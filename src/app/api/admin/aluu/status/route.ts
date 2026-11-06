/**
 * GET /api/admin/aluu/status — supplier connection panel (admin only).
 *
 * Reports PRESENCE of the ALUU credentials as booleans only — never values.
 * When configured, also fetches the live wallet balance + plan through the
 * signed client. Fails closed: an unconfigured account yields
 * { configured: false } with HTTP 200 so the admin UI stays simple.
 */
import { apiSuccess, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import {
  aluuErrorInfo,
  getAluuConfigPresence,
  aluuRequest,
  resolveWebhookUrl,
} from "@/lib/aluu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  await requireAdmin();

  const presence = getAluuConfigPresence();
  const configured = presence.apiKeySet && presence.secretSet;
  const webhookUrl = resolveWebhookUrl();

  if (!configured) {
    return apiSuccess({
      configured: false,
      apiKeySet: presence.apiKeySet,
      secretSet: presence.secretSet,
      webhookUrlSet: !!webhookUrl,
      baseUrl: presence.baseUrl,
      balance: null,
      plan: null,
      note: !presence.apiKeySet
        ? "ALU_API_KEY is missing."
        : "ALU_SECRET_KEY is missing — IP-free (signed) mode needs both keys.",
    });
  }

  // Signed balance + plan fetches; a failure here is reported, never thrown
  // as a raw 500 — the admin panel should still render.
  let balance: number | null = null;
  let currency: string | null = null;
  let plan: { name: string | null; limits: unknown; usedToday: unknown } | null = null;
  let warning: string | null = null;

  try {
    const { payload } = await aluuRequest<{ success?: boolean; data?: { wallet_balance?: number; currency?: string } }>(
      "GET",
      "/api/v.1/balance"
    );
    if (payload?.success && payload.data && typeof payload.data.wallet_balance === "number") {
      balance = payload.data.wallet_balance;
      currency = payload.data.currency ?? "USD";
    } else {
      warning = aluuErrorInfo(payload).message;
    }
  } catch (e) {
    warning = e instanceof Error ? e.message : "Could not reach ALUU.";
  }

  try {
    const { payload } = await aluuRequest<{
      success?: boolean;
      data?: { plan?: { name?: string } | null; limits?: unknown; used_today?: unknown };
    }>("GET", "/api/v.1/plan");
    if (payload?.success && payload.data) {
      plan = {
        name: payload.data.plan?.name ?? null,
        limits: payload.data.limits ?? null,
        usedToday: payload.data.used_today ?? null,
      };
    }
  } catch {
    // Plan info is optional; balance failure already sets the warning.
  }

  return apiSuccess({
    configured: true,
    apiKeySet: presence.apiKeySet,
    secretSet: presence.secretSet,
    webhookUrlSet: !!webhookUrl,
    baseUrl: presence.baseUrl,
    balance,
    currency,
    plan,
    warning,
  });
});
