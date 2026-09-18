import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import {
  createSession,
  generateReferralCode,
  hashPassword,
  sanitizeUser,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApi(async (req: Request) => {
  const ip = getClientIp(req);
  await assertRateLimit(`register:${ip}`, 5, 60_000);

  const input = await readJson(req, registerSchema);

  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    throw new ApiError("An account with this email already exists.", 409);
  }

  // Referral (optional): resolve the referrer by code, case-insensitive (stored uppercased).
  let referrerId: string | null = null;
  const code = input.referralCode?.trim().toUpperCase() ?? "";
  if (code) {
    const referrer = await db.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (referrer) referrerId = referrer.id;
    // Unknown/invalid codes are ignored — never block signups over them.
  }

  const passwordHash = await hashPassword(input.password);
  const referralCode = await generateReferralCode();

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        referralCode,
        referredById: referrerId,
        wallet: { create: {} },
      },
    });
    if (referrerId && referrerId !== created.id) {
      await tx.referral.create({
        data: { referrerId, referredId: created.id, status: "PENDING" },
      });
    }
    return created;
  });

  await createSession(user);
  await notify({
    userId: user.id,
    type: "SYSTEM",
    title: "Welcome to RAJA GAMING",
    body: "Your account is ready. Explore diamond top-ups, tournaments and the verified ID marketplace. Good luck, have fun.",
    link: "/dashboard",
  });
  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "AUTH_REGISTER",
    entity: "User",
    entityId: user.id,
    metadata: { referred: !!referrerId },
    ip,
  });

  return apiSuccess({ user: sanitizeUser(user) });
});
