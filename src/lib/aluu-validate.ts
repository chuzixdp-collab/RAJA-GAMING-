/**
 * ALUU Name Check — player ID validation for games that support it.
 * SERVER-ONLY. Implements EXACTLY the documented endpoint:
 *
 *   GET /api/check/game-check?code=<gameCode>&characterId=<playerId>
 *                       [&server_code=<zone>][&charname=<name>][&denom=<pack>]
 *   Header: x-api-key (per the docs' curl/Node examples; this endpoint does
 *   not use the request-signing scheme of /api/v.1).
 *
 * Documented response behavior (important):
 *   - UNKNOWN PLAYERS STILL ANSWER HTTP 200: { "valid": "invalid", ... }.
 *     A found player answers 200 with valid:"valid" plus name/nickname/
 *     username (field set varies by game) or success:true + username.
 *   - 403 with codes like NAME_CHECK_NOT_INCLUDED / FREE_DAILY_LIMIT_REACHED
 *     and IP-whitelist refusals; 429 RATE_LIMITED (50 req/min for
 *     game-check). All of these are surfaced as `note`, never as a fake
 *     "player not found".
 *
 * SECURITY: the API key is read from the environment (ALU_API_KEY /
 * ALUU_API_KEY), never returned, logged, or embedded in errors. Failures are
 * reported as stable reason codes.
 *
 * LIMITATION (documented honestly): ALUU's Name Check refuses requests from
 * IPs that are not whitelisted on the ALUU account. Serverless platforms
 * (Netlify) use changing egress IPs — if the account has a strict IP
 * whitelist, validation will fail with an IP_WHITELIST note even though the
 * rest of the API works. Order placement is NOT affected (the /api/v.1 API
 * supports signature-based "no static IP" auth).
 */
import { ALUU_DEFAULT_BASE_URL } from "@/lib/aluu";

const GAME_CHECK_PATH = "/api/check/game-check";

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

export type AluuGameCheckInput = {
  /** Game code exactly as listed by the ALUU catalog (e.g. freefire_global). */
  code: string;
  /** Player ID (Free Fire UID). */
  characterId: string;
  /** Server / zone ID — only for games that list one. */
  serverCode?: string;
  /** Character name — only for games that list one. */
  charname?: string;
  /** Pack (denom) — only for games that validate per pack. */
  denom?: string;
};

export type AluuGameCheckResult = {
  /** true only when the supplier confirmed the player exists. */
  found: boolean;
  /** Player nickname when found (best field per the docs' fallback order). */
  name: string | null;
  region: string | null;
  /** "valid" | "invalid" | "error" — the supplier's own verdict class. */
  verdict: "valid" | "invalid" | "error";
  /** Human-readable warning for soft failures (quota, plan, IP, rate limit). */
  note: string | null;
};

/**
 * Pure response normalizer (unit-tested). Implements the docs' detection rule:
 * `found = data.success === true || data.valid === "valid"`.
 */
export function parseGameCheckResponse(payload: unknown): AluuGameCheckResult {
  const p = (payload ?? {}) as {
    success?: unknown;
    valid?: unknown;
    username?: unknown;
    name?: unknown;
    nickname?: unknown;
    fullname?: unknown;
    uid?: unknown;
    characterId?: unknown;
    region?: unknown;
    zone?: unknown;
    message?: unknown;
    code?: unknown;
  };

  const validFlag = typeof p.valid === "string" ? p.valid.trim().toLowerCase() : null;
  const successFlag = p.success === true;

  if (validFlag === "invalid" && !successFlag) {
    return { found: false, name: null, region: null, verdict: "invalid", note: null };
  }

  if (successFlag || validFlag === "valid") {
    const name =
      [p.username, p.name, p.nickname, p.fullname].find(
        (v): v is string => typeof v === "string" && v.trim() !== "" && v.trim().toLowerCase() !== "na"
      ) ?? null;
    const region = typeof p.region === "string" && p.region.trim() ? p.region : typeof p.zone === "string" && p.zone.trim() ? p.zone : null;
    return { found: true, name, region, verdict: "valid", note: null };
  }

  // Any other shape: an error envelope (success:false + message) or junk.
  const message = typeof p.message === "string" ? p.message : null;
  const code = typeof p.code === "string" ? p.code : null;
  return {
    found: false,
    name: null,
    region: null,
    verdict: "error",
    note: message ? (code ? `${message} (${code})` : message) : "Unrecognized ALUU name-check response.",
  };
}

/** HTTP status → note for the soft-failure cases documented for Name Check. */
export function gameCheckHttpNote(httpStatus: number, payload: unknown): string | null {
  const info = (payload ?? {}) as { message?: unknown; code?: unknown };
  const message = typeof info.message === "string" ? info.message : null;
  const code = typeof info.code === "string" ? info.code : null;
  if (httpStatus === 403) {
    if (typeof code === "string" && code.includes("IP")) return "ALUU refused the request — the server IP is not whitelisted for Name Check on the ALUU account.";
    if (typeof code === "string" && code.includes("LIMIT")) return `ALUU name-check quota reached${message ? `: ${message}` : ""}.`;
    if (typeof code === "string" && code.includes("NOT_INCLUDED")) return "The ALUU plan does not include Name Check.";
    return message ? `ALUU refused the name check: ${message}` : "ALUU refused the name check (403).";
  }
  if (httpStatus === 429) return "ALUU name-check rate limit hit (50 requests/minute). Try again shortly.";
  if (httpStatus === 401 || httpStatus === 400) return message ?? "ALUU rejected the name-check credentials/request.";
  return message ?? `ALUU name check failed (HTTP ${httpStatus}).`;
}

/** Validate a player ID against the live ALUU Name Check API. */
export async function aluuGameCheck(
  input: AluuGameCheckInput
): Promise<AluuGameCheckResult | { error: string }> {
  const apiKey = readEnv("ALU_API_KEY", "ALUU_API_KEY");
  if (!apiKey) {
    return { error: "ALUU is not configured — set the ALU_API_KEY environment variable." };
  }

  const params = new URLSearchParams();
  params.set("code", input.code);
  params.set("characterId", input.characterId);
  if (input.serverCode && input.serverCode.trim()) params.set("server_code", input.serverCode.trim());
  if (input.charname && input.charname.trim()) params.set("charname", input.charname.trim());
  if (input.denom && input.denom.trim()) params.set("denom", input.denom.trim());
  const pathWithQuery = `${GAME_CHECK_PATH}?${params.toString()}`;

  const baseUrl = (readEnv("ALUU_BASE_URL") || ALUU_DEFAULT_BASE_URL).replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${pathWithQuery}`, {
      method: "GET",
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { error: "Could not reach the ALUU name-check API." };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return { error: `ALUU name check returned a non-JSON response (HTTP ${response.status}).` };
  }

  if (!response.ok) {
    return { error: gameCheckHttpNote(response.status, payload) ?? "ALUU name check failed." };
  }

  const result = parseGameCheckResponse(payload);
  if (result.verdict === "error") return { error: result.note ?? "ALUU name check failed." };
  return result;
}
