/**
 * Unit tests for the automatic ALUU status polling — 100% OFFLINE.
 *
 * No network call to aluu.in is ever made and no database is touched. All
 * credentials here are obviously fake test values. Covered:
 *  - verifyCronAuth: every verdict branch (fail-closed NO_SECRET, header
 *    parsing, scheme check, timing-safe match/mismatch incl. length
 *    mismatch) — the single gate protecting the cron endpoint
 *  - The polling contract constants (pollable statuses, batch/deadline
 *    bounds) so a future edit cannot silently break the cron budget
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { verifyCronAuth, CRON_AUTH_SCHEME } from "../src/lib/cron";
import {
  POLLABLE_SUPPLIER_STATUSES,
  POLL_BATCH_LIMIT,
  POLL_MAX_AGE_DAYS,
  POLL_DEADLINE_MS,
  POLL_REQUEST_TIMEOUT_MS,
} from "../src/lib/aluu-poll";

// ---------------------------------------------------------------------------
// verifyCronAuth — Authorization: Bearer <CRON_SECRET>
// ---------------------------------------------------------------------------
describe("verifyCronAuth (timing-safe cron bearer check)", () => {
  const SECRET = "cron-secret-abc123";

  test("fail closed when the server has no secret configured", () => {
    assert.deepEqual(verifyCronAuth(`Bearer ${SECRET}`, undefined), {
      ok: false,
      reason: "NO_SECRET",
    });
    assert.deepEqual(verifyCronAuth(`Bearer ${SECRET}`, ""), {
      ok: false,
      reason: "NO_SECRET",
    });
    assert.deepEqual(verifyCronAuth(`Bearer ${SECRET}`, "   "), {
      ok: false,
      reason: "NO_SECRET",
    });
  });

  test("reject missing / empty / non-string header", () => {
    assert.deepEqual(verifyCronAuth(null, SECRET), { ok: false, reason: "NO_HEADER" });
    assert.deepEqual(verifyCronAuth("", SECRET), { ok: false, reason: "NO_HEADER" });
    assert.deepEqual(verifyCronAuth("   ", SECRET), { ok: false, reason: "NO_HEADER" });
  });

  test("reject wrong auth scheme (case-insensitive prefix compare)", () => {
    assert.deepEqual(verifyCronAuth(`Basic ${SECRET}`, SECRET), {
      ok: false,
      reason: "BAD_SCHEME",
    });
    // A token scheme whose first 6 chars are NOT "bearer".
    assert.deepEqual(verifyCronAuth(`Token ${SECRET}`, SECRET), {
      ok: false,
      reason: "BAD_SCHEME",
    });
    // "bearer-not ..." starts with the 6-char prefix "bearer", so the scheme
    // check passes and the bogus token fails the secret compare instead.
    assert.deepEqual(verifyCronAuth(`bearer-not ${SECRET}`, SECRET), {
      ok: false,
      reason: "MISMATCH",
    });
  });

  test("accept the exact secret with the Bearer scheme (any case)", () => {
    assert.deepEqual(verifyCronAuth(`Bearer ${SECRET}`, SECRET), { ok: true });
    assert.deepEqual(verifyCronAuth(`bearer ${SECRET}`, SECRET), { ok: true });
    assert.deepEqual(verifyCronAuth(`BEARER   ${SECRET}`, SECRET), { ok: true });
  });

  test("reject wrong secrets, including length mismatches (no throw)", () => {
    assert.deepEqual(verifyCronAuth("Bearer wrong-value-xxxx", SECRET), {
      ok: false,
      reason: "MISMATCH",
    });
    // shorter and longer than the expected secret — timingSafeEqual must
    // never be handed unequal lengths (it throws); the helper guards that.
    assert.deepEqual(verifyCronAuth("Bearer short", SECRET), {
      ok: false,
      reason: "MISMATCH",
    });
    assert.deepEqual(verifyCronAuth(`Bearer ${SECRET}-with-extra-suffix`, SECRET), {
      ok: false,
      reason: "MISMATCH",
    });
  });

  test("reject Bearer with no token", () => {
    assert.deepEqual(verifyCronAuth("Bearer", SECRET), { ok: false, reason: "MISMATCH" });
    assert.deepEqual(verifyCronAuth("Bearer ", SECRET), { ok: false, reason: "MISMATCH" });
    assert.deepEqual(verifyCronAuth("Bearer    ", SECRET), { ok: false, reason: "MISMATCH" });
  });

  test("scheme constant is exactly what the scheduled function sends", () => {
    assert.equal(CRON_AUTH_SCHEME, "Bearer");
  });
});

// ---------------------------------------------------------------------------
// Polling contract constants — lock the cron budget
// ---------------------------------------------------------------------------
describe("aluu poller contract constants", () => {
  test("only PENDING / UNKNOWN supplier orders are polled", () => {
    assert.deepEqual([...POLLABLE_SUPPLIER_STATUSES], ["PENDING", "UNKNOWN"]);
  });

  test("bounded work: small batch, per-call timeout below the client default, soft deadline", () => {
    assert.ok(POLL_BATCH_LIMIT >= 1 && POLL_BATCH_LIMIT <= 20, "batch must stay small");
    assert.ok(POLL_REQUEST_TIMEOUT_MS > 0 && POLL_REQUEST_TIMEOUT_MS <= 25_000);
    assert.ok(POLL_DEADLINE_MS > POLL_REQUEST_TIMEOUT_MS, "deadline must allow >=1 call");
    assert.ok(POLL_MAX_AGE_DAYS >= 1 && POLL_MAX_AGE_DAYS <= 60);
  });
});
