import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { createSession, sanitizeUser, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApi(async (req: Request) => {
  const ip = getClientIp(req);
  await assertRateLimit(`login:${ip}`, 8, 60_000);

  const input = await readJson(req, loginSchema);

  const user = await db.user.findUnique({ where: { email: input.email } });

  // Generic invalid-credentials error for unknown emails AND wrong passwords
  // (never reveal which one failed). Verified before the banned check so ban
  // status is only disclosed to someone who knows the password.
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !valid) {
    throw new ApiError("Invalid email or password.", 401);
  }

  if (user.banned) {
    throw new ApiError(
      user.banReason
        ? `Your account has been banned. Reason: ${user.banReason}`
        : "Your account has been banned.",
      403
    );
  }

  await createSession(user);
  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "AUTH_LOGIN",
    entity: "User",
    entityId: user.id,
    ip,
  });

  return apiSuccess({ user: sanitizeUser(user) });
});
