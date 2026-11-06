/**
 * RAJA GAMING — FazerCards (api.fzr.cards) reseller API client. SERVER-ONLY.
 *
 * Implements exactly what the official OpenAPI specification
 * (https://api.fzr.cards/public/docs/openapi.json, retrieved 2026-11-05)
 * specifies — no invented endpoints:
 *
 *  - Base URL https://api.fzr.cards, JSON endpoints under /api/v2.
 *  - Auth on every request: `X-API-Key: fc_…` (spec also allows
 *    `Authorization: Bearer fc_…`).
 *  - Responses wrap data in `{ ok: true, … }`; errors are
 *    `{ ok: false, error: string, code?: string }` with HTTP 400/401/403/404/500.
 *  - `POST /api/v2/topups/order` accepts an optional `Idempotency-Key`
 *    header (≤255 chars): repeating the same request with the same key
 *    returns the ORIGINAL order instead of charging/fulfilling again.
 *    This integration always sends the Raja Gaming orderNumber as the key,
 *    so a retry can never double-order or double-charge.
 *  - Documented order lifecycle (per endpoint docs): an order is charged
 *    immediately, then `processing` until `completed` or refund.
 *
 * DOCUMENTED LIMITATION (reported, not simulated):
 *  - The public OpenAPI does NOT define the webhook payload schema nor the
 *    signature header name. It only documents that an account webhook URL
 *    can be configured (PUT /api/v2/account/webhook), that an HMAC secret
 *    is generated / rotatable (POST /api/v2/account/webhook/secret/regenerate)
 *    and that test events (`webhook.test`) are delivered. The webhook
 *    receiver in this integration therefore:
 *      · fails closed when FAZERCARDS_WEBHOOK_SECRET is not configured,
 *      · verifies an HMAC-SHA256 hex digest of the RAW body against the
 *        configured secret (constant-time compare),
 *      · NEVER trusts payload fields for state changes — it only extracts a
 *        FazerCards order reference / Raja Gaming order number and re-fetches
 *        the authoritative order state via the DOCUMENTED
 *        `GET /api/v2/orders/{orderId}` endpoint before anything is applied.
 *
 * SECURITY RULES ENFORCED HERE:
 *  - Keys are read from environment variables and NEVER returned, logged or
 *    embedded in error messages. Presence is exposed as booleans only.
 *  - All functions fail closed: if the integration is not configured they
 *    throw `FazerError` with code FAZERCARDS_NOT_CONFIGURED and no network
 *    call is attempted.
 *
 * Env vars (server-side only):
 *   FAZERCARDS_API_KEY          — reseller API key (`fc_…`), required
 *   FAZERCARDS_BASE_URL         — defaults to https://api.fzr.cards
 *   FAZERCARDS_WEBHOOK_SECRET   — optional; webhook verification fails
 *                                 closed without it
 *   FAZERCARDS_BASE_URL is also the OFFLINE TEST override (never set in
 *   production).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const FAZERCARDS_DEFAULT_BASE_URL = "https://api.fzr.cards";

/**
 * Replay-protection window for webhook timestamps. FazerCards' webhook
 * timestamp header is not documented, so the window is only enforced when a
 * numeric timestamp header is actually present.
 */
export const FAZERCARDS_WEBHOOK_TOLERANCE_SECONDS = 300;

/** FazerCards public order id pattern, per the OpenAPI `orderId` parameter. */
const FAZERCARDS_ORDER_ID_PATTERN = /^ord-[0-9]+$/;

export type FazerConfig = { apiKey: string; baseUrl: string };

export class FazerError extends Error {
  code: string;
  httpStatus?: number;
  constructor(code: string, message: string, httpStatus?: number) {
    super(message);
    this.name = "FazerError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

/** Resolve config or null. Never leaks values. */
export function getFazerConfig(): FazerConfig | null {
  const apiKey = readEnv("FAZERCARDS_API_KEY");
  if (!apiKey) return null;
  const baseUrl = (readEnv("FAZERCARDS_BASE_URL") || FAZERCARDS_DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

/** Presence-only booleans for the admin status panel — no values. */
export function getFazerConfigPresence(): {
  apiKeySet: boolean;
  webhookSecretSet: boolean;
  baseUrl: string;
} {
  return {
    apiKeySet: !!readEnv("FAZERCARDS_API_KEY"),
    webhookSecretSet: !!readEnv("FAZERCARDS_WEBHOOK_SECRET"),
    baseUrl: (readEnv("FAZERCARDS_BASE_URL") || FAZERCARDS_DEFAULT_BASE_URL).replace(/\/+$/, ""),
  };
}

/** True when the string matches the documented public order id pattern. */
export function isValidFazerOrderId(value: unknown): value is string {
  return typeof value === "string" && FAZERCARDS_ORDER_ID_PATTERN.test(value);
}

/**
 * FazerCards API request. `pathWithQuery` must start with "/" and already
 * contain any query string. `idempotencyKey` is sent as the documented
 * `Idempotency-Key` request header (≤255 chars) on order creation.
 */
export async function fazerRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  pathWithQuery: string,
  body?: unknown,
  options?: { idempotencyKey?: string }
): Promise<{ httpStatus: number; payload: T }> {
  const config = getFazerConfig();
  if (!config) {
    throw new FazerError(
      "FAZERCARDS_NOT_CONFIGURED",
      "FazerCards is not configured — set the FAZERCARDS_API_KEY environment variable."
    );
  }
  if (!pathWithQuery.startsWith("/")) {
    throw new FazerError("FAZERCARDS_BAD_REQUEST", "pathWithQuery must start with '/'.");
  }

  const raw = body === undefined ? "" : JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${pathWithQuery}`, {
      method,
      headers: {
        "X-API-Key": config.apiKey,
        Accept: "application/json",
        ...(raw ? { "Content-Type": "application/json" } : {}),
        ...(options?.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey.slice(0, 255) }
          : {}),
      },
      body: raw || undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    // Surface the underlying cause (timeout/DNS/refused) without leaking any
    // secret material — the base URL and path are not sensitive.
    const cause = error instanceof Error ? error.message : "unknown";
    throw new FazerError("FAZERCARDS_NETWORK", `Could not reach the FazerCards API (${cause}).`);
  }

  let payload: T;
  try {
    payload = (await response.json()) as T;
  } catch {
    throw new FazerError(
      "FAZERCARDS_BAD_RESPONSE",
      "FazerCards returned a non-JSON response.",
      response.status
    );
  }
  return { httpStatus: response.status, payload };
}

/** Extract `error`/`code` from a FazerCards error payload (`{ok:false,…}`). */
export function fazerErrorInfo(payload: unknown): { message: string; code: string | null } {
  const p = payload as { error?: unknown; code?: unknown } | null | undefined;
  return {
    message: typeof p?.error === "string" && p.error.trim() ? p.error : "Unknown FazerCards error",
    code: typeof p?.code === "string" && p.code.trim() ? p.code : null,
  };
}

/**
 * Parse a documented `price_usd` decimal string (e.g. "0.3500") into USD
 * cents. Returns null when the value is not a usable non-negative number.
 */
export function parseFazerPriceUsdCents(priceUsd: unknown): number | null {
  if (typeof priceUsd === "number" && Number.isFinite(priceUsd) && priceUsd >= 0) {
    return Math.round(priceUsd * 100);
  }
  if (typeof priceUsd === "string" && priceUsd.trim() !== "") {
    const value = Number(priceUsd);
    if (Number.isFinite(value) && value >= 0) return Math.round(value * 100);
  }
  return null;
}

/** Format USD cents back to the API's decimal-string style (4 dp). */
export function formatFazerUsd(amountUsdCents: number | null | undefined): string {
  if (typeof amountUsdCents !== "number" || !Number.isFinite(amountUsdCents) || amountUsdCents < 0) {
    return "—";
  }
  return `$${(amountUsdCents / 100).toFixed(4)}`;
}

/**
 * Local mirror of the FazerCards order status, using the SAME vocabulary as
 * the shared SupplierOrder status column (PENDING | SUCCESSFUL | ERROR |
 * CANCELLED | UNKNOWN | SUBMIT_FAILED).
 *
 * Documented lifecycle: `processing` until `completed` or refund. The exact
 * status strings other than those two are not enumerated in the OpenAPI, so
 * anything unrecognised maps to UNKNOWN and NEVER changes local state.
 */
export type FazerSupplierStatus = "PENDING" | "SUCCESSFUL" | "ERROR" | "CANCELLED" | "UNKNOWN";

export function normalizeFazerStatus(status: unknown): FazerSupplierStatus {
  if (typeof status !== "string") return "UNKNOWN";
  switch (status.trim().toLowerCase()) {
    case "completed":
    case "complete":
    case "success":
    case "successful":
    case "done":
    case "delivered":
      return "SUCCESSFUL";
    case "processing":
    case "pending":
    case "in_progress":
    case "queued":
    case "ordered":
    case "new":
      return "PENDING";
    case "refunded":
    case "refund":
      return "CANCELLED";
    case "failed":
    case "error":
      return "ERROR";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}

/** True when the local status is a final verdict (no further polling). */
export function isTerminalSupplierStatus(status: string): boolean {
  return status === "SUCCESSFUL" || status === "ERROR" || status === "CANCELLED";
}

/**
 * Build the documented `fields` object for POST /topups/order from the
 * category's `fields[]` spec stored at sync time: the first `type === "text"`
 * field is the player-id input and receives the Free Fire UID. Any additional
 * text fields would need explicit admin mapping (not invented here).
 */
export function buildOrderFields(
  fieldsSpec: unknown,
  playerUid: string
): { fields: Record<string, string>; playerIdKey: string } | null {
  if (!Array.isArray(fieldsSpec)) return null;
  const textKey = fieldsSpec.find(
    (f): f is { key: string; type?: unknown } =>
      typeof f === "object" &&
      f !== null &&
      typeof (f as { key?: unknown }).key === "string" &&
      (f as { type?: unknown }).type === "text"
  );
  if (!textKey) return null;
  return { fields: { [textKey.key]: playerUid }, playerIdKey: textKey.key };
}

/**
 * Pre-flight safety decision before an order is sent to FazerCards
 * (availability + pricing + balance, per the supplier-switching safety rule).
 * Pure arithmetic — no network, fully unit-testable.
 *
 * @param offerPriceUsdCents live price from GET /topups/offers
 * @param storedPriceUsdCents price recorded at catalog sync (null = unknown)
 * @param supplierBalanceUsdCents live account balance (null = unknown)
 */
export function preflightCheck(
  offerPriceUsdCents: number | null,
  storedPriceUsdCents: number | null | undefined,
  supplierBalanceUsdCents: number | null
): { ok: boolean; reason?: string } {
  if (offerPriceUsdCents === null) return { ok: false, reason: "OFFER_NOT_FOUND" };
  if (offerPriceUsdCents === 0) return { ok: false, reason: "OFFER_PRICE_ZERO" };
  if (
    typeof storedPriceUsdCents === "number" &&
    Number.isFinite(storedPriceUsdCents) &&
    offerPriceUsdCents > storedPriceUsdCents
  ) {
    return { ok: false, reason: "PRICE_INCREASED" };
  }
  if (
    typeof supplierBalanceUsdCents === "number" &&
    Number.isFinite(supplierBalanceUsdCents) &&
    supplierBalanceUsdCents < offerPriceUsdCents
  ) {
    return { ok: false, reason: "INSUFFICIENT_SUPPLIER_BALANCE" };
  }
  return { ok: true };
}

/**
 * Verify a FazerCards webhook signature against the RAW request body using
 * the configured FAZERCARDS_WEBHOOK_SECRET.
 *
 * The signature header name is not part of the public OpenAPI, so the
 * receiver passes in whatever signature header it found (first match of
 * x-fazer-signature / x-signature / x-webhook-signature / x-hub-signature-256)
 * and this function does a constant-time comparison of a hex HMAC-SHA256
 * over the raw body. When `timestamp` is provided (numeric), the documented
 * 5-minute-style replay window is enforced.
 *
 * Returns `{ ok: true }` or `{ ok: false, reason }`:
 *   NOT_CONFIGURED | MISSING_SIGNATURE | STALE_TIMESTAMP | INVALID_SIGNATURE
 */
export function verifyFazerWebhook(
  rawBody: string,
  signature: string | null,
  timestamp?: string | null
): { ok: boolean; reason?: string } {
  const secret = readEnv("FAZERCARDS_WEBHOOK_SECRET");
  if (!secret) return { ok: false, reason: "NOT_CONFIGURED" };
  if (!signature || !signature.trim()) return { ok: false, reason: "MISSING_SIGNATURE" };

  if (timestamp && timestamp.trim()) {
    if (!/^\d+$/.test(timestamp.trim())) return { ok: false, reason: "STALE_TIMESTAMP" };
    const tsSeconds = Number(timestamp.trim());
    if (
      !Number.isSafeInteger(tsSeconds) ||
      Math.abs(Date.now() / 1000 - tsSeconds) > FAZERCARDS_WEBHOOK_TOLERANCE_SECONDS
    ) {
      return { ok: false, reason: "STALE_TIMESTAMP" };
    }
  }

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = signature.trim().replace(/^sha256=/, "").toLowerCase();
  const receivedBuf = Buffer.from(received, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (receivedBuf.length !== expectedBuf.length || !timingSafeEqual(receivedBuf, expectedBuf)) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }
  return { ok: true };
}

/**
 * Dedup id for the FazerWebhookEvent table. Prefers the supplier event id;
 * falls back to a SHA-256 of the raw body so replays of the same delivery
 * are still deduplicated.
 */
export function buildFazerEventId(eventId: unknown, rawBody: string): string {
  if (typeof eventId === "string" && eventId.trim()) return `evt:${eventId.trim()}`;
  const eventLike = rawBody.match(/"(?:event_id|id)"\s*:\s*"([^"]+)"/);
  if (eventLike) return `evt:${eventLike[1]}`;
  return `body:${createHmac("sha256", "fazer-event-id").update(rawBody, "utf8").digest("hex")}`;
}

/**
 * Extract a FazerCards order reference (`ord-N`) from an untrusted webhook
 * payload without trusting ANY other field. The receiver re-fetches the
 * authoritative order via the documented GET /orders/{orderId} endpoint.
 */
export function extractFazerOrderIdFromPayload(rawBody: string): string | null {
  const match = rawBody.match(/ord-[0-9]+/);
  return match ? match[0] : null;
}

/** A webhook URL is only configured upstream when it is a public HTTPS URL. */
export function isHttpsWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** Resolve the webhook URL for the FazerCards account (never logged). */
export function resolveFazerWebhookUrl(): string | null {
  const candidate =
    readEnv("FAZERCARDS_WEBHOOK_URL") ||
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/webhooks/fazercards`
      : "");
  return candidate && isHttpsWebhookUrl(candidate) ? candidate : null;
}

/**
 * Suggested sale price (whole PKR) for a FazerCards offer. Same arithmetic as
 * the ALUU suggestion — round UP to the nearest 10 PKR so pricing never
 * lands below cost. The admin can still edit every package price manually.
 */
export function suggestFazerSalePricePkr(
  supplierPriceUsdCents: number,
  usdToPkr: number,
  markupPercent: number
): number {
  if (!Number.isFinite(supplierPriceUsdCents) || supplierPriceUsdCents <= 0) return 0;
  const safeRate = Number.isFinite(usdToPkr) && usdToPkr > 0 ? usdToPkr : 280;
  const safeMarkup = Number.isFinite(markupPercent) && markupPercent >= 0 ? markupPercent : 0;
  const usd = supplierPriceUsdCents / 100;
  const pkr = usd * safeRate * (1 + safeMarkup / 100);
  return Math.max(10, Math.ceil(pkr / 10) * 10);
}

/** Parse the diamond/units count out of an offer name (e.g. "86 Diamonds"). */
export function parseUnitsFromOfferName(name: string): number | null {
  const match = name.match(/\d[\d,]*/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
