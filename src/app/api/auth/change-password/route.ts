import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { createSession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApi(async (req: Request) => {
  const user = await requireUser();
  const ip = getClientIp(req);
  await assertRateLimit(`change-password:${user.id}`, 5, 60_000);

  const input = await readJson(req, changePasswordSchema);

  // requireUser() returns the sanitized user — fetch the full record for the hash.
  const full = await db.user.findUnique({ where: { id: user.id } });
  if (!full) throw new ApiError("Account not found.", 404);

  const valid = await verifyPassword(input.currentPassword, full.passwordHash);
  if (!valid) throw new ApiError("Current password is incorrect.", 400);

  const passwordHash = await hashPassword(input.newPassword);
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  // Re-issue the session for the new tokenVersion so the current device stays signed in.
  await createSession(updated);

  await notify({
    userId: user.id,
    type: "ADMIN",
    title: "Password changed",
    body: "Your password was changed successfully. All other sessions were signed out. If this wasn't you, contact support immediately.",
  });
  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "AUTH_CHANGE_PASSWORD",
    entity: "User",
    entityId: user.id,
    ip,
  });

  return apiSuccess({ changed: true });
});
