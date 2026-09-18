import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";
import { resetPasswordSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApi(async (req: Request) => {
  const ip = getClientIp(req);
  await assertRateLimit(`reset:${ip}`, 5, 60_000);

  const input = await readJson(req, resetPasswordSchema);

  const record = await db.passwordReset.findUnique({ where: { token: input.token } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new ApiError("Invalid or expired reset link.", 400);
  }

  const passwordHash = await hashPassword(input.password);

  await db.$transaction([
    // Consume the token.
    db.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Rotate the password and bump tokenVersion — invalidates every old session.
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    // Any other unused links for this user are now dead.
    db.passwordReset.deleteMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
    }),
  ]);

  await notify({
    userId: record.userId,
    type: "ADMIN",
    title: "Password reset successful",
    body: "Your password was reset successfully. If you did not do this, contact support immediately.",
  });
  await logAudit({
    actorId: record.userId,
    action: "AUTH_RESET",
    entity: "User",
    entityId: record.userId,
    ip,
  });

  return apiSuccess({ reset: true });
});
