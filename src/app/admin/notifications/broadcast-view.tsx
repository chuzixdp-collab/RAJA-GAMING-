"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Megaphone, Send } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDateTime, timeAgo } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/app/admin/_components/confirm-dialog";

const NOTIFICATION_TYPES = [
  "ADMIN",
  "SYSTEM",
  "ORDER",
  "PAYMENT",
  "TOURNAMENT",
  "MARKETPLACE",
  "WALLET",
  "REFERRAL",
  "REVIEW",
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
  user: { id: string; email: string; name: string } | null;
};

function typeBadgeClass(type: string): string {
  switch (type) {
    case "PAYMENT":
    case "WALLET":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
    case "TOURNAMENT":
      return "border-primary/40 bg-primary/10 text-primary";
    case "ORDER":
      return "border-amber-600/40 bg-amber-600/10 text-amber-500";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function BroadcastView() {
  const [type, setType] = useState<NotificationType>("ADMIN");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");

  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [recent, setRecent] = useState<NotificationRow[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ notifications: NotificationRow[]; total: number }>(
        "/api/admin/notifications"
      );
      setRecent(res.notifications);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load recent notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canSend = title.trim().length >= 3 && body.trim().length >= 3;

  async function send() {
    setSending(true);
    try {
      const res = await apiFetch<{ recipients: number }>("/api/admin/notifications", {
        method: "POST",
        json: { type, title: title.trim(), body: body.trim(), link: link.trim() },
      });
      toast.success(`Broadcast sent to ${res.recipients} user${res.recipients === 1 ? "" : "s"}`);
      setTitle("");
      setBody("");
      setLink("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Broadcast failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Broadcast announcements to every registered user."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Broadcast form */}
        <Card className="card-raja">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
              <Megaphone className="h-4 w-4 text-primary" aria-hidden="true" />
              New broadcast
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="broadcast-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as NotificationType)}>
                <SelectTrigger aria-label="Notification type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFICATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broadcast-title">Title</Label>
              <Input
                id="broadcast-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="e.g. Double diamonds weekend"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broadcast-body">Message</Label>
              <Textarea
                id="broadcast-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Write the announcement players will see..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broadcast-link">Link (optional)</Label>
              <Input
                id="broadcast-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                maxLength={200}
                placeholder="/top-up"
              />
            </div>
            <div>
              <Button onClick={() => setConfirmOpen(true)} disabled={!canSend || sending} className="gap-2">
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                Send broadcast
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="card-raja">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg font-bold tracking-wide">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border bg-card/60 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full border border-primary/40 bg-primary/10 p-2">
                  <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={typeBadgeClass(type)}>
                      {type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">now</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold">
                    {title.trim() || "Your notification title"}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {body.trim() || "The message body players will receive in their notification bell."}
                  </p>
                  {link.trim() && (
                    <p className="mt-1.5 text-xs text-primary underline">{link.trim()}</p>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Sent to every non-admin account. The notification appears in each user dashboard bell menu.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent notifications */}
      <Card className="card-raja">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="font-display text-lg font-bold tracking-wide">
            Recent notifications
          </CardTitle>
          {total !== null && (
            <Badge variant="outline">
              {total.toLocaleString("en-PK")} total
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {loading && !recent ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !recent || recent.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title="No notifications sent yet"
              description="System and broadcast notifications will appear here."
            />
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {recent.map((n) => (
                <li key={n.id} className="rounded-md border border-border/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={typeBadgeClass(n.type)}>
                      {n.type}
                    </Badge>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium" title={n.title}>
                      {n.title}
                    </p>
                    <span className="text-xs text-muted-foreground" title={formatDateTime(n.createdAt)}>
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    To: {n.user?.email ?? "unknown"}
                    {n.read ? " (read)" : " (unread)"}
                    {n.link ? ` - ${n.link}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Send this broadcast?"
        description={`Every registered user will receive "${title.trim() || "this notification"}". Broadcasts cannot be recalled.`}
        confirmLabel="Send to all users"
        busy={sending}
        onConfirm={() => send()}
      />
    </div>
  );
}
