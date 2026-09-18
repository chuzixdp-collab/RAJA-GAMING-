/**
 * Wallet operations — MUST run inside a prisma.$transaction.
 * All balance changes are atomic; duplicate financial operations are blocked
 * with unique idempotency keys.
 */
import type { Prisma, TxReason, TxType } from "@prisma/client";
import { ApiError } from "@/lib/api";

type Tx = Prisma.TransactionClient;

type WalletOp = {
  userId: string;
  amount: number; // positive integer (PKR)
  reason: TxReason;
  description: string;
  reference?: string;
  idempotencyKey?: string;
};

export async function getOrCreateWallet(tx: Tx, userId: string) {
  let wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await tx.wallet.create({ data: { userId } });
  }
  return wallet;
}

/** Credit a wallet. Idempotent when idempotencyKey is provided. */
export async function creditWallet(tx: Tx, op: WalletOp) {
  if (!Number.isInteger(op.amount) || op.amount <= 0) {
    throw new ApiError("Invalid wallet amount.", 400);
  }
  if (op.idempotencyKey) {
    const existing = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: op.idempotencyKey },
    });
    if (existing) return existing; // already applied — skip silently
  }
  const wallet = await getOrCreateWallet(tx, op.userId);
  const updated = await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: op.amount } },
  });
  return tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      userId: op.userId,
      type: "CREDIT" as TxType,
      amount: op.amount,
      balanceAfter: updated.balance,
      reason: op.reason,
      description: op.description,
      reference: op.reference,
      idempotencyKey: op.idempotencyKey,
    },
  });
}

/** Debit a wallet — atomically guarded against negative balance. */
export async function debitWallet(tx: Tx, op: WalletOp) {
  if (!Number.isInteger(op.amount) || op.amount <= 0) {
    throw new ApiError("Invalid wallet amount.", 400);
  }
  if (op.idempotencyKey) {
    const existing = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: op.idempotencyKey },
    });
    if (existing) return existing;
  }
  const wallet = await getOrCreateWallet(tx, op.userId);
  const updated = await tx.wallet.updateMany({
    where: { id: wallet.id, balance: { gte: op.amount } },
    data: { balance: { decrement: op.amount } },
  });
  if (updated.count === 0) {
    throw new ApiError("Insufficient wallet balance.", 400);
  }
  const fresh = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  return tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      userId: op.userId,
      type: "DEBIT" as TxType,
      amount: op.amount,
      balanceAfter: fresh.balance,
      reason: op.reason,
      description: op.description,
      reference: op.reference,
      idempotencyKey: op.idempotencyKey,
    },
  });
}
