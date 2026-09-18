import { apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireUser, sanitizeUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { profileUpdateSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current session user profile. */
export const GET = withApi(async () => {
  const user = await requireUser();
  return apiSuccess({ user: sanitizeUser(user) });
});

/** Update profile (name, phone). */
export const PATCH = withApi(async (req: Request) => {
  const user = await requireUser();
  const input = await readJson(req, profileUpdateSchema);

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      name: input.name,
      phone: input.phone === undefined ? undefined : input.phone === "" ? null : input.phone,
    },
  });

  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "PROFILE_UPDATE",
    entity: "User",
    entityId: user.id,
    metadata: { name: updated.name },
    ip: getClientIp(req),
  });

  return apiSuccess({ user: sanitizeUser(updated) });
});
