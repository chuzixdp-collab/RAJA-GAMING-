/**
 * POST /api/admin/aluu/submit — place a paid, verified top-up order with ALUU
 * (admin only). Manual retry path: the automatic paths (CryptoEze webhook,
 * admin VERIFY) call the same shared core (src/lib/aluu-submit.ts) at their
 * trust points, so this route and auto-delivery can never drift apart.
 *
 * Response contract (unchanged from the original implementation):
 *  - 404 when the order does not exist.
 *  - 400 with a clear message when payment is not verified, the package is
 *    not an ALUU-synced pack, or the pack is out of stock.
 *  - 503 when ALUU credentials are missing (fail closed).
 *  - apiSuccess({ supplierOrder, resent, note? }) on a no-op (already
 *    pending/successful).
 *  - apiSuccess({ supplierOrder, resent }) when ALUU accepted the order.
 *  - apiSuccess({ supplierOrder, resent, failed: true, error }) when ALUU
 *    rejected it — recorded as SUBMIT_FAILED (or the supplier verdict), the
 *    paid order itself stays untouched and retryable.
 *
 * IDEMPOTENCY: partner_orderid is always the Raja Gaming orderNumber and
 * SupplierOrder.topUpOrderId is UNIQUE, so no path can double-order.
 *
 * This route NEVER marks an order COMPLETED — delivery is only claimed when
 * the supplier reports "successful" (webhook or track).
 */
import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { submitOrderToAluu } from "@/lib/aluu-submit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitSchema = z.object({
  orderId: z.string().min(1).max(64),
});

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { orderId } = await readJson(req, submitSchema);

  const result = await submitOrderToAluu(orderId, { via: "admin", actor: admin });

  if (!result.ok) {
    switch (result.code) {
      case "NOT_FOUND":
        throw new ApiError("Order not found.", 404);
      case "PAYMENT_NOT_VERIFIED":
        throw new ApiError(result.message, 400);
      case "NOT_ALUU_PACKAGE":
        throw new ApiError(result.message, 400);
      case "OUT_OF_STOCK":
        throw new ApiError(result.message, 400);
      case "ALUU_NOT_CONFIGURED":
        throw new ApiError(result.message, 503);
      default:
        throw new ApiError(result.message, 502);
    }
  }

  if (result.kind === "no-op") {
    return apiSuccess({ supplierOrder: result.supplierOrder, resent: false, note: result.note });
  }
  if (result.kind === "rejected") {
    return apiSuccess({
      supplierOrder: result.supplierOrder,
      resent: result.resent,
      failed: true,
      error: result.error,
    });
  }
  return apiSuccess({ supplierOrder: result.supplierOrder, resent: result.resent });
});
