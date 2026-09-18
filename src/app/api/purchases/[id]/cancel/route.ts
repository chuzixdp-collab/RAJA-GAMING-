import { ApiError, apiSuccess, getClientIp, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertPurchaseTransition } from "@/lib/marketplace";
import { notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Buyer cancels a marketplace purchase before payment verification. */
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const purchase = await db.purchase.findUnique({ where: { id } });
  if (!purchase || purchase.buyerId !== user.id) {
    throw new ApiError("Marketplace transaction not found.", 404);
  }
  if (purchase.status !== "REQUESTED" && purchase.status !== "PAYMENT_PENDING") {
    throw new ApiError("This transaction can no longer be cancelled.", 400);
  }
  assertPurchaseTransition(purchase.status, "CANCELLED");

  const updated = await db.purchase.update({
    where: { id },
    data: { status: "CANCELLED" },
    select: { id: true, listingTitle: true, status: true },
  });

  await notifyAdmins({
    type: "MARKETPLACE",
    title: "Purchase cancelled by buyer",
    body: `${user.name} cancelled the purchase of "${purchase.listingTitle}".`,
    link: "/admin/marketplace",
  });
  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "PURCHASE_CANCEL",
    entity: "Purchase",
    entityId: id,
    metadata: { previousStatus: purchase.status, listingTitle: purchase.listingTitle },
    ip: getClientIp(req),
  });

  return apiSuccess({ purchase: updated });
});
