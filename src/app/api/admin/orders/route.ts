import { z } from "zod";
import type { Prisma, OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { assertOrderTransition } from "@/lib/orders";
import { creditWallet } from "@/lib/wallet";
import { getSettingInt } from "@/lib/settings";
import { notify } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { humanizeStatus } from "@/app/admin/_components/order-transitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusEnum = z.enum([
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PROCESSING",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
]);

const orderAdminSchema = z.object({
  orderId: z.string().min(1).max(64),
  action: z.enum(["VERIFY", "SET_STATUS", "NOTE", "ADD_NOTE"]),
  status: statusEnum.optional(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

/** GET /api/admin/orders?status=&query= — latest 100 orders with user info. */
export const GET = withApi(async (req: Request) => {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status")?.trim();
  const query = (searchParams.get("query") ?? "").trim().slice(0, 100);

  const where: Prisma.TopUpOrderWhereInput = {};
  if (statusParam) {
    const parsed = statusEnum.safeParse(statusParam);
    if (!parsed.success) throw new ApiError("Invalid status filter.", 400);
    where.status = parsed.data as OrderStatus;
  }
  if (query) {
    where.OR = [
      { orderNumber: { contains: query, mode: "insensitive" } },
      { ffUid: { contains: query } },
      { user: { email: { contains: query, mode: "insensitive" } } },
      { user: { name: { contains: query, mode: "insensitive" } } },
    ];
  }

  const orders = await db.topUpOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, email: true, name: true, referredById: true } },
      package: { select: { title: true } },
    },
  });

  return apiSuccess({ orders });
});

/** PATCH /api/admin/orders — verify / transition status / manage notes. */
export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, orderAdminSchema);
  const note = input.note?.trim() || undefined;

  const order = await db.topUpOrder.findUnique({
    where: { id: input.orderId },
    include: { user: { select: { id: true, email: true, name: true, referredById: true } } },
  });
  if (!order) throw new ApiError("Order not found.", 404);

  const ip = getClientIp(req);
  let referralRewardAmount = 0;

  if (input.action === "VERIFY") {
    assertOrderTransition(order.status, "APPROVED");

    await db.$transaction(async (tx) => {
      await tx.topUpOrder.update({
        where: { id: order.id },
        data: {
          status: "APPROVED",
          paymentVerifiedAt: new Date(),
          reviewedById: admin.id,
        },
      });

      // Pay the referrer's pending referral reward, if configured.
      const referredById = order.user.referredById;
      if (referredById) {
        const referral = await tx.referral.findFirst({
          where: { referredId: order.userId, status: "PENDING" },
        });
        if (referral) {
          const rewardAmount = await getSettingInt("REFERRAL_REWARD_AMOUNT");
          if (rewardAmount > 0) {
            await creditWallet(tx, {
              userId: referredById,
              amount: rewardAmount,
              reason: "REFERRAL_REWARD",
              description: `Referral reward for ${order.orderNumber}`,
              reference: order.orderNumber,
              idempotencyKey: `ref-${referral.id}`,
            });
            await tx.referral.update({
              where: { id: referral.id },
              data: { status: "COMPLETED", rewardAmount, rewardedAt: new Date() },
            });
            referralRewardAmount = rewardAmount;
          }
        }
      }
    });

    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ORDER_VERIFY",
      entity: "TopUpOrder",
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        from: order.status,
        to: "APPROVED",
        totalAmount: order.totalAmount,
        referralRewardPaid: referralRewardAmount,
      },
      ip,
    });

    await safeNotify({
      userId: order.userId,
      title: `Order ${order.orderNumber} approved`,
      body: `Your payment for ${order.packageTitle} was verified. Your order is now APPROVED and will be delivered shortly.`,
      link: "/dashboard/orders",
    });

    return apiSuccess({ id: order.id, status: "APPROVED" });
  }

  if (input.action === "SET_STATUS") {
    if (!input.status) throw new ApiError("A target status is required.", 400);
    const targetStatus: OrderStatus = input.status;
    assertOrderTransition(order.status, targetStatus);

    const updated = await db.$transaction(async (tx) => {
      return tx.topUpOrder.update({
        where: { id: order.id },
        data: {
          status: targetStatus,
          reviewedById: admin.id,
          ...(targetStatus === "COMPLETED" ? { completedAt: new Date() } : {}),
        },
      });
    });

    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ORDER_STATUS",
      entity: "TopUpOrder",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, from: order.status, to: targetStatus, note: note ?? null },
      ip,
    });

    await safeNotify({
      userId: order.userId,
      title: `Order ${order.orderNumber} ${humanizeStatus(targetStatus).toLowerCase()}`,
      body: `Your ${order.packageTitle} order status changed to ${humanizeStatus(targetStatus)}.${
        note ? ` Note from support: ${note}` : ""
      }`,
      link: "/dashboard/orders",
    });

    return apiSuccess({ id: updated.id, status: updated.status });
  }

  // NOTE (replace) / ADD_NOTE (append)
  const adminNotes =
    input.action === "NOTE"
      ? note ?? ""
      : `${order.adminNotes ? `${order.adminNotes}\n` : ""}[${new Date().toISOString()}] ${note ?? "(empty)"}`;

  await db.topUpOrder.update({ where: { id: order.id }, data: { adminNotes } });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: input.action === "NOTE" ? "ORDER_NOTE_SET" : "ORDER_NOTE_APPEND",
    entity: "TopUpOrder",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, note: note ?? null },
    ip,
  });

  return apiSuccess({ id: order.id, adminNotes });
});

/** Notifications must never break the admin flow. */
async function safeNotify(input: { userId: string; title: string; body: string; link?: string }) {
  try {
    await notify({ ...input, type: "ORDER" });
  } catch (e) {
    console.error("[admin/orders] failed to notify user:", e);
  }
}
