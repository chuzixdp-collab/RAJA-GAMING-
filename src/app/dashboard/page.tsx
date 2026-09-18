import Link from "next/link";
import { ArrowRight, Bell, Coins, Crown, Receipt, Store, Trophy, Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { formatRs, timeAgo } from "@/lib/format";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

export default async function DashboardOverviewPage() {
  // The dashboard layout already redirects unauthenticated visitors.
  const user = await getCurrentUser();
  if (!user) return null;

  const [wallet, statusGroups, activeRegistrations, unreadAlerts, recentOrders, recentNotifications] =
    await Promise.all([
      db.wallet.findUnique({ where: { userId: user.id }, select: { balance: true } }),
      db.topUpOrder.groupBy({
        by: ["status"],
        where: { userId: user.id },
        _count: { _all: true },
      }),
      db.tournamentRegistration.count({
        where: {
          userId: user.id,
          status: { in: ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "APPROVED"] },
        },
      }),
      db.notification.count({ where: { userId: user.id, read: false } }),
      db.topUpOrder.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const balance = wallet?.balance ?? 0;
  const totalOrders = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
  const pendingOrders = statusGroups.find((g) => g.status === "PENDING_PAYMENT")?._count._all ?? 0;
  const firstName = user.name.trim().split(/\s+/)[0] || "player";

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Crown className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <h1 className="font-display text-2xl font-bold tracking-wide sm:text-3xl">
            Welcome back, {firstName}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Your RAJA GAMING command center — top-ups, tournaments, trades and rewards in one place.
        </p>
      </header>

      {/* Stats */}
      <section aria-label="Account summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Wallet Balance"
          value={formatRs(balance)}
          icon={<Wallet />}
          tone="gold"
          hint="Prizes, payouts and rewards"
        />
        <StatCard
          title="Total Orders"
          value={String(totalOrders)}
          icon={<Receipt />}
          hint={pendingOrders > 0 ? `${pendingOrders} awaiting payment` : "All orders up to date"}
        />
        <StatCard
          title="Active Registrations"
          value={String(activeRegistrations)}
          icon={<Trophy />}
          hint="Tournaments you joined"
        />
        <StatCard
          title="Unread Alerts"
          value={String(unreadAlerts)}
          icon={<Bell />}
          hint="Notifications to review"
        />
      </section>

      {/* Quick actions */}
      <section aria-label="Quick actions" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Button asChild size="lg" className="font-display tracking-wide">
          <Link href="/top-up">
            <Coins className="h-4 w-4" aria-hidden="true" /> Top Up Diamonds
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="font-display tracking-wide">
          <Link href="/tournaments">
            <Trophy className="h-4 w-4" aria-hidden="true" /> Join Tournament
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="font-display tracking-wide">
          <Link href="/dashboard/marketplace">
            <Store className="h-4 w-4" aria-hidden="true" /> Sell an ID
          </Link>
        </Button>
      </section>

      {/* Recent activity */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section aria-label="Recent orders" className="card-raja p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold tracking-wide">Recent Orders</h2>
            <Link
              href="/dashboard/orders"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="Top up Free Fire diamonds to see your orders here."
              action={
                <Button asChild size="sm">
                  <Link href="/top-up">Browse packages</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {recentOrders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {o.packageTitle}
                      <span className="text-muted-foreground"> · {o.diamonds.toLocaleString()} diamonds</span>
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {o.orderNumber} · {formatRs(o.totalAmount)}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Recent notifications" className="card-raja p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold tracking-wide">Notifications</h2>
            <Link
              href="/dashboard/notifications"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          {recentNotifications.length === 0 ? (
            <EmptyState
              title="No notifications"
              description="Order updates, tournament alerts and rewards will appear here."
            />
          ) : (
            <ul className="space-y-2">
              {recentNotifications.map((n) => (
                <li
                  key={n.id}
                  className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.read ? "bg-muted-foreground/40" : "bg-primary"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm",
                        n.read ? "font-medium text-foreground" : "font-semibold text-primary"
                      )}
                    >
                      {n.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
