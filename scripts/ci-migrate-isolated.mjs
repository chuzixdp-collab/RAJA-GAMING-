/**
 * CI helper: verify `prisma migrate deploy` against an EPHEMERAL Postgres
 * that is created and destroyed inside the build container.
 *
 * Safety properties:
 *  - The target database is 127.0.0.1 only. No environment-configured
 *    database (production included) is ever read or written by this script.
 *  - Prints only non-secret information: a localhost URL and prisma output.
 *  - Exits with prisma's exit code, so a failed migration fails the build.
 *
 * Used by Netlify deploy previews / branch deploys so migrations are always
 * verified on an isolated database before they are ever allowed to run
 * against production.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = 54329;
const DATA_DIR = path.join(process.cwd(), ".pgdata-ci");
const DB = "ci_migrate";
const USER = "ci_user";
const PASSWORD = "ci_only_local_throwaway";
const ISOLATED_URL = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB}`;

async function main() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: false,
  });

  let exitCode = 1;
  try {
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(DB);
    console.log(
      `[ci-migrate-isolated] ephemeral postgres ready at 127.0.0.1:${PORT}/${DB} — isolated from all external databases`,
    );

    const res = spawnSync(
      path.join("node_modules", ".bin", "prisma"),
      ["migrate", "deploy"],
      {
        stdio: "inherit",
        // Prisma 6 no longer accepts `--url` on migrate commands; the URL is
        // taken from the env vars referenced by schema.prisma, which defines
        // BOTH `url` (DATABASE_URL) and `directUrl` (DIRECT_DATABASE_URL) —
        // migrate commands prefer `directUrl`. We override BOTH for this
        // child process only, pointing at the isolated ephemeral database.
        // The parent build environment (and any environment-configured
        // database) is never touched.
        env: {
          ...process.env,
          DATABASE_URL: ISOLATED_URL,
          DIRECT_DATABASE_URL: ISOLATED_URL,
        },
      },
    );
    exitCode = res.status ?? 1;
    console.log(`[ci-migrate-isolated] prisma migrate deploy exit code: ${exitCode}`);
  } finally {
    try {
      await pg.stop();
    } catch {
      // already stopped
    }
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(
    "[ci-migrate-isolated] FAILED:",
    err && err.message ? err.message : err,
  );
  process.exit(1);
});
