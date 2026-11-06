/**
 * POST /api/webhooks/fazercards — FazerCards webhook receiver.
 *
 * SECURITY MODEL (documented limitation, handled conservatively):
 *  - The FazerCards OpenAPI documents that an account webhook exists, that an
 *    HMAC secret is generated/rotatable, and that events are delivered with
 *    retries — but it does NOT define the payload schema or the signature
 *    header name. This receiver therefore:
 *      1. FAILS CLOSED (500) when FAZERCARDS_WEBHOOK_SECRET is not set —
 *         identical to the CryptoEze/ALUU webhook posture.
 *      2. Requires a signature header (first match of x-fazer-signature /
 *         x-signature / x-webhook-signature / x-hub-signature-256) and
 *         verifies a hex HMAC-SHA256 over the RAW body (constant-time).
 *      3. Enforces a 5-minute replay window ONLY when a numeric timestamp
 *         header is present (x-fazer-timestamp / x-timestamp).
 *      4. Deduplicates deliveries via FazerWebhookEvent (P2002 →
 *         { received: true, duplicate: true }).
 *      5. NEVER trusts payload fields for state changes. It extracts a
 *         FazerCards order reference (`ord-N`) from the payload and then
 *         re-fetches the AUTHORITATIVE order state from the documented
 *         `GET /api/v2/orders/{orderId}` endpoint before anything is applied.
 *         Payloads without a parseable order reference are accepted and
 *         ignored ({ received: true, action: "none" }).
 *
 *  The result: even if FazerCards' payload format differs from what this
 *  receiver expects, the worst case is a no-op — state can only ever change
 *  via the documented order endpoint.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildFazerEventId,
  extractFazerOrderIdFromPayload,
  isValidFazerOrderId,
  verifyFazerWebhook,
} from "@/lib/fazercards";
import { applyFazerStatus, fetchFazerOrder } from "@/lib/fazercards-fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    endpoint: "FazerCards webhook",
    status: "online",
    note: "Webhook accepts POST requests only. Order state is always re-verified via the documented orders API.",
  });
}

export async function POST(req: Request) {
  const secret = process.env.FAZERCARDS_WEBHOOK_SECRET;

  // Fail closed — same posture as the CryptoEze/ALUU receivers.
  if (!secret) {
    console.error("FazerCards webhook secret is not configured");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 500 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const signatureHeader =
    req.headers.get("x-fazer-signature") ||
    req.headers.get("x-signature") ||
    req.headers.get("x-webhook-signature") ||
    req.headers.get("x-hub-signature-256");
  const timestampHeader = req.headers.get("x-fazer-timestamp") || req.headers.get("x-timestamp");

  const verdict = verifyFazerWebhook(rawBody, signatureHeader, timestampHeader);
  if (!verdict.ok) {
    return NextResponse.json({ error: `Webhook verification failed: ${verdict.reason}` }, { status: 401 });
  }

  // Dedup BEFORE any processing — replays are a cheap no-op.
  const eventId = buildFazerEventId(safeJsonField(rawBody, "event_id") ?? safeJsonField(rawBody, "id"), rawBody);
  const eventType = safeJsonField(rawBody, "event") ?? safeJsonField(rawBody, "type");
  try {
    await db.fazerWebhookEvent.create({
      data: {
        eventId,
        eventType: typeof eventType === "string" ? eventType.slice(0, 120) : null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("Could not record FazerCards webhook event");
    return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  }

  // Extract ONLY an order reference — every other payload field is ignored.
  const fzrOrderId = extractFazerOrderIdFromPayload(rawBody);
  if (!isValidFazerOrderId(fzrOrderId)) {
    // No order reference (e.g. the documented `webhook.test` event) — accept.
    return NextResponse.json({ received: true, action: "none" });
  }

  // Authoritative re-fetch via the DOCUMENTED endpoint. Payload data is never
  // used for state changes.
  try {
    const fetched = await fetchFazerOrder(fzrOrderId);
    if (!fetched.ok) {
      // Unknown/foreign order id — accept the delivery, change nothing.
      console.info("FazerCards webhook referenced an order that could not be fetched", {
        fzrOrderId,
        error: fetched.error,
      });
      return NextResponse.json({ received: true, action: "ignored" });
    }
    const applied = await applyFazerStatus({ fzrOrderId }, fetched.order, "webhook");
    return NextResponse.json({
      received: true,
      action: applied.applied ? "applied" : "skipped",
      reason: applied.reason ?? null,
    });
  } catch (error) {
    // The event is already recorded (dedup) and verified — never fail after
    // persistence; the periodic refresh will reconcile any missed change.
    console.error("FazerCards webhook order sync failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ received: true, action: "deferred" });
  }
}

/** Best-effort top-level string field extraction from the raw JSON body. */
function safeJsonField(rawBody: string, field: string): string | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object") {
      const value = (parsed as Record<string, unknown>)[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // not JSON — signature already verified; treat as opaque
  }
  return null;
}
