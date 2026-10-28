
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const secretKey = process.env.CRYPTOEZE_SECRET_KEY;
    const siteUrl = process.env.SITE_URL;

    if (!secretKey || !siteUrl) {
      return NextResponse.json(
        { error: "Payment configuration is missing" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const orderId =
      typeof body?.orderId === "string" ? body.orderId : "";

    if (!orderId) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    const order = await db.topUpOrder.findFirst({
      where: {
        id: orderId,
        userId: user.id,
      },
      include: {
        user: { select: { email: true } },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    if (
      order.status !== "PENDING_PAYMENT" &&
      order.status !== "PAYMENT_SUBMITTED"
    ) {
      return NextResponse.json(
        { error: "This order cannot start a new payment" },
        { status: 409 }
      );
    }

    if (order.paymentMethod === "CRYPTOEZE_QR" && order.paymentTrxId) {
      const check = await fetch(
        `https://cryptoeze.com/api/v1/pkr/${encodeURIComponent(order.paymentTrxId)}`,
        {
          headers: { Authorization: `Bearer ${secretKey}` },
          cache: "no-store",
        }
      );

      if (check.ok) {
        const result = await check.json();
        const payment = result?.data;

        if (
          payment?.checkout_url &&
          payment?.order_id === order.orderNumber &&
          payment?.status === "pending"
        ) {
          return NextResponse.json({
            success: true,
            checkoutUrl: payment.checkout_url,
          });
        }
      }

      return NextResponse.json(
        {
          error:
            "An existing payment is recorded. Check its status before retrying.",
        },
        { status: 409 }
      );
    }

    if (order.paymentTrxId) {
      return NextResponse.json(
        { error: "This order already has a payment reference" },
        { status: 409 }
      );
    }

    const response = await fetch(
      "https://cryptoeze.com/api/v1/pkr",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Idempotency-Key": order.orderNumber,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: "qr",
          amount: order.totalAmount.toFixed(2),
          order_id: order.orderNumber,
          customer_email: order.user.email,
          return_url: `${siteUrl.replace(/\/$/, "")}/dashboard/orders`,
        }),
        cache: "no-store",
      }
    );

    const result = await response.json().catch(() => null);
    const payment = result?.data;

    if (
      !response.ok ||
      typeof payment?.id !== "string" ||
      typeof payment?.checkout_url !== "string"
    ) {
      console.error("CryptoEze create payment failed", {
        status: response.status,
      });

      return NextResponse.json(
        { error: "Could not create payment. Please try again later." },
        { status: 502 }
      );
    }

    await db.topUpOrder.updateMany({
      where: {
        id: order.id,
        userId: user.id,
        status: order.status,
        paymentTrxId: null,
      },
      data: {
        paymentMethod: "CRYPTOEZE_QR",
        paymentTrxId: payment.id,
      },
    });

    const savedOrder = await db.topUpOrder.findUnique({
      where: { id: order.id },
      select: { paymentTrxId: true, paymentMethod: true },
    });

    if (
      savedOrder?.paymentMethod !== "CRYPTOEZE_QR" ||
      savedOrder?.paymentTrxId !== payment.id
    ) {
      return NextResponse.json(
        { error: "Payment reference could not be saved safely" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      checkoutUrl: payment.checkout_url,
    });
  } catch (error) {
    console.error("CryptoEze payment route failed", error);

    return NextResponse.json(
      { error: "Unable to start payment" },
      { status: 500 }
    );
  }
}
