import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { debitWallet } from "@/lib/wallet";
import { notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { withdrawalRequestSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** My withdrawal requests. */
export const GET = withApi(async () => {
  const user = await requireUser();
  const withdrawals = await db.withdrawal.findMany({
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
  });
  return apiSuccess({ withdrawals });
});

/** Request a withdrawal — debits the wallet immediately, admin approves and pays out. */
export const POST = withApi(async (req: Request) => {
  const user = await requireUser();
  const input = await readJson(req, withdrawalRequestSchema);

  const withdrawal = await db.$transaction(async (tx) => {
    // One pending request at a time.
    const pendingCount = await tx.withdrawal.count({
      where: { userId: user.id, status: "PENDING" },
    });
    if (pendingCount > 0) {
      throw new ApiError("You already have a pending withdrawal. Wait for it to be processed.", 400);
    }
    // Atomic balance guard: throws ApiError("Insufficient wallet balance.") when short.
    const walletTx = await debitWallet(tx, {
      userId: user.id,
      amount: input.amount,
      reason: "WITHDRAWAL",
      description: "Withdrawal request",
    });
    return tx.withdrawal.create({
      data: {
        userId: user.id,
        amount: input.amount,
        accountName: input.accountName,
        accountNumber: input.accountNumber,
        method: "EASYPAISA",
        status: "PENDING",
        walletTxId: walletTx.id,
      },
    });
  });

  await notifyAdmins({
    type: "WALLET",
    title: "New withdrawal request",
    body: `${user.name} requested a withdrawal of Rs ${input.amount} via EasyPaisa.`,
    link: "/admin/wallet",
  });
  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "WITHDRAWAL_REQUEST",
    entity: "Withdrawal",
    entityId: withdrawal.id,
    metadata: { amount: input.amount, method: "EASYPAISA" },
    ip: getClientIp(req),
  });

  return apiSuccess(
    {
      withdrawal: {
        id: withdrawal.id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt,
      },
    },
    201
  );
});
