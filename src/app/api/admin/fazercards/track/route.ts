/**
 * POST /api/admin/fazercards/track — refresh ONE FazerCards supplier order
 * from the documented `GET /api/v2/orders/{orderId}` endpoint (admin only).
 *
 * The polled data is the only source of truth — webhook payloads never
 * change state directly, they only trigger this same path.
 */
import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyFazerStatus, fetchFazerOrder } from "@/lib/fazercards-fulfill";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const trackSchema = z.object({
  orderId: z.string().min(1).max(64), // Raja Gaming TopUpOrder id
});

export const POST = withApi(async (req: Request) => {
  await requireAdmin();
  const { orderId } = await readJson(req, trackSchema);

  const supplierOrder = await db.supplierOrder.findUnique({
    where: { topUpOrderId: orderId },
    include: { topUpOrder: { select: { orderNumber: true } } },
  });
  if (!supplierOrder || supplierOrder.supplier !== "FAZERCARDS") {
    throw new ApiError("This order has no FazerCards supplier submission.", 404);
  }
  if (!supplierOrder.fzrOrderId) {
    throw new ApiError(
      "No FazerCards order id is stored for this order yet — submit it first.",
      400
    );
  }

  const fetched = await fetchFazerOrder(supplierOrder.fzrOrderId);
  if (!fetched.ok) {
    throw new ApiError(`FazerCards order fetch failed: ${fetched.error}`, 502);
  }

  const result = await applyFazerStatus({ id: supplierOrder.id }, fetched.order, "track");

  const fresh = await db.supplierOrder.findUnique({ where: { id: supplierOrder.id } });

  return apiSuccess({
    supplierOrder: fresh,
    applied: result.applied,
    reason: result.reason ?? null,
    supplierStatus: result.supplierStatus ?? null,
    orderCompleted: result.orderCompleted === true,
  });
});
