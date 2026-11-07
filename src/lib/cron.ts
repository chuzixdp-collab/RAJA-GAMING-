/**
 * Server-to-server cron authentication — SERVER-ONLY.
 *
 * The automatic ALUU status poller is triggered by a Netlify Scheduled
 * Function that calls the site's own `/api/cron/aluu-poll` endpoint with
 * `Authorization: Bearer <CRON_SECRET>`. This module is the single
 * verification point for that handshake:
 *
 *  - FAIL CLOSED: no CRON_SECRET configured -> never authorized (the route
 *    answers 503 so the misconfiguration is visible in function logs).
 *  - TIMING-SAFE comparison of the presented secret against the configured
 *    one (constant-time, length-checked — no early exits on mismatch).
 *  - The secret is never logged, returned, or embedded in error messages.
 */

import { timingSafeEqual } from "node:crypto";

/** Fixed scheme the scheduled function sends. */
export const CRON_AUTH_SCHEME = "Bearer";

/**
 * Pure, unit-testable verification of an `Authorization` header value.
 *
 * Returns one of:
 *  - { ok: true }                          — header matches the secret
 *  - { ok: false; reason: "NO_SECRET" }    — server has no CRON_SECRET set
 *  - { ok: false; reason: "NO_HEADER" }    — client sent nothing usable
 *  - { ok: false; reason: "BAD_SCHEME" }   — wrong auth scheme
 *  - { ok: false; reason: "MISMATCH" }     — wrong secret
 */
export function verifyCronAuth(
  authHeader: string | null,
  secret: string | undefined | null
): { ok: boolean; reason?: "NO_SECRET" | "NO_HEADER" | "BAD_SCHEME" | "MISMATCH" } {
  if (typeof secret !== "string" || secret.trim() === "") {
    return { ok: false, reason: "NO_SECRET" };
  }
  if (typeof authHeader !== "string" || authHeader.trim() === "") {
    return { ok: false, reason: "NO_HEADER" };
  }

  const scheme = authHeader.slice(0, CRON_AUTH_SCHEME.length);
  if (scheme.toLowerCase() !== CRON_AUTH_SCHEME.toLowerCase()) {
    return { ok: false, reason: "BAD_SCHEME" };
  }

  const presented = authHeader.slice(CRON_AUTH_SCHEME.length).trim();
  if (presented.length === 0) {
    return { ok: false, reason: "MISMATCH" };
  }

  // timingSafeEqual throws on length mismatch, so the length gate runs
  // first; only equal-length buffers ever reach the constant-time compare.
  const expected = Buffer.from(secret, "utf8");
  const received = Buffer.from(presented, "utf8");
  const sameLength = expected.length === received.length;
  const equal = sameLength && timingSafeEqual(expected, received);

  return equal ? { ok: true } : { ok: false, reason: "MISMATCH" };
}
