import { db } from "@/lib/db";
import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { withdrawalActionSchema } from "@/lib/validations";
import { creditWallet } from "@/lib/wallet";
import { notify } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { formatRs } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/withdrawals — approve, mark paid, or reject (with refund).
 * The user's wallet was already debited when the withdrawal was requested,
 * so rejecting credits the money back.
 */
export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, withdrawalActionSchema);
  const note = input.note?.trim() || undefined;

  const withdrawal = await db.withdrawal.findUnique({
    where: { id: input.withdrawalId },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!withdrawal) throw new ApiError("Withdrawal not found.", 404);

  const ip = getClientIp(req);

  if (input.action === "APPROVE") {
    if (withdrawal.status !== "PENDING") {
      throw new ApiError("Only pending withdrawals can be approved.", 400);
    }
    await db.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: "APPROVED", adminNotes: note ?? withdrawal.adminNotes },
    });

    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "WITHDRAWAL_APPROVE",
      entity: "Withdrawal",
      entityId: withdrawal.id,
      metadata: { userEmail: withdrawal.user.email, amount: withdrawal.amount },
      ip,
    });

    await safeNotify({
      userId: withdrawal.userId,
      title: "Withdrawal approved",
      body: `Your withdrawal of ${formatRs(withdrawal.amount)} has been approved and is queued for transfer.`,
      link: "/dashboard/wallet",
    });

    return apiSuccess({ id: withdrawal.id, status: "APPROVED" });
  }

  if (input.action === "MARK_PAID") {
    if (withdrawal.status !== "APPROVED") {
      throw new ApiError("Only approved withdrawals can be marked as paid.", 400);
    }
    await db.withdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: "PAID",
        processedAt: new Date(),
        adminNotes: note ?? withdrawal.adminNotes,
      },
    });

    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "WITHDRAWAL_MARK_PAID",
      entity: "Withdrawal",
      entityId: withdrawal.id,
      metadata: { userEmail: withdrawal.user.email, amount: withdrawal.amount, accountNumber: withdrawal.accountNumber },
      ip,
    });

    await safeNotify({
      userId: withdrawal.userId,
      title: "Withdrawal paid",
      body: `${formatRs(withdrawal.amount)} has been transferred to your ${withdrawal.method} account (${withdrawal.accountNumber}).`,
      link: "/dashboard/wallet",
    });

    return apiSuccess({ id: withdrawal.id, status: "PAID" });
  }

  // REJECT — refund the (already debited) amount back to the wallet.
  if (withdrawal.status !== "PENDING" && withdrawal.status !== "APPROVED") {
    throw new ApiError("Only pending or approved withdrawals can be rejected.", 400);
  }

  await db.$transaction(async (tx) => {
    await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: "REJECTED",
        processedAt: new Date(),
        adminNotes: note ?? withdrawal.adminNotes,
      },
    });
    await creditWallet(tx, {
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      reason: "REFUND",
      description: `Withdrawal refund${note ? ` — ${note}` : ""}`,
      reference: withdrawal.id,
      idempotencyKey: `wd-refund-${withdrawal.id}`,
    });
  });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "WITHDRAWAL_REJECT",
    entity: "Withdrawal",
    entityId: withdrawal.id,
    metadata: { userEmail: withdrawal.user.email, amount: withdrawal.amount, refunded: true, note: note ?? null },
    ip,
  });

  await safeNotify({
    userId: withdrawal.userId,
    title: "Withdrawal rejected",
    body: `Your withdrawal request of ${formatRs(withdrawal.amount)} was rejected and the amount has been returned to your wallet.${note ? ` Reason: ${note}` : ""}`,
    link: "/dashboard/wallet",
  });

  return apiSuccess({ id: withdrawal.id, status: "REJECTED" });
});

async function safeNotify(input: { userId: string; title: string; body: string; link?: string }) {
  try {
    await notify({ ...input, type: "WALLET" });
  } catch (e) {
    console.error("[admin/withdrawals] failed to notify user:", e);
  }
}
