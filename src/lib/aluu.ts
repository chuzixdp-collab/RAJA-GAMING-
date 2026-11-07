/**
 * RAJA GAMING — ALUU (aluu.in) supplier API client. SERVER-ONLY.
 *
 * Implements exactly what the official docs (https://aluu.in/docs) specify:
 *
 *  - Auth header  `x-api-key` on every request.
 *  - "No static IP" mode (required for Netlify serverless): every request is
 *    signed with the secret key:
 *        string_to_sign = timestamp + "." + METHOD + "." + path_with_query + "." + raw_body
 *        signature      = hex(HMAC_SHA256(secret, string_to_sign))
 *    sent as `X-Timestamp` (unix seconds) and `X-Signature`.
 *    GET requests sign the empty body — the string still ends with a dot.
 *  - Top-up webhooks are signed OVER THE RAW BODY:
 *        signature = hex(HMAC_SHA256(secret, X-Webhook-Timestamp + "." + raw_body))
 *    with replay protection (reject timestamps older than 5 minutes).
 *
 * SECURITY RULES ENFORCED HERE:
 *  - Keys are read from environment variables and NEVER returned, logged or
 *    embedded in error messages. Presence is exposed as booleans only.
 *  - Error objects carry stable codes, never secret material.
 *  - All functions fail closed: if the integration is not configured they
 *    throw `AluuError` with code ALUU_NOT_CONFIGURED and no network call is
 *    attempted.
 *
 * Env vars (server-side only):
 *   ALU_API_KEY / ALU_SECRET_KEY   — primary names (per spec)
 *   ALUU_API_KEY / ALUU_SECRET_KEY — legacy fallback (kept for the earlier
 *                                    balance route)
 *   ALUU_BASE_URL                  — override for OFFLINE TESTS ONLY
 *                                    (defaults to https://aluu.in; never set
 *                                    in production)
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const ALUU_DEFAULT_BASE_URL = "https://aluu.in";

/** Five minutes, per the docs' replay-protection window. */
export const ALUU_WEBHOOK_TOLERANCE_SECONDS = 300;

export type AluuConfig = { apiKey: string; secret: string; baseUrl: string };

export class AluuError extends Error {
  code: string;
  httpStatus?: number;
  constructor(code: string, message: string, httpStatus?: number) {
    super(message);
    this.name = "AluuError";
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
export function getAluuConfig(): AluuConfig | null {
  const apiKey = readEnv("ALU_API_KEY", "ALUU_API_KEY");
  const secret = readEnv("ALU_SECRET_KEY", "ALUU_SECRET_KEY");
  if (!apiKey || !secret) return null;
  const baseUrl = (readEnv("ALUU_BASE_URL") || ALUU_DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, secret, baseUrl };
}

/** Presence-only booleans for the admin status panel — no values. */
export function getAluuConfigPresence(): { apiKeySet: boolean; secretSet: boolean; baseUrl: string } {
  const apiKey = readEnv("ALU_API_KEY", "ALUU_API_KEY");
  const secret = readEnv("ALU_SECRET_KEY", "ALUU_SECRET_KEY");
  return {
    apiKeySet: !!apiKey,
    secretSet: !!secret,
    baseUrl: (readEnv("ALUU_BASE_URL") || ALUU_DEFAULT_BASE_URL).replace(/\/+$/, ""),
  };
}

/**
 * Signed ALUU request. `pathWithQuery` must start with "/api" and be exactly
 * the path (+query) that will be requested — the signature is computed over
 * the same string. Only simple, pre-encoded query values are used by this
 * integration, so URL normalization cannot alter the signed bytes.
 */
export async function aluuRequest<T = unknown>(
  method: "GET" | "POST",
  pathWithQuery: string,
  body?: unknown,
  opts?: { timeoutMs?: number }
): Promise<{ httpStatus: number; payload: T }> {
  const config = getAluuConfig();
  if (!config) {
    throw new AluuError(
      "ALUU_NOT_CONFIGURED",
      "ALUU is not configured — set the ALU_API_KEY and ALU_SECRET_KEY environment variables."
    );
  }
  if (!pathWithQuery.startsWith("/")) {
    throw new AluuError("ALUU_BAD_REQUEST", "pathWithQuery must start with '/'.");
  }

  const raw = body === undefined ? "" : JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const stringToSign = `${timestamp}.${method}.${pathWithQuery}.${raw}`;
  const signature = createHmac("sha256", config.secret).update(stringToSign).digest("hex");

  // Optional tighter deadline (the cron poller bounds every call so a slow
  // ALUU can never wedge a run). Default stays the documented 25 s.
  const timeoutMs =
    typeof opts?.timeoutMs === "number" && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? Math.min(Math.trunc(opts.timeoutMs), 25_000)
      : 25_000;

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${pathWithQuery}`, {
      method,
      headers: {
        "x-api-key": config.apiKey,
        "X-Timestamp": timestamp,
        "X-Signature": signature,
        Accept: "application/json",
        ...(raw ? { "Content-Type": "application/json" } : {}),
      },
      body: raw || undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AluuError("ALUU_NETWORK", "Could not reach the ALUU API.");
  }

  let payload: T;
  try {
    payload = (await response.json()) as T;
  } catch {
    throw new AluuError("ALUU_BAD_RESPONSE", "ALUU returned a non-JSON response.", response.status);
  }
  return { httpStatus: response.status, payload };
}

/** Extract `message`/`code` from an ALUU error payload without echoing secrets (there are none in payloads anyway). */
export function aluuErrorInfo(payload: unknown): { message: string; code: string | null } {
  const p = payload as { message?: unknown; code?: unknown } | null | undefined;
  return {
    message: typeof p?.message === "string" ? p.message : "Unknown ALUU error",
    code: typeof p?.code === "string" ? p.code : null,
  };
}

/**
 * Verify an ALUU top-up webhook against the RAW request body.
 * Returns `{ ok: true }` or `{ ok: false, reason }` — reasons:
 *   NOT_CONFIGURED | MISSING_HEADERS | STALE_TIMESTAMP | INVALID_SIGNATURE
 */
export function verifyAluuWebhook(
  rawBody: string,
  timestamp: string | null,
  signature: string | null
): { ok: boolean; reason?: string } {
  const config = getAluuConfig();
  if (!config) return { ok: false, reason: "NOT_CONFIGURED" };
  if (!timestamp || !signature) return { ok: false, reason: "MISSING_HEADERS" };
  if (!/^\d+$/.test(timestamp)) return { ok: false, reason: "STALE_TIMESTAMP" };

  const tsSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(tsSeconds) ||
    Math.abs(Date.now() / 1000 - tsSeconds) > ALUU_WEBHOOK_TOLERANCE_SECONDS
  ) {
    return { ok: false, reason: "STALE_TIMESTAMP" };
  }

  const expected = createHmac("sha256", config.secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const received = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (received.length !== expectedBuf.length || !timingSafeEqual(received, expectedBuf)) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }
  return { ok: true };
}

export type AluuSupplierStatus = "PENDING" | "SUCCESSFUL" | "ERROR" | "CANCELLED" | "UNKNOWN";

/** Map an ALUU status value onto the local SupplierOrder.status mirror. */
export function normalizeSupplierStatus(status: unknown): AluuSupplierStatus {
  switch (status) {
    case "pending":
      return "PENDING";
    case "successful":
      return "SUCCESSFUL";
    case "error":
      return "ERROR";
    case "cancelled":
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}

/**
 * Dedup id for the AluuWebhookEvent table. ALUU sends one webhook per final
 * status change; `${orderid}:${status}:${updatedAt}` is unique per delivery
 * and identical when the same event is replayed.
 */
export function buildWebhookEventId(orderid: string, status: string, updatedAt: string): string {
  return `${orderid}:${status}:${updatedAt}`;
}

/** A webhook URL is only sent to ALUU when it is a public HTTPS URL. */
export function isHttpsWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** Resolve the webhook URL for supplier orders (never logged, only stored on the ALUU side). */
export function resolveWebhookUrl(): string | null {
  const candidate =
    readEnv("ALUU_WEBHOOK_URL") ||
    (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/webhooks/aluu` : "");
  return candidate && isHttpsWebhookUrl(candidate) ? candidate : null;
}

/** Parse the Free Fire diamond count out of an ALUU product name (e.g. "86 Diamonds" → 86). */
export function parseDiamondsFromName(name: string): number | null {
  const match = name.match(/\d[\d,]*/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Suggested sale price (whole PKR) for a supplier pack. Pure arithmetic —
 * the admin can still edit every package price manually afterwards.
 */
export function suggestSalePricePkr(
  supplierPriceUsdCents: number,
  usdToPkr: number,
  markupPercent: number
): number {
  if (!Number.isFinite(supplierPriceUsdCents) || supplierPriceUsdCents <= 0) return 0;
  const safeRate = Number.isFinite(usdToPkr) && usdToPkr > 0 ? usdToPkr : 280;
  const safeMarkup = Number.isFinite(markupPercent) && markupPercent >= 0 ? markupPercent : 0;
  const usd = supplierPriceUsdCents / 100;
  const pkr = usd * safeRate * (1 + safeMarkup / 100);
  // Round UP to the nearest 10 rupees so pricing never lands below cost.
  return Math.max(10, Math.ceil(pkr / 10) * 10);
}
