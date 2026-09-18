"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderStatus } from "@prisma/client";
import { Loader2, Receipt, Search, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDateTime, formatRs, timeAgo } from "@/lib/format";
import { CopyButton } from "@/components/shared/copy-button";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/app/admin/_components/confirm-dialog";
import {
  humanizeStatus,
  orderActions,
  ORDER_STATUSES,
  type OrderAction,
} from "@/app/admin/_components/order-transitions";

type AdminOrder = {
  id: string;
  orderNumber: string;
  userId: string;
  packageId: string;
  packageTitle: string;
  package: { title: string };
  diamonds: number;
  amount: number;
  couponCode: string | null;
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
  adminNotes: string | null;
  completedAt: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string };
};

type PendingTransition = { order: AdminOrder; action: OrderAction };

export function OrdersView({ initialStatus = "ALL" }: { initialStatus?: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<AdminOrder | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status !== "ALL") params.set("status", status);
      if (query) params.set("query", query);
      const res = await apiFetch<{ orders: AdminOrder[] }>(`/api/admin/orders?${params.toString()}`);
      setOrders(res.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, [status, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionsForDetail = useMemo(
    () => (detail ? orderActions(detail.status as OrderStatus) : []),
    [detail]
  );

  function openDetail(order: AdminOrder) {
    setDetail(order);
    setNotesDraft(order.adminNotes ?? "");
  }

  function patchLocal(orderId: string, changes: Partial<AdminOrder>) {
    setOrders((prev) =>
      prev ? prev.map((o) => (o.id === orderId ? { ...o, ...changes } : o)) : prev
    );
    setDetail((prev) => (prev && prev.id === orderId ? { ...prev, ...changes } : prev));
  }

  async function runTransition(order: AdminOrder, action: OrderAction, note?: string) {
    setBusy(true);
    try {
      await apiFetch("/api/admin/orders", {
        method: "PATCH",
        json: {
          orderId: order.id,
          action: action.action,
          ...(action.action === "SET_STATUS" ? { status: action.target } : {}),
          note,
        },
      });
      toast.success(`Order ${order.orderNumber} → ${humanizeStatus(action.target)}`);
      patchLocal(order.id, { status: action.target });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (!detail) return;
    setSavingNotes(true);
    try {
      const res = await apiFetch<{ adminNotes: string | null }>("/api/admin/orders", {
        method: "PATCH",
        json: { orderId: detail.id, action: "NOTE", note: notesDraft.trim() },
      });
      patchLocal(detail.id, { adminNotes: res.adminNotes ?? "" });
      toast.success("Admin notes saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save notes.");
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Diamond top-up orders. Status changes are validated against the order state machine."
        actions={
          loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading orders" /> : undefined
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList className="flex h-auto w-full max-w-full flex-wrap gap-1 sm:flex-nowrap lg:overflow-x-auto">
            <TabsTrigger value="ALL">All</TabsTrigger>
            {ORDER_STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="whitespace-nowrap">
                {humanizeStatus(s)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full lg:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Order no, FF UID, user..."
            className="pl-9"
            aria-label="Search orders"
          />
        </div>
      </div>

      <Card className="card-raja">
        <CardContent className="p-4 sm:p-6">
          {error ? (
            <EmptyState
              icon={<Receipt />}
              title="Could not load orders"
              description={error}
              action={
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          ) : loading && !orders ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !orders || orders.length === 0 ? (
            <EmptyState
              icon={<Receipt />}
              title="No orders found"
              description={
                query || status !== "ALL"
                  ? "Nothing matches the current filters."
                  : "Orders will appear here once players check out."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Diamonds</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>FF UID</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Placed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id} className="cursor-pointer" onClick={() => openDetail(order)}>
                      <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
                      <TableCell className="max-w-[180px] truncate" title={order.user.email}>
                        {order.user.email}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate" title={order.packageTitle}>
                        {order.packageTitle}
                      </TableCell>
                      <TableCell className="text-primary">{order.diamonds.toLocaleString("en-PK")}</TableCell>
                      <TableCell>{formatRs(order.amount)}</TableCell>
                      <TableCell>{order.discount > 0 ? `-${formatRs(order.discount)}` : "—"}</TableCell>
                      <TableCell className="font-medium">{formatRs(order.totalAmount)}</TableCell>
                      <TableCell className="font-mono text-xs">{order.ffUid}</TableCell>
                      <TableCell>
                        {order.paymentTrxId ? (
                          <span className="text-xs text-emerald-400">Submitted</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Awaiting</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" title={formatDateTime(order.createdAt)}>
                        {timeAgo(order.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order detail dialog */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 font-display">
                  <span className="font-mono text-base">{detail.orderNumber}</span>
                  <StatusBadge status={detail.status} />
                </DialogTitle>
                <DialogDescription>
                  Placed {formatDateTime(detail.createdAt)} by {detail.user.name} ({detail.user.email})
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <section aria-label="Order details" className="rounded-md border border-border/70 p-3 text-sm">
                  <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Order
                  </h3>
                  <DetailRow label="Package" value={detail.packageTitle} />
                  <DetailRow label="Diamonds" value={detail.diamonds.toLocaleString("en-PK")} />
                  <DetailRow label="Amount" value={formatRs(detail.amount)} />
                  <DetailRow
                    label="Coupon"
                    value={detail.couponCode ? `${detail.couponCode} (-${formatRs(detail.discount)})` : "—"}
                  />
                  <DetailRow label="Total" value={formatRs(detail.totalAmount)} strong />
                  <DetailRow label="FF UID" value={detail.ffUid} mono />
                  {detail.ffServer && <DetailRow label="FF Server" value={detail.ffServer} />}
                  {detail.completedAt && <DetailRow label="Completed" value={formatDateTime(detail.completedAt)} />}
                  {detail.userNote && <DetailRow label="User note" value={detail.userNote} />}
                </section>

                <section aria-label="Payment details" className="rounded-md border border-border/70 p-3 text-sm">
                  <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment
                  </h3>
                  <DetailRow label="Method" value={detail.paymentMethod} />
                  <div className="flex items-center justify-between gap-2 py-1">
                    <span className="text-muted-foreground">Transaction ID</span>
                    {detail.paymentTrxId ? (
                      <span className="flex items-center gap-1.5 font-mono text-xs">
                        {detail.paymentTrxId}
                        <CopyButton value={detail.paymentTrxId} label="transaction ID" />
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                  <DetailRow
                    label="Submitted"
                    value={detail.paymentSubmittedAt ? formatDateTime(detail.paymentSubmittedAt) : "—"}
                  />
                  <DetailRow
                    label="Verified"
                    value={detail.paymentVerifiedAt ? formatDateTime(detail.paymentVerifiedAt) : "—"}
                  />
                  {detail.paymentScreenshotId ? (
                    <div className="mt-2">
                      <p className="mb-1 text-xs text-muted-foreground">Payment screenshot</p>
                      <img
                        src={`/api/uploads/${detail.paymentScreenshotId}`}
                        className="max-h-64 w-auto rounded border"
                        alt={`Payment screenshot for order ${detail.orderNumber}`}
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No screenshot attached.</p>
                  )}
                </section>
              </div>

              {actionsForDetail.length > 0 && (
                <div>
                  <Separator className="my-1" />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {actionsForDetail.map((action) => (
                      <Button
                        key={action.target}
                        size="sm"
                        variant={action.variant === "destructive" ? "destructive" : action.variant === "outline" ? "outline" : "default"}
                        onClick={() => setPendingTransition({ order: detail, action })}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="admin-notes" className="flex items-center gap-1.5">
                  <StickyNote className="h-3.5 w-3.5" aria-hidden="true" /> Admin notes
                </Label>
                <Textarea
                  id="admin-notes"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Internal notes — visible to admins only"
                />
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => void saveNotes()} disabled={savingNotes}>
                    {savingNotes && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Save notes
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Status transition confirm */}
      <ConfirmDialog
        open={!!pendingTransition}
        onOpenChange={(open) => !open && setPendingTransition(null)}
        title={
          pendingTransition
            ? `${pendingTransition.action.label} — order ${pendingTransition.order.orderNumber}?`
            : ""
        }
        description={pendingTransition?.action.description ?? ""}
        confirmLabel={pendingTransition?.action.label ?? "Confirm"}
        destructive={pendingTransition?.action.variant === "destructive"}
        note={pendingTransition?.action.withNote}
        notePlaceholder="Reason shown to the user (recommended)"
        busy={busy}
        onConfirm={(noteText) => {
          if (!pendingTransition) return Promise.resolve();
          return runTransition(pendingTransition.order, pendingTransition.action, noteText);
        }}
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={`text-right ${mono ? "font-mono text-xs" : ""} ${
          strong ? "font-semibold text-primary" : ""
        } break-words`}
      >
        {value}
      </span>
    </div>
  );
}
