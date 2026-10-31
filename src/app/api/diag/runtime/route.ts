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
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";

const req = createRequire(import.meta.url);

function redact(s: string) {
  return s
    .replace(/postgres(ql)?:\/\/[^\s"']+/g, "[redacted-url]")
    .replace(/:[^\s:@/]+@/g, ":[redacted]@");
}

// Read-only probe: TCP connect (+ optional Postgres SSLRequest byte, which
// carries no credentials) to a host:port parsed from an env-provided URL.
function tcpProbe(host: string, port: number, family: 4 | 6, timeoutMs = 5000, sslreq = false) {
  return new Promise<{ ok: boolean; err: string | null; ms: number }>((resolve) => {
    const t0 = Date.now();
    const socket = net.connect({ host, port, family });
    const finish = (ok: boolean, err: string | null) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ ok, err, ms: Date.now() - t0 });
    };
    socket.setTimeout(timeoutMs, () => finish(false, "timeout"));
    if (!sslreq) {
      socket.on("connect", () => finish(true, null));
    } else {
      socket.on("connect", () => {
        // Postgres SSLRequest: len=8, code=80877103 — no credentials sent
        socket.write(Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]));
        socket.once("data", (d: Buffer) => finish(d[0] === 0x53, d[0] === 0x53 ? null : `unexpected-byte:${d[0]}`));
      });
    }
    socket.on("error", (e) => finish(false, (e as NodeJS.ErrnoException).code || e.message));
  });
}

async function probeEnvUrl(label: string, raw: string | undefined, sslreq: boolean) {
  if (!raw) return { present: false };
  let host = "";
  let port = 5432;
  try {
    const u = new URL(raw.trim());
    host = u.hostname;
    port = Number(u.port || 5432);
  } catch {
    return { present: true, parse: "failed" };
  }
  if (!host || !/^postgres(ql)?$/.test(new URL(raw.trim()).protocol.replace(":", ""))) {
    return { present: true, parse: "non-network" };
  }
  const v4 = await tcpProbe(host, port, 4, 5000, sslreq);
  const v6 = await tcpProbe(host, port, 6, 5000, sslreq);
  console.log(`[diag] ${label}: host=${host} tcpV4=${v4.ok}(${v4.ms}ms,${v4.err}) tcpV6=${v6.ok}(${v6.ms}ms,${v6.err}) sslreq=${sslreq}`);
  return { present: true, host, port, v4, v6 };
}

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
  const anyErr = e as { name?: string; code?: string; message?: string };
  return {
    name: anyErr?.name ?? "Unknown",
    code: typeof anyErr?.code === "string" ? anyErr.code : null,
    message: anyErr?.message ? redact(String(anyErr.message)).slice(0, 500) : null,
  };
}

let bundledEngines: unknown = "unavailable";
try {
  const idx = req.resolve(".prisma/client/index.js");
  const dir = path.dirname(idx);
  bundledEngines = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.includes("query_engine") ||
        f.includes("query_engine-") ||
        f.endsWith(".so.node") ||
        f.startsWith("schema"),
    );
} catch (e) {
  bundledEngines = errShape(e);
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
    dbQuery = { ok: false, ms: Date.now() - started, ...errShape(e) };
  }

  // Raw network probes from INSIDE the function runtime (no credentials).
  const runtimeProbePooled = await probeEnvUrl(
    "DATABASE_URL(pooled)",
    process.env.DATABASE_URL,
    true,
  );
  const runtimeProbeDirect = await probeEnvUrl(
    "DIRECT_DATABASE_URL(direct)",
    process.env.DIRECT_DATABASE_URL,
    true,
  );

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
      platform: `${process.platform}-${process.arch}`,
      bundledEngines,
      env,
      runtimeProbePooled,
      runtimeProbeDirect,
      dbQuery,
      jwtSign,
      totalMs: Date.now() - started,
    },
  });
}
