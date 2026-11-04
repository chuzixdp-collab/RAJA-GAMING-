/**
 * POST /api/admin/aluu/sync — import the live ALUU catalog into DiamondPackage
 * (admin only).
 *
 * Behaviour (strictly additive — manual packages are never touched):
 *  - Fetches the live products for the game code (body or ALUU_FF_GAMECODE).
 *  - For each supplier pack: upserts a DiamondPackage matched on
 *    (supplierSource="ALUU", supplierGameCode, supplierPack), refreshing the
 *    title, diamonds, supplier price, stock and synced-at columns.
 *  - Pricing: suggested price = supplier USD price × ALUU_USD_TO_PKR ×
 *    (1 + ALUU_PRICE_MARKUP_PERCENT/100), rounded UP to whole 10 PKR.
 *    Existing packages KEEP their manual price — the suggestion only applies
 *    to newly created rows. Admins can edit prices in Diamond Packages.
 *  - Supplier packs that went out of stock are deactivated (only ones that
 *    were synced from ALUU before — active=false, never deleted).
 *  - Products absent from ALUU are left untouched (deactivation is a
 *    deliberate admin action in Diamond Packages).
 */
import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { aluuErrorInfo, aluuRequest, parseDiamondsFromName, suggestSalePricePkr } from "@/lib/aluu";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const syncSchema = z.object({
  gamecode: z
    .string()
    .trim()
    .regex(/^$|^[a-zA-Z0-9_-]{1,40}$/, "Invalid game code.")
    .optional(),
  /** Apply the suggested price to already-synced packages too. */
  applySuggestedPrices: z.boolean().optional(),
});

type AluuProduct = {
  name?: unknown;
  gamecode?: unknown;
  Pack?: unknown;
  price?: unknown;
  stockStatus?: unknown;
};

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, syncSchema);

  const gameCode = input.gamecode || (await getSetting("ALUU_FF_GAMECODE"));
  if (!gameCode) {
    throw new ApiError("No game code given and none saved yet — pick one from the games list first.", 400);
  }

  const { payload } = await aluuRequest<{ success?: boolean; data?: AluuProduct[] }>(
    "GET",
    `/api/v.1/products/${encodeURIComponent(gameCode)}`
  );

  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new ApiError(`ALUU products fetch failed: ${aluuErrorInfo(payload).message}`, 502);
  }

  const usdToPkr = Number((await getSetting("ALUU_USD_TO_PKR")) || 280);
  const markupPercent = Number((await getSetting("ALUU_PRICE_MARKUP_PERCENT")) || 0);

  const packs = payload.data.filter(
    (p): p is { name: string; Pack: string; price?: number; stockStatus?: string } =>
      typeof p?.name === "string" &&
      p.name.trim() !== "" &&
      typeof p?.Pack === "string" &&
      p.Pack.trim() !== ""
  );

  let created = 0;
  let updated = 0;
  let reactivated = 0;
  let deactivated = 0;
  let skippedNoPrice = 0;

  for (const pack of packs) {
    const supplierPack = pack.Pack.trim();
    const title = pack.name.trim();
    const priceUsdCents = typeof pack.price === "number" && Number.isFinite(pack.price) ? Math.round(pack.price * 100) : null;
    const stockStatus = typeof pack.stockStatus === "string" ? pack.stockStatus : null;
    const inStock = stockStatus !== "out_of_stock";

    const existing = await db.diamondPackage.findFirst({
      where: { supplierSource: "ALUU", supplierGameCode: gameCode, supplierPack },
    });

    if (!existing) {
      if (priceUsdCents === null) {
        skippedNoPrice += 1;
        continue;
      }
      await db.diamondPackage.create({
        data: {
          title,
          diamonds: parseDiamondsFromName(title) ?? 0,
          price: suggestSalePricePkr(priceUsdCents, usdToPkr, markupPercent),
          description: `Official ALUU pack: ${title}. Delivered automatically to the Free Fire UID after order approval.`,
          active: inStock,
          // Keep new supplier packs after manually sorted ones.
          sortOrder: 1000 + packs.findIndex((p) => p.Pack === pack.Pack),
          supplierSource: "ALUU",
          supplierGameCode: gameCode,
          supplierPack,
          supplierPriceUsdCents: priceUsdCents,
          supplierStock: stockStatus,
          supplierSyncedAt: new Date(),
        },
      });
      created += 1;
      continue;
    }

    const deactivate = !inStock && existing.active;
    const reactivate = inStock && !existing.active && existing.supplierSource === "ALUU";
    const priceChanged = input.applySuggestedPrices === true && priceUsdCents !== null;

    if (
      existing.title === title &&
      existing.supplierPriceUsdCents === priceUsdCents &&
      existing.supplierStock === stockStatus &&
      !deactivate &&
      !reactivate &&
      !priceChanged
    ) {
      // Still refresh syncedAt so the admin sees freshness.
      await db.diamondPackage.update({
        where: { id: existing.id },
        data: { supplierSyncedAt: new Date() },
      });
      continue;
    }

    await db.diamondPackage.update({
      where: { id: existing.id },
      data: {
        title,
        diamonds: parseDiamondsFromName(title) ?? existing.diamonds,
        ...(priceChanged && priceUsdCents !== null
          ? { price: suggestSalePricePkr(priceUsdCents, usdToPkr, markupPercent) }
          : {}),
        ...(deactivate ? { active: false } : {}),
        ...(reactivate ? { active: true } : {}),
        supplierPriceUsdCents: priceUsdCents,
        supplierStock: stockStatus,
        supplierSyncedAt: new Date(),
      },
    });
    if (deactivate) deactivated += 1;
    if (reactivate) reactivated += 1;
    updated += 1;
  }

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "ALUU_SYNC_CATALOG",
    entity: "DiamondPackage",
    entityId: gameCode,
    metadata: { gameCode, packs: packs.length, created, updated, deactivated, reactivated, skippedNoPrice },
  });

  return apiSuccess({
    gameCode,
    packs: packs.length,
    created,
    updated,
    deactivated,
    reactivated,
    skippedNoPrice,
    usdToPkr,
    markupPercent,
  });
});
