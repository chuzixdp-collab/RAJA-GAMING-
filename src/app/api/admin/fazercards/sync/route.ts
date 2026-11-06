/**
 * POST /api/admin/fazercards/sync — import the live FazerCards catalog for
 * one category (e.g. Free Fire) into DiamondPackage (admin only).
 *
 * Behaviour (strictly additive — manual and ALUU packages are never touched):
 *  - Fetches the live offers for the category (documented
 *    `GET /api/v2/topups/offers?category_id=…`).
 *  - Refuses to sync a category that has no player-ID text field (orders
 *    could never be built safely).
 *  - For each offer: upserts a DiamondPackage matched on
 *    (supplierSource="FAZERCARDS", supplierFzrCategoryId, supplierFzrOfferId),
 *    refreshing the title, units, supplier price, offer name, fields spec
 *    and synced-at columns.
 *  - Pricing: suggested price = supplier USD price × FAZERCARDS_USD_TO_PKR ×
 *    (1 + FAZERCARDS_PRICE_MARKUP_PERCENT/100), rounded UP to whole 10 PKR.
 *    Existing packages KEEP their manual price unless applySuggestedPrices
 *    is true. Admins can always edit prices in Diamond Packages.
 *  - Offers that vanished from the category are deactivated (only packages
 *    that were synced from FazerCards before — active=false, never deleted).
 */
import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  fazerErrorInfo,
  fazerRequest,
  parseFazerPriceUsdCents,
  parseUnitsFromOfferName,
  suggestFazerSalePricePkr,
} from "@/lib/fazercards";
import { getSetting, setSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const syncSchema = z.object({
  categoryId: z.string().trim().min(1).max(120).optional(),
  /** Apply the suggested price to already-synced packages too. */
  applySuggestedPrices: z.boolean().optional(),
});

type FazerOffer = {
  offer_id?: unknown;
  name?: unknown;
  price_usd?: unknown;
};

type FazerField = {
  key?: unknown;
  label?: unknown;
  type?: unknown;
};

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, syncSchema);

  const categoryId = input.categoryId || (await getSetting("FAZERCARDS_FF_CATEGORY_ID"));
  if (!categoryId) {
    throw new ApiError("No category given and none saved yet — pick one from the categories list first.", 400);
  }

  const { payload } = await fazerRequest<{ ok?: unknown; error?: unknown }>(
    "GET",
    `/api/v2/topups/offers?category_id=${encodeURIComponent(categoryId)}&include_ui=0`
  );
  const p = payload as { ok?: unknown; offers?: unknown; fields?: unknown; name?: unknown };
  if (p?.ok !== true || !Array.isArray(p.offers)) {
    throw new ApiError(`FazerCards offers fetch failed: ${fazerErrorInfo(payload).message}`, 502);
  }

  const fieldsSpec = Array.isArray(p.fields) ? p.fields : [];
  const hasPlayerField = fieldsSpec.some(
    (f): f is { key: string; type: string } =>
      typeof f === "object" &&
      f !== null &&
      typeof (f as FazerField).key === "string" &&
      (f as FazerField).type === "text"
  );
  if (!hasPlayerField) {
    throw new ApiError(
      "This category has no player-ID text field, so orders could never be built safely. Pick the correct category (e.g. Free Fire).",
      400
    );
  }

  const usdToPkr = Number((await getSetting("FAZERCARDS_USD_TO_PKR")) || 280);
  const markupPercent = Number((await getSetting("FAZERCARDS_PRICE_MARKUP_PERCENT")) || 0);

  const offers = (p.offers as FazerOffer[]).filter(
    (o): o is { offer_id: string; name: string; price_usd: string } =>
      typeof o?.offer_id === "string" &&
      o.offer_id.trim() !== "" &&
      typeof o?.name === "string" &&
      o.name.trim() !== ""
  );

  let created = 0;
  let updated = 0;
  let reactivated = 0;
  let deactivated = 0;
  let skippedNoPrice = 0;

  for (const offer of offers) {
    const offerId = offer.offer_id.trim();
    const title = offer.name.trim();
    const priceUsdCents = parseFazerPriceUsdCents(offer.price_usd);
    if (priceUsdCents === null) {
      skippedNoPrice += 1;
      continue;
    }

    const existing = await db.diamondPackage.findFirst({
      where: { supplierSource: "FAZERCARDS", supplierFzrCategoryId: categoryId, supplierFzrOfferId: offerId },
    });

    const suggestedPkr = suggestFazerSalePricePkr(priceUsdCents, usdToPkr, markupPercent);
    const units = parseUnitsFromOfferName(title);

    if (existing) {
      const shouldApplySuggested = input.applySuggestedPrices === true || !existing.active;
      await db.diamondPackage.update({
        where: { id: existing.id },
        data: {
          title,
          diamonds: units ?? existing.diamonds,
          supplierFzrOfferName: title,
          supplierPriceUsdCents: priceUsdCents,
          supplierFzrFields: fieldsSpec as unknown as object,
          supplierSyncedAt: new Date(),
          // Refreshed offers come back active; a vanished offer stays
          // deactivated (deliberate admin action to re-enable).
          ...(shouldApplySuggested ? { price: suggestedPkr } : {}),
        },
      });
      updated += 1;
    } else {
      await db.diamondPackage.create({
        data: {
          title,
          diamonds: units ?? 0,
          price: suggestedPkr,
          description: `FazerCards offer (synced) — supplier price ${`$${(priceUsdCents / 100).toFixed(4)}`}.`,
          active: true,
          sortOrder: 100 + offers.length,
          supplierSource: "FAZERCARDS",
          supplierFzrCategoryId: categoryId,
          supplierFzrOfferId: offerId,
          supplierFzrOfferName: title,
          supplierFzrFields: fieldsSpec as unknown as object,
          supplierPriceUsdCents: priceUsdCents,
          supplierSyncedAt: new Date(),
        },
      });
      created += 1;
    }
  }

  // Deactivate FazerCards packages of THIS category whose offers vanished.
  const syncedPackages = await db.diamondPackage.findMany({
    where: { supplierSource: "FAZERCARDS", supplierFzrCategoryId: categoryId },
    select: { id: true, supplierFzrOfferId: true, active: true },
  });
  const liveOfferIds = new Set(offers.map((o) => o.offer_id.trim()));
  for (const pkg of syncedPackages) {
    if (pkg.supplierFzrOfferId && !liveOfferIds.has(pkg.supplierFzrOfferId) && pkg.active) {
      await db.diamondPackage.update({ where: { id: pkg.id }, data: { active: false } });
      deactivated += 1;
    } else if (pkg.supplierFzrOfferId && liveOfferIds.has(pkg.supplierFzrOfferId) && !pkg.active) {
      await db.diamondPackage.update({ where: { id: pkg.id }, data: { active: true } });
      reactivated += 1;
    }
  }

  await setSettings({ FAZERCARDS_FF_CATEGORY_ID: categoryId });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "FAZERCARDS_CATALOG_SYNC",
    entity: "DiamondPackage",
    entityId: categoryId,
    metadata: {
      categoryId,
      created,
      updated,
      reactivated,
      deactivated,
      skippedNoPrice,
      applySuggestedPrices: input.applySuggestedPrices === true,
    },
  });

  return apiSuccess({
    categoryId,
    categoryName: typeof p.name === "string" ? p.name : categoryId,
    created,
    updated,
    reactivated,
    deactivated,
    skippedNoPrice,
  });
});
