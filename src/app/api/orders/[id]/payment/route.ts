import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { burnCoupon } from "@/lib/coupons";
import { notify, notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { submitOrderPaymentSchema } from "@/lib/validations";
import { formatRs } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[id]/payment — submit EasyPaisa payment details for an order
 * that is still awaiting payment. Burns any attached coupon (best effort — the
 * payment is still accepted if the coupon became invalid meanwhile).
 */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const input = await readJson(req, submitOrderPaymentSchema);

  const order = await db.topUpOrder.findFirst({ where: { id, userId: user.id } });
  if (!order) throw new ApiError("Order not found.", 404);
  if (order.status !== "PENDING_PAYMENT") {
    throw new ApiError("Payment for this order has already been submitted.", 400);
  }

  const updated = await db.$transaction(async (tx) => {
    const o = await tx.topUpOrder.update({
      where: { id: order.id },
      data: {
        paymentTrxId: input.trxId,
        paymentScreenshotId: input.screenshotUploadId || null,
        paymentSubmittedAt: new Date(),
        status: "PAYMENT_SUBMITTED",
        ...(input.note
          ? { userNote: order.userNote ? `${order.userNote}\n${input.note}` : input.note }
          : {}),
      },
    });

    if (o.couponCode && o.discount > 0) {
      try {
        const coupon = await tx.coupon.findUnique({ where: { code: o.couponCode } });
        if (coupon) {
          await burnCoupon(tx, {
            couponId: coupon.id,
            userId: o.userId,
            orderId: o.id,
            discount: o.discount,
          });
        }
      } catch {
        // coupon no longer valid — payment is still accepted
      }
    }

    return o;
  });

  await notifyAdmins({
    type: "PAYMENT",
    title: "Top-up payment submitted",
    body: `${user.name} submitted payment of ${formatRs(updated.totalAmount)} for order ${updated.orderNumber}.`,
    link: "/admin/orders",
  });

  await notify({
    userId: user.id,
    type: "PAYMENT",
    title: "Payment received",
    body: `We received your payment details for order ${updated.orderNumber}. Our team will verify it shortly.`,
    link: "/dashboard/orders",
  });

  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "ORDER_PAYMENT_SUBMIT",
    entity: "TopUpOrder",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, trxId: input.trxId },
  });

  return apiSuccess(updated);
});
