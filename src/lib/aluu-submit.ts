/**
 * ALUU order submission — shared core used by BOTH trust points that represent
 * a VERIFIED payment, and by the admin manual submit route:
 *
 *  1. `via = "auto_webhook"` — the HMAC-verified CryptoEze `payment.paid`
 *     webhook. The signature over the raw body IS the payment verification;
 *     frontend messages are never trusted.
 *  2. `via = "auto_admin"`   — an admin just pressed VERIFY on a manual
 *     payment (EasyPaisa screenshot etc.), moving the order to APPROVED.
 *  3. `via = "admin"`        — the existing admin "Submit to ALUU" button
 *     (retry path; identical behavior to the original route).
 *
 * HARD GATES (all must pass, or nothing is sent to the supplier):
 *  - Payment verified: the order status is one of the statuses allowed for
 *    the calling `via` (PAYMENT_SUBMITTED only counts for the webhook that
 *    itself just verified the payment cryptographically).
 *  - The package was synced from ALUU (supplierSource="ALUU") so the exact
 *    game code + denom ("Pack") are known.
 *  - The pack is not out of stock at the supplier.
 *  - ALUU credentials are configured (fails closed otherwise).
 *
 * IDEMPOTENCY / DUPLICATE PREVENTION:
 *  - partner_orderid is always the Raja Gaming orderNumber; ALUU answers a
 *    duplicate create with the existing order, so a retry can never
 *    double-order or double-charge.
 *  - SupplierOrder.topUpOrderId is UNIQUE in the database — even if the
 *    webhook and an admin submit race, only ONE supplier row per customer
 *    order can ever exist (a lost race is treated as "already submitted").
 *  - A local SupplierOrder row is only created after a definitive supplier
 *    answer; retries after SUBMIT_FAILED reuse the same partner_orderid.
 *
 * This module NEVER marks an order COMPLETED — delivery is only claimed when
 * ALUU itself reports "successful" (webhook or track, via aluu-fulfill).
 * Failures leave the paid order untouched (retryable) and notify admins.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  aluuErrorInfo,
  aluuRequest,
  AluuError,
  normalizeSupplierStatus,
  resolveWebhookUrl,
} from "@/lib/aluu";
import { logAudit } from "@/lib/audit";
import { notify, notifyAdmins } from "@/lib/notifications";

export type AluuSubmitVia = "admin" | "auto_webhook" | "auto_admin";

export type AluuSubmitActor = { id: string; email: string } | null;

type SupplierOrderRow = {
  id: string;
  topUpOrderId: string;
  status: string;
  partnerOrderNumber: string;
  statusMessage: string | null;
  aluuOrderRef: string | null;
  amountUsdCents: number | null;
  lastStatusAt: Date | null;
};

export type AluuSubmitResult =
  | { ok: false; code: "NOT_FOUND" }
  | { ok: false; code: "PAYMENT_NOT_VERIFIED"; orderStatus: string; message: string }
  | { ok: false; code: "NOT_ALUU_PACKAGE"; message: string }
  | { ok: false; code: "OUT_OF_STOCK"; message: string }
  | { ok: false; code: "ALUU_NOT_CONFIGURED"; message: string }
  | { ok: false; code: "ALUU_ERROR"; message: string }
  | { ok: true; kind: "no-op"; supplierOrder: SupplierOrderRow; note: string }
  | { ok: true; kind: "accepted"; supplierOrder: SupplierOrderRow; resent: boolean }
  | {
      ok: true;
      kind: "rejected";
      supplierOrder: SupplierOrderRow;
      error: string;
      resent: boolean;
    };

/**
 * Which order statuses count as a VERIFIED payment for each submission path.
 * Pure function (unit-tested): PAYMENT_SUBMITTED is only trustworthy when it
 * was just set by the HMAC-verified CryptoEze webhook itself — the admin
 * button and the admin VERIFY auto-submit still require APPROVED/PROCESSING.
 */
export function paymentVerifiedForSubmit(orderStatus: string, via: AluuSubmitVia): boolean {
  if (via === "auto_webhook") {
    return orderStatus === "PAYMENT_SUBMITTED" || orderStatus === "APPROVED" || orderStatus === "PROCESSING";
  }
  return orderStatus === "APPROVED" || orderStatus === "PROCESSING";
}

/**
 * The order status to move to after ALUU accepted the create call, or null to
 * keep the current status. Pure function (unit-tested).
 */
export function nextOrderStatusAfterSubmit(currentStatus: string): "PROCESSING" | null {
  return currentStatus === "APPROVED" || currentStatus === "PAYMENT_SUBMITTED" ? "PROCESSING" : null;
}

type AluuCreateData = {
  orderid?: unknown;
  reference?: unknown;
  provider_order_id?: unknown;
  status?: unknown;
  amount?: unknown;
  message?: unknown;
};

export async function submitOrderToAluu(
  orderId: string,
  opts: { via: AluuSubmitVia; actor?: AluuSubmitActor }
): Promise<AluuSubmitResult> {
  const via = opts.via;
  const actor = opts.actor ?? null;

  const order = await db.topUpOrder.findUnique({
    where: { id: orderId },
    include: {
      package: { select: { supplierSource: true, supplierGameCode: true, supplierPack: true, supplierStock: true } },
      supplierOrder: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!order) return { ok: false, code: "NOT_FOUND" };

  // GATE 1 — verified payment only (see paymentVerifiedForSubmit).
  if (!paymentVerifiedForSubmit(order.status, via)) {
    return {
      ok: false,
      code: "PAYMENT_NOT_VERIFIED",
      orderStatus: order.status,
      message: `Payment for ${order.orderNumber} is not verified yet (status: ${order.status}). Supplier orders are only placed after the payment is verified.`,
    };
  }

  // GATE 2 — the package must be a synced ALUU pack.
  const pkg = order.package;
  if (!pkg || pkg.supplierSource !== "ALUU" || !pkg.supplierGameCode || !pkg.supplierPack) {
    return {
      ok: false,
      code: "NOT_ALUU_PACKAGE",
      message:
        "This package is not linked to the ALUU catalog. Sync it from the Supplier page (or manage delivery manually).",
    };
  }
  if (pkg.supplierStock === "out_of_stock") {
    return {
      ok: false,
      code: "OUT_OF_STOCK",
      message: "This pack is currently out of stock at the supplier. Sync the catalog and re-check.",
    };
  }

  // Existing supplier order — decide whether this is a retry or a no-op.
  const existing = order.supplierOrder as SupplierOrderRow | null;
  if (existing) {
    if (existing.status === "PENDING" || existing.status === "SUCCESSFUL") {
      return {
        ok: true,
        kind: "no-op",
        supplierOrder: existing,
        note:
          existing.status === "PENDING"
            ? "Supplier order is already pending — check the status instead of resubmitting."
            : "Supplier already delivered this order.",
      };
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

  let httpStatus: number;
  let payload: { success?: boolean; message?: unknown; data?: AluuCreateData };
  try {
    ({ httpStatus, payload } = await aluuRequest<{
      success?: boolean;
      message?: unknown;
      data?: AluuCreateData;
    }>("POST", "/api/v.1/create", body));
  } catch (error) {
    if (error instanceof AluuError && error.code === "ALUU_NOT_CONFIGURED") {
      return {
        ok: false,
        code: "ALUU_NOT_CONFIGURED",
        message: "ALUU is not configured on the server (ALU_API_KEY / ALU_SECRET_KEY missing).",
      };
    }
    const message =
      error instanceof AluuError
        ? error.message
        : "Could not reach the ALUU API.";
    return { ok: false, code: "ALUU_ERROR", message };
  }

  const supplierMessage = typeof payload?.message === "string" ? payload.message : null;

  // ---------------- ALUU accepted the order ----------------
  if (payload?.success && payload.data && typeof payload.data.orderid === "string") {
    const data = payload.data;
    const status = normalizeSupplierStatus(data.status);

    const sharedData = {
      status,
      statusMessage:
        typeof data.message === "string" && data.message.trim() ? data.message : supplierMessage,
      aluuOrderRef: typeof data.reference === "string" ? data.reference : null,
      providerOrderId:
        typeof data.provider_order_id === "string" && data.provider_order_id.trim()
          ? data.provider_order_id
          : null,
      gameCode: pkg.supplierGameCode,
      denom: pkg.supplierPack,
      userid: order.ffUid,
      submittedById: actor?.id ?? null,
      rawResponse: payload as unknown as object,
    };

    let supplierOrder: SupplierOrderRow;
    try {
      supplierOrder = existing
        ? ((await db.supplierOrder.update({
            where: { id: existing.id },
            data: {
              ...sharedData,
              amountUsdCents:
                typeof data.amount === "number" && Number.isFinite(data.amount)
                  ? Math.round(data.amount * 100)
                  : (existing as { amountUsdCents: number | null }).amountUsdCents,
              lastStatusAt: status !== "PENDING" ? new Date() : (existing as { lastStatusAt: Date | null }).lastStatusAt,
            },
          })) as SupplierOrderRow)
        : ((await db.supplierOrder.create({
            data: {
              topUpOrderId: order.id,
              supplier: "ALUU",
              partnerOrderNumber,
              amountUsdCents:
                typeof data.amount === "number" && Number.isFinite(data.amount)
                  ? Math.round(data.amount * 100)
                  : null,
              lastStatusAt: status !== "PENDING" ? new Date() : null,
              ...sharedData,
            },
          })) as SupplierOrderRow);
    } catch (error) {
      // Lost a race against a concurrent submit (webhook + admin click):
      // the UNIQUE(topUpOrderId) constraint guarantees ONE supplier row per
      // customer order — exactly one supplier attempt, by design.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await db.supplierOrder.findUnique({ where: { topUpOrderId: order.id } });
        if (winner) {
          return {
            ok: true,
            kind: "no-op",
            supplierOrder: winner as SupplierOrderRow,
            note: "A supplier order was already created for this order (concurrent submit lost the race).",
          };
        }
      }
      throw error;
    }

    await logAudit({
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action: "ALUU_ORDER_SUBMIT",
      entity: "TopUpOrder",
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        partnerOrderNumber,
        gameCode: pkg.supplierGameCode,
        denom: pkg.supplierPack,
        supplierStatus: status,
        aluuOrderRef: supplierOrder.aluuOrderRef ?? null,
        webhookSent: !!webhookUrl,
        retry: !!existing,
        via,
      },
    });

    // Move a freshly-verified order forward so the status board reflects
    // reality. reviewedById keeps its existing value for auto paths (the
    // VERIFY action already set it; the webhook has no admin actor).
    const nextStatus = nextOrderStatusAfterSubmit(order.status);
    if (nextStatus) {
      await db.topUpOrder.update({
        where: { id: order.id },
        data: { status: nextStatus, ...(actor ? { reviewedById: actor.id } : {}) },
      });
    }

    await notify({
      userId: order.user.id,
      type: "ORDER",
      title: "Order being delivered",
      body: `Your ${order.packageTitle} order ${order.orderNumber} is being delivered automatically now. You will be notified once the diamonds arrive.`,
      link: "/dashboard/orders",
    }).catch(() => undefined);

    if (via !== "admin") {
      await notifyAdmins({
        type: "ORDER",
        title: "ALUU order placed automatically",
        body: `${order.packageTitle} (${order.orderNumber}) was submitted to ALUU automatically after payment verification${via === "auto_webhook" ? " by the CryptoEze webhook" : " by an admin VERIFY action"}. Supplier status: ${status.toLowerCase()}.`,
        link: "/admin/supplier",
      }).catch(() => undefined);
    }

    return { ok: true, kind: "accepted", supplierOrder, resent: !!existing };
  }

  // ---------------- ALUU rejected / could not accept ----------------
  const failureStatus = normalizeSupplierStatus(
    (payload?.data as AluuCreateData | undefined)?.status
  );
  const failData = {
    status: httpStatus,
    message: supplierMessage ?? "ALUU rejected the order",
    code: aluuErrorInfo(payload).code,
  };
  const localStatus =
    failureStatus === "ERROR" || failureStatus === "CANCELLED" ? failureStatus : "SUBMIT_FAILED";

  const supplierOrder = existing
    ? ((await db.supplierOrder.update({
        where: { id: existing.id },
        data: {
          // "error"/"cancelled" straight from the create call are supplier
          // verdicts; anything else is a local submit failure (retryable).
          status: localStatus,
          statusMessage: failData.message,
          rawResponse: payload as unknown as object,
          submittedById: actor?.id ?? null,
        },
      })) as SupplierOrderRow)
    : ((await db.supplierOrder.create({
        data: {
          topUpOrderId: order.id,
          supplier: "ALUU",
          partnerOrderNumber,
          gameCode: pkg.supplierGameCode,
          denom: pkg.supplierPack,
          userid: order.ffUid,
          status: localStatus,
          statusMessage: failData.message,
          submittedById: actor?.id ?? null,
          rawResponse: payload as unknown as object,
        },
      })) as SupplierOrderRow);

  await logAudit({
    actorId: actor?.id ?? null,
    actorEmail: actor?.email ?? null,
    action: "ALUU_ORDER_SUBMIT_FAILED",
    entity: "TopUpOrder",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, ...failData, via },
  });

  if (via !== "admin") {
    await notifyAdmins({
      type: "ORDER",
      title: "ALUU auto-submit failed",
      body: `Automatic submission of ${order.packageTitle} (${order.orderNumber}) did not go through: ${failData.message}. The paid order is untouched — retry from the orders page or handle manually.`,
      link: "/admin/orders",
    }).catch(() => undefined);
  }

  // The order stays APPROVED/PROCESSING/PAYMENT_SUBMITTED locally — money was
  // verified, the delivery simply failed and can be retried or refunded by
  // the admin.
  return { ok: true, kind: "rejected", supplierOrder, error: failData.message, resent: !!existing };
}
