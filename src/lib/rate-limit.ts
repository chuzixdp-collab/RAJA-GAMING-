/**
 * Simple in-memory sliding-window rate limiter.
 * Best-effort (per server instance) — used to slow down brute-force and spam.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastCleanup = Date.now();

function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  cleanup(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (bucket.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Throws ApiError(429) when the limit is exceeded. */
export async function assertRateLimit(key: string, max: number, windowMs: number) {
  const { ApiError } = await import("@/lib/api");
  const result = rateLimit(key, max, windowMs);
  if (!result.ok) {
    throw new ApiError(`Too many requests. Please try again in ${result.retryAfterSec}s.`, 429);
  }
}
