/**
 * db-inspect.mjs — STRICTLY READ-ONLY database & migration-history inspector.
 *
 * Purpose: verify the ACTUAL production schema and the `_prisma_migrations`
 * state BEFORE a production migration, with zero possibility of writes:
 *  - Opens ONE TLS-verified connection (certificate chain + hostname; never
 *    disables verification).
 *  - Runs SELECT statements only. It never creates the ledger table, never
 *    inserts, never alters anything.
 *  - Prints only non-secret output: object names, migration names, ledger
 *    timestamps. Never prints the connection string or credentials, so the
 *    output is safe to paste into a PR or chat.
 *
 * Usage (run where DIRECT_DATABASE_URL is already set — e.g. locally; the URL
 * itself must never be pasted into chats, issues, or CI logs):
 *   DIRECT_DATABASE_URL='postgres://...' node scripts/db-inspect.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const connectionString = (process.env.DIRECT_DATABASE_URL || "").trim();
if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
  console.error(
    "[db-inspect] DIRECT_DATABASE_URL must be set to a postgres:// connection string (read-only inspection)."
  );
  process.exit(1);
}
const hostname = (() => {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return "";
  }
})();
const isLocal = LOCAL_HOSTS.has(hostname);

const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 15_000,
  ssl: isLocal ? false : { rejectUnauthorized: true },
});

function declaredObjects(sql) {
  const objects = [];
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi)) {
    objects.push({ kind: "table", name: m[2], ifNotExists: Boolean(m[1]) });
  }
  for (const m of sql.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi
  )) {
    objects.push({ kind: "index", name: m[2], ifNotExists: Boolean(m[1]) });
  }
  return objects;
}

async function main() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, e.name, "migration.sql"), "utf8");
      return { name: e.name, sql, checksum: crypto.createHash("sha256").update(sql).digest("hex") };
    });

  await client.connect();
  const info = await client.query("SELECT version() AS v, current_database() AS db, current_user AS usr");
  console.log(
    `[db-inspect] server: ${String(info.rows[0].v).split(" ").slice(0, 2).join(" ")} | database: ${
      info.rows[0].db
    } | role: ${info.rows[0].usr} | TLS: ${isLocal ? "local (no TLS)" : "verified"}`
  );

  const { rows: tables } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  const tableSet = new Set(tables.map((r) => r.table_name));
  console.log(
    `[db-inspect] public tables (${tables.length}): ${tables.map((t) => t.table_name).join(", ") || "(none)"}`
  );

  let ledger = { rows: [] };
  let ledgerMissing = false;
  try {
    ledger = await client.query(
      "SELECT migration_name, checksum, finished_at, rolled_back_at, logs FROM _prisma_migrations ORDER BY started_at"
    );
  } catch (err) {
    if (err.code === "42P01") ledgerMissing = true;
    else throw err;
  }
  if (ledgerMissing) {
    console.log("[db-inspect] _prisma_migrations: table does NOT exist (never migrated via CLI/runner)");
  } else {
    console.log(`[db-inspect] _prisma_migrations entries (${ledger.rows.length}):`);
    for (const r of ledger.rows) {
      console.log(
        `  - ${r.migration_name}${r.rolled_back_at ? " [rolled back]" : ""} finished=${
          r.finished_at ? new Date(r.finished_at).toISOString() : "n/a"
        }${r.logs ? ` logs=${String(r.logs).slice(0, 60)}` : ""}`
      );
    }
  }

  const appliedNames = new Set(ledger.rows.filter((r) => !r.rolled_back_at).map((r) => r.migration_name));
  const { rows: indexes } = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'");
  const indexSet = new Set(indexes.map((r) => r.indexname));

  let unverifiable = false;
  for (const m of files) {
    const recorded = ledger.rows.find((r) => r.migration_name === m.name && !r.rolled_back_at);
    if (recorded && recorded.checksum !== m.checksum) {
      console.log(`[db-inspect] DRIFT: "${m.name}" is recorded with a different checksum than the local file`);
      unverifiable = true;
      continue;
    }
    if (!appliedNames.has(m.name)) {
      const objects = declaredObjects(m.sql).filter((o) => !o.ifNotExists);
      const found = objects.filter((o) => (o.kind === "table" ? tableSet.has(o.name) : indexSet.has(o.name)));
      console.log(
        `[db-inspect] pending "${m.name}": ${objects.length} object(s) expected; already existing: ${
          found.map((o) => `${o.kind}:${o.name}`).join(", ") || "(none)"
        }`
      );
      if (found.length > 0) unverifiable = true;
    }
  }

  if (unverifiable) {
    console.log("[db-inspect] VERDICT: HISTORY UNVERIFIABLE — do not run a production migration until resolved.");
    console.log("[db-inspect] Manual action: compare the objects above with the pending SQL in prisma/migrations/.");
    console.log("[db-inspect] ONLY if every object of a pending migration already exists with the expected shape,");
    console.log("[db-inspect] record it deliberately WITHOUT executing (writes only to _prisma_migrations):");
    console.log("[db-inspect]   npx prisma migrate resolve --applied <migration_name>");
  } else {
    const pending = files.filter((m) => !appliedNames.has(m.name));
    console.log(
      `[db-inspect] VERDICT: HISTORY VERIFIED — ${pending.length} pending migration(s) can be applied cleanly: ${
        pending.map((m) => m.name).join(", ") || "(none)"
      }`
    );
  }
}

main()
  .catch((err) => {
    console.error("[db-inspect] FAILED:", String(err.message || err).split("\n")[0]);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await client.end();
    } catch {}
    process.exit(process.exitCode || 0);
  });
