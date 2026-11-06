/**
 * POST /api/admin/fazercards/webhook-setup — configure the FazerCards account
 * webhook to point at this site's receiver (admin only).
 *
 * Uses the DOCUMENTED endpoints only:
 *  - `PUT /api/v2/account/webhook` { url } — set/enable the webhook URL
 *  - `POST /api/v2/account/webhook/test`   — send one `webhook.test` event
 *
 * The HMAC secret is generated on the FazerCards side; this endpoint NEVER
 * returns or stores it — the admin copies it from the FazerCards dashboard
 * into the FAZERCARDS_WEBHOOK_SECRET environment variable. The receiver
 * fails closed while that variable is unset.
 */
import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import {
  fazerErrorInfo,
  fazerRequest,
  getFazerConfigPresence,
  resolveFazerWebhookUrl,
} from "@/lib/fazercards";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setupSchema = z.object({
  /** Also fire one documented `webhook.test` event after configuring. */
  sendTest: z.boolean().optional(),
  /** Override the target URL (defaults to NEXT_PUBLIC_APP_URL-based URL). */
  url: z.string().trim().url().max(2048).optional(),
});

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, setupSchema);

  if (!getFazerConfigPresence().apiKeySet) {
    throw new ApiError("FazerCards is not configured — set FAZERCARDS_API_KEY first.", 400);
  }

  const targetUrl = input.url || resolveFazerWebhookUrl();
  if (!targetUrl) {
    throw new ApiError(
      "Could not resolve a public HTTPS webhook URL — set NEXT_PUBLIC_APP_URL (or pass an explicit https:// URL).",
      400
    );
  }

  const put = await fazerRequest<{ ok?: unknown; error?: unknown }>("PUT", "/api/v2/account/webhook", {
    url: targetUrl,
    enabled: true,
  });
  if ((put.payload as { ok?: unknown })?.ok !== true) {
    throw new ApiError(`Webhook configuration failed: ${fazerErrorInfo(put.payload).message}`, 502);
  }

  let test: { sent: boolean; result?: string } = { sent: false };
  if (input.sendTest) {
    try {
      const testRes = await fazerRequest<{ ok?: unknown; status?: unknown; error?: unknown }>(
        "POST",
        "/api/v2/account/webhook/test"
      );
      const tp = testRes.payload as { ok?: unknown; status?: unknown; error?: unknown };
      test = {
        sent: true,
        result: tp?.ok === true ? `delivered (status ${String(tp.status ?? "?")})` : `failed: ${tp?.error ?? "unknown"}`,
      };
    } catch (error) {
      test = { sent: true, result: error instanceof Error ? error.message : "test request failed" };
    }
  }

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "FAZERCARDS_WEBHOOK_SETUP",
    entity: "FazerCards",
    entityId: targetUrl,
    metadata: { url: targetUrl, sendTest: input.sendTest === true, test },
  });

  return apiSuccess({
    url: targetUrl,
    webhookSecretConfigured: getFazerConfigPresence().webhookSecretSet,
    note:
      "Copy the webhook HMAC secret from the FazerCards dashboard into the FAZERCARDS_WEBHOOK_SECRET environment variable. The webhook receiver stays fail-closed (503) until then; order status keeps syncing via manual/periodic refresh.",
    test,
  });
});
