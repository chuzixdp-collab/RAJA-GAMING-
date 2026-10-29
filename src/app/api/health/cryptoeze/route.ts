/**
 * GET /api/health/cryptoeze — configuration-presence probe for Deploy
 * Previews and production. Reports ONLY booleans and static paths — never a
 * secret value. The values of CRYPTOEZE_SECRET_KEY / SITE_URL /
 * CRYPTOEZE_WEBHOOK_SECRET are not readable from any endpoint.
 *
 * Unauthenticated on purpose so it stays usable even when session auth itself
 * is misconfigured (e.g. AUTH_SECRET problems); the disclosed information is
 * limited to "is each variable set" (same signal the server logs emit).
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
// force-dynamic: env must be read at request time, never baked in at build.
export const dynamic = "force-dynamic";

export async function GET() {
  const secretKey = Boolean(process.env.CRYPTOEZE_SECRET_KEY);
  const siteUrl = Boolean(process.env.SITE_URL);
  const webhookSecret = Boolean(process.env.CRYPTOEZE_WEBHOOK_SECRET);

  return NextResponse.json({
    ok: true,
    data: {
      provider: "cryptoeze",
      webhookPath: "/api/webhooks/cryptoeze",
      config: {
        secretKey,
        siteUrl,
        webhookSecret,
        // Mirrors the exact gate the checkout route applies before calling
        // the provider (both vars required, else the route returns 503 with
        // "use EasyPaisa" guidance).
        checkoutReady: secretKey && siteUrl,
      },
    },
  });
}
