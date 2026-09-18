/**
 * Order numbering + top-up order status machine.
 */
import { randomBytes } from "crypto";
import type { OrderStatus } from "@prisma/client";
import { ApiError } from "@/lib/api";

export function generateOrderNumber(): string {
  const time = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(2).toString("hex").toUpperCase();
  return `RG-${time}${rand}`;
}

/**
 * Allowed admin-driven transitions for top-up orders.
 * PENDING_PAYMENT → PAYMENT_SUBMITTED happens when the user submits payment.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAYMENT_SUBMITTED", "CANCELLED", "REJECTED"],
  PAYMENT_SUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PROCESSING", "COMPLETED", "REJECTED", "CANCELLED"],
  PROCESSING: ["COMPLETED", "REJECTED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ORDER_TRANSITIONS[from]?.includes(to)) {
    throw new ApiError(`Cannot change order status from ${from} to ${to}.`, 400);
  }
}
