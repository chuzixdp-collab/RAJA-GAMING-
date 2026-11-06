/**
 * GET /api/admin/fazercards/status — connection status + balance + order
 * counters for the FazerCards supplier management page (admin only).
 *
 * Never returns secret material — config presence as booleans only.
 */
import { apiSuccess, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  fazerErrorInfo,
  fazerRequest,
  getFazerConfigPresence,
} from "@/lib/fazercards";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  await requireAdmin();

  const presence = getFazerConfigPresence();
  const settings = await getSettings();

  // Order counters from the local mirror (no supplier call needed).
  const counts = await db.supplierOrder.groupBy({
    by: ["status"],
    where: { supplier: "FAZERCARDS" },
    _count: { _all: true },
  });
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of counts) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }

  let account: {
    reachable: boolean;
    balanceUsd: string | null;
    login: string | null;
    plan: string | null;
    subscriptionActive: boolean | null;
    error: string | null;
  } = { reachable: false, balanceUsd: null, login: null, plan: null, subscriptionActive: null, error: null };

  if (presence.apiKeySet) {
    try {
      const balanceRes = await fazerRequest<{ ok?: unknown; balance?: unknown; error?: unknown }>(
        "GET",
        "/api/v2/balance"
      );
      const meRes = await fazerRequest<{
        ok?: unknown;
        login?: unknown;
        plan?: unknown;
        subscriptionActive?: unknown;
      }>("GET", "/api/v2/me");
      const balancePayload = balanceRes.payload as { ok?: unknown; balance?: unknown };
      const mePayload = meRes.payload as {
        ok?: unknown;
        login?: unknown;
        plan?: unknown;
        subscriptionActive?: unknown;
      };
      account = {
        reachable: balancePayload?.ok === true,
        balanceUsd: typeof balancePayload?.balance === "string" ? balancePayload.balance : null,
        login: typeof mePayload?.login === "string" ? mePayload.login : null,
        plan: typeof mePayload?.plan === "string" ? mePayload.plan : null,
        subscriptionActive: typeof mePayload?.subscriptionActive === "boolean" ? mePayload.subscriptionActive : null,
        error: balancePayload?.ok === true ? null : fazerErrorInfo(balanceRes.payload).message,
      };
    } catch (error) {
      account.error = error instanceof Error ? error.message : "FazerCards API unreachable.";
    }
  }

  return apiSuccess({
    config: presence,
    enabled:
      process.env.FAZERCARDS_ENABLED === undefined ||
      process.env.FAZERCARDS_ENABLED.trim() === "" ||
      ["1", "true", "yes"].includes(process.env.FAZERCARDS_ENABLED.trim().toLowerCase()),
    account,
    orders: {
      total,
      successful: byStatus["SUCCESSFUL"] ?? 0,
      pending: (byStatus["PENDING"] ?? 0) + (byStatus["SUBMIT_FAILED"] ?? 0),
      failed: (byStatus["ERROR"] ?? 0) + (byStatus["CANCELLED"] ?? 0),
      byStatus,
    },
    settings: {
      usdToPkr: settings.FAZERCARDS_USD_TO_PKR || "280",
      markupPercent: settings.FAZERCARDS_PRICE_MARKUP_PERCENT || "0",
      ffCategoryId: settings.FAZERCARDS_FF_CATEGORY_ID || "",
    },
  });
});
