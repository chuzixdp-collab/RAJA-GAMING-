import { db } from "@/lib/db";
import { apiSuccess, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_PURCHASE_STATUSES = [
  "REQUESTED",
  "PAYMENT_PENDING",
  "PAYMENT_SUBMITTED",
  "PAYMENT_VERIFIED",
  "OWNERSHIP_REVIEW",
  "TRANSFER_PENDING",
  "TRANSFER_VERIFIED",
] as const;

/** Aggregated platform statistics for the admin dashboard. */
export const GET = withApi(async () => {
  await requireAdmin();

  const [
    users,
    orderGroups,
    completedAgg,
    activeTournaments,
    pendingListings,
    activePurchases,
    disputedPurchases,
    walletAgg,
    newContacts,
    pendingReviews,
    pendingWithdrawals,
  ] = await Promise.all([
    db.user.count(),
    db.topUpOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    db.topUpOrder.aggregate({ _sum: { totalAmount: true }, where: { status: "COMPLETED" } }),
    db.tournament.count({ where: { status: { in: ["UPCOMING", "OPEN", "FULL", "LIVE"] } } }),
    db.listing.count({ where: { status: { in: ["PENDING", "UNDER_REVIEW", "DUPLICATE_REVIEW"] } } }),
    db.purchase.count({ where: { status: { in: [...ACTIVE_PURCHASE_STATUSES] } } }),
    db.purchase.count({ where: { status: "DISPUTED" } }),
    db.wallet.aggregate({ _sum: { balance: true } }),
    db.contactMessage.count({ where: { status: "NEW" } }),
    db.review.count({ where: { status: "PENDING" } }),
    db.withdrawal.count({ where: { status: "PENDING" } }),
  ]);

  const statusCounts: Record<string, number> = {};
  let totalOrders = 0;
  for (const group of orderGroups) {
    statusCounts[group.status] = group._count._all;
    totalOrders += group._count._all;
  }

  return apiSuccess({
    users,
    totalOrders,
    statusCounts,
    revenue: completedAgg._sum.totalAmount ?? 0,
    pendingPayments:
      (statusCounts.PAYMENT_SUBMITTED ?? 0) + (statusCounts.UNDER_REVIEW ?? 0),
    inProgressOrders: (statusCounts.APPROVED ?? 0) + (statusCounts.PROCESSING ?? 0),
    activeTournaments,
    pendingListings,
    activePurchases,
    disputedPurchases,
    walletBalance: walletAgg._sum.balance ?? 0,
    newContacts,
    pendingReviews,
    pendingWithdrawals,
  });
});
