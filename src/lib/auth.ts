/**
 * Server-side authentication: password hashing, session cookies, guards.
 * (Edge middleware uses src/lib/jwt.ts instead — bcrypt/db are node-only.)
 */
import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySessionToken } from "@/lib/jwt";

export type SafeUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: "USER" | "ADMIN";
  banned: boolean;
  referralCode: string;
  referredById: string | null;
  createdAt: Date;
};

export function sanitizeUser(user: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  banned: boolean;
  referralCode: string;
  referredById: string | null;
  createdAt: Date;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    banned: user.banned,
    referralCode: user.referralCode,
    referredById: user.referredById,
    createdAt: user.createdAt,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  tokenVersion: number;
}): Promise<void> {
  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    tv: user.tokenVersion,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0, path: "/" });
}

export async function getSessionUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const user = await db.user.findUnique({ where: { id: payload.sub } });
  if (!user) return null;
  if (user.banned) return null;
  // invalidate sessions issued before a tokenVersion bump (password change etc.)
  if (user.tokenVersion !== payload.tv) return null;
  return sanitizeUser(user);
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  try {
    return await getSessionUser();
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("You must be signed in to do that.", 401);
  return user;
}

export async function requireAdmin(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("You must be signed in to do that.", 401);
  if (user.role !== "ADMIN") throw new ApiError("Administrator access required.", 403);
  return user;
}

/** Short, human-friendly referral code (unique). */
export async function generateReferralCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = `RG${randomBytes(3).toString("hex").toUpperCase()}`;
    const exists = await db.user.findUnique({ where: { referralCode: code } });
    if (!exists) return code;
  }
  return `RG${Date.now().toString(36).toUpperCase()}`;
}
