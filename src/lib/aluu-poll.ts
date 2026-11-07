/**
 * Automatic ALUU status polling — the PULL fallback for delivery statuses.
 * SERVER-ONLY. Used by POST /api/cron/aluu-poll, which is triggered every
 * 5 minutes by the Netlify Scheduled Function (netlify/functions/
 * aluu-poll-scheduled.mts).
 *
 * WHY THIS EXISTS: ALUU pushes final status changes to our webhook, but does
 * NOT guarantee redelivery, and the push URL is only attached when a public
 * HTTPS webhook URL is configured. If a push is lost, a paid order would sit
 * in supplier status PENDING forever unless an admin pressed "Track status"
 * manually. This poller closes that gap automatically.
 *
 * SAFETY RULES (identical to the webhook / admin track paths):
 *  - Statuses are applied exclusively through applyAluuStatus — the ONLY code
 *    path that can mark an order COMPLETED is a supplier-reported
 *    "successful". The poller itself never completes, refunds or retries.
 *  - Only supplier orders in PENDING / UNKNOWN are polled (SUCCESSFUL is
 *    final, ERROR/CANCELLED are admin decisions, SUBMIT_FAILED was never
 *    accepted by ALUU so there is nothing to track).
 *  - Bounded work per run: small batch, oldest first, per-call timeout and a
 *    soft wall-clock deadline — a slow ALUU must never wedge the cron slot.
 *  - Orders older than the retirement window are skipped (counted as stale)
 *    so a permanently stuck order cannot crowd out fresh ones; admins are
 *    expected to resolve those manually (retry/refund).
 *  - One failing order never aborts the run; errors are per-order and
 *    summarize only (no secret material anywhere).
 */
import { db } from "@/lib/db";
import { aluuErrorInfo, aluuRequest } from "@/lib/aluu";
import { applyAluuStatus } from "@/lib/aluu-fulfill";

/** Supplier statuses that may still change and are therefore polled. */
export const POLLABLE_SUPPLIER_STATUSES = ["PENDING", "UNKNOWN"] as const;

/** Max supplier orders refreshed per run (bounded cron work). */
export const POLL_BATCH_LIMIT = 5;

/** Orders older than this are left for manual admin handling. */
export const POLL_MAX_AGE_DAYS = 14;

/** Soft wall-clock deadline per run (the cron slot must stay short). */
export const POLL_DEADLINE_MS = 15_000;

/** Per-call ALUU timeout — shorter than the client default to bound the run. */
export const POLL_REQUEST_TIMEOUT_MS = 4_000;

export type AluuPollDetail = {
  orderNumber: string;
  ok: boolean;
  supplierStatus?: string;
  orderCompleted?: boolean;
  applied?: boolean;
  error?: string;
};

export type AluuPollSummary = {
  configured: boolean;
  checked: number;
  applied: number;
  completed: number;
  failed: number;
  staleSkipped: number;
  remaining: number;
  details: AluuPollDetail[];
};

/**
 * Run one bounded polling pass over pending ALUU supplier orders.
 * Never throws for per-order problems — everything is reported in the
 * summary. Throws only when ALUU is not configured (fail closed).
 */
export async function pollPendingAluuOrders(now = new Date()): Promise<AluuPollSummary> {
  const cutoff = new Date(now.getTime() - POLL_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const deadline = now.getTime() + POLL_DEADLINE_MS;

  const [pollable, staleSkipped] = await Promise.all([
    db.supplierOrder.findMany({
      where: {
        supplier: "ALUU",
        status: { in: [...POLLABLE_SUPPLIER_STATUSES] },
        createdAt: { gt: cutoff },
      },
      orderBy: { updatedAt: "asc" },
      take: POLL_BATCH_LIMIT,
      select: { id: true, partnerOrderNumber: true },
    }),
    db.supplierOrder.count({
      where: {
        supplier: "ALUU",
        status: { in: [...POLLABLE_SUPPLIER_STATUSES] },
        createdAt: { lte: cutoff },
      },
    }),
  ]);

  const summary: AluuPollSummary = {
    configured: true,
    checked: 0,
    applied: 0,
    completed: 0,
    failed: 0,
    staleSkipped,
    remaining: 0,
    details: [],
  };

  for (const row of pollable) {
    // Soft deadline — stop between orders when the cron budget is spent.
    if (Date.now() >= deadline) break;
    summary.checked += 1;

    const detail: AluuPollDetail = { orderNumber: row.partnerOrderNumber, ok: false };
    try {
      const { payload } = await aluuRequest<{ success?: boolean; data?: unknown }>(
        "GET",
        `/api/v.1/${encodeURIComponent(row.partnerOrderNumber)}`,
        undefined,
        { timeoutMs: POLL_REQUEST_TIMEOUT_MS }
      );

      if (payload?.success && payload.data && typeof payload.data === "object") {
        const result = await applyAluuStatus(
          payload.data as Parameters<typeof applyAluuStatus>[0],
          "track"
        );
        detail.ok = true;
        detail.supplierStatus = result.supplierStatus;
        detail.applied = result.applied;
        detail.orderCompleted = result.orderCompleted === true;
        if (result.applied) summary.applied += 1;
        if (result.orderCompleted) summary.completed += 1;
      } else {
        // ALUU answered but refused the status query — keep the mirror
        // untouched (the admin Track route surfaces the same condition).
        summary.failed += 1;
        detail.error = aluuErrorInfo(payload).message;
      }
    } catch (error) {
      summary.failed += 1;
      detail.error =
        error instanceof Error && error.message
          ? error.message
          : "Could not reach the ALUU API.";
    }
    summary.details.push(detail);
  }

  // How many pollable orders are still waiting after this pass (for the
  // cron log — shows whether the batch size keeps up with the backlog).
  summary.remaining = await db.supplierOrder.count({
    where: { supplier: "ALUU", status: { in: [...POLLABLE_SUPPLIER_STATUSES] }, createdAt: { gt: cutoff } },
  });

  return summary;
}
