import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_PURCHASE_STATUSES } from "@/lib/marketplace";
import { notify, notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { getSettingBool } from "@/lib/settings";
import { purchaseRequestSchema } from "@/lib/validations";
import { formatRs } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/marketplace/[id]/purchase — request to buy an APPROVED listing.
 * One active transaction per listing, enforced inside a transaction to avoid
 * double-buy races. The seller cannot buy their own listing.
 */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const input = await readJson(req, purchaseRequestSchema);

  if (!(await getSettingBool("MARKETPLACE_ENABLED", true))) {
    throw new ApiError("Marketplace purchases are temporarily disabled.", 400);
  }

  const purchase = await db.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({ where: { id } });
    if (!listing || listing.status !== "APPROVED") {
      throw new ApiError("This listing is not available for purchase.", 400);
    }
    if (listing.sellerId === user.id) {
      throw new ApiError("You cannot purchase your own listing.", 400);
    }
    const active = await tx.purchase.findFirst({
      where: { listingId: id, status: { in: ACTIVE_PURCHASE_STATUSES } },
    });
    if (active) {
      throw new ApiError("This listing already has an active purchase request.", 400);
    }
    return tx.purchase.create({
      data: {
        listingId: id,
        listingTitle: listing.title,
        buyerId: user.id,
        sellerId: listing.sellerId,
        price: listing.price,
        status: "REQUESTED",
        buyerNote: input.buyerNote?.trim() || null,
      },
    });
  });

  await notify({
    userId: purchase.sellerId,
    type: "MARKETPLACE",
    title: "New purchase request",
    body: `A buyer requested to purchase "${purchase.listingTitle}" (${formatRs(purchase.price)}). Admin will coordinate the transfer.`,
    link: "/dashboard/marketplace",
  });

  await notifyAdmins({
    type: "MARKETPLACE",
    title: "New marketplace purchase",
    body: `${user.name} requested to buy "${purchase.listingTitle}" (${formatRs(purchase.price)}).`,
    link: "/admin/marketplace",
  });

  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "MARKETPLACE_PURCHASE_REQUEST",
    entity: "Purchase",
    entityId: purchase.id,
    metadata: { listingId: id, price: purchase.price },
  });

  return apiSuccess(purchase, 201);
});
