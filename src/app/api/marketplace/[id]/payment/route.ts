import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertPurchaseTransition } from "@/lib/marketplace";
import { notify, notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { purchasePaymentSchema } from "@/lib/validations";
import { formatRs } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/marketplace/[id]/payment — submit payment for the caller's active
 * purchase on this listing (REQUESTED or PAYMENT_PENDING only, state-machine
 * enforced).
 */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const input = await readJson(req, purchasePaymentSchema);

  const purchase = await db.purchase.findFirst({
    where: { listingId: id, buyerId: user.id, status: { in: ["REQUESTED", "PAYMENT_PENDING"] } },
  });
  if (!purchase) {
    throw new ApiError("No active purchase request found for this listing.", 404);
  }
  assertPurchaseTransition(purchase.status, "PAYMENT_SUBMITTED");

  const updated = await db.purchase.update({
    where: { id: purchase.id },
    data: {
      paymentTrxId: input.trxId,
      paymentScreenshotId: input.screenshotUploadId || null,
      paymentSubmittedAt: new Date(),
      status: "PAYMENT_SUBMITTED",
    },
  });

  await notifyAdmins({
    type: "PAYMENT",
    title: "Marketplace payment submitted",
    body: `${user.name} submitted ${formatRs(updated.price)} for "${updated.listingTitle}". Verify and coordinate the transfer.`,
    link: "/admin/marketplace",
  });

  await notify({
    userId: purchase.sellerId,
    type: "PAYMENT",
    title: "Buyer payment submitted",
    body: `The buyer of "${updated.listingTitle}" submitted payment — admin will verify and start the transfer.`,
    link: "/dashboard/marketplace",
  });

  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "MARKETPLACE_PAYMENT_SUBMIT",
    entity: "Purchase",
    entityId: purchase.id,
    metadata: { listingId: id, trxId: input.trxId, price: purchase.price },
  });

  return apiSuccess(updated);
});
