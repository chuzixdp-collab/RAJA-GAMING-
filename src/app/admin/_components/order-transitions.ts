/**
 * Client-safe copy of the top-up order status machine (mirrors
 * `ORDER_TRANSITIONS` in @/lib/orders, which imports server-only modules
 * and therefore cannot be bundled into client components).
 * Keep in sync with src/lib/orders.ts.
 */
import type { OrderStatus } from "@prisma/client";

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

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PROCESSING",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

export function humanizeStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export type OrderAction = {
  target: OrderStatus;
  /** API action: VERIFY does an explicit payment verification, others use SET_STATUS. */
  action: "VERIFY" | "SET_STATUS";
  label: string;
  description: string;
  variant: "default" | "destructive" | "outline";
  /** Show a note textarea in the confirm dialog. */
  withNote: boolean;
};

/** Buttons to show for an order, derived from valid transitions only. */
export function orderActions(status: OrderStatus): OrderAction[] {
  const targets = ORDER_TRANSITIONS[status] ?? [];
  const actions: OrderAction[] = [];
  if (targets.includes("APPROVED")) {
    actions.push({
      target: "APPROVED",
      action: "VERIFY",
      label: "Approve payment",
      description:
        "This verifies the payment, marks the order APPROVED and starts fulfilment. Referral rewards are paid automatically when due. This cannot be undone.",
      variant: "default",
      withNote: false,
    });
  }
  if (targets.includes("UNDER_REVIEW")) {
    actions.push({
      target: "UNDER_REVIEW",
      action: "SET_STATUS",
      label: "Mark under review",
      description: "Move this order into the manual review queue.",
      variant: "outline",
      withNote: false,
    });
  }
  if (targets.includes("PROCESSING")) {
    actions.push({
      target: "PROCESSING",
      action: "SET_STATUS",
      label: "Start processing",
      description: "Mark the diamonds as being delivered to the player.",
      variant: "outline",
      withNote: false,
    });
  }
  if (targets.includes("COMPLETED")) {
    actions.push({
      target: "COMPLETED",
      action: "SET_STATUS",
      label: "Mark completed",
      description: "Confirm the diamonds were delivered. This closes the order.",
      variant: "default",
      withNote: false,
    });
  }
  if (targets.includes("REJECTED")) {
    actions.push({
      target: "REJECTED",
      action: "SET_STATUS",
      label: "Reject",
      description: "Reject this order. The user will be notified and should be contacted about a refund.",
      variant: "destructive",
      withNote: true,
    });
  }
  if (targets.includes("CANCELLED")) {
    actions.push({
      target: "CANCELLED",
      action: "SET_STATUS",
      label: "Cancel",
      description: "Cancel this order. The user will be notified.",
      variant: "destructive",
      withNote: true,
    });
  }
  return actions;
}
