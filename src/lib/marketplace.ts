/**
 * Marketplace purchase state machine + duplicate-UID protection.
 * All transitions are enforced SERVER-SIDE.
 */
import type { ListingStatus, PurchaseStatus } from "@prisma/client";
import { ApiError } from "@/lib/api";

export const PURCHASE_TRANSITIONS: Record<PurchaseStatus, PurchaseStatus[]> = {
  REQUESTED: ["PAYMENT_PENDING", "PAYMENT_SUBMITTED", "REJECTED", "CANCELLED"],
  PAYMENT_PENDING: ["PAYMENT_SUBMITTED", "CANCELLED", "REJECTED"],
  PAYMENT_SUBMITTED: ["PAYMENT_VERIFIED", "REJECTED", "CANCELLED"],
  PAYMENT_VERIFIED: ["OWNERSHIP_REVIEW", "REFUNDED", "DISPUTED"],
  OWNERSHIP_REVIEW: ["TRANSFER_PENDING", "REFUNDED", "DISPUTED"],
  TRANSFER_PENDING: ["TRANSFER_VERIFIED", "REFUNDED", "DISPUTED"],
  TRANSFER_VERIFIED: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  DISPUTED: ["COMPLETED", "REFUNDED", "TRANSFER_PENDING"],
  REFUNDED: [],
};

export function assertPurchaseTransition(from: PurchaseStatus, to: PurchaseStatus): void {
  if (!PURCHASE_TRANSITIONS[from]?.includes(to)) {
    throw new ApiError(`Cannot change marketplace transaction from ${from} to ${to}.`, 400);
  }
}

/** Listing statuses that block the same Free Fire UID from being sold again. */
export const ACTIVE_LISTING_STATUSES: ListingStatus[] = [
  "PENDING",
  "UNDER_REVIEW",
  "APPROVED",
  "DUPLICATE_REVIEW",
];

/** Purchase statuses considered "in flight" (one active transaction per listing). */
export const ACTIVE_PURCHASE_STATUSES: PurchaseStatus[] = [
  "REQUESTED",
  "PAYMENT_PENDING",
  "PAYMENT_SUBMITTED",
  "PAYMENT_VERIFIED",
  "OWNERSHIP_REVIEW",
  "TRANSFER_PENDING",
  "TRANSFER_VERIFIED",
  "DISPUTED",
];
