/**
 * Unit tests for the CryptoEze QR integration.
 *
 * All provider responses here are MOCKED fixtures (clearly marked `mock`).
 * No real payment, no network call to cryptoeze.com, and no claim of a real
 * payment test is made anywhere in this file.
 *
 * Run: npm test   (tsx --test tests/cryptoeze-qr.test.ts)
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import QRCode from "qrcode";

import {
  buildPaymentQrDataUrl,
  parseCryptoEzePaymentData,
  PAYMENT_QR_OPTIONS,
  resolveQrRenderSource,
} from "../src/lib/cryptoeze";
import { formatRs } from "../src/lib/format";

// ---------------------------------------------------------------------------
// Mocked provider fixtures — POST /api/v1/pkr with method "qr" returns BOTH
// checkout_url and qr_string for every order (confirmed by CryptoEze admin).
// Values are fake and clearly marked mock; they are never sent anywhere.
// ---------------------------------------------------------------------------
const MOCK_CHECKOUT_URL = "https://cryptoeze.com/checkout/cze_mock_0001?mock=1";
const MOCK_QR_STRING =
  "00020101021226580014PK-MOCK-WALLET0111777123456789010204000452045899" +
  "5303586540515.005802PK5913RAJAGAMINGTEST6005MOCKC62170508CZE-MOCK-0001630433B2";

const MOCK_CREATE_RESPONSE = {
  data: {
    id: "cze_mock_0001",
    status: "pending",
    checkout_url: MOCK_CHECKOUT_URL,
    qr_string: MOCK_QR_STRING,
  },
};

const MOCK_RESUME_RESPONSE = {
  data: {
    id: "cze_mock_0001",
    status: "pending",
    checkout_url: MOCK_CHECKOUT_URL,
    qr_string: MOCK_QR_STRING,
    order_id: "RAJA-MOCK-ORD-1",
  },
};

// ---------------------------------------------------------------------------
// 1. API response parsing (mocked response containing BOTH fields)
// ---------------------------------------------------------------------------
describe("parseCryptoEzePaymentData (mocked POST /api/v1/pkr response)", () => {
  test("parses checkout_url and qr_string from the mocked create response", () => {
    const parsed = parseCryptoEzePaymentData(MOCK_CREATE_RESPONSE);
    assert.ok(parsed, "mocked create response must parse");
    assert.equal(parsed.id, "cze_mock_0001");
    assert.equal(parsed.status, "pending");
    assert.equal(parsed.checkoutUrl, MOCK_CHECKOUT_URL);
    assert.equal(parsed.qrString, MOCK_QR_STRING);
    assert.equal(parsed.providerOrderId, null);
  });

  test("keeps the two fields distinct — qr_string is never the checkout_url", () => {
    const parsed = parseCryptoEzePaymentData(MOCK_CREATE_RESPONSE);
    assert.ok(parsed);
    assert.notEqual(parsed.qrString, parsed.checkoutUrl);
    assert.notEqual(parsed.checkoutUrl, parsed.qrString);
  });

  test("parses the mocked resume (GET /api/v1/pkr/{id}) response with order_id echo", () => {
    const parsed = parseCryptoEzePaymentData(MOCK_RESUME_RESPONSE);
    assert.ok(parsed);
    assert.equal(parsed.checkoutUrl, MOCK_CHECKOUT_URL);
    assert.equal(parsed.qrString, MOCK_QR_STRING);
    assert.equal(parsed.providerOrderId, "RAJA-MOCK-ORD-1");
  });

  test("tolerates a missing qr_string — qrString becomes null (UI falls back to Open Payment Page)", () => {
    const parsed = parseCryptoEzePaymentData({
      data: {
        id: "cze_mock_0002",
        status: "pending",
        checkout_url: MOCK_CHECKOUT_URL,
      },
    });
    assert.ok(parsed);
    assert.equal(parsed.qrString, null);
    assert.equal(parsed.checkoutUrl, MOCK_CHECKOUT_URL);
  });

  test("ignores a non-string qr_string (number, object, empty)", () => {
    for (const bad of [123, { payload: true }, "", null]) {
      const parsed = parseCryptoEzePaymentData({
        data: {
          id: "cze_mock_0003",
          status: "pending",
          checkout_url: MOCK_CHECKOUT_URL,
          qr_string: bad,
        },
      });
      assert.ok(parsed, `expected parse to succeed with qr_string=${String(bad)}`);
      assert.equal(parsed.qrString, null);
    }
  });

  test("rejects malformed responses so callers can map them to safe errors", () => {
    const bads: unknown[] = [
      null,
      undefined,
      {},
      { data: null },
      { data: "pending" },
      { data: {} },
      { data: { id: "cze_x" } }, // missing checkout_url
      { data: { id: "cze_x", checkout_url: "" } }, // empty checkout_url
      { data: { id: "", checkout_url: MOCK_CHECKOUT_URL } }, // empty id
      { error: "401 authentication" },
    ];
    for (const bad of bads) {
      assert.equal(
        parseCryptoEzePaymentData(bad),
        null,
        `expected null for ${JSON.stringify(bad)}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. QR payload resolution — the payment QR is generated from qr_string ONLY.
//    checkout_url is a fallback LINK, never QR content.
// ---------------------------------------------------------------------------
describe("resolveQrRenderSource", () => {
  test("uses qr_string as the ONLY QR payload when both fields are present", () => {
    const source = resolveQrRenderSource({
      qrString: MOCK_QR_STRING,
      checkoutUrl: MOCK_CHECKOUT_URL,
    });
    assert.equal(source.kind, "qr_string");
    assert.ok(source.kind === "qr_string" && source.value === MOCK_QR_STRING);
    // The checkout_url must never leak into the QR payload:
    assert.notEqual(source.kind === "qr_string" ? source.value : "", MOCK_CHECKOUT_URL);
  });

  test("degrades to the checkout_url LINK (not a QR) when qr_string is missing", () => {
    const source = resolveQrRenderSource({ checkoutUrl: MOCK_CHECKOUT_URL });
    assert.equal(source.kind, "checkout_fallback");
    assert.ok(
      source.kind === "checkout_fallback" && source.value === MOCK_CHECKOUT_URL
    );
  });

  test("treats a blank/whitespace qr_string as missing", () => {
    const source = resolveQrRenderSource({
      qrString: "   ",
      checkoutUrl: MOCK_CHECKOUT_URL,
    });
    assert.equal(source.kind, "checkout_fallback");
  });

  test("resolves to none when neither field is usable", () => {
    assert.deepEqual(resolveQrRenderSource({}), { kind: "none" });
    assert.deepEqual(resolveQrRenderSource({ qrString: null, checkoutUrl: null }), {
      kind: "none",
    });
  });
});

// ---------------------------------------------------------------------------
// 3. QR rendering from the mocked qr_string
// ---------------------------------------------------------------------------
describe("buildPaymentQrDataUrl (rendering the payment QR)", () => {
  test("renders a real PNG data URL from the mocked qr_string payload", async () => {
    const dataUrl = await buildPaymentQrDataUrl(MOCK_QR_STRING);
    assert.match(dataUrl, /^data:image\/png;base64,/);
    const base64 = dataUrl.slice("data:image/png;base64,".length);
    const bytes = Buffer.from(base64, "base64");
    // PNG magic number \x89PNG\r\n\x1a\n
    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    );
    assert.ok(bytes.length > 500, "512px QR PNG should be non-trivial in size");
  });

  test("passes EXACTLY the qr_string payload to the renderer — never checkout_url", async (t) => {
    const spy = t.mock.method(
      QRCode,
      "toDataURL",
      async () => "data:image/png;base64,MOCK"
    );
    const out = await buildPaymentQrDataUrl(MOCK_QR_STRING);
    assert.equal(out, "data:image/png;base64,MOCK");
    assert.equal(spy.mock.calls.length, 1);
    const [payload, options] = spy.mock.calls[0].arguments;
    assert.equal(payload, MOCK_QR_STRING);
    assert.notEqual(payload, MOCK_CHECKOUT_URL);
    assert.deepEqual(options, PAYMENT_QR_OPTIONS);
  });

  test("pins the QR rendering options (512px, margin 2, EC level M)", () => {
    assert.deepEqual(PAYMENT_QR_OPTIONS, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
    });
  });

  test("rejects when the renderer fails so the UI can show its Try Again state", async (t) => {
    t.mock.method(QRCode, "toDataURL", async () => {
      throw new Error("mock renderer failure");
    });
    await assert.rejects(
      buildPaymentQrDataUrl(MOCK_QR_STRING),
      /mock renderer failure/
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Amount / order details formatting
// ---------------------------------------------------------------------------
describe("amount and order detail formatting", () => {
  test("formats the order total the way the checkout screen shows it", () => {
    assert.equal(formatRs(1500), "Rs 1,500");
  });

  test("formats the fixed-two-decimals amount string sent to the provider", () => {
    assert.equal(formatRs("1500.00"), "Rs 1,500");
  });

  test("falls back to Rs 0 for missing/invalid amounts", () => {
    assert.equal(formatRs(null), "Rs 0");
    assert.equal(formatRs("not-a-number"), "Rs 0");
  });
});
