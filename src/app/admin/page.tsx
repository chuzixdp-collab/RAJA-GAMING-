import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  ClipboardList,
  Contact,
  Gem,
  Inbox,
  MessageSquareWarning,
  Receipt,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { formatDateTime, formatRs } from "@/lib/format";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

export default async function AdminDashboardPage() {
  const [
    totalUsers,
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
    recentOrders,
    recentMessages,
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
    db.topUpOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { email: true, name: true } } },
    }),
    db.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const statusCounts: Record<string, number> = {};
  let totalOrders = 0;
  for (const group of orderGroups) {
    statusCounts[group.status] = group._count._all;
    totalOrders += group._count._all;
  }

  const pendingPayments =
    (statusCounts.PAYMENT_SUBMITTED ?? 0) + (statusCounts.UNDER_REVIEW ?? 0);
  const inProgressOrders = (statusCounts.APPROVED ?? 0) + (statusCounts.PROCESSING ?? 0);
  const revenue = completedAgg._sum.totalAmount ?? 0;
  const walletBalance = walletAgg._sum.balance ?? 0;

  const pendingActions: { label: string; count: number; href: string; danger?: boolean }[] = [
    { label: "Payments awaiting verification", count: pendingPayments, href: "/admin/payments", danger: true },
    { label: "Withdrawals awaiting approval", count: pendingWithdrawals, href: "/admin/wallet", danger: true },
    { label: "Orders in fulfilment (approved / processing)", count: inProgressOrders, href: "/admin/orders?status=APPROVED" },
    { label: "Marketplace listings awaiting review", count: pendingListings, href: "/admin/marketplace" },
    { label: "Purchases in progress", count: activePurchases, href: "/admin/marketplace" },
    { label: "Disputed purchases", count: disputedPurchases, href: "/admin/marketplace", danger: true },
    { label: "Reviews pending moderation", count: pendingReviews, href: "/admin/reviews" },
    { label: "New contact messages", count: newContacts, href: "/admin/contact" },
  ];
  const totalPendingActions = pendingActions.reduce((sum, a) => sum + a.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        description="Live platform statistics — every number below is read from the database."
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          title="Revenue (completed)"
          value={formatRs(revenue)}
          icon={<CircleDollarSign />}
          hint={`${statusCounts.COMPLETED ?? 0} completed orders`}
          tone="gold"
        />
        <StatCard
          title="Registered users"
          value={totalUsers.toLocaleString("en-PK")}
          icon={<Users />}
          hint="All-time accounts"
        />
        <StatCard
          title="Total orders"
          value={totalOrders.toLocaleString("en-PK")}
          icon={<Receipt />}
          hint={`${inProgressOrders} in fulfilment`}
        />
        <StatCard
          title="Pending payments"
          value={pendingPayments.toLocaleString("en-PK")}
          icon={<BadgeCheck />}
          hint="Submitted + under review"
          tone={pendingPayments > 0 ? "red" : "default"}
        />
        <StatCard
          title="Wallet liability"
          value={formatRs(walletBalance)}
          icon={<Wallet />}
          hint="Sum of all user balances"
        />
        <StatCard
          title="Active tournaments"
          value={activeTournaments.toLocaleString("en-PK")}
          icon={<Trophy />}
          hint="Upcoming, open, full or live"
        />
        <StatCard
          title="Listings to review"
          value={pendingListings.toLocaleString("en-PK")}
          icon={<Gem />}
          hint="Pending + under review"
          tone={pendingListings > 0 ? "red" : "default"}
        />
        <StatCard
          title="Disputed purchases"
          value={disputedPurchases.toLocaleString("en-PK")}
          icon={<MessageSquareWarning />}
          hint={`${activePurchases} purchases in progress`}
          tone={disputedPurchases > 0 ? "red" : "default"}
        />
      </section>

      <Card className="card-raja">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="font-display text-lg font-bold tracking-wide">
            Pending actions
          </CardTitle>
          <Badge variant={totalPendingActions > 0 ? "destructive" : "outline"}>
            {totalPendingActions} total
          </Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pendingActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="group flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="min-w-0 truncate text-muted-foreground group-hover:text-foreground">
                {action.label}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    action.count === 0
                      ? "text-muted-foreground"
                      : action.danger
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-primary/40 bg-primary/10 text-primary"
                  }
                >
                  {action.count}
                </Badge>
                <ArrowRight
                  className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="card-raja xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
              <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
              Recent orders
            </CardTitle>
            <Link
              href="/admin/orders"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title="No orders yet"
                description="Top-up orders will appear here as soon as players start purchasing diamonds."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Order</th>
                      <th className="pb-2 pr-3 font-medium">User</th>
                      <th className="pb-2 pr-3 font-medium">Package</th>
                      <th className="pb-2 pr-3 font-medium">Total</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 font-medium">Placed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 pr-3 font-mono text-xs">{order.orderNumber}</td>
                        <td className="max-w-[160px] truncate py-2.5 pr-3" title={order.user.email}>
                          {order.user.email}
                        </td>
                        <td className="max-w-[140px] truncate py-2.5 pr-3" title={order.packageTitle}>
                          {order.packageTitle}
                        </td>
                        <td className="py-2.5 pr-3 font-medium text-primary">{formatRs(order.totalAmount)}</td>
                        <td className="py-2.5 pr-3">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-raja">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
              <Contact className="h-4 w-4 text-primary" aria-hidden="true" />
              Contact messages
            </CardTitle>
            <Link
              href="/admin/contact"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentMessages.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title="Inbox is empty"
                description="Messages sent through the contact page will appear here."
              />
            ) : (
              <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {recentMessages.map((message) => (
                  <li key={message.id} className="rounded-md border border-border/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium" title={message.subject}>
                        {message.subject}
                      </p>
                      <StatusBadge status={message.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {message.name} &middot; {message.email}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{message.message}</p>
                    <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {formatDateTime(message.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
