/**
 * Unit tests for the ALUU supplier integration — 100% OFFLINE.
 *
 * No network call to aluu.in is ever made. All provider payloads are mocked
 * fixtures and all credentials are obviously fake test values ("test-key",
 * "test-secret"). No real supplier order is placed by this file.
 *
 * Covered:
 *  - Signed request construction (string_to_sign layout from the docs)
 *  - Webhook signature verification (HMAC-SHA256 over timestamp.raw_body,
 *    timing-safe compare, replay window)
 *  - Duplicate-event id construction
 *  - Supplier status normalization (pending|successful|error|cancelled)
 *  - Diamond parsing from ALUU pack names
 *  - Suggested PKR sale price arithmetic (round-up to 10)
 *  - Webhook URL safety rules (HTTPS + public host only)
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createHmac } from "node:crypto";

process.env.ALU_API_KEY = "test-key";
process.env.ALU_SECRET_KEY = "test-secret";

import {
  verifyAluuWebhook,
  normalizeSupplierStatus,
  buildWebhookEventId,
  parseDiamondsFromName,
  suggestSalePricePkr,
  isHttpsWebhookUrl,
  aluuRequest,
  ALUU_WEBHOOK_TOLERANCE_SECONDS,
} from "../src/lib/aluu";

// ---------------------------------------------------------------------------
// 1. Signed request construction — verified against the documented layout:
//    string_to_sign = timestamp + "." + METHOD + "." + path_with_query + "." + raw_body
//    (GET body counts as an empty string; the string still ends with a dot.)
// ---------------------------------------------------------------------------
describe("aluuRequest signing (mocked fetch, no real API call)", () => {
  const originalFetch = globalThis.fetch;

  test("POST — signs ts.METHOD.path.rawBody and sends x-api-key + X-Timestamp + X-Signature", async () => {
    let captured: { url: string; headers: Record<string, string>; body: string | undefined } | null = null;
    // @ts-expect-error — mock fetch
    globalThis.fetch = async (url: string, init: RequestInit) => {
      captured = {
        url,
        headers: Object.fromEntries(
          Object.entries(init.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])
        ),
        body: typeof init.body === "string" ? init.body : undefined,
      };
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    };

    const body = { game: "freefire", denom: "86", userid: "12345678", partner_orderid: "RG-TEST" };
    const { httpStatus, payload } = await aluuRequest("POST", "/api/v.1/create", body);
    assert.equal(httpStatus, 200);
    assert.deepEqual(payload, { success: true, data: {} });

    assert.ok(captured);
    assert.equal(captured.url, "https://aluu.in/api/v.1/create");
    assert.equal(captured.headers["x-api-key"], "test-key");
    assert.ok(/^\d+$/.test(captured.headers["x-timestamp"]), "X-Timestamp must be unix seconds");
    assert.equal(captured.body, JSON.stringify(body));

    const expectedSig = createHmac("sha256", "test-secret")
      .update(
        `${captured.headers["x-timestamp"]}.POST./api/v.1/create.${JSON.stringify(body)}`
      )
      .digest("hex");
    assert.equal(captured.headers["x-signature"], expectedSig);

    globalThis.fetch = originalFetch;
  });

  test("GET — signs with an empty body (trailing dot)", async () => {
    let captured: { headers: Record<string, string> } | null = null;
    // @ts-expect-error — mock fetch
    globalThis.fetch = async (_url: string, init: RequestInit) => {
      captured = {
        headers: Object.fromEntries(
          Object.entries(init.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])
        ),
      };
      return new Response(JSON.stringify({ success: true, data: { wallet_balance: 1 } }), { status: 200 });
    };

    await aluuRequest("GET", "/api/v.1/balance");
    const expectedSig = createHmac("sha256", "test-secret")
      .update(`${captured!.headers["x-timestamp"]}.GET./api/v.1/balance.`)
      .digest("hex");
    assert.equal(captured!.headers["x-signature"], expectedSig);

    globalThis.fetch = originalFetch;
  });

  test("fails closed when credentials are missing", async () => {
    delete process.env.ALU_API_KEY;
    delete process.env.ALUU_API_KEY;
    await assert.rejects(
      () => aluuRequest("GET", "/api/v.1/balance"),
      (err: Error & { code?: string }) => err.code === "ALUU_NOT_CONFIGURED"
    );
    // restore for later tests
    process.env.ALU_API_KEY = "test-key";
  });
});

// ---------------------------------------------------------------------------
// 2. Webhook signature verification (raw body + 5 minute replay window)
// ---------------------------------------------------------------------------
describe("verifyAluuWebhook", () => {
  const secret = "test-secret";
  const payload = JSON.stringify({
    success: true,
    data: {
      orderid: "RG-TEST-1",
      reference: "API-MOCK0001",
      status: "successful",
      amount: 0.15,
      message: "delivered",
      updatedAt: "2026-01-15T10:17:00.000Z",
    },
  });

  function sign(ts: string, raw: string): string {
    return createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  }

  test("accepts a correctly signed, fresh webhook", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const verdict = verifyAluuWebhook(payload, ts, sign(ts, payload));
    assert.deepEqual(verdict, { ok: true });
  });

  test("rejects an invalid signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const verdict = verifyAluuWebhook(payload, ts, "0".repeat(64));
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "INVALID_SIGNATURE");
  });

  test("rejects a signature that belongs to different bytes (body swap)", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    // Attacker signs THEIR body (tampered status) but sends the original
    // raw body — verification must bind the signature to the exact bytes.
    const attackerBody = JSON.stringify({
      success: true,
      data: {
        orderid: "RG-TEST-1",
        reference: "API-MOCK0001",
        status: "error",
        amount: 0.15,
        message: "delivered",
        updatedAt: "2026-01-15T10:17:00.000Z",
      },
    });
    assert.notEqual(attackerBody, payload);
    const verdict = verifyAluuWebhook(payload, ts, sign(ts, attackerBody));
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "INVALID_SIGNATURE");
  });

  test("verifies against the exact raw bytes received (no re-serialization)", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    // Non-canonical whitespace must still verify when signed as-is.
    const spaced = JSON.stringify(JSON.parse(payload), null, 2);
    const verdict = verifyAluuWebhook(spaced, ts, sign(ts, spaced));
    assert.deepEqual(verdict, { ok: true });
  });

  test("rejects stale timestamps beyond the replay window", () => {
    const old = String(Math.floor(Date.now() / 1000) - ALUU_WEBHOOK_TOLERANCE_SECONDS - 10);
    const verdict = verifyAluuWebhook(payload, old, sign(old, payload));
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "STALE_TIMESTAMP");
  });

  test("rejects missing headers and non-numeric timestamps", () => {
    assert.equal(verifyAluuWebhook(payload, null, null).reason, "MISSING_HEADERS");
    assert.equal(verifyAluuWebhook(payload, "abc", sign("abc", payload)).reason, "STALE_TIMESTAMP");
  });
});

// ---------------------------------------------------------------------------
// 3. Idempotent event ids — same order/status/updatedAt ⇒ same dedup id
// ---------------------------------------------------------------------------
describe("buildWebhookEventId", () => {
  test("is stable for replays and distinct across statuses", () => {
    const a = buildWebhookEventId("RG-1", "successful", "2026-01-15T10:17:00.000Z");
    const b = buildWebhookEventId("RG-1", "successful", "2026-01-15T10:17:00.000Z");
    const c = buildWebhookEventId("RG-1", "pending", "2026-01-15T10:17:00.000Z");
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});

// ---------------------------------------------------------------------------
// 4. Supplier status normalization
// ---------------------------------------------------------------------------
describe("normalizeSupplierStatus", () => {
  test("maps the documented statuses", () => {
    assert.equal(normalizeSupplierStatus("pending"), "PENDING");
    assert.equal(normalizeSupplierStatus("successful"), "SUCCESSFUL");
    assert.equal(normalizeSupplierStatus("error"), "ERROR");
    assert.equal(normalizeSupplierStatus("cancelled"), "CANCELLED");
  });

  test("maps unknown/garbage to UNKNOWN", () => {
    assert.equal(normalizeSupplierStatus("weird"), "UNKNOWN");
    assert.equal(normalizeSupplierStatus(undefined), "UNKNOWN");
    assert.equal(normalizeSupplierStatus(42), "UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// 5. Diamond parsing from pack names
// ---------------------------------------------------------------------------
describe("parseDiamondsFromName", () => {
  test("parses the documented pack names", () => {
    assert.equal(parseDiamondsFromName("86 Diamonds"), 86);
    assert.equal(parseDiamondsFromName("1,060 Diamonds"), 1060);
    assert.equal(parseDiamondsFromName("Weekly Membership"), null);
  });
});

// ---------------------------------------------------------------------------
// 6. Suggested PKR price — supplier USD cents × rate × markup, round UP to 10
// ---------------------------------------------------------------------------
describe("suggestSalePricePkr", () => {
  test("applies rate and markup, rounding up to the nearest 10 PKR", () => {
    // 120 US cents = $1.20 × 280 = Rs 336 × 1.1 = Rs 369.6 → Rs 370
    assert.equal(suggestSalePricePkr(120, 280, 10), 370);
    // exact multiple stays put: $1 × 300 = Rs 300
    assert.equal(suggestSalePricePkr(100, 300, 0), 300);
  });

  test("falls back safely on bad input", () => {
    assert.equal(suggestSalePricePkr(0, 280, 10), 0);
    assert.equal(suggestSalePricePkr(-5, 280, 10), 0);
    // bad rate falls back to 280
    assert.equal(suggestSalePricePkr(100, Number.NaN, 0), 280);
    assert.equal(suggestSalePricePkr(100, 0, 0), 280);
  });
});

// ---------------------------------------------------------------------------
// 7. Webhook URL safety — HTTPS + public host only (ALUU rejects the rest)
// ---------------------------------------------------------------------------
describe("isHttpsWebhookUrl", () => {
  test("accepts public HTTPS URLs only", () => {
    assert.equal(isHttpsWebhookUrl("https://raja-gaming.netlify.app/api/webhooks/aluu"), true);
    assert.equal(isHttpsWebhookUrl("http://raja-gaming.netlify.app/api/webhooks/aluu"), false);
    assert.equal(isHttpsWebhookUrl("https://localhost/api/webhooks/aluu"), false);
    assert.equal(isHttpsWebhookUrl("https://127.0.0.1/api/webhooks/aluu"), false);
    assert.equal(isHttpsWebhookUrl("not a url"), false);
  });
});
