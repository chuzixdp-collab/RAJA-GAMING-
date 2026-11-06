/**
 * FazerCards fulfillment helpers shared by the admin submit/track routes, the
 * auto-submit hooks (verified CryptoEze payment / admin VERIFY) and the
 * webhook receiver.
 *
 * SECURITY / BUSINESS RULES (mirroring the ALUU + CryptoEze patterns):
 *  - A supplier order is created ONLY for orders whose payment was verified:
 *    either the HMAC-verified CryptoEze `payment.paid` webhook moved the
 *    order to PAYMENT_SUBMITTED, or an admin verified the payment
 *    (APPROVED/PROCESSING). Frontend payment messages are never trusted.
 *  - The Raja Gaming orderNumber is always sent as the documented
 *    `Idempotency-Key` on POST /topups/order — FazerCards returns the
 *    ORIGINAL order for a repeated key, so a retry can never double-order or
 *    double-charge. The local SupplierOrder rows are additionally protected
 *    by unique constraints (one supplier row per TopUpOrder, ever — across
 *    suppliers).
 *  - TopUpOrder is marked COMPLETED only when FazerCards reports the final
 *    `completed` status. Refunds/failures NEVER touch the customer order
 *    state — the admin decides on refunds/retries manually (never an
 *    automatic refund, never a double credit).
 *  - Every status application is idempotent: replays of the same final
 *    status do not resend notifications or re-apply state changes.
 *  - Nothing here ever logs or returns secret material.
 */
import { db } from "@/lib/db";
import {
  buildOrderFields,
  fazerErrorInfo,
  fazerRequest,
  formatFazerUsd,
  isValidFazerOrderId,
  normalizeFazerStatus,
  parseFazerPriceUsdCents,
  preflightCheck,
} from "@/lib/fazercards";
import { notify, notifyAdmins } from "@/lib/notifications";

/** TopUpOrder statuses that may still transition to COMPLETED automatically. */
const COMPLETABLE_ORDER_STATUSES = ["APPROVED", "PROCESSING"] as const;
/** Order statuses a FazerCards submission (manual or auto) may start from. */
const SUBMITTABLE_ORDER_STATUSES = ["PAYMENT_SUBMITTED", "APPROVED", "PROCESSING"] as const;

type FazerOrderObject = {
  id?: unknown;
  status?: unknown;
  message?: unknown;
  [key: string]: unknown;
};

/** Extract the balance (USD cents) from GET /api/v2/balance. */
function balanceUsdCentsFromPayload(payload: unknown): number | null {
  const p = payload as { ok?: unknown; balance?: unknown } | null | undefined;
  if (p?.ok !== true) return null;
  return parseFazerPriceUsdCents(p.balance);
}

/**
 * Apply a FazerCards order object (from GET /orders/{id} — the documented,
 * authoritative source — or the order object returned by the create call) to
 * the local SupplierOrder mirror + TopUpOrder.
 *
 * `via` describes the trigger; only logging/UX differs.
 */
export async function applyFazerStatus(
  supplierOrderIdOrRef: { id?: string; fzrOrderId?: string; partnerOrderNumber?: string },
  order: FazerOrderObject,
  via: "webhook" | "track" | "sync" | "submit"
): Promise<{
  applied: boolean;
  reason?: string;
  orderNumber?: string;
  supplierStatus?: string;
  orderCompleted?: boolean;
}> {
  const fzrOrderId = isValidFazerOrderId(order.id) ? order.id : null;
  const supplierOrder = await db.supplierOrder.findFirst({
    where: supplierOrderIdOrRef.id
      ? { id: supplierOrderIdOrRef.id }
      : supplierOrderIdOrRef.fzrOrderId
        ? { fzrOrderId: supplierOrderIdOrRef.fzrOrderId, supplier: "FAZERCARDS" }
        : { partnerOrderNumber: supplierOrderIdOrRef.partnerOrderNumber ?? "", supplier: "FAZERCARDS" },
    include: {
      topUpOrder: {
        select: { id: true, userId: true, orderNumber: true, totalAmount: true, packageTitle: true, status: true },
      },
    },
  });
  if (!supplierOrder) return { applied: false, reason: "SUPPLIER_ORDER_NOT_FOUND" };
  if (supplierOrder.supplier !== "FAZERCARDS") {
    return { applied: false, reason: "WRONG_SUPPLIER", orderNumber: supplierOrder.partnerOrderNumber };
  }

  const status = normalizeFazerStatus(order.status);
  // Unknown status → never touch local state (the docs do not enumerate all
  // status strings; an unknown value must not flip anything).
  if (status === "UNKNOWN") {
    return {
      applied: false,
      reason: "UNKNOWN_SUPPLIER_STATUS",
      orderNumber: supplierOrder.partnerOrderNumber,
      supplierStatus: typeof order.status === "string" ? order.status : undefined,
    };
  }

  const message = typeof order.message === "string" && order.message.trim() ? order.message.trim() : null;

  // Idempotency: a replay of the same final status is a no-op.
  if (supplierOrder.status === status && status !== "PENDING") {
    return {
      applied: false,
      reason: "ALREADY_RECORDED",
      orderNumber: supplierOrder.partnerOrderNumber,
      supplierStatus: status,
    };
  }

  await db.supplierOrder.update({
    where: { id: supplierOrder.id },
    data: {
      status,
      statusMessage: message,
      fzrOrderId: fzrOrderId ?? supplierOrder.fzrOrderId,
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
          title: "FazerCards delivered order",
          body: `${supplierOrder.topUpOrder.packageTitle} (${supplierOrder.partnerOrderNumber}) was delivered by FazerCards and marked COMPLETED.${message ? ` Note: ${message}` : ""}`,
          link: "/admin/orders",
        });
        await notify({
          userId: supplierOrder.topUpOrder.userId,
          type: "ORDER",
          title: "Diamonds delivered",
          body: `Your ${supplierOrder.topUpOrder.packageTitle} order ${supplierOrder.topUpOrder.orderNumber} has been delivered. Enjoy!`,
          link: "/dashboard/orders",
        });
        return {
          applied: true,
          orderNumber: supplierOrder.partnerOrderNumber,
          supplierStatus: status,
          orderCompleted: true,
        };
      }
    }
    return { applied: true, orderNumber: supplierOrder.partnerOrderNumber, supplierStatus: status, orderCompleted: false };
  }

  if (status === "ERROR" || status === "CANCELLED") {
    // Never auto-complete, never auto-refund. Admin decides.
    await notifyAdmins({
      type: "ORDER",
      title: `FazerCards order ${status.toLowerCase()}`,
      body: `FazerCards reported ${status.toLowerCase()} for ${supplierOrder.topUpOrder.packageTitle} (${supplierOrder.partnerOrderNumber}).${message ? ` Reason: ${message}` : ""} Review the order and handle any customer refund manually.`,
      link: "/admin/orders",
    });
  }

  return { applied: true, orderNumber: supplierOrder.partnerOrderNumber, supplierStatus: status, orderCompleted: false };
}

/**
 * Fetch the authoritative order object from the DOCUMENTED
 * `GET /api/v2/orders/{orderId}` endpoint.
 */
export async function fetchFazerOrder(
  fzrOrderId: string
): Promise<{ ok: true; order: FazerOrderObject } | { ok: false; error: string }> {
  const { payload } = await fazerRequest<{ ok?: unknown; order?: unknown; error?: unknown }>(
    "GET",
    `/api/v2/orders/${encodeURIComponent(fzrOrderId)}`
  );
  const p = payload as { ok?: unknown; order?: unknown; error?: unknown };
  if (p?.ok === true && p.order && typeof p.order === "object") {
    return { ok: true, order: p.order as FazerOrderObject };
  }
  return { ok: false, error: fazerErrorInfo(payload).message };
}

/**
 * Submit (or safely retry) a PAID top-up order to FazerCards.
 *
 * Gates (all must pass or nothing is sent):
 *  1. Order status ∈ PAYMENT_SUBMITTED (reached ONLY via the verified
 *     CryptoEze webhook) / APPROVED / PROCESSING (admin-verified).
 *  2. Package is synced from FazerCards (supplierSource="FAZERCARDS" with a
 *     stored category_id + offer_id + a player-id field).
 *  3. Pre-flight safety: the offer still exists, its live price has NOT
 *     increased vs the synced price, and the FazerCards balance covers it.
 *  4. FazerCards is configured + enabled (FAZERCARDS_ENABLED kill-switch).
 *
 * Idempotency: Idempotency-Key = orderNumber + unique local supplier rows.
 */
export async function submitToFazercards(
  topUpOrderId: string,
  opts: { via: "auto_webhook" | "auto_admin" | "manual"; actorId?: string | null }
): Promise<
  | { ok: true; supplierOrderId: string; fzrOrderId: string | null; status: string; resent: boolean }
  | { ok: false; error: string; reason: string }
> {
  const enabled = process.env.FAZERCARDS_ENABLED;
  if (enabled !== undefined && enabled.trim() !== "" && !["1", "true", "yes"].includes(enabled.trim().toLowerCase())) {
    return { ok: false, error: "FazerCards auto-delivery is disabled (FAZERCARDS_ENABLED).", reason: "DISABLED" };
  }

  const order = await db.topUpOrder.findUnique({
    where: { id: topUpOrderId },
    include: {
      package: {
        select: {
          supplierSource: true,
          supplierFzrCategoryId: true,
          supplierFzrOfferId: true,
          supplierFzrOfferName: true,
          supplierFzrFields: true,
          supplierPriceUsdCents: true,
        },
      },
      supplierOrder: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!order) return { ok: false, error: "Order not found.", reason: "ORDER_NOT_FOUND" };

  // GATE 1 — verified payment only.
  if (!SUBMITTABLE_ORDER_STATUSES.includes(order.status as (typeof SUBMITTABLE_ORDER_STATUSES)[number])) {
    return {
      ok: false,
      error: `Payment for ${order.orderNumber} is not verified yet (status: ${order.status}). Supplier orders are only placed after a verified payment.`,
      reason: "PAYMENT_NOT_VERIFIED",
    };
  }

  // GATE 2 — FazerCards-synced package only.
  const pkg = order.package;
  if (
    !pkg ||
    pkg.supplierSource !== "FAZERCARDS" ||
    !pkg.supplierFzrCategoryId ||
    !pkg.supplierFzrOfferId
  ) {
    return {
      ok: false,
      error: "This package is not linked to the FazerCards catalog. Sync it from the FazerCards supplier page first.",
      reason: "PACKAGE_NOT_SYNCED",
    };
  }
  // Narrowed after the gate — TS-safe for the submit body and failure rows.
  const pkgRef = {
    supplierFzrCategoryId: pkg.supplierFzrCategoryId,
    supplierFzrOfferId: pkg.supplierFzrOfferId,
  };

  // Existing supplier order — decide whether this is a retry or a no-op.
  const existing = order.supplierOrder;
  if (existing) {
    if (existing.supplier !== "FAZERCARDS") {
      return {
        ok: false,
        error: `This order was already submitted to ${existing.supplier}. It can never be sent to two suppliers.`,
        reason: "ALREADY_WITH_OTHER_SUPPLIER",
      };
    }
    if (existing.status === "PENDING" || existing.status === "SUCCESSFUL") {
      return {
        ok: false,
        error:
          existing.status === "PENDING"
            ? "A FazerCards order is already pending — track it instead of resubmitting."
            : "FazerCards already delivered this order.",
        reason: existing.status === "PENDING" ? "ALREADY_PENDING" : "ALREADY_DELIVERED",
      };
    }
    // SUBMIT_FAILED / ERROR / CANCELLED → a resubmit is allowed. The
    // documented Idempotency-Key (our orderNumber) makes this safe.
  }

  const fieldsSpec = pkg.supplierFzrFields;
  const builtFields = buildOrderFields(fieldsSpec, order.ffUid);
  if (!builtFields) {
    return {
      ok: false,
      error: "The synced FazerCards category has no player-ID text field — cannot build the order payload.",
      reason: "NO_PLAYER_FIELD",
    };
  }

  // GATE 3 — pre-flight safety: availability + pricing + balance.
  let liveOfferPriceUsdCents: number | null = null;
  try {
    const offersRes = await fazerRequest<{
      ok?: unknown;
      offers?: unknown;
      error?: unknown;
    }>("GET", `/api/v2/topups/offers?category_id=${encodeURIComponent(pkg.supplierFzrCategoryId)}`);
    const offersPayload = offersRes.payload as { ok?: unknown; offers?: unknown };
    if (offersPayload?.ok !== true || !Array.isArray(offersPayload.offers)) {
      return { ok: false, error: "Could not verify the FazerCards offer (catalog fetch failed).", reason: "OFFERS_FETCH_FAILED" };
    }
    const offer = (offersPayload.offers as Array<{ offer_id?: unknown; price_usd?: unknown }>).find(
      (o) => o && typeof o.offer_id === "string" && o.offer_id === pkg.supplierFzrOfferId
    );
    liveOfferPriceUsdCents = offer ? parseFazerPriceUsdCents(offer.price_usd) : null;
  } catch (error) {
    return {
      ok: false,
      error: `Could not reach FazerCards to verify the offer (${error instanceof Error ? error.message : "unknown"}).`,
      reason: "OFFERS_FETCH_FAILED",
    };
  }

  let supplierBalanceUsdCents: number | null = null;
  try {
    const balanceRes = await fazerRequest<{ ok?: unknown; balance?: unknown }>("GET", "/api/v2/balance");
    supplierBalanceUsdCents = balanceUsdCentsFromPayload(balanceRes.payload);
  } catch {
    // Balance check is best-effort; order proceeds only if it cannot be read.
    supplierBalanceUsdCents = null;
  }

  const preflight = preflightCheck(liveOfferPriceUsdCents, pkg.supplierPriceUsdCents, supplierBalanceUsdCents);
  if (!preflight.ok) {
    const messages: Record<string, string> = {
      OFFER_NOT_FOUND: "The FazerCards offer no longer exists in its category — resync the catalog.",
      OFFER_PRICE_ZERO: "The FazerCards offer price could not be read — resync the catalog.",
      PRICE_INCREASED: `The live FazerCards price (${formatFazerUsd(liveOfferPriceUsdCents)}) is above the synced price — resync the catalog and adjust the sale price before submitting.`,
      INSUFFICIENT_SUPPLIER_BALANCE: `The FazerCards balance does not cover this order (${formatFazerUsd(supplierBalanceUsdCents)} available). Top up the supplier account first.`,
    };
    return { ok: false, error: messages[preflight.reason ?? ""] ?? "Pre-flight safety check failed.", reason: preflight.reason ?? "PREFLIGHT_FAILED" };
  }

  // Submit with the documented idempotency guarantee.
  const partnerOrderNumber = order.orderNumber;
  try {
    const { httpStatus, payload } = await fazerRequest<{ ok?: unknown; order?: unknown; error?: unknown }>(
      "POST",
      "/api/v2/topups/order",
      {
        category_id: pkgRef.supplierFzrCategoryId,
        offer_id: pkgRef.supplierFzrOfferId,
        fields: builtFields.fields,
      },
      { idempotencyKey: partnerOrderNumber }
    );

    const p = payload as { ok?: unknown; order?: unknown; error?: unknown };
    if (p?.ok === true && p.order && typeof p.order === "object") {
      const fzrOrder = p.order as FazerOrderObject;
      const fzrOrderId = isValidFazerOrderId(fzrOrder.id) ? fzrOrder.id : null;
      const status = normalizeFazerStatus(fzrOrder.status);
      const message = typeof fzrOrder.message === "string" && fzrOrder.message.trim() ? fzrOrder.message.trim() : null;
      const liveUsd = liveOfferPriceUsdCents ?? pkg.supplierPriceUsdCents ?? null;

      const supplierOrder = existing
        ? await db.supplierOrder.update({
            where: { id: existing.id },
            data: {
              status: status === "UNKNOWN" ? "PENDING" : status,
              statusMessage: message,
              fzrOrderId: fzrOrderId ?? existing.fzrOrderId,
              gameCode: pkgRef.supplierFzrCategoryId,
              denom: pkgRef.supplierFzrOfferId,
              userid: order.ffUid,
              amountUsdCents: liveUsd,
              submittedById: opts.actorId ?? null,
              lastStatusAt: status !== "PENDING" && status !== "UNKNOWN" ? new Date() : existing.lastStatusAt,
            },
          })
        : await db.supplierOrder.create({
            data: {
              topUpOrderId: order.id,
              supplier: "FAZERCARDS",
              partnerOrderNumber,
              fzrOrderId: fzrOrderId ?? null,
              gameCode: pkgRef.supplierFzrCategoryId,
              denom: pkgRef.supplierFzrOfferId,
              userid: order.ffUid,
              amountUsdCents: liveUsd,
              status: status === "UNKNOWN" ? "PENDING" : status,
              statusMessage: message,
              submittedById: opts.actorId ?? null,
              lastStatusAt: status !== "PENDING" && status !== "UNKNOWN" ? new Date() : null,
            },
          });

      // Move the order forward — guarded so only submittable states flip.
      if (order.status === "PAYMENT_SUBMITTED" || order.status === "APPROVED") {
        await db.topUpOrder.updateMany({
          where: { id: order.id, status: { in: ["PAYMENT_SUBMITTED", "APPROVED"] } },
          data: {
            status: "PROCESSING",
            ...(opts.actorId ? { reviewedById: opts.actorId } : {}),
          },
        });
      }

      await notify({
        userId: order.user.id,
        type: "ORDER",
        title: "Order being delivered",
        body: `Your ${order.packageTitle} order ${order.orderNumber} is being delivered automatically now. You will be notified once the diamonds arrive.`,
        link: "/dashboard/orders",
      }).catch(() => undefined);

      // If the create response already carries a final status, apply it now
      // (idempotent — the mirror was just written with the same value).
      if (status === "SUCCESSFUL" || status === "ERROR" || status === "CANCELLED") {
        await applyFazerStatus({ id: supplierOrder.id }, fzrOrder, "submit").catch(() => undefined);
      }

      return {
        ok: true,
        supplierOrderId: supplierOrder.id,
        fzrOrderId: supplierOrder.fzrOrderId,
        status: supplierOrder.status,
        resent: !!existing,
      };
    }

    // Definitive rejection from FazerCards — record it (retryable).
    const info = fazerErrorInfo(payload);
    const failData = { status: httpStatus, message: info.message, code: info.code };
    await recordSubmitFailure(existing?.id ?? null, order.id, partnerOrderNumber, pkgRef, order.ffUid, failData, opts.actorId ?? null);
    return { ok: false, error: failData.message, reason: "SUPPLIER_REJECTED" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "FazerCards submission failed.";
    const failData = { status: 0, message, code: null as string | null };
    await recordSubmitFailure(existing?.id ?? null, order.id, partnerOrderNumber, pkgRef, order.ffUid, failData, opts.actorId ?? null).catch(() => undefined);
    return { ok: false, error: message, reason: "SUBMIT_FAILED" };
  }
}

/** Record a failed submission (SUBMIT_FAILED) so the admin can retry safely. */
async function recordSubmitFailure(
  existingId: string | null,
  topUpOrderId: string,
  partnerOrderNumber: string,
  pkg: { supplierFzrCategoryId: string; supplierFzrOfferId: string },
  userid: string,
  failData: { status: number; message: string; code: string | null },
  actorId: string | null
): Promise<void> {
  if (existingId) {
    await db.supplierOrder.update({
      where: { id: existingId },
      data: {
        status: "SUBMIT_FAILED",
        statusMessage: failData.message,
        submittedById: actorId,
      },
    });
  } else {
    await db.supplierOrder.create({
      data: {
        topUpOrderId,
        supplier: "FAZERCARDS",
        partnerOrderNumber,
        gameCode: pkg.supplierFzrCategoryId,
        denom: pkg.supplierFzrOfferId,
        userid,
        status: "SUBMIT_FAILED",
        statusMessage: failData.message,
        submittedById: actorId,
      },
    });
  }
  await notifyAdmins({
    type: "ORDER",
    title: "FazerCards submission failed",
    body: `Submitting ${partnerOrderNumber} to FazerCards failed: ${failData.message} The order is NOT lost — retry from the admin orders page (idempotent) or handle manually.`,
    link: "/admin/orders",
  }).catch(() => undefined);
}
