/**
 * Netlify Scheduled Function — FazerCards automatic order status sync.
 *
 * Runs every 10 minutes and calls the site's own
 * `POST /api/admin/fazercards/refresh` endpoint with the server-side
 * `FAZERCARDS_SYNC_SECRET` bearer token. ALL fulfillment logic stays in the
 * Next.js TypeScript codebase — this function is a thin, fail-soft trigger:
 *
 *  - No-op (200, never retries) when FAZERCARDS_SYNC_SECRET is unset or the
 *    site URL is unknown — a missing config must never burn cron retries.
 *  - The refresh endpoint is bounded (max 20 orders/run), per-order
 *    fault-isolated, and only polls non-terminal FazerCards orders via the
 *    documented `GET /api/v2/orders/{orderId}` endpoint.
 *  - Never touches ALUU or manual orders.
 *
 * Optional env (server-side only):
 *   FAZERCARDS_SYNC_SECRET — enables the cron path; same value must be set
 *                            in the site's environment variables.
 *   FAZERCARDS_SYNC_URL    — override target (defaults to Netlify's injected
 *                            URL, e.g. https://raja-gaming.netlify.app).
 */
export default async () => {
  const secret = (process.env.FAZERCARDS_SYNC_SECRET || "").trim();
  const base = (
    process.env.FAZERCARDS_SYNC_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    ""
  ).replace(/\/+$/, "");

  if (!secret || !base) {
    console.info("fazercards-status-sync: not configured (FAZERCARDS_SYNC_SECRET or site URL missing) — no-op");
    return new Response(JSON.stringify({ ok: true, skipped: "not_configured" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50_000);
    const res = await fetch(`${base}/api/admin/fazercards/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.text().catch(() => "");
    console.info(`fazercards-status-sync: refresh responded ${res.status}`);
    return new Response(JSON.stringify({ ok: res.ok, status: res.status, body: body.slice(0, 2000) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Fail soft — the next cron tick retries; never throw in a scheduled fn.
    console.error("fazercards-status-sync failed", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ ok: false, error: "sync_failed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  schedule: "*/10 * * * *",
};
