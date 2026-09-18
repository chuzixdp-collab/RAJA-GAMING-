import { db } from "@/lib/db";
import { apiSuccess, withApi, readJson, ApiError, getClientIp } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { creditWallet } from "@/lib/wallet";
import { getSettingInt } from "@/lib/settings";
import { referralActionSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const admin = await requireAdmin();

  const referrals = await db.referral.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    include: {
      referrer: { select: { id: true, email: true, name: true } },
      referred: { select: { id: true, email: true, name: true } },
    },
  });

  const rewardConfigured = await getSettingInt("REFERRAL_REWARD_AMOUNT", 0);

  return apiSuccess({ referrals, rewardConfigured });
});

export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, referralActionSchema);
  const ip = getClientIp(req);

  const referral = await db.referral.findUnique({
    where: { id: input.referralId },
    include: {
      referrer: { select: { id: true, email: true, name: true } },
      referred: { select: { id: true, email: true, name: true } },
    },
  });
  if (!referral) throw new ApiError("Referral not found.", 404);

  if (input.action === "PAY_REWARD") {
    if (referral.status !== "PENDING") {
      throw new ApiError("Only pending referrals can be paid.", 400);
    }
    const amount = await getSettingInt("REFERRAL_REWARD_AMOUNT", 0);
    if (amount <= 0) {
      throw new ApiError(
        "REFERRAL_REWARD_AMOUNT is not configured. Set it in admin settings first.",
        400
      );
    }

    // Financial action: idempotent wallet credit + referral completion in one tx.
    const walletTx = await db.$transaction(async (tx) => {
      const txResult = await creditWallet(tx, {
        userId: referral.referrerId,
        amount,
        reason: "REFERRAL_REWARD",
        description: "Referral reward",
        reference: referral.id,
        idempotencyKey: `ref-${referral.id}`,
      });
      await tx.referral.update({
        where: { id: referral.id },
        data: { status: "COMPLETED", rewardAmount: amount, rewardedAt: new Date() },
      });
      return txResult;
    });

    await notify({
      userId: referral.referrerId,
      type: "REFERRAL",
      title: "Referral reward paid",
      body: `Your referral reward of Rs ${amount.toLocaleString("en-PK")} for inviting ${referral.referred.email} has been credited to your RAJA wallet.`,
      link: "/dashboard/referrals",
    });
    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "REFERRAL_PAY_REWARD",
      entity: "Referral",
      entityId: referral.id,
      metadata: {
        amount,
        referrer: referral.referrer.email,
        referred: referral.referred.email,
        walletTxId: walletTx.id,
      },
      ip,
    });
    return apiSuccess({ paid: true, amount });
  }

  // CANCEL: mark completed with zero reward — no money moves.
  if (referral.status !== "PENDING") {
    throw new ApiError("Only pending referrals can be cancelled.", 400);
  }
  await db.referral.update({
    where: { id: referral.id },
    data: { status: "COMPLETED", rewardAmount: 0, rewardedAt: new Date() },
  });
  await notify({
    userId: referral.referrerId,
    type: "REFERRAL",
    title: "Referral cancelled",
    body: `The referral reward for inviting ${referral.referred.email} was cancelled by staff and no reward will be paid.`,
    link: "/dashboard/referrals",
  });
  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "REFERRAL_CANCEL",
    entity: "Referral",
    entityId: referral.id,
    metadata: { referrer: referral.referrer.email, referred: referral.referred.email },
    ip,
  });
  return apiSuccess({ cancelled: true });
});
