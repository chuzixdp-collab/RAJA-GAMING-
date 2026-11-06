/**
 * migrate-deploy.mjs — production migration runner (v2, hardened).
 *
 * Review-driven changes (PR #4 hardening):
 *  1. TLS is FULLY VERIFIED for remote databases (certificate chain AND
 *     hostname, via Node's bundled Mozilla CA store — Neon uses publicly
 *     trusted certificates). `rejectUnauthorized: false` was removed and must
 *     never be reintroduced.
 *  2. Automatic baselining was REMOVED. A duplicate-object error is NOT proof
 *     that a migration was applied — the runner now fails closed instead of
 *     recording anything it did not execute.
 *  3. Read-only pre-flight before ANY write: prints the migration ledger
 *     (_prisma_migrations) and a public-table census, verifies checksums of
 *     already-applied migrations against the local files (drift detection),
 *     and refuses to run if any object a pending migration would create
 *     already exists (history unverifiable).
 *  4. If migration history cannot be verified, the runner exits 1 and prints
 *     the exact manual action (read-only inspection + a deliberate,
 *     human-verified `prisma migrate resolve --applied`, which writes only to
 *     the ledger and executes no migration SQL).
 *
 * Semantics kept from v1: applies migrations in order only; never drops,
 * resets, or rewrites data; each migration runs inside a transaction with its
 * ledger row; checksums are sha256 over migration.sql (Prisma-CLI compatible);
 * secrets are read from the environment and never printed.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const MAX_LISTED_CONFLICTS = 10;

function log(msg) {
  console.log(`[migrate-deploy] ${msg}`);
}
function fail(msg) {
  console.error(`[migrate-deploy] FAILED: ${msg}`);
}

// Context guard (fail-closed): production always runs this runner. Deploy
// previews and branch deploys may only run it with the explicit opt-in
// ALLOW_PREVIEW_MIGRATION=1 (set in netlify.toml), so their runtime database
// schema always matches the Prisma Client built from this branch. Any other
// context refuses to run — migrations must never happen by accident.
//
// Netlify exposes the build context as `CONTEXT` ("production",
// "deploy-preview", "branch-deploy"). `NETLIFY_CONTEXT` is NOT a variable
// Netlify sets — an earlier guard that read only NETLIFY_CONTEXT always saw
// "unset" and refused even real production builds (observed 2026-11-06:
// production "build.command" failed with exit code 1 before any step ran).
// `CONTEXT` is authoritative; NETLIFY_CONTEXT is kept only as a fallback for
// local reproductions that export it manually.
const netlifyContext = (process.env.CONTEXT || process.env.NETLIFY_CONTEXT || "").trim();
const previewOptIn = process.env.ALLOW_PREVIEW_MIGRATION === "1";
if (netlifyContext !== "production" && !previewOptIn) {
  fail(
    `refusing to migrate in this context (CONTEXT=${netlifyContext || "unset"}).`
  );
  fail(
    "This runner runs when CONTEXT=production (netlify.toml [context.production]) or, for deploy previews / branch deploys, only when the build command sets ALLOW_PREVIEW_MIGRATION=1."
  );
  process.exit(1);
}

const connectionString = (process.env.DIRECT_DATABASE_URL || "").trim();
if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
  fail("DIRECT_DATABASE_URL is not set to a postgres:// connection string.");
  fail(
    "Refusing to fall back to the pooled DATABASE_URL: migrations must use the direct (non-pooler) endpoint. Set DIRECT_DATABASE_URL and retry."
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

// Remote databases (Neon): the certificate chain and hostname are verified
// against Node's bundled Mozilla CA store (includes ISRG Root X1, which signs
// Neon's certificates). Local ephemeral/test databases do not use TLS.
const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 15_000,
  ssl: isLocal ? false : { rejectUnauthorized: true },
});

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const sqlPath = path.join(MIGRATIONS_DIR, e.name, "migration.sql");
      const sql = fs.readFileSync(sqlPath, "utf8");
      return {
        name: e.name,
        sql,
        checksum: crypto.createHash("sha256").update(sql).digest("hex"),
      };
    });
}

// Best-effort static analysis of the objects a migration would create. The
// transactional guard below remains the authoritative backstop for anything
// this does not model (ALTERs, CREATE TYPE, ...).
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

const LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
)`;

const INSERT_LEDGER = `
INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)`;

function printManualAction() {
  fail("Manual action (deliberate, human-verified — the runner will never guess):");
  fail("  1. Inspect read-only:  DIRECT_DATABASE_URL=... node scripts/db-inspect.mjs");
  fail("  2. Compare its output with the pending SQL in prisma/migrations/.");
  fail("  3. ONLY if every object of a pending migration already exists with the expected shape,");
  fail("     record it WITHOUT executing:  npx prisma migrate resolve --applied <migration_name>");
  fail("     (this writes only to _prisma_migrations; it executes no migration SQL)");
  fail("  4. Rebuild — the runner then applies only genuinely pending migrations.");
}

async function main() {
  const migrations = listMigrations();
  log(`${migrations.length} local migration(s): ${migrations.map((m) => m.name).join(", ")}`);

  await client.connect();
  const who = await client.query("SELECT current_database() AS db, current_user AS usr");
  log(
    `connected to database "${who.rows[0].db}" as role "${who.rows[0].usr}"` +
      (isLocal ? " (local, no TLS)" : " (TLS certificate chain + hostname verified)")
  );

  // ---------------- read-only pre-flight (no writes) ----------------
  const { rows: tables } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  const tableSet = new Set(tables.map((r) => r.table_name));
  const { rows: indexes } = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'");
  const indexSet = new Set(indexes.map((r) => r.indexname));
  log(
    `pre-flight (read-only): public tables (${tables.length}): ${
      tables.map((t) => t.table_name).join(", ") || "(none)"
    }`
  );

  const ledger = await client
    .query(
      "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at"
    )
    .catch((err) => {
      if (err.code === "42P01") return { rows: [] }; // ledger not created yet → nothing recorded
      throw err;
    });
  log(
    `pre-flight (read-only): ledger entries (${ledger.rows.length}): ${
      ledger.rows
        .map((r) => `${r.migration_name}${r.rolled_back_at ? " [rolled back]" : ""}`)
        .join(", ") || "(none)"
    }`
  );

  // Drift detection: an already-recorded migration must match its local file.
  for (const row of ledger.rows.filter((r) => !r.rolled_back_at)) {
    const local = migrations.find((m) => m.name === row.migration_name);
    if (!local) {
      log(
        `note: ledger records "${row.migration_name}" which is not present in this build's migration files (drift check skipped for it)`
      );
      continue;
    }
    if (local.checksum !== row.checksum) {
      fail(
        `recorded migration "${row.migration_name}" does not match its checksum in _prisma_migrations — history has drifted.`
      );
      fail("Refusing to continue: restore the original migration file and investigate the change before migrating.");
      process.exitCode = 1;
      return;
    }
  }

  const applied = new Set(ledger.rows.filter((r) => !r.rolled_back_at).map((r) => r.migration_name));
  const pending = migrations.filter((m) => !applied.has(m.name));
  log(`${pending.length} pending migration(s): ${pending.map((m) => m.name).join(", ") || "(none)"}`);
  if (pending.length === 0) {
    log("nothing to apply");
    return;
  }

  // History must be verifiable: none of the objects a pending migration would
  // create may already exist. A duplicate-object error is NOT proof that a
  // migration was applied — no automatic baselining, ever.
  const conflicts = [];
  for (const m of pending) {
    for (const obj of declaredObjects(m.sql)) {
      if (obj.ifNotExists) continue;
      const exists = obj.kind === "table" ? tableSet.has(obj.name) : indexSet.has(obj.name);
      if (exists) conflicts.push(`${m.name}: ${obj.kind} "${obj.name}" already exists in the database`);
    }
  }
  if (conflicts.length > 0) {
    fail("migration history cannot be verified against this database — refusing to migrate (fail-closed).");
    for (const c of conflicts.slice(0, MAX_LISTED_CONFLICTS)) fail(`  conflict: ${c}`);
    if (conflicts.length > MAX_LISTED_CONFLICTS) fail(`  ... and ${conflicts.length - MAX_LISTED_CONFLICTS} more`);
    fail("This database was likely created outside of migrations (e.g. db push) or is partially migrated.");
    printManualAction();
    process.exitCode = 1;
    return;
  }

  // ---------------- apply (transactional, fail-closed) ----------------
  await client.query(LEDGER_SQL); // additive: creates the ledger only if missing
  for (const m of pending) {
    try {
      await client.query("BEGIN");
      await client.query(m.sql);
      await client.query(INSERT_LEDGER, [crypto.randomUUID(), m.checksum, m.name]);
      await client.query("COMMIT");
      log(`applied  ${m.name}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      fail(
        `applying "${m.name}" failed (pg code ${err.code || "unknown"}); transaction rolled back; nothing was recorded.`
      );
      fail(String(err.message || err).split("\n").slice(0, 5).join("\n"));
      fail("No automatic baselining. Fix the database state, or record the migration deliberately after human verification:");
      fail("  npx prisma migrate resolve --applied <migration_name>   (ledger-only write, executes no SQL)");
      process.exitCode = 1;
      return;
    }
  }
  log("all migrations applied successfully");
}

main()
  .catch((err) => {
    fail(`FATAL: ${String(err.message || err).split("\n")[0]}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await client.end();
    } catch {}
    process.exit(process.exitCode || 0);
  });
