/**
 * POST /api/admin/fazercards/refresh — poll ALL in-flight FazerCards supplier
 * orders against the documented `GET /api/v2/orders/{orderId}` endpoint and
 * apply any status changes (admin only, or a server-side cron via
 * `Authorization: Bearer $FAZERCARDS_SYNC_SECRET` for the scheduled Netlify
 * function).
 *
 * Bounded (max 20 orders per run) and per-order fault-isolated: one broken
 * order never blocks the others. Only PENDING rows are polled — final
 * statuses are terminal.
 */
import { ApiError, apiSuccess, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyFazerStatus, fetchFazerOrder } from "@/lib/fazercards-fulfill";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_RUN = 20;

/** Cron-secret check — constant-time compare against FAZERCARDS_SYNC_SECRET. */
async function authorizeCron(req: Request): Promise<boolean> {
  const secret = (process.env.FAZERCARDS_SYNC_SECRET || "").trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const given = Buffer.from(match[1].trim(), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const POST = withApi(async (req: Request) => {
  const viaCron = await authorizeCron(req);
  if (!viaCron) await requireAdmin();

  const inFlight = await db.supplierOrder.findMany({
    where: { supplier: "FAZERCARDS", status: "PENDING", fzrOrderId: { not: null } },
    select: { id: true, fzrOrderId: true, partnerOrderNumber: true },
    orderBy: { updatedAt: "asc" },
    take: MAX_PER_RUN,
  });

  const results: Array<{ orderNumber: string; fzrOrderId: string; outcome: string; supplierStatus?: string }> = [];

  for (const row of inFlight) {
    if (!row.fzrOrderId) continue;
    try {
      const fetched = await fetchFazerOrder(row.fzrOrderId);
      if (!fetched.ok) {
        results.push({ orderNumber: row.partnerOrderNumber, fzrOrderId: row.fzrOrderId, outcome: `FETCH_FAILED: ${fetched.error}` });
        continue;
      }
      const applied = await applyFazerStatus({ id: row.id }, fetched.order, "sync");
      results.push({
        orderNumber: row.partnerOrderNumber,
        fzrOrderId: row.fzrOrderId,
        outcome: applied.applied ? `APPLIED:${applied.supplierStatus}` : `SKIPPED:${applied.reason}`,
        supplierStatus: applied.supplierStatus,
      });
    } catch (error) {
      results.push({
        orderNumber: row.partnerOrderNumber,
        fzrOrderId: row.fzrOrderId,
        outcome: `ERROR: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  return apiSuccess({ polled: inFlight.length, max: MAX_PER_RUN, via: viaCron ? "cron" : "admin", results });
});
