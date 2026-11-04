/**
 * ALUU fulfillment helpers shared by the webhook and the admin track route.
 *
 * SECURITY / BUSINESS RULES (mirroring the CryptoEze webhook):
 *  - The TopUpOrder is marked COMPLETED only when the supplier reports the
 *    final status "successful". Never before. Errors/cancellations never
 *    touch the order state — the admin decides on refunds/retries manually.
 *  - This function is idempotent: replayed events with the same final status
 *    do not resend notifications or re-apply state changes.
 *  - Nothing here ever logs or returns secret material.
 */
import { db } from "@/lib/db";
import { normalizeSupplierStatus } from "@/lib/aluu";
import { notify, notifyAdmins } from "@/lib/notifications";
/** Statuses that may still transition to COMPLETED automatically. */
const COMPLETABLE_ORDER_STATUSES = ["APPROVED", "PROCESSING"] as const;

export type AluuStatusPayload = {
  orderid?: unknown;
  reference?: unknown;
  provider_order_id?: unknown;
  status?: unknown;
  amount?: unknown;
  message?: unknown;
  updatedAt?: unknown;
};

/**
 * Apply an ALUU status payload (webhook or track response `data` object) to
 * the local SupplierOrder mirror + TopUpOrder.
 *
 * Returns a compact summary the callers can log / respond with. Never throws
 * for "not found" style situations — callers decide the HTTP status.
 */
export async function applyAluuStatus(
  payload: AluuStatusPayload,
  via: "webhook" | "track"
): Promise<{
  applied: boolean;
  reason?: string;
  orderNumber?: string;
  supplierStatus?: string;
  orderCompleted?: boolean;
}> {
  const orderNumber =
    typeof payload.orderid === "string" && payload.orderid.trim() ? payload.orderid.trim() : null;
  if (!orderNumber) return { applied: false, reason: "MISSING_ORDER_ID" };

  const supplierOrder = await db.supplierOrder.findUnique({
    where: { partnerOrderNumber: orderNumber },
    include: { topUpOrder: { select: { id: true, userId: true, orderNumber: true, totalAmount: true, packageTitle: true, status: true } } },
  });
  if (!supplierOrder) return { applied: false, reason: "SUPPLIER_ORDER_NOT_FOUND", orderNumber };

  const status = normalizeSupplierStatus(payload.status);
  const message = typeof payload.message === "string" ? payload.message : null;
  const reference = typeof payload.reference === "string" && payload.reference.trim() ? payload.reference.trim() : null;
  const providerOrderId =
    typeof payload.provider_order_id === "string" && payload.provider_order_id.trim()
      ? payload.provider_order_id.trim()
      : null;
  const amountUsdCents =
    typeof payload.amount === "number" && Number.isFinite(payload.amount)
      ? Math.round(payload.amount * 100)
      : supplierOrder.amountUsdCents;

  // Idempotency: a webhook replay of the same final status is a no-op.
  if (supplierOrder.status === status && status !== "PENDING") {
    return { applied: false, reason: "ALREADY_RECORDED", orderNumber, supplierStatus: status };
  }

  await db.supplierOrder.update({
    where: { id: supplierOrder.id },
    data: {
      status,
      statusMessage: message,
      aluuOrderRef: reference ?? supplierOrder.aluuOrderRef,
      providerOrderId: providerOrderId ?? supplierOrder.providerOrderId,
      amountUsdCents,
      ...(status !== "PENDING" ? { lastStatusAt: new Date() } : {}),
      ...(via === "webhook" ? { webhookAt: new Date() } : {}),
    },
  });

  if (status === "SUCCESSFUL") {
    // The ONLY path that ever completes an order: the supplier confirmed
    // delivery. Guarded with updateMany so an order an admin already closed
    // (or rejected/cancelled meanwhile) is never flipped back.
    const completable = COMPLETABLE_ORDER_STATUSES.includes(
      supplierOrder.topUpOrder.status as (typeof COMPLETABLE_ORDER_STATUSES)[number]
    );
    if (completable) {
      const updated = await db.topUpOrder.updateMany({
        where: { id: supplierOrder.topUpOrderId, status: { in: [...COMPLETABLE_ORDER_STATUSES] } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      if (updated.count > 0) {
        await notifyAdmins({
          type: "ORDER",
          title: "ALUU delivered order",
          body: `${supplierOrder.topUpOrder.packageTitle} (${orderNumber}) was delivered by ALUU and marked COMPLETED.${message ? ` Note: ${message}` : ""}`,
          link: "/admin/orders",
        });
        await notify({
          userId: supplierOrder.topUpOrder.userId,
          type: "ORDER",
          title: "Diamonds delivered",
          body: `Your ${supplierOrder.topUpOrder.packageTitle} order ${supplierOrder.topUpOrder.orderNumber} has been delivered. Enjoy!`,
          link: "/dashboard/orders",
        });
        return { applied: true, orderNumber, supplierStatus: status, orderCompleted: true };
      }
    }
    // Not completable (already terminal) — the status mirror is still updated.
    return { applied: true, orderNumber, supplierStatus: status, orderCompleted: false };
  }

  if (status === "ERROR" || status === "CANCELLED") {
    // Never auto-complete, never auto-refund. Admin decides.
    await notifyAdmins({
      type: "ORDER",
      title: `ALUU order ${status.toLowerCase()}`,
      body: `Supplier reported ${status.toLowerCase()} for ${supplierOrder.topUpOrder.packageTitle} (${orderNumber}).${message ? ` Reason: ${message}` : ""} Review the order and handle any refund manually.`,
      link: "/admin/orders",
    });
  }

  return { applied: true, orderNumber, supplierStatus: status, orderCompleted: false };
}

/**
 * Cheap USD formatter for admin-facing summaries.
 */
export function formatUsd(amountUsdCents: number | null | undefined): string {
  if (typeof amountUsdCents !== "number" || !Number.isFinite(amountUsdCents)) return "—";
  return `$${(amountUsdCents / 100).toFixed(3)}`;
}

