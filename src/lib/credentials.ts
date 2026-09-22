/**
 * Marketplace credential reveal — server-side only.
 * Decrypts the stored listing credentials and returns ONLY whitelisted fields.
 * Every reveal must be audit-logged by the calling route.
 */
import "server-only";
import { decryptJSON } from "@/lib/crypto";

export type ListingCredentials = {
  accountEmail: string | null;
  accountPassword: string | null;
  recoveryEmail: string | null;
  recoveryPassword: string | null;
  extra: string | null;
};

const CREDENTIAL_KEYS = [
  "accountEmail",
  "accountPassword",
  "recoveryEmail",
  "recoveryPassword",
  "extra",
] as const;

/** Empty / missing / unknown fields are dropped so the UI can hide them. */
export function revealCredentials(encrypted: string): ListingCredentials {
  const raw = decryptJSON<Record<string, unknown>>(encrypted);
  const out: ListingCredentials = {
    accountEmail: null,
    accountPassword: null,
    recoveryEmail: null,
    recoveryPassword: null,
    extra: null,
  };
  for (const key of CREDENTIAL_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) {
      out[key] = value;
    }
  }
  return out;
}
