/**
 * POST /api/admin/aluu/submit — place a paid, admin-approved top-up order
 * with ALUU (admin only).
 *
 * HARD GATES (all must pass, or nothing is sent to the supplier):
 *  1. The order's payment was verified by an admin — status APPROVED or
 *     PROCESSING only. PAYMENT_SUBMITTED alone is NOT enough.
 *  2. The package was synced from ALUU (supplierSource="ALUU") so we know
 *     the exact game code + denom ("Pack") to order.
 *  3. ALUU credentials are configured (fails closed otherwise).
 *
 * IDEMPOTENCY:
 *  - partner_orderid is always the Raja Gaming orderNumber. ALUU answers a
 *    duplicate create with 409 + the existing order, so a retry can never
 *    double-order or double-charge.
 *  - A local SupplierOrder row is only created after a definitive supplier
 *    answer; retries after SUBMIT_FAILED reuse the same partner_orderid.
 *
 * This route NEVER marks an order COMPLETED — delivery is only claimed when
 * the supplier reports "successful" (webhook or track).
 */
import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  aluuErrorInfo,
  aluuRequest,
  normalizeSupplierStatus,
  resolveWebhookUrl,
} from "@/lib/aluu";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitSchema = z.object({
  orderId: z.string().min(1).max(64),
});

type AluuCreateData = {
  orderid?: unknown;
  reference?: unknown;
  provider_order_id?: unknown;
  status?: unknown;
  amount?: unknown;
  message?: unknown;
};

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { orderId } = await readJson(req, submitSchema);

  const order = await db.topUpOrder.findUnique({
    where: { id: orderId },
    include: {
      package: { select: { supplierSource: true, supplierGameCode: true, supplierPack: true, supplierStock: true } },
      supplierOrder: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!order) throw new ApiError("Order not found.", 404);

  // GATE 1 — admin-approved payment only.
  if (order.status !== "APPROVED" && order.status !== "PROCESSING") {
    throw new ApiError(
      `Payment for ${order.orderNumber} is not approved yet (status: ${order.status}). Verify the payment first — supplier orders are only placed after admin approval.`,
      400
    );
  }

  // GATE 2 — the package must be a synced ALUU pack.
  const pkg = order.package;
  if (!pkg || pkg.supplierSource !== "ALUU" || !pkg.supplierGameCode || !pkg.supplierPack) {
    throw new ApiError(
      "This package is not linked to the ALUU catalog. Sync it from the Supplier page (or manage delivery manually).",
      400
    );
  }
  if (pkg.supplierStock === "out_of_stock") {
    throw new ApiError("This pack is currently out of stock at the supplier. Sync the catalog and re-check.", 400);
  }

  // Existing supplier order — decide whether this is a retry or a no-op.
  const existing = order.supplierOrder;
  if (existing) {
    if (existing.status === "PENDING" || existing.status === "SUCCESSFUL") {
      return apiSuccess({
        supplierOrder: existing,
        resent: false,
        note:
          existing.status === "PENDING"
            ? "Supplier order is already pending — check the status instead of resubmitting."
            : "Supplier already delivered this order.",
      });
    }
    // SUBMIT_FAILED / ERROR / CANCELLED → a resubmit is allowed. ALUU
    // deduplicates on partner_orderid, so this cannot create a second order.
  }

  const partnerOrderNumber = order.orderNumber; // stable, unique, retry-safe
  const webhookUrl = resolveWebhookUrl();

  const body: Record<string, string> = {
    game: pkg.supplierGameCode,
    denom: pkg.supplierPack,
    userid: order.ffUid,
    partner_orderid: partnerOrderNumber,
  };
  if (webhookUrl) body.partner_webhook_url = webhookUrl;

  const { httpStatus, payload } = await aluuRequest<{
    success?: boolean;
    message?: unknown;
    data?: AluuCreateData;
  }>("POST", "/api/v.1/create", body);

  const supplierMessage = typeof payload?.message === "string" ? payload.message : null;

  if (payload?.success && payload.data && typeof payload.data.orderid === "string") {
    const data = payload.data;
    const status = normalizeSupplierStatus(data.status);

    const supplierOrder = existing
      ? await db.supplierOrder.update({
          where: { id: existing.id },
          data: {
            status,
            statusMessage:
              typeof data.message === "string" && data.message.trim()
                ? data.message
                : supplierMessage,
            aluuOrderRef: typeof data.reference === "string" ? data.reference : null,
            providerOrderId:
              typeof data.provider_order_id === "string" && data.provider_order_id.trim()
                ? data.provider_order_id
                : null,
            amountUsdCents:
              typeof data.amount === "number" && Number.isFinite(data.amount)
                ? Math.round(data.amount * 100)
                : existing.amountUsdCents,
            gameCode: pkg.supplierGameCode,
            denom: pkg.supplierPack,
            userid: order.ffUid,
            submittedById: admin.id,
            lastStatusAt: status !== "PENDING" ? new Date() : existing.lastStatusAt,
            rawResponse: payload as unknown as object,
          },
        })
      : await db.supplierOrder.create({
          data: {
            topUpOrderId: order.id,
            supplier: "ALUU",
            partnerOrderNumber,
            aluuOrderRef: typeof data.reference === "string" ? data.reference : null,
            providerOrderId:
              typeof data.provider_order_id === "string" && data.provider_order_id.trim()
                ? data.provider_order_id
                : null,
            gameCode: pkg.supplierGameCode,
            denom: pkg.supplierPack,
            userid: order.ffUid,
            amountUsdCents:
              typeof data.amount === "number" && Number.isFinite(data.amount)
                ? Math.round(data.amount * 100)
                : null,
            status,
            statusMessage:
              (typeof data.message === "string" && data.message.trim()) || supplierMessage,
            submittedById: admin.id,
            lastStatusAt: status !== "PENDING" ? new Date() : null,
            rawResponse: payload as unknown as object,
          },
        });

    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ALUU_ORDER_SUBMIT",
      entity: "TopUpOrder",
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        partnerOrderNumber,
        gameCode: pkg.supplierGameCode,
        denom: pkg.supplierPack,
        supplierStatus: status,
        aluuOrderRef: supplierOrder.aluuOrderRef,
        webhookSent: !!webhookUrl,
        retry: !!existing,
      },
    });

    // Move an APPROVED order forward so the status board reflects reality.
    if (order.status === "APPROVED") {
      await db.topUpOrder.update({
        where: { id: order.id },
        data: { status: "PROCESSING", reviewedById: admin.id },
      });
    }

    await notify({
      userId: order.user.id,
      type: "ORDER",
      title: "Order being delivered",
      body: `Your ${order.packageTitle} order ${order.orderNumber} is being delivered automatically now. You will be notified once the diamonds arrive.`,
      link: "/dashboard/orders",
    }).catch(() => undefined);

    return apiSuccess({ supplierOrder, resent: !!existing });
  }

  // Not accepted. Keep a local record so the admin can retry safely.
  const failureStatus = normalizeSupplierStatus(
    (payload?.data as AluuCreateData | undefined)?.status
  );
  const failData = {
    status: httpStatus,
    message: supplierMessage ?? "ALUU rejected the order",
    code: aluuErrorInfo(payload).code,
  };

  const supplierOrder = existing
    ? await db.supplierOrder.update({
        where: { id: existing.id },
        data: {
          // "error"/"cancelled" straight from the create call are supplier
          // verdicts; anything else is a local submit failure (retryable).
          status:
            failureStatus === "ERROR" || failureStatus === "CANCELLED"
              ? failureStatus
              : "SUBMIT_FAILED",
          statusMessage: failData.message,
          rawResponse: payload as unknown as object,
          submittedById: admin.id,
        },
      })
    : await db.supplierOrder.create({
        data: {
          topUpOrderId: order.id,
          supplier: "ALUU",
          partnerOrderNumber,
          gameCode: pkg.supplierGameCode,
          denom: pkg.supplierPack,
          userid: order.ffUid,
          status:
            failureStatus === "ERROR" || failureStatus === "CANCELLED"
              ? failureStatus
              : "SUBMIT_FAILED",
          statusMessage: failData.message,
          submittedById: admin.id,
          rawResponse: payload as unknown as object,
        },
      });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "ALUU_ORDER_SUBMIT_FAILED",
    entity: "TopUpOrder",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, ...failData },
  });

  // The order stays APPROVED/PROCESSING locally — money was verified, the
  // delivery simply failed and can be retried or refunded by the admin.
  return apiSuccess({ supplierOrder, resent: !!existing, failed: true, error: failData.message });
});
