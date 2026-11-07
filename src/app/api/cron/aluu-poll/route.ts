/**
 * POST /api/cron/aluu-poll — automatic ALUU supplier status polling.
 *
 * Triggered every 5 minutes by the Netlify Scheduled Function
 * (netlify/functions/aluu-poll-scheduled.mts) with
 * `Authorization: Bearer $CRON_SECRET`. This is the PULL fallback for
 * delivery statuses: ALUU pushes final statuses to /api/webhooks/aluu, but
 * does not guarantee redelivery — this poller makes sure a paid order can
 * never silently stall in supplier status PENDING.
 *
 * SECURITY:
 *  - FAIL CLOSED: without CRON_SECRET configured the endpoint answers 503
 *    and never polls. Wrong bearer -> 401 (timing-safe compare, see
 *    src/lib/cron.ts). This is a server-to-server endpoint: no session, no
 *    CSRF, no same-origin check — ONLY the shared secret.
 *  - Work is bounded (see src/lib/aluu-poll.ts): small batch, oldest first,
 *    per-call timeout, soft deadline. No order is ever completed, refunded
 *    or resubmitted here — statuses apply exclusively through
 *    applyAluuStatus, whose only COMPLETED path is a supplier-reported
 *    "successful".
 *
 * Responses (all JSON): 200 { ok, summary } | 401 | 405 (method info) |
 * 503 (not configured).
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron";
import { pollPendingAluuOrders } from "@/lib/aluu-poll";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    endpoint: "ALUU status poller (cron)",
    status: "online",
    note: "Accepts POST requests only, authenticated with the CRON_SECRET bearer token.",
  });
}

export async function POST(req: Request) {
  const verdict = verifyCronAuth(req.headers.get("authorization"), process.env.CRON_SECRET);

  if (!verdict.ok) {
    if (verdict.reason === "NO_SECRET") {
      console.error("ALUU poller cron secret is not configured");
      return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let summary;
  try {
    summary = await pollPendingAluuOrders();
  } catch (error) {
    // Includes the fail-closed ALUU_NOT_CONFIGURED case: nothing to poll
    // without credentials, and nothing for the scheduler to retry.
    console.error("ALUU poll run failed", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ ok: false, error: "Poll run failed" }, { status: 502 });
  }

  // Audit only when something actually changed — a 5-minute cron must not
  // flood the audit log with no-op runs.
  if (summary.applied > 0) {
    await logAudit({
      actorId: null,
      actorEmail: "cron@netlify-scheduled",
      action: "ALUU_STATUS_POLL",
      entity: "SupplierOrder",
      entityId: null,
      metadata: {
        checked: summary.checked,
        applied: summary.applied,
        completed: summary.completed,
        failed: summary.failed,
        staleSkipped: summary.staleSkipped,
        completedOrders: summary.details.filter((d) => d.orderCompleted).map((d) => d.orderNumber),
      },
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, summary });
}
