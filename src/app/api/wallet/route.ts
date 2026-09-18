import { apiSuccess, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Wallet balance, recent transactions and my withdrawal requests. */
export const GET = withApi(async () => {
  const user = await requireUser();

  const wallet = await db.wallet.findUnique({
    where: { userId: user.id },
    select: { balance: true },
  });

  const [transactions, withdrawals] = await Promise.all([
    db.walletTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        reason: true,
        description: true,
        createdAt: true,
      },
    }),
    db.withdrawal.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amount: true,
        accountName: true,
        accountNumber: true,
        method: true,
        status: true,
        adminNotes: true,
        processedAt: true,
        createdAt: true,
      },
    }),
  ]);

  return apiSuccess({
    wallet: { balance: wallet?.balance ?? 0 },
    transactions,
    withdrawals,
  });
});
