/**
 * Unit tests for the FazerCards supplier integration — 100% OFFLINE.
 *
 * No network call to api.fzr.cards is ever made. All supplier payloads are
 * mocked fixtures and the API key is an obviously fake test value
 * ("fc_test_key"). No real supplier order is placed by this file.
 *
 * Covered (from the official OpenAPI spec, api.fzr.cards/public/docs):
 *  - Public order-id pattern (ord-N)
 *  - price_usd parsing (decimal string → cents) and formatting
 *  - Status normalization (documented lifecycle: processing → completed |
 *    refund; unknown values never map to a state change)
 *  - buildOrderFields (player-id text field extraction)
 *  - preflightCheck (availability / price-increase / balance safety gates)
 *  - Webhook signature verification (HMAC-SHA256 over the RAW body,
 *    constant-time compare, optional replay window, sha256= prefix tolerance)
 *  - Webhook event dedup id construction
 *  - Order-reference extraction from untrusted payloads
 *  - Webhook URL safety rules (HTTPS + public host only)
 *  - Request construction: X-API-Key + Idempotency-Key headers against a
 *    local loopback HTTP server (never the real API)
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.FAZERCARDS_API_KEY = "fc_test_key";
process.env.FAZERCARDS_WEBHOOK_SECRET = "fc_test_webhook_secret";

import {
  FAZERCARDS_WEBHOOK_TOLERANCE_SECONDS,
  buildFazerEventId,
  buildOrderFields,
  extractFazerOrderIdFromPayload,
  fazerRequest,
  formatFazerUsd,
  getFazerConfigPresence,
  isHttpsWebhookUrl,
  isValidFazerOrderId,
  normalizeFazerStatus,
  parseFazerPriceUsdCents,
  preflightCheck,
  suggestFazerSalePricePkr,
  verifyFazerWebhook,
} from "../src/lib/fazercards";

// ---------------------------------------------------------------------------
// 1. Order id pattern (documented: ^ord-[0-9]+$)
// ---------------------------------------------------------------------------
describe("fazercards order ids", () => {
  test("accepts documented ord-N ids", () => {
    assert.equal(isValidFazerOrderId("ord-1"), true);
    assert.equal(isValidFazerOrderId("ord-123456"), true);
  });

  test("rejects malformed ids", () => {
    assert.equal(isValidFazerOrderId("ORD-1"), false);
    assert.equal(isValidFazerOrderId("ord-"), false);
    assert.equal(isValidFazerOrderId("ord-1a"), false);
    assert.equal(isValidFazerOrderId("API-123"), false);
    assert.equal(isValidFazerOrderId(""), false);
    assert.equal(isValidFazerOrderId(null), false);
    assert.equal(isValidFazerOrderId(42), false);
  });
});

// ---------------------------------------------------------------------------
// 2. Price parsing / formatting (documented: 4-decimal USD strings)
// ---------------------------------------------------------------------------
describe("fazercards price parsing", () => {
  test("parses documented decimal strings", () => {
    assert.equal(parseFazerPriceUsdCents("0.3500"), 35);
    assert.equal(parseFazerPriceUsdCents("1.0000"), 100);
    assert.equal(parseFazerPriceUsdCents("12.3456"), 1235); // rounds to cent
    assert.equal(parseFazerPriceUsdCents("0"), 0);
  });

  test("accepts plain numbers too", () => {
    assert.equal(parseFazerPriceUsdCents(0.35), 35);
    assert.equal(parseFazerPriceUsdCents(2), 200);
  });

  test("rejects unusable values", () => {
    assert.equal(parseFazerPriceUsdCents(""), null);
    assert.equal(parseFazerPriceUsdCents("abc"), null);
    assert.equal(parseFazerPriceUsdCents(-1), null);
    assert.equal(parseFazerPriceUsdCents(undefined), null);
    assert.equal(parseFazerPriceUsdCents(null), null);
  });

  test("formats back to 4-decimal USD", () => {
    assert.equal(formatFazerUsd(35), "$0.3500");
    assert.equal(formatFazerUsd(null), "—");
    assert.equal(formatFazerUsd(-5), "—");
  });
});

// ---------------------------------------------------------------------------
// 3. Status normalization (documented lifecycle: processing → completed/refund)
// ---------------------------------------------------------------------------
describe("fazercards status normalization", () => {
  test("maps documented final success states", () => {
    assert.equal(normalizeFazerStatus("completed"), "SUCCESSFUL");
    assert.equal(normalizeFazerStatus("COMPLETED"), "SUCCESSFUL");
    assert.equal(normalizeFazerStatus("success"), "SUCCESSFUL");
  });

  test("maps documented in-flight states", () => {
    assert.equal(normalizeFazerStatus("processing"), "PENDING");
    assert.equal(normalizeFazerStatus("PENDING"), "PENDING");
    assert.equal(normalizeFazerStatus("in_progress"), "PENDING");
  });

  test("maps refund and failure states", () => {
    assert.equal(normalizeFazerStatus("refunded"), "CANCELLED");
    assert.equal(normalizeFazerStatus("refund"), "CANCELLED");
    assert.equal(normalizeFazerStatus("failed"), "ERROR");
    assert.equal(normalizeFazerStatus("cancelled"), "CANCELLED");
    assert.equal(normalizeFazerStatus("canceled"), "CANCELLED");
  });

  test("unknown values never map to a state change", () => {
    assert.equal(normalizeFazerStatus("weird_status"), "UNKNOWN");
    assert.equal(normalizeFazerStatus(""), "UNKNOWN");
    assert.equal(normalizeFazerStatus(null), "UNKNOWN");
    assert.equal(normalizeFazerStatus(123), "UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// 4. buildOrderFields — player-id text field from the category fields spec
// ---------------------------------------------------------------------------
describe("fazercards order fields builder", () => {
  test("uses the documented text field key for the player id", () => {
    const spec = [
      { key: "user_id", label: "User ID", type: "text" },
      { key: "server", label: "Server", type: "select", options: [] },
    ];
    assert.deepEqual(buildOrderFields(spec, "123456789"), {
      fields: { user_id: "123456789" },
      playerIdKey: "user_id",
    });
  });

  test("returns null when there is no text field (cannot build safely)", () => {
    assert.equal(buildOrderFields([{ key: "server", type: "select" }], "123"), null);
    assert.equal(buildOrderFields([], "123"), null);
    assert.equal(buildOrderFields("junk", "123"), null);
    assert.equal(buildOrderFields(null, "123"), null);
  });

  test("ignores entries without a proper key", () => {
    assert.equal(buildOrderFields([{ type: "text" }], "123"), null);
  });
});

// ---------------------------------------------------------------------------
// 5. preflightCheck — availability / pricing / balance safety gates
// ---------------------------------------------------------------------------
describe("fazercards preflight safety checks", () => {
  test("allows a healthy order", () => {
    assert.deepEqual(preflightCheck(35, 35, 1000), { ok: true });
    assert.deepEqual(preflightCheck(35, 40, 35), { ok: true }); // live cheaper
    assert.deepEqual(preflightCheck(35, null, null), { ok: true }); // unknown stored price/balance
  });

  test("denies when the offer vanished", () => {
    assert.equal(preflightCheck(null, 35, 1000).reason, "OFFER_NOT_FOUND");
  });

  test("denies zero / unreadable prices", () => {
    assert.equal(preflightCheck(0, 35, 1000).reason, "OFFER_PRICE_ZERO");
  });

  test("denies live price above the synced price", () => {
    const result = preflightCheck(40, 35, 1000);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "PRICE_INCREASED");
  });

  test("denies when the balance cannot cover the order", () => {
    const result = preflightCheck(35, 35, 34);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "INSUFFICIENT_SUPPLIER_BALANCE");
  });
});

// ---------------------------------------------------------------------------
// 6. Webhook signature verification (HMAC-SHA256 over the RAW body)
// ---------------------------------------------------------------------------
describe("fazercards webhook verification", () => {
  const RAW = '{"event":"order.completed","data":{"order_id":"ord-9"}}';

  function sign(raw: string, secret = "fc_test_webhook_secret"): string {
    return createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  }

  test("accepts a valid signature over the raw body", () => {
    assert.deepEqual(verifyFazerWebhook(RAW, sign(RAW)), { ok: true });
  });

  test("accepts a sha256= prefixed signature (common convention)", () => {
    assert.deepEqual(verifyFazerWebhook(RAW, `sha256=${sign(RAW)}`), { ok: true });
  });

  test("accepts with a fresh timestamp header", () => {
    const now = Math.floor(Date.now() / 1000).toString();
    assert.deepEqual(verifyFazerWebhook(RAW, sign(RAW), now), { ok: true });
  });

  test("rejects a stale timestamp when provided", () => {
    const stale = (Math.floor(Date.now() / 1000) - FAZERCARDS_WEBHOOK_TOLERANCE_SECONDS - 10).toString();
    const result = verifyFazerWebhook(RAW, sign(RAW), stale);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "STALE_TIMESTAMP");
  });

  test("rejects a non-numeric timestamp", () => {
    assert.equal(verifyFazerWebhook(RAW, sign(RAW), "abc").reason, "STALE_TIMESTAMP");
  });

  test("rejects tampered bodies", () => {
    const result = verifyFazerWebhook(RAW + " ", sign(RAW));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "INVALID_SIGNATURE");
  });

  test("rejects signatures from a different secret", () => {
    const result = verifyFazerWebhook(RAW, sign(RAW, "other_secret"));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "INVALID_SIGNATURE");
  });

  test("fails closed without a signature", () => {
    assert.equal(verifyFazerWebhook(RAW, null).reason, "MISSING_SIGNATURE");
    assert.equal(verifyFazerWebhook(RAW, "   ").reason, "MISSING_SIGNATURE");
  });

  test("fails closed without a configured secret", () => {
    const original = process.env.FAZERCARDS_WEBHOOK_SECRET;
    delete process.env.FAZERCARDS_WEBHOOK_SECRET;
    try {
      assert.equal(verifyFazerWebhook(RAW, sign(RAW)).reason, "NOT_CONFIGURED");
    } finally {
      process.env.FAZERCARDS_WEBHOOK_SECRET = original;
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Webhook event dedup ids
// ---------------------------------------------------------------------------
describe("fazercards webhook event ids", () => {
  test("prefers the supplier event id", () => {
    assert.equal(buildFazerEventId("evt-1", "{}"), "evt:evt-1");
  });

  test("falls back to an event_id/id field in the raw body", () => {
    assert.equal(buildFazerEventId(null, '{"event_id":"evt-9"}'), "evt:evt-9");
  });

  test("falls back to a deterministic body hash for opaque payloads", () => {
    const a = buildFazerEventId(null, "opaque");
    const b = buildFazerEventId(undefined, "opaque");
    assert.equal(a, b);
    assert.match(a, /^body:[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// 8. Order-reference extraction from untrusted payloads
// ---------------------------------------------------------------------------
describe("fazercards order reference extraction", () => {
  test("extracts ord-N references", () => {
    assert.equal(extractFazerOrderIdFromPayload('{"data":{"order_id":"ord-42"}}'), "ord-42");
    assert.equal(extractFazerOrderIdFromPayload("order ord-7 completed"), "ord-7");
  });

  test("returns null when no reference exists", () => {
    assert.equal(extractFazerOrderIdFromPayload('{"event":"webhook.test"}'), null);
    assert.equal(extractFazerOrderIdFromPayload("garbage"), null);
  });
});

// ---------------------------------------------------------------------------
// 9. Webhook URL safety rules
// ---------------------------------------------------------------------------
describe("fazercards webhook url rules", () => {
  test("requires public HTTPS URLs", () => {
    assert.equal(isHttpsWebhookUrl("https://raja-gaming.netlify.app/api/webhooks/fazercards"), true);
    assert.equal(isHttpsWebhookUrl("http://raja-gaming.netlify.app/api/webhooks/fazercards"), false);
    assert.equal(isHttpsWebhookUrl("https://localhost/api/webhooks/fazercards"), false);
    assert.equal(isHttpsWebhookUrl("https://127.0.0.1/api/webhooks/fazercards"), false);
    assert.equal(isHttpsWebhookUrl("not a url"), false);
  });
});

// ---------------------------------------------------------------------------
// 10. Config presence — booleans only, never values
// ---------------------------------------------------------------------------
describe("fazercards config presence", () => {
  test("reports presence as booleans with the default base URL", () => {
    const presence = getFazerConfigPresence();
    assert.equal(presence.apiKeySet, true);
    assert.equal(presence.webhookSecretSet, true);
    assert.equal(presence.baseUrl, "https://api.fzr.cards");
    assert.equal(JSON.stringify(presence).includes("fc_test"), false);
  });
});

// ---------------------------------------------------------------------------
// 11. Request construction against a loopback server (never the real API)
// ---------------------------------------------------------------------------
describe("fazercards request construction", () => {
  test("sends X-API-Key, JSON body and Idempotency-Key to the configured base URL", async () => {
    const seen: { path?: string; apiKey?: string; idem?: string; body?: string; method?: string } = {};
    const server: Server = createServer((req, res) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        seen.path = req.url;
        seen.method = req.method;
        seen.apiKey = req.headers["x-api-key"] as string | undefined;
        seen.idem = req.headers["idempotency-key"] as string | undefined;
        seen.body = data;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, order: { id: "ord-1", status: "processing" } }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const originalBase = process.env.FAZERCARDS_BASE_URL;
    process.env.FAZERCARDS_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { httpStatus, payload } = await fazerRequest<{ ok?: unknown }>(
        "POST",
        "/api/v2/topups/order",
        { category_id: "freefire", offer_id: "310", fields: { user_id: "123" } },
        { idempotencyKey: "RG-TEST-1" }
      );

      assert.equal(httpStatus, 200);
      assert.equal((payload as { ok?: unknown }).ok, true);
      assert.equal(seen.path, "/api/v2/topups/order");
      assert.equal(seen.method, "POST");
      assert.equal(seen.apiKey, "fc_test_key");
      assert.equal(seen.idem, "RG-TEST-1");
      assert.deepEqual(JSON.parse(seen.body ?? "{}"), {
        category_id: "freefire",
        offer_id: "310",
        fields: { user_id: "123" },
      });
    } finally {
      process.env.FAZERCARDS_BASE_URL = originalBase;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("fails closed without an API key", async () => {
    const original = process.env.FAZERCARDS_API_KEY;
    delete process.env.FAZERCARDS_API_KEY;
    try {
      await assert.rejects(
        () => fazerRequest("GET", "/api/v2/balance"),
        (error: Error & { code?: string }) => error.code === "FAZERCARDS_NOT_CONFIGURED"
      );
    } finally {
      process.env.FAZERCARDS_API_KEY = original;
    }
  });

  test("rejects paths without a leading slash", async () => {
    await assert.rejects(
      () => fazerRequest("GET", "api/v2/balance"),
      (error: Error & { code?: string }) => error.code === "FAZERCARDS_BAD_REQUEST"
    );
  });

  test("surfaces network failures as FAZERCARDS_NETWORK", async () => {
    const originalBase = process.env.FAZERCARDS_BASE_URL;
    process.env.FAZERCARDS_BASE_URL = "http://127.0.0.1:9"; // closed port
    try {
      await assert.rejects(
        () => fazerRequest("GET", "/api/v2/balance"),
        (error: Error & { code?: string }) => error.code === "FAZERCARDS_NETWORK"
      );
    } finally {
      process.env.FAZERCARDS_BASE_URL = originalBase;
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Suggested sale price arithmetic (round UP to 10 PKR)
// ---------------------------------------------------------------------------
describe("fazercards suggested PKR pricing", () => {
  test("never lands below cost", () => {
    assert.equal(suggestFazerSalePricePkr(35, 280, 0), 100); // $0.35 × 280 = 98 → 100
    assert.equal(suggestFazerSalePricePkr(100, 280, 10), 310); // 280 × 1.1 = 308 → 310
    assert.equal(suggestFazerSalePricePkr(0, 280, 10), 0);
    assert.equal(suggestFazerSalePricePkr(-5, 280, 10), 0);
  });
});
