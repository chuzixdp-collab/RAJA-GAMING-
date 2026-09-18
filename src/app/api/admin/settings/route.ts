import { apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { settingsUpdateSchema } from "@/lib/validations";
import { getSettings, setSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/settings — all site settings as a key/value map. */
export const GET = withApi(async () => {
  await requireAdmin();

  const settings = await getSettings();
  return apiSuccess({ settings });
});

/** PUT /api/admin/settings — replace the provided keys. */
export const PUT = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, settingsUpdateSchema);

  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) entries[key] = value;
  }

  await setSettings(entries);
  const updated = await getSettings();

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "SETTINGS_UPDATE",
    entity: "SiteSetting",
    metadata: { changedKeys: Object.keys(entries) },
    ip: getClientIp(req),
  });

  return apiSuccess({ settings: updated });
});
