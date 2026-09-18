/**
 * AES-256-GCM encryption for temporary sensitive marketplace data.
 * Key: RAJA_GAMING_ENCRYPTION_KEY (64 hex chars = 32 bytes). Server-side only.
 * Never log plaintext. Delete decrypted data as soon as possible.
 */
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ApiError } from "@/lib/api";

function getKey(): Buffer {
  const raw = process.env.RAJA_GAMING_ENCRYPTION_KEY;
  if (!raw) {
    throw new ApiError("Encrypted storage is not configured on this server.", 500);
  }
  // Accept 64-char hex, else derive deterministically from the provided secret
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw).digest();
}

export function encryptionAvailable(): boolean {
  return Boolean(process.env.RAJA_GAMING_ENCRYPTION_KEY);
}

export function encryptJSON(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptJSON<T>(payload: string): T {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 28) throw new ApiError("Corrupted encrypted payload.", 500);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
