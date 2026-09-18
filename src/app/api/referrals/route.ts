import { apiSuccess, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** My referral code, referred users and total rewards earned. */
export const GET = withApi(async () => {
  const user = await requireUser();

  const [referrals, totals] = await Promise.all([
    db.referral.findMany({
      where: { referrerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        rewardAmount: true,
        rewardedAt: true,
        createdAt: true,
        referred: { select: { name: true, email: true, createdAt: true } },
      },
    }),
    db.referral.aggregate({
      where: { referrerId: user.id, status: "COMPLETED" },
      _sum: { rewardAmount: true },
    }),
  ]);

  return apiSuccess({
    referralCode: user.referralCode,
    referrals,
    totalEarned: totals._sum.rewardAmount ?? 0,
  });
});
