/**
 * TEMPORARY diagnostic (deploy previews only — REMOVE BEFORE MERGE):
 * reports WHY DB-backed pages may fail in the Netlify function runtime.
 *
 * Discloses ONLY: env-var presence booleans, error NAMES/codes, and timings.
 * Never prints any value of any environment variable and never prints raw
 * error messages (they can embed connection data).
 */
import { NextResponse } from "next/server";
import { SignJWT } from "jose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENV_NAMES = [
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "SITE_URL",
  "CRYPTOEZE_SECRET_KEY",
  "CRYPTOEZE_WEBHOOK_SECRET",
  "CRYPTOEZE_API_BASE_URL",
  "RAJA_GAMING_ENCRYPTION_KEY",
  "STORAGE_DRIVER",
  "RESEND_API_KEY",
] as const;

function errShape(e: unknown) {
  const anyErr = e as { name?: string; code?: string };
  return {
    name: anyErr?.name ?? "Unknown",
    code: typeof anyErr?.code === "string" ? anyErr.code : null,
  };
}

export async function GET() {
  const started = Date.now();

  const env: Record<string, boolean> = {};
  for (const name of ENV_NAMES) env[name] = Boolean(process.env[name]);

  let dbQuery: unknown = "skipped";
  try {
    const { db } = await import("@/lib/db");
    const t0 = Date.now();
    const count = await db.diamondPackage.count();
    dbQuery = { ok: true, count, ms: Date.now() - t0 };
  } catch (e) {
    dbQuery = { ok: false, ...errShape(e) };
  }

  let jwtSign: unknown = "skipped";
  try {
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (!secret) {
      jwtSign = { ok: false, name: "MissingSecret" };
    } else {
      const t0 = Date.now();
      await new SignJWT({ diag: true })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(secret));
      jwtSign = { ok: true, ms: Date.now() - t0 };
    }
  } catch (e) {
    jwtSign = { ok: false, ...errShape(e) };
  }

  return NextResponse.json({
    ok: true,
    data: {
      note: "booleans and error codes only — no values",
      nodeVersion: process.version,
      env,
      dbQuery,
      jwtSign,
      totalMs: Date.now() - started,
    },
  });
}
