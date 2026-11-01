/**
 * CI diagnostic: report whether the database endpoints configured for this
 * Netlify build context are reachable via TCP.
 *
 * Safety properties:
 *  - READ-ONLY. Opens a TCP socket to host:port, sends nothing, closes it.
 *    Never authenticates, never issues SQL, never touches data.
 *  - The build LOG may contain host:port (the same information Prisma's own
 *    P1001 error prints). Credentials are NEVER read or printed.
 *  - In deploy previews / branch deploys it also writes .next/db-check.json
 *    containing BOOLEANS ONLY (no hostnames, no credentials) so results can
 *    be verified without Netlify log access.
 */
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const WRITE_JSON = process.argv.includes("--write-json");
const CONTEXT = process.env.CONTEXT || "unknown";

function parseTarget(raw) {
  if (!raw) return { present: false, reason: "not-set" };
  try {
    const u = new URL(raw.trim());
    if (!/^postgres(ql)?:$/.test(u.protocol)) {
      return { present: true, network: false, reason: `non-postgres-protocol:${u.protocol}` };
    }
    if (!u.hostname) return { present: true, network: false, reason: "missing-host" };
    return {
      present: true,
      network: true,
      host: u.hostname,
      port: Number(u.port || 5432),
      pooler: u.hostname.includes("-pooler"),
    };
  } catch {
    return { present: true, network: false, reason: "url-parse-failed" };
  }
}

function tcpProbe(host, port, family, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, family });
    const finish = (ok, err) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ ok, err: err ?? null });
    };
    socket.setTimeout(timeoutMs, () => finish(false, "timeout"));
    socket.on("connect", () => finish(true, null));
    socket.on("error", (e) => finish(false, e.code || e.message));
  });
}

async function probe(label, raw) {
  const t = parseTarget(raw);
  if (!t.present) {
    console.log(`[ci-db-check] ${label}: NOT SET`);
    return { present: false };
  }
  if (!t.network) {
    console.log(`[ci-db-check] ${label}: non-network url (${t.reason})`);
    return { present: true, network: false, reason: t.reason };
  }
  const v4 = await tcpProbe(t.host, t.port, 4);
  const v6 = await tcpProbe(t.host, t.port, 6);
  console.log(
    `[ci-db-check] ${label}: host=${t.host} port=${t.port} pooler=${t.pooler} ` +
      `tcpV4=${v4.ok}${v4.err ? ` (${v4.err})` : ""} tcpV6=${v6.ok}${v6.err ? ` (${v6.err})` : ""}`,
  );
  return {
    present: true,
    network: true,
    pooler: t.pooler,
    tcpV4: v4.ok,
    tcpV6: v6.ok,
    v4err: v4.err,
    v6err: v6.err,
  };
}

const direct = await probe("DIRECT_DATABASE_URL (production migration target)", process.env.DIRECT_DATABASE_URL);
const database = await probe("DATABASE_URL (runtime target)", process.env.DATABASE_URL);

const result = {
  checkedAt: new Date().toISOString(),
  context: CONTEXT,
  directSet: direct.present === true,
  directPoolerHost: direct.pooler ?? null,
  directTcpV4: direct.tcpV4 ?? null,
  directTcpV6: direct.tcpV6 ?? null,
  databaseSet: database.present === true,
  databasePoolerHost: database.pooler ?? null,
  databaseTcpV4: database.tcpV4 ?? null,
  databaseTcpV6: database.tcpV6 ?? null,
};

if (WRITE_JSON && (CONTEXT === "deploy-preview" || CONTEXT === "branch-deploy")) {
  // Booleans only — no hostnames, no credentials.
  // Written into public/ BEFORE `next build` so the Next.js runtime serves it
  // at /db-check.json (files in .next/ are not routable on Netlify).
  fs.mkdirSync(path.join("public"), { recursive: true });
  fs.writeFileSync(path.join("public", "db-check.json"), JSON.stringify(result, null, 2));
  console.log("[ci-db-check] booleans-only summary will be served at /db-check.json on the preview site");
}
console.log("[ci-db-check] done:", JSON.stringify(result));
