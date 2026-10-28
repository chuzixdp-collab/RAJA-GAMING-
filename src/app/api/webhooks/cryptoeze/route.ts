
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    endpoint: "CryptoEze webhook",
    status: "online",
    note: "Webhook accepts POST requests only for payment events.",
  });
}

export async function POST(req: Request) {
  try {
    const secret = process.env.CRYPTOEZE_WEBHOOK_SECRET;

    if (!secret) {
      console.error("CryptoEze webhook secret is not configured");
      return NextResponse.json(
        { error: "Webhook is not configured" },
        { status: 500 }
      );
    }

    const rawBody = await req.text();
    const signature = req.headers.get("X-CryptoEze-Signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const parts = Object.fromEntries(
      signature.split(",").map((part) => {
        const index = part.indexOf("=");
        if (index < 1) return ["", ""];
        return [
          part.slice(0, index).trim(),
          part.slice(index + 1).trim(),
        ];
      })
    );

    const timestamp = parts.t;
    const receivedSignature = parts.v1;

    if (
      !timestamp ||
      !receivedSignature ||
      !/^\d+$/.test(timestamp) ||
      !/^[a-fA-F0-9]{64}$/.test(receivedSignature)
    ) {
      return NextResponse.json(
        { error: "Invalid signature format" },
        { status: 401 }
      );
    }

    const timestampMs = Number(timestamp) * 1000;

    if (
      !Number.isSafeInteger(timestampMs) ||
      Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000
    ) {
      return NextResponse.json({ error: "Expired signature" }, { status: 401 });
    }

    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest();

    const received = Buffer.from(receivedSignature, "hex");

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 401 }
      );
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

    const payload = event as {
      id?: unknown;
      type?: unknown;
      data?: { order_id?: unknown } | null;
    };

    if (
      typeof payload.id !== "string" ||
      !payload.id.trim() ||
      typeof payload.type !== "string" ||
      !payload.type.trim() ||
      !payload.data ||
      typeof payload.data.order_id !== "string" ||
      !payload.data.order_id.trim()
    ) {
      return NextResponse.json(
        { error: "Missing required event fields" },
        { status: 400 }
      );
    }

    try {
      await db.cryptoEzeWebhookEvent.create({
        data: {
          id: payload.id,
          eventType: payload.type,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json({ received: true, duplicate: true });
      }

      console.error("Could not record CryptoEze webhook event");
      return NextResponse.json(
        { error: "Could not record event" },
        { status: 500 }
      );
    }

    console.info("Verified CryptoEze webhook recorded", {
      eventType: payload.type,
      eventId: payload.id,
      orderNumber: payload.data.order_id,
    });

    // Intentionally do not approve orders or trigger diamond delivery here.
    // Keep the existing manual admin verification flow unchanged.
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook request" },
      { status: 400 }
    );
  }
}
