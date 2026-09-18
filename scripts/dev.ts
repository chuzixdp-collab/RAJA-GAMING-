/**
 * Dev server launcher: loads .env explicitly (overriding any inherited env),
 * then starts `next dev`. This keeps local runs immune to stale DATABASE_URL
 * style vars exported by the surrounding environment.
 */
import { readFileSync } from "fs";
import { spawn } from "child_process";
import { join } from "path";

function loadEnvFile(file: string) {
  try {
    const raw = readFileSync(join(process.cwd(), file), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // no .env — fine
  }
}

loadEnvFile(".env");

const isWin = process.platform === "win32";
const npxCmd = isWin ? "next.cmd" : "next";

const child = spawn(
  process.execPath,
  [join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", "-p", "3000"],
  {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
