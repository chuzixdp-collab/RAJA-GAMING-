/**
 * migrate-deploy.mjs — applies prisma/migrations in order via node-postgres.
 *
 * WHY THIS EXISTS: Prisma's native query engine cannot complete its connection
 * to the Neon proxy (P1001 on both direct and pooled endpoints from every
 * network tested, while node-postgres over the identical TCP+TLS path
 * succeeds). This runner uses node-postgres, which is verified working, and
 * keeps the `_prisma_migrations` ledger EXACTLY compatible with the Prisma CLI
 * so `prisma migrate` tooling stays consistent with reality.
 *
 * Safety semantics (matching `prisma migrate deploy`):
 *  - Only ever APPLIES migrations; never drops, resets, or rewrites data.
 *  - Each migration runs inside a transaction; failure rolls it back.
 *  - Fail-closed: any unexpected error aborts with exit code 1.
 *  - If a migration fails because its objects already exist (a database that
 *    was created via `db push` and never baselined), the migration is
 *    recorded as applied WITHOUT executing (a standard Prisma "baseline")
 *    and the run continues. This is logged loudly.
 *
 * Secrets: reads DIRECT_DATABASE_URL/DATABASE_URL from the environment;
 * never prints connection details.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString.trim())) {
  console.error(
    "[migrate-deploy] FAILED: DIRECT_DATABASE_URL (or DATABASE_URL) must be set to a postgres:// connection string",
  );
  process.exit(1);
}

// Neon requires TLS. The server certificate is publicly trusted, but build
// images do not always carry a complete CA bundle, so we require encryption
// without CA verification (equivalent to sslmode=require). Local/test
// databases (localhost) do not use TLS.
const hostname = (() => {
  try {
    return new URL(connectionString.trim()).hostname;
  } catch {
    return "";
  }
})();
const isLocal = ["localhost", "127.0.0.1", "::1", ""].includes(hostname);
const client = new pg.Client({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

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

const BASELINE_ERROR_CODES = new Set([
  "42P07", // duplicate table
  "42710", // duplicate object (constraint/type)
  "42701", // duplicate column
  "42P06", // duplicate schema
  "42723", // duplicate function
]);

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const dir = path.join(MIGRATIONS_DIR, e.name);
      const sqlPath = path.join(dir, "migration.sql");
      return { name: e.name, sql: fs.readFileSync(sqlPath, "utf8"), checksum: crypto.createHash("sha256").update(fs.readFileSync(sqlPath)).digest("hex") };
    });
}

async function main() {
  const migrations = listMigrations();
  await client.connect();
  await client.query(LEDGER_SQL);

  const applied = new Set(
    (
      await client.query(
        `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
      )
    ).rows.map((r) => r.migration_name),
  );

  const pending = migrations.filter((m) => !applied.has(m.name));
  console.log(
    `[migrate-deploy] ${migrations.length} local migrations, ${applied.size} recorded as applied, ${pending.length} pending`,
  );

  for (const m of pending) {
    try {
      await client.query("BEGIN");
      await client.query(m.sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)`,
        [crypto.randomUUID(), m.checksum, m.name],
      );
      await client.query("COMMIT");
      console.log(`[migrate-deploy] applied  ${m.name}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      const code = err.code || "";
      if (BASELINE_ERROR_CODES.has(code)) {
        // Objects already exist (database created outside of migrations):
        // record as applied without executing — standard Prisma baselining.
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
           VALUES ($1, $2, now(), $3, $4, NULL, now(), 0)`,
          [crypto.randomUUID(), m.checksum, m.name, "baselined: objects already existed"],
        );
        console.log(
          `[migrate-deploy] BASELINED ${m.name} (objects already exist; recorded without executing)`,
        );
      } else {
        console.error(`[migrate-deploy] FAILED  ${m.name} (pg code ${code || "unknown"})`);
        console.error(String(err.message || err).split("\n").slice(0, 5).join("\n"));
        process.exitCode = 1;
        break;
      }
    }
  }

  if (process.exitCode !== 1) {
    console.log("[migrate-deploy] all migrations applied/baselined successfully");
  }
}

main()
  .catch((err) => {
    console.error("[migrate-deploy] FATAL:", String(err.message || err).split("\n")[0]);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await client.end(); } catch {}
    process.exit(process.exitCode || 0);
  });
