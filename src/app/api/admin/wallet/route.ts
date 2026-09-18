import { randomUUID } from "crypto";
import type { TxReason, TxType } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { walletAdjustSchema } from "@/lib/validations";
import { creditWallet, debitWallet } from "@/lib/wallet";
import { notify } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { formatRs } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TX_TYPES = ["CREDIT", "DEBIT"] as const;
const TX_REASONS = [
  "TOURNAMENT_PRIZE",
  "REFERRAL_REWARD",
  "SELLER_PAYOUT",
  "REFUND",
  "WITHDRAWAL",
  "ADMIN_ADJUSTMENT",
] as const;

/** GET /api/admin/wallet?type=&reason= — recent transactions + withdrawals. */
export const GET = withApi(async (req: Request) => {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type")?.trim();
  const reason = searchParams.get("reason")?.trim();

  const where: { type?: TxType; reason?: TxReason } = {};
  if (type) {
    if (!(TX_TYPES as readonly string[]).includes(type)) throw new ApiError("Invalid type filter.", 400);
    where.type = type as TxType;
  }
  if (reason) {
    if (!(TX_REASONS as readonly string[]).includes(reason)) throw new ApiError("Invalid reason filter.", 400);
    where.reason = reason as TxReason;
  }

  const [transactions, withdrawals] = await Promise.all([
    db.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    db.withdrawal.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
  ]);

  // WalletTransaction has no relation to User — resolve emails separately.
  const userIds = [...new Set(transactions.map((t) => t.userId))];
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });
  const usersById = new Map(users.map((u) => [u.id, u]));

  return apiSuccess({
    transactions: transactions.map((t) => ({
      ...t,
      user: usersById.get(t.userId) ?? null,
    })),
    withdrawals,
  });
});

/** POST /api/admin/wallet — manual balance adjustment (credit or debit). */
export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, walletAdjustSchema);

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, name: true },
  });
  if (!target) throw new ApiError("User not found.", 404);

  const amount = Math.abs(input.amount);
  const isCredit = input.amount > 0;
  const idempotencyKey = `adj-${randomUUID()}`;

  await db.$transaction(async (tx) => {
    const op = {
      userId: target.id,
      amount,
      reason: "ADMIN_ADJUSTMENT" as const,
      description: input.description,
      idempotencyKey,
    };
    if (isCredit) {
      await creditWallet(tx, op);
    } else {
      await debitWallet(tx, op); // throws 400 when balance is insufficient
    }
  });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: isCredit ? "WALLET_CREDIT" : "WALLET_DEBIT",
    entity: "Wallet",
    entityId: target.id,
    metadata: { targetEmail: target.email, amount: isCredit ? amount : -amount, description: input.description },
    ip: getClientIp(req),
  });

  try {
    await notify({
      userId: target.id,
      type: "WALLET",
      title: isCredit ? "Wallet credited" : "Wallet debited",
      body: `${formatRs(amount)} was ${isCredit ? "added to" : "deducted from"} your wallet by an administrator. Reason: ${input.description}`,
      link: "/dashboard/wallet",
    });
  } catch (e) {
    console.error("[admin/wallet] failed to notify user:", e);
  }

  return apiSuccess({ userId: target.id, amount: isCredit ? amount : -amount });
});
