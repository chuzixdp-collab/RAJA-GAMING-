
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 401 }
      );
    }

    const parts = Object.fromEntries(
      signature.split(",").map((part) => {
        const index = part.indexOf("=");
        return [
          part.slice(0, index).trim(),
          part.slice(index + 1).trim(),
        ];
      })
    );

    const timestamp = parts.t;
    const receivedSignature = parts.v1;

    if (!timestamp || !receivedSignature || !/^\d+$/.test(timestamp)) {
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
      return NextResponse.json(
        { error: "Expired signature" },
        { status: 401 }
      );
    }

    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest();

    let received: Buffer;

    try {
      received = Buffer.from(receivedSignature, "hex");
    } catch {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 401 }
      );
    }

    const event = JSON.parse(rawBody);

    // Verified webhook only. Order processing will be added
    // after confirming CryptoEze's exact event payload.
    console.info("Verified CryptoEze webhook received", {
      event: event?.event,
      eventId: event?.id,
    });

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook request" },
      { status: 400 }
    );
  }
}
