/**
 * Coupon validation + usage burning (server-side only — discounts are never
 * trusted from the client). Works inside a transaction or standalone.
 */
import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";

type Tx = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

export type AppliedCoupon = {
  couponId: string;
  code: string;
  discount: number;
};

export function computeDiscount(
  coupon: { type: "PERCENTAGE" | "FIXED"; value: number; maxDiscount: number | null },
  amount: number
): number {
  let discount =
    coupon.type === "PERCENTAGE"
      ? Math.floor((amount * coupon.value) / 100)
      : coupon.value;
  if (coupon.type === "PERCENTAGE" && coupon.maxDiscount != null) {
    discount = Math.min(discount, coupon.maxDiscount);
  }
  return Math.min(discount, amount);
}

/** Validate a coupon for a given user + order amount. Throws ApiError when invalid. */
export async function validateCoupon(
  tx: Tx,
  input: { userId: string; code: string; orderAmount: number }
): Promise<AppliedCoupon> {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new ApiError("Please enter a coupon code.", 400);

  const coupon = await tx.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) throw new ApiError("This coupon is not valid.", 400);
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    throw new ApiError("This coupon has expired.", 400);
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw new ApiError("This coupon has reached its usage limit.", 400);
  }
  if (input.orderAmount < coupon.minOrder) {
    throw new ApiError(`This coupon requires a minimum order of Rs ${coupon.minOrder}.`, 400);
  }
  const userUses = await tx.couponRedemption.count({
    where: { couponId: coupon.id, userId: input.userId },
  });
  if (userUses >= coupon.perUserLimit) {
    throw new ApiError("You have already used this coupon the maximum number of times.", 400);
  }
  const discount = computeDiscount(coupon, input.orderAmount);
  if (discount <= 0) throw new ApiError("This coupon does not reduce the price.", 400);

  return { couponId: coupon.id, code: coupon.code, discount };
}

/**
 * Burn a coupon when payment is submitted (prevents unpaid orders from
 * consuming usage). The unique [couponId, userId, orderId] index makes this
 * idempotent against double submission races.
 */
export async function burnCoupon(
  tx: Tx,
  input: { couponId: string; userId: string; orderId: string; discount: number }
) {
  const exists = await tx.couponRedemption.findFirst({
    where: { couponId: input.couponId, userId: input.userId, orderId: input.orderId },
  });
  if (exists) return;
  await tx.couponRedemption.create({
    data: {
      couponId: input.couponId,
      userId: input.userId,
      orderId: input.orderId,
      amount: input.discount,
    },
  });
  await tx.coupon.update({
    where: { id: input.couponId },
    data: { usedCount: { increment: 1 } },
  });
}
