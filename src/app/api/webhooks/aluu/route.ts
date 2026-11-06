/**
 * ALUU top-up webhook — POST /api/webhooks/aluu
 *
 * Security model (identical in shape to the CryptoEze webhook):
 *  1. FAIL CLOSED — without ALU_SECRET_KEY configured the endpoint returns
 *     500 and never processes anything.
 *  2. RAW-BODY HMAC — signature = hex(HMAC_SHA256(secret, timestamp + "." +
 *     raw_body)), sent as X-Webhook-Timestamp + X-Webhook-Signature.
 *     Verified with timingSafeEqual against the exact bytes received.
 *  3. REPLAY PROTECTION — timestamps older/newer than 5 minutes are rejected.
 *  4. DEDUPLICATION — every processed event is recorded in AluuWebhookEvent
 *     (id = `${orderid}:${status}:${updatedAt}`); a replayed event gets
 *     { received: true, duplicate: true } and no second side effect.
 *  5. NO EARLY DELIVERY CLAIMS — an order is marked COMPLETED only when the
 *     supplier status is literally "successful" (handled inside
 *     applyAluuStatus). error/cancelled never touch the order state.
 *
 * A webhook is sent when an order reaches its final status. ALUU does not
 * guarantee redelivery, so status can always be recovered through the admin
 * "Track status" action (GET /api/v.1/:partner_orderid).
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildWebhookEventId, verifyAluuWebhook } from "@/lib/aluu";
import { applyAluuStatus, type AluuStatusPayload } from "@/lib/aluu-fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    endpoint: "ALUU webhook",
    status: "online",
    note: "Webhook accepts POST requests only for top-up order status events.",
  });
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const timestamp = req.headers.get("X-Webhook-Timestamp");
    const signature = req.headers.get("X-Webhook-Signature");

    const verdict = verifyAluuWebhook(rawBody, timestamp, signature);

    if (!verdict.ok) {
      // Distinguish "misconfigured server" (500) from "bad request" (4xx),
      // exactly like the CryptoEze webhook does.
      if (verdict.reason === "NOT_CONFIGURED") {
        console.error("ALUU webhook secret is not configured");
        return NextResponse.json({ error: "Webhook is not configured" }, { status: 500 });
      }
      if (verdict.reason === "MISSING_HEADERS" || verdict.reason === "INVALID_SIGNATURE") {
        return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
      }
      // STALE_TIMESTAMP
      return NextResponse.json({ error: "Expired signature" }, { status: 401 });
    }

    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!event || typeof event !== "object") {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    const payload = event as { success?: unknown; data?: AluuStatusPayload | null };
    const data = payload.data;

    if (
      !data ||
      typeof data !== "object" ||
      typeof data.orderid !== "string" ||
      !data.orderid.trim() ||
      typeof data.status !== "string" ||
      !data.status.trim()
    ) {
      return NextResponse.json({ error: "Missing required event fields" }, { status: 400 });
    }

    const eventId = buildWebhookEventId(
      data.orderid.trim(),
      data.status.trim(),
      typeof data.updatedAt === "string" ? data.updatedAt : "unknown"
    );

    // Deduplication — mirrors cryptoEzeWebhookEvent.create() + P2002.
    try {
      await db.aluuWebhookEvent.create({
        data: { id: eventId, orderNumber: data.orderid.trim() },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json({ received: true, duplicate: true });
      }
      console.error("Could not record ALUU webhook event");
      return NextResponse.json({ error: "Could not record event" }, { status: 500 });
    }

    // The event is now durably recorded — apply it. A failure here must NOT
    // fail the webhook (the event is persisted; the admin can always use
    // Track status, and ALUU does not rely on redelivery).
    try {
      const result = await applyAluuStatus(data, "webhook");
      console.info("Processed ALUU webhook", {
        via: "webhook",
        orderNumber: result.orderNumber,
        supplierStatus: result.supplierStatus,
        orderCompleted: result.orderCompleted === true,
        applied: result.applied,
        reason: result.reason ?? null,
      });
    } catch (processingError) {
      console.error("ALUU webhook status handling failed", processingError);
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });
  }
}
