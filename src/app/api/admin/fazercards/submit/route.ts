/**
 * POST /api/admin/fazercards/submit — place a PAID top-up order with
 * FazerCards (admin only; manual trigger / retry).
 *
 * Hard gates live in submitToFazercards(): verified payment only
 * (PAYMENT_SUBMITTED via the verified CryptoEze webhook, or APPROVED /
 * PROCESSING after admin verification), FazerCards-synced package only,
 * pre-flight offer/price/balance checks, documented Idempotency-Key.
 *
 * Response contract mirrors the ALUU submit route for UI consistency:
 *  - Gate violations (nothing was sent): ApiError 4xx with the reason.
 *  - Supplier rejected the create or the network call failed: HTTP 200 with
 *    `failed: true` + the recorded SUBMIT_FAILED supplier order row, so the
 *    admin UI can show it and retry safely.
 *
 * This route NEVER marks an order COMPLETED — delivery is only claimed when
 * FazerCards reports the final `completed` status (track/webhook/sync).
 */
import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { submitToFazercards } from "@/lib/fazercards-fulfill";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitSchema = z.object({
  orderId: z.string().min(1).max(64),
});

/** Gate reasons that must surface as HTTP errors (nothing was sent). */
const GATE_REASONS = new Set([
  "DISABLED",
  "ORDER_NOT_FOUND",
  "PAYMENT_NOT_VERIFIED",
  "PACKAGE_NOT_SYNCED",
  "ALREADY_WITH_OTHER_SUPPLIER",
  "ALREADY_PENDING",
  "ALREADY_DELIVERED",
  "NO_PLAYER_FIELD",
  "OFFERS_FETCH_FAILED",
  "OFFER_NOT_FOUND",
  "OFFER_PRICE_ZERO",
  "PRICE_INCREASED",
  "INSUFFICIENT_SUPPLIER_BALANCE",
]);

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { orderId } = await readJson(req, submitSchema);

  const result = await submitToFazercards(orderId, { via: "manual", actorId: admin.id });

  if (result.ok) {
    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "FAZERCARDS_ORDER_SUBMIT",
      entity: "TopUpOrder",
      entityId: orderId,
      metadata: {
        supplierOrderId: result.supplierOrderId,
        fzrOrderId: result.fzrOrderId,
        status: result.status,
        retry: result.resent,
      },
    });
    return apiSuccess({
      supplierOrder: await db.supplierOrder.findUnique({ where: { id: result.supplierOrderId } }),
      resent: result.resent,
    });
  }

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: result.reason === "SUPPLIER_REJECTED" || result.reason === "SUBMIT_FAILED"
      ? "FAZERCARDS_ORDER_SUBMIT_FAILED"
      : "FAZERCARDS_ORDER_SUBMIT_BLOCKED",
    entity: "TopUpOrder",
    entityId: orderId,
    metadata: { reason: result.reason, error: result.error },
  });

  if (GATE_REASONS.has(result.reason)) {
    throw new ApiError(result.error, result.reason === "ALREADY_PENDING" || result.reason === "ALREADY_DELIVERED" ? 409 : 400);
  }

  // Supplier rejected the create call, or it failed — the SUBMIT_FAILED row
  // is recorded; return it so the UI can show the state (ALUU route parity).
  const supplierOrder = await db.supplierOrder.findUnique({ where: { topUpOrderId: orderId } });
  return apiSuccess({ supplierOrder, failed: true, error: result.error, resent: false });
});
