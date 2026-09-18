"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Banknote, Eye, Loader2, ReceiptText, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDateTime, formatRs, timeAgo } from "@/lib/format";
import { CopyButton } from "@/components/shared/copy-button";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/app/admin/_components/confirm-dialog";

type AdminOrder = {
  id: string;
  orderNumber: string;
  packageTitle: string;
  diamonds: number;
  amount: number;
  discount: number;
  totalAmount: number;
  ffUid: string;
  ffServer: string | null;
  paymentMethod: string;
  paymentTrxId: string | null;
  paymentScreenshotId: string | null;
  paymentSubmittedAt: string | null;
  paymentVerifiedAt: string | null;
  status: string;
  userNote: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string };
};

type PendingAction = {
  order: AdminOrder;
  kind: "APPROVE" | "REJECT" | "REVIEW";
};

const TAB_STATUSES = ["PAYMENT_SUBMITTED", "UNDER_REVIEW"] as const;

export function PaymentsView() {
  const [tab, setTab] = useState<(typeof TAB_STATUSES)[number]>("PAYMENT_SUBMITTED");
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ orders: AdminOrder[] }>(
        `/api/admin/orders?status=${tab}`
      );
      setOrders(res.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payment queue.");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  function removeLocal(orderId: string) {
    setOrders((prev) => (prev ? prev.filter((o) => o.id !== orderId) : prev));
  }

  async function act(order: AdminOrder, kind: PendingAction["kind"], note?: string) {
    setBusy(true);
    try {
      if (kind === "APPROVE") {
        await apiFetch("/api/admin/orders", {
          method: "PATCH",
          json: { orderId: order.id, action: "VERIFY" },
        });
        toast.success(`Payment verified — ${order.orderNumber} is now APPROVED`);
      } else if (kind === "REVIEW") {
        await apiFetch("/api/admin/orders", {
          method: "PATCH",
          json: { orderId: order.id, action: "SET_STATUS", status: "UNDER_REVIEW" },
        });
        toast.success(`${order.orderNumber} moved to under review`);
      } else {
        await apiFetch("/api/admin/orders", {
          method: "PATCH",
          json: { orderId: order.id, action: "SET_STATUS", status: "REJECTED", note },
        });
        toast.success(`${order.orderNumber} rejected`);
      }
      removeLocal(order.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const queueCount = orders?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Verification"
        description="The money path — compare the transaction ID and screenshot against your Easypaisa account before approving."
        actions={
          <Badge variant="outline" className={queueCount > 0 ? "border-destructive/40 bg-destructive/10 text-destructive" : ""}>
            {queueCount} in queue
          </Badge>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TAB_STATUSES)[number])}>
        <TabsList>
          <TabsTrigger value="PAYMENT_SUBMITTED">Submitted</TabsTrigger>
          <TabsTrigger value="UNDER_REVIEW">Under review</TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <EmptyState
          icon={<ShieldAlert />}
          title="Could not load the payment queue"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : loading && !orders ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : !orders || orders.length === 0 ? (
        <EmptyState
          icon={<BadgeCheck />}
          title="Payment queue is clear"
          description={
            tab === "PAYMENT_SUBMITTED"
              ? "No payments are waiting for verification right now."
              : "No orders are marked under review."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <Card key={order.id} className="card-raja">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 font-mono text-sm font-semibold">
                      <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
                      {order.orderNumber}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {order.user.name} &middot; {order.user.email}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={order.status} />
                    <p className="mt-1 text-xs text-muted-foreground" title={formatDateTime(order.createdAt)}>
                      {timeAgo(order.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Package</p>
                    <p className="font-medium">{order.packageTitle}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Diamonds</p>
                    <p className="font-medium text-primary">{order.diamonds.toLocaleString("en-PK")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Amount due</p>
                    <p className="flex items-center gap-1 font-semibold text-primary">
                      <Banknote className="h-4 w-4" aria-hidden="true" />
                      {formatRs(order.totalAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">FF UID</p>
                    <p className="font-mono text-xs">{order.ffUid}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Method</p>
                    <p className="text-xs">{order.paymentMethod}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Submitted</p>
                    <p className="text-xs">
                      {order.paymentSubmittedAt ? formatDateTime(order.paymentSubmittedAt) : "—"}
                    </p>
                  </div>
                </div>

                {order.userNote && (
                  <p className="mt-3 rounded-md border border-border/70 bg-muted/40 p-2 text-xs text-muted-foreground">
                    User note: {order.userNote}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">Transaction ID:</span>
                  {order.paymentTrxId ? (
                    <span className="flex items-center gap-1.5 rounded border border-primary/30 bg-primary/5 px-2 py-1 font-mono text-xs">
                      {order.paymentTrxId}
                      <CopyButton value={order.paymentTrxId} label="transaction ID" className="h-6" />
                    </span>
                  ) : (
                    <span className="text-xs text-destructive">Missing — ask the user for the transaction ID</span>
                  )}
                </div>

                <div className="mt-4">
                  {order.paymentScreenshotId ? (
                    <a
                      href={`/api/uploads/${order.paymentScreenshotId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative inline-block"
                      title="Open full-size screenshot"
                    >
                      <img
                        src={`/api/uploads/${order.paymentScreenshotId}`}
                        className="max-h-64 w-auto rounded border"
                        alt={`Payment screenshot for order ${order.orderNumber}`}
                        loading="lazy"
                      />
                      <span className="absolute right-2 top-2 rounded bg-background/80 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </a>
                  ) : (
                    <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                      No payment screenshot attached to this order.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setPendingAction({ order, kind: "APPROVE" })}>
                    <BadgeCheck className="h-4 w-4" aria-hidden="true" /> Approve payment
                  </Button>
                  {order.status === "PAYMENT_SUBMITTED" && (
                    <Button size="sm" variant="outline" onClick={() => setPendingAction({ order, kind: "REVIEW" })}>
                      Mark under review
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setPendingAction({ order, kind: "REJECT" })}
                  >
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingAction}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction
            ? pendingAction.kind === "APPROVE"
              ? `Verify payment for ${pendingAction.order.orderNumber}?`
              : pendingAction.kind === "REVIEW"
                ? `Move ${pendingAction.order.orderNumber} under review?`
                : `Reject ${pendingAction.order.orderNumber}?`
            : ""
        }
        description={
          pendingAction
            ? pendingAction.kind === "APPROVE"
              ? `Confirm you have received ${formatRs(
                  pendingAction.order.totalAmount
                )} in your Easypaisa account for transaction ${pendingAction.order.paymentTrxId ?? "—"} and that the screenshot matches. Approval grants the diamonds.`
              : pendingAction.kind === "REVIEW"
                ? "The order moves to the under-review tab while you investigate."
                : "The user will be notified that the payment was not accepted. Contact them about a refund if the money was received."
            : ""
        }
        confirmLabel={
          pendingAction
            ? pendingAction.kind === "APPROVE"
              ? "Verify and approve"
              : pendingAction.kind === "REVIEW"
                ? "Move to review"
                : "Reject payment"
            : "Confirm"
        }
        destructive={pendingAction?.kind === "REJECT"}
        note={pendingAction?.kind === "REJECT"}
        noteRequired={pendingAction?.kind === "REJECT"}
        notePlaceholder="Reason for rejecting (required)"
        busy={busy}
        onConfirm={(noteText) => {
          if (!pendingAction) return Promise.resolve();
          return act(pendingAction.order, pendingAction.kind, noteText);
        }}
      />

      {busy && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Processing...
        </div>
      )}
    </div>
  );
}
