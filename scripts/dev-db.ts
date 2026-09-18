/**
 * Local development PostgreSQL (embedded, DEV ONLY).
 * Production uses Neon PostgreSQL via DATABASE_URL — this script must never
 * run in production (guarded by USE_EMBEDDED_PG=1 in local .env).
 *
 * Idempotent: exits immediately if the database is already reachable.
 *
 * Usage: bun scripts/dev-db.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "fs";
import { join } from "path";
import net from "net";

const DATA_DIR = join(process.cwd(), "db", "pgdata");
const PORT = 5432;
const USER = "raja";
const PASSWORD = "raja_local_pw";
const DB_NAME = "raja_gaming";

function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function main() {
  if (await isPortOpen(PORT)) {
    console.log("[dev-db] postgres already running");
    return;
  }

  const initialized = existsSync(join(DATA_DIR, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });

  if (!initialized) {
    console.log("[dev-db] initializing postgres cluster...");
    await pg.initialise();
    console.log("[dev-db] starting postgres...");
    await pg.start();
    try {
      await pg.createDatabase(DB_NAME);
      console.log(`[dev-db] created database ${DB_NAME}`);
    } catch {
      console.log(`[dev-db] database ${DB_NAME} already exists`);
    }
  } else {
    console.log("[dev-db] cluster already initialized, starting postgres...");
    await pg.start();
  }

  console.log(`[dev-db] postgres ready on port ${PORT} (db: ${DB_NAME})`);

  // keep this process alive so the postgres child stays attached
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error("[dev-db] fatal:", err);
  process.exit(1);
});
