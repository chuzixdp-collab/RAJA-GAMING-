/**
 * POST /api/admin/aluu/track — refresh the supplier status of one order
 * (admin only). Mirrors the webhook's completion rules through
 * `applyAluuStatus`, so polling can never claim delivery before ALUU does.
 */
import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { aluuErrorInfo, aluuRequest } from "@/lib/aluu";
import { applyAluuStatus } from "@/lib/aluu-fulfill";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const trackSchema = z.object({
  orderId: z.string().min(1).max(64),
});

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { orderId } = await readJson(req, trackSchema);

  const supplierOrder = await db.supplierOrder.findUnique({
    where: { topUpOrderId: orderId },
  });
  if (!supplierOrder) {
    throw new ApiError("No supplier order exists for this top-up order yet.", 404);
  }
  // Nothing to ask the supplier about a locally failed submit — the create
  // call was rejected, so ALUU has no order with this id.
  if (supplierOrder.status === "SUBMIT_FAILED") {
    throw new ApiError(
      `The last submit failed (${supplierOrder.statusMessage ?? "unknown reason"}). Resubmit instead of tracking.`,
      400
    );
  }

  // Fresh status straight from ALUU (same fields as the webhook payload).
  const { httpStatus, payload } = await aluuRequest<{
    success?: boolean;
    data?: Record<string, unknown>;
  }>("GET", `/api/v.1/${encodeURIComponent(supplierOrder.partnerOrderNumber)}`);

  if (!payload?.success || !payload.data) {
    throw new ApiError(
      `ALUU status fetch failed: ${aluuErrorInfo(payload).message}${httpStatus === 404 ? " (order unknown to the supplier)" : ""}`,
      httpStatus === 404 ? 404 : 502
    );
  }

  const result = await applyAluuStatus(payload.data as Parameters<typeof applyAluuStatus>[0], "track");

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "ALUU_ORDER_TRACK",
    entity: "SupplierOrder",
    entityId: supplierOrder.id,
    metadata: {
      orderNumber: supplierOrder.partnerOrderNumber,
      supplierStatus: result.supplierStatus ?? null,
      orderCompleted: result.orderCompleted === true,
    },
  });

  const supplierOrderAfter = await db.supplierOrder.findUnique({
    where: { id: supplierOrder.id },
  });

  return apiSuccess({
    ...result,
    supplierOrder: supplierOrderAfter,
  });
});
