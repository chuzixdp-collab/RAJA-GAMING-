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
import tls from "node:tls";
import dns from "node:dns";

const req = createRequire(import.meta.url);

function redact(s: string) {
  return s
    .replace(/postgres(ql)?:\/\/[^\s"']+/g, "[redacted-url]")
    .replace(/:[^\s:@/]+@/g, ":[redacted]@");
}

const SSLREQ = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]);

// Raw TCP (family-pinned): optionally SSLRequest, optionally then TLS with SNI,
// then read the first post-TLS server message type (Authentication request) —
// NO credentials are ever sent.
function pgPathProbe(host: string, port: number, family: 4 | 6, wantTls: boolean, timeoutMs = 6000) {
  return new Promise<{ ok: boolean; stage: string; err: string | null; ms: number }>((resolve) => {
    const t0 = Date.now();
    const done = (ok: boolean, stage: string, err: string | null) => {
      resolve({ ok, stage, err, ms: Date.now() - t0 });
    };
    const socket = net.connect({ host, port, family });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => { socket.destroy(); done(false, "timeout", "timeout"); });
    socket.on("error", (e) => done(false, "tcp", (e as NodeJS.ErrnoException).code || e.message));
    socket.on("connect", () => {
      if (!wantTls) {
        socket.once("data", (d: Buffer) => { socket.destroy(); done(d[0] === 0x53, "sslrequest", d[0] === 0x53 ? null : `byte:${d[0]}`); });
        socket.write(SSLREQ);
        return;
      }
      socket.once("data", (d: Buffer) => {
        if (d[0] !== 0x53) { socket.destroy(); done(false, "sslrequest", `byte:${d[0]}`); return; }
        const tlsSocket = tls.connect({ socket, servername: host, rejectUnauthorized: false }, () => {
          // send StartupMessage (protocol 3.0, user "diag_probe", db "postgres") —
          // no credentials; server will reply with an authentication request.
          const params = Buffer.from(`user\0diag_probe\0database\0postgres\0\0`, "utf8");
          const len = 4 + 4 + params.length;
          const startup = Buffer.alloc(len);
          startup.writeUInt32BE(len, 0);
          startup.writeUInt32BE(196608, 4);
          params.copy(startup, 8);
          tlsSocket.once("data", (d2: Buffer) => {
            // message type byte: 'R' (0x52) = authentication request → server reachable
            const type = String.fromCharCode(d2[0]);
            tlsSocket.destroy();
            done(type === "R", "tls+startup", type === "R" ? null : `msg-type:${type}`);
          });
          tlsSocket.once("error", (e2) => done(false, "tls-post", (e2 as Error).message));
          tlsSocket.write(startup);
        });
        tlsSocket.setTimeout(timeoutMs);
        tlsSocket.on("error", (e2) => done(false, "tls", (e2 as Error).message));
        tlsSocket.on("timeout", () => { tlsSocket.destroy(); done(false, "tls", "timeout"); });
      });
      socket.write(SSLREQ);
    });
  });
}

function dnsOrder(host: string) {
  return new Promise<{ ok: boolean; order?: string[]; err?: string }>((resolve) => {
    dns.lookup(host, { all: true, verbatim: true }, (err, addrs) => {
      if (err) resolve({ ok: false, err: (err as NodeJS.ErrnoException).code });
      else resolve({ ok: true, order: addrs.map((a) => (a.family === 6 ? "AAAA" : "A")) });
    });
  });
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

  // Full pre-auth Postgres path probes from INSIDE the function runtime —
  // family-pinned IPv4 vs IPv6, no credentials ever sent.
  async function deepProbe(raw: string | undefined) {
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
    const dnsOrderResult = await dnsOrder(host);
    const v4Plain = await pgPathProbe(host, port, 4, false);
    const v4Tls = await pgPathProbe(host, port, 4, true);
    const v6Plain = await pgPathProbe(host, port, 6, false);
    return {
      present: true,
      host,
      port,
      dnsOrderResult,
      v4Plain,
      v4Tls,
      v6Plain,
    };
  }

  const runtimeProbePooled = await deepProbe(process.env.DATABASE_URL);
  const runtimeProbeDirect = await deepProbe(process.env.DIRECT_DATABASE_URL);

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
