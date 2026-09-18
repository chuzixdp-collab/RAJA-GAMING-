"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  CreditCard,
  Info,
  Receipt,
  ShieldCheck,
  Star,
  Store,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type NotificationDTO = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  ORDER: Receipt,
  PAYMENT: CreditCard,
  TOURNAMENT: Trophy,
  MARKETPLACE: Store,
  WALLET: Wallet,
  REFERRAL: Users,
  REVIEW: Star,
  ADMIN: ShieldCheck,
  SYSTEM: Info,
};

export function NotificationsView() {
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationDTO[]; unreadCount: number }>(
        "/api/notifications"
      );
      setItems(data.notifications);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load notifications.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = items?.filter((n) => !n.read).length ?? 0;

  async function markRead(id: string) {
    setBusy(true);
    try {
      await apiFetch("/api/notifications", { method: "POST", json: { action: "read", ids: [id] } });
      setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark as read.");
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await apiFetch("/api/notifications", { method: "POST", json: { action: "read_all" } });
      setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark all as read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description={items ? `${unreadCount} unread of ${items.length}` : "Loading…"}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void markAllRead()}
            disabled={busy || unreadCount === 0}
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" /> Mark all read
          </Button>
        }
      />

      {items === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="No notifications"
          description="Order updates, tournament alerts and rewards will appear here."
        />
      ) : (
        <ul className="max-h-[600px] space-y-2 overflow-y-auto pr-1" aria-label="Notification list">
          {items.map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? Bell;
            return (
              <li
                key={n.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                  n.read
                    ? "border-border/60 bg-card/30"
                    : "border-primary/40 bg-primary/5"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 shrink-0 rounded-md border p-2",
                    n.read
                      ? "border-border/60 text-muted-foreground"
                      : "border-primary/40 text-primary"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "text-sm",
                        n.read ? "font-medium text-foreground" : "font-semibold text-primary"
                      )}
                    >
                      {!n.read && (
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary align-middle"
                          aria-label="Unread"
                        />
                      )}
                      {n.title}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {n.link && (
                      <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                        <Link href={n.link}>View</Link>
                      </Button>
                    )}
                    {!n.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => void markRead(n.id)}
                        disabled={busy}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
