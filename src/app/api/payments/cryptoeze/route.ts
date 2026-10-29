
import { ApiError, apiSuccess, assertSameOrigin, handleApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CryptoEze PKR QR checkout (https://cryptoeze.com/docs):
 *   POST /api/v1/pkr   { method, amount, order_id, customer_email, return_url }
 *   -> 200 { data: { id, status: "pending", checkout_url } }
 *   GET  /api/v1/pkr/{id} to resume an already-created payment.
 * Documented errors: 401 authentication, 403 method not active on the account,
 * 409 idempotency_conflict, 429 rate_limited.
 *
 * CRYPTOEZE_API_BASE_URL overrides the provider origin for sandbox/mock
 * testing only; production default is https://cryptoeze.com.
 */
const PROVIDER_API_BASE =
  process.env.CRYPTOEZE_API_BASE_URL?.replace(/\/$/, "") || "https://cryptoeze.com";
const PROVIDER_TIMEOUT_MS = 15_000;

/** Map documented provider status codes to a safe, actionable client message. */
function providerApiMessage(status: number): string | null {
  switch (status) {
    case 401:
      return "The payment provider rejected the configured API key. Please contact support.";
    case 403:
      return "QR payments are not enabled on our payment provider account yet. Please use EasyPaisa or try again later.";
    case 409:
      return "The payment provider reported an idempotency conflict for this order. Please contact support.";
    case 429:
      return "The payment provider is rate limiting requests. Please wait a few seconds and try again.";
    default:
      return null;
  }
}

function providerHeaders(secretKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();

    const secretKey = process.env.CRYPTOEZE_SECRET_KEY;
    const siteUrl = process.env.SITE_URL;

    if (!secretKey || !siteUrl) {
      // Log WHICH variable is missing (never its value) so the failure is
      // diagnosable from server logs (e.g. Netlify function logs).
      console.error("[payments/cryptoeze] configuration missing", {
        hasSecretKey: Boolean(secretKey),
        hasSiteUrl: Boolean(siteUrl),
      });
      throw new ApiError(
        "CryptoEze QR payments are not configured yet — please pay via EasyPaisa or contact support.",
        503
      );
    }

    const body = await req.json().catch(() => null);
    const orderId =
      typeof body?.orderId === "string" ? body.orderId : "";

    if (!orderId) {
      throw new ApiError("Order ID is required", 400);
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
      throw new ApiError("Order not found", 404);
    }

    if (
      order.status !== "PENDING_PAYMENT" &&
      order.status !== "PAYMENT_SUBMITTED"
    ) {
      throw new ApiError("This order cannot start a new payment", 409);
    }

    if (order.paymentMethod === "CRYPTOEZE_QR" && order.paymentTrxId) {
      // Resume: re-check the already-created payment before allowing a retry.
      const check = await fetch(
        `${PROVIDER_API_BASE}/api/v1/pkr/${encodeURIComponent(order.paymentTrxId)}`,
        {
          headers: providerHeaders(secretKey),
          cache: "no-store",
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        }
      );

      if (check.ok) {
        const result = await check.json().catch(() => null);
        const payment = result?.data;

        // order_id is echoed per the docs' create response; the GET response
        // shape is not fully documented, so enforce the match only when the
        // field is present (absent => trust the stored paymentTrxId, which
        // this order created via Idempotency-Key).
        const orderMatches =
          payment?.order_id == null ||
          payment.order_id === order.orderNumber;

        if (
          payment?.checkout_url &&
          payment?.status === "pending" &&
          orderMatches
        ) {
          return apiSuccess({
            success: true,
            checkoutUrl: payment.checkout_url,
          });
        }
      } else {
        console.error("[payments/cryptoeze] resume check failed", {
          status: check.status,
        });
      }

      throw new ApiError(
        "An existing payment is recorded. Check its status before retrying.",
        409
      );
    }

    if (order.paymentTrxId) {
      throw new ApiError("This order already has a payment reference", 409);
    }

    const response = await fetch(`${PROVIDER_API_BASE}/api/v1/pkr`, {
      method: "POST",
      headers: {
        ...providerHeaders(secretKey),
        "Idempotency-Key": order.orderNumber,
      },
      body: JSON.stringify({
        method: "qr",
        amount: order.totalAmount.toFixed(2),
        order_id: order.orderNumber,
        customer_email: order.user.email,
        return_url: `${siteUrl.replace(/\/$/, "")}/dashboard/orders`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });

    const result = await response.json().catch(() => null);
    const payment = result?.data;

    if (
      !response.ok ||
      typeof payment?.id !== "string" ||
      typeof payment?.checkout_url !== "string"
    ) {
      console.error("[payments/cryptoeze] create payment failed", {
        status: response.status,
        orderId: order.orderNumber,
      });

      const mapped = providerApiMessage(response.status);
      throw new ApiError(
        mapped ??
          "Could not create the QR payment. Please try again in a moment.",
        502
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
      throw new ApiError("Payment reference could not be saved safely", 409);
    }

    return apiSuccess({
      success: true,
      checkoutUrl: payment.checkout_url,
    });
  } catch (error) {
    // handleApiError keeps ApiError statuses (401 stays 401, 503 stays 503),
    // returns the app envelope { ok:false, error } so the client shows the
    // real reason, and logs only unexpected errors.
    return handleApiError(error);
  }
}
