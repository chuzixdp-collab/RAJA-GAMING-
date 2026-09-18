import { apiSuccess, withApi } from "@/lib/api";
import { getSettings, PUBLIC_SETTING_KEYS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/settings — public site settings only (never exposes admin-only keys). */
export const GET = withApi(async () => {
  const all = await getSettings();
  const out: Record<string, string> = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    if (all[key] !== undefined) out[key] = all[key];
  }
  return apiSuccess(out);
});
