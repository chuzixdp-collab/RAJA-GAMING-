/**
 * Edge-safe JWT session helpers (used by middleware and server code).
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "raja_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  tv: number; // tokenVersion — bump to invalidate sessions
};

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (min 16 chars).");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("raja-gaming")
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: "raja-gaming" });
    if (!payload.sub || typeof payload.role !== "string") return null;
    return {
      sub: payload.sub as string,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: payload.role === "ADMIN" ? "ADMIN" : "USER",
      tv: Number(payload.tv ?? 0),
    };
  } catch {
    return null;
  }
}
