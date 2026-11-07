/**
 * Netlify Scheduled Function — ALUU delivery status poller trigger.
 *
 * Runs every 5 minutes (cron `*/5 * * * *`) and calls the site's own
 * POST /api/cron/aluu-poll endpoint with the shared CRON_SECRET bearer
 * token. All real logic lives inside the Next.js app
 * (src/lib/aluu-poll.ts + src/app/api/cron/aluu-poll/route.ts) so the whole
 * polling pipeline is typed, unit-testable and identical between local runs
 * and production.
 *
 * REQUIRED Netlify environment variable:
 *   CRON_SECRET — shared secret between this function and the API route
 *                 (fail closed: without it the route answers 503 and this
 *                 function reports skipped:NO_CRON_SECRET).
 * `URL` is provided by Netlify at runtime (the site's main domain).
 *
 * This function NEVER talks to ALUU directly, holds no keys besides
 * CRON_SECRET, and never places orders — it only refreshes supplier order
 * statuses through the gated, idempotent app pipeline.
 */

const POLL_PATH = "/api/cron/aluu-poll";

export default async () => {
  const base = (process.env.URL || process.env.DEPLOY_PRIME_URL || "").replace(/\/+$/, "");
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error("aluu-poll scheduled function misconfigured", {
      hasSiteUrl: Boolean(base),
      hasCronSecret: Boolean(secret),
    });
    return new Response(
      JSON.stringify({ skipped: true, reason: !base ? "NO_SITE_URL" : "NO_CRON_SECRET" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const response = await fetch(`${base}${POLL_PATH}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      // The route itself is deadline-bounded; this is just a safety net for
      // the HTTP hop (scheduled functions tolerate longer runs, but there is
      // nothing useful to wait for past 30 s).
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    console.info("aluu-poll cron run", { status: response.status, body: body.slice(0, 500) });
    return new Response(body.slice(0, 2000) || JSON.stringify({ ok: response.ok }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    // Never throw from a scheduled run — Netlify logs the failure and the
    // next 5-minute tick simply tries again.
    console.error("aluu-poll cron trigger failed", {
      error: error instanceof Error ? error.message : error,
    });
    return new Response(JSON.stringify({ ok: false, error: "trigger failed" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
};

export const config = {
  schedule: "*/5 * * * *",
};
