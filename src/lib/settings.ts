/**
 * Site settings stored in the database (admin-editable), cached in memory.
 */
import { db } from "@/lib/db";

export const SETTING_KEYS = [
  "SITE_NAME",
  "SITE_TAGLINE",
  "SITE_DESCRIPTION",
  "CONTACT_EMAIL",
  "CONTACT_PHONE",
  "CONTACT_WHATSAPP",
  "CONTACT_ADDRESS",
  "PAYMENTS_ENABLED",
  "PAYMENT_METHOD_NAME",
  "EASYPAISA_ACCOUNT_TITLE",
  "EASYPAISA_ACCOUNT_NUMBER",
  "EASYPAISA_INSTRUCTIONS",
  "MIN_PAYMENT_AMOUNT",
  "MARKETPLACE_ENABLED",
  "MARKETPLACE_SELLING_ENABLED",
  "TOURNAMENTS_ENABLED",
  "REGISTRATION_PAYMENT_NOTE",
  "REFERRAL_REWARD_AMOUNT",
  "REVIEWS_AUTO_APPROVE",
  "MAINTENANCE_MODE",
  "MAINTENANCE_MESSAGE",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Keys safe to expose to anonymous visitors. */
export const PUBLIC_SETTING_KEYS: SettingKey[] = [
  "SITE_NAME",
  "SITE_TAGLINE",
  "SITE_DESCRIPTION",
  "CONTACT_EMAIL",
  "CONTACT_PHONE",
  "CONTACT_WHATSAPP",
  "CONTACT_ADDRESS",
  "PAYMENTS_ENABLED",
  "PAYMENT_METHOD_NAME",
  "EASYPAISA_ACCOUNT_TITLE",
  "EASYPAISA_ACCOUNT_NUMBER",
  "EASYPAISA_INSTRUCTIONS",
  "MARKETPLACE_ENABLED",
  "TOURNAMENTS_ENABLED",
  "REGISTRATION_PAYMENT_NOTE",
];

type CacheEntry = { values: Record<string, string>; expiresAt: number };
const globalCache = globalThis as unknown as { __rajaSettings?: CacheEntry };
const TTL_MS = 30_000;

export async function getSettings(): Promise<Record<string, string>> {
  const cached = globalCache.__rajaSettings;
  if (cached && cached.expiresAt > Date.now()) return cached.values;
  const rows = await db.siteSetting.findMany();
  const values: Record<string, string> = {};
  for (const row of rows) values[row.key] = row.value;
  globalCache.__rajaSettings = { values, expiresAt: Date.now() + TTL_MS };
  return values;
}

export async function getSetting(key: SettingKey, fallback = ""): Promise<string> {
  const all = await getSettings();
  return all[key] ?? fallback;
}

export async function getSettingBool(key: SettingKey, fallback = false): Promise<boolean> {
  const v = await getSetting(key);
  if (v === "") return fallback;
  return v === "true" || v === "1";
}

export async function getSettingInt(key: SettingKey, fallback = 0): Promise<number> {
  const v = await getSetting(key);
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function setSettings(entries: Record<string, string>): Promise<void> {
  const keys = Object.keys(entries).filter((k): k is SettingKey =>
    (SETTING_KEYS as readonly string[]).includes(k)
  );
  for (const key of keys) {
    await db.siteSetting.upsert({
      where: { key },
      update: { value: entries[key] },
      create: { key, value: entries[key] },
    });
  }
  globalCache.__rajaSettings = undefined;
}
