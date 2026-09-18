"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDateTime, formatRs } from "@/lib/format";
import { EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { ImageUpload } from "@/components/shared/image-upload";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type OrderDTO = {
  id: string;
  orderNumber: string;
  packageTitle: string;
  diamonds: number;
  amount: number;
  discount: number;
  couponCode: string | null;
  totalAmount: number;
  ffUid: string;
  ffServer: string | null;
  paymentMethod: string;
  paymentTrxId: string | null;
  paymentSubmittedAt: string | null;
  status: string;
  userNote: string | null;
  adminNotes: string | null;
  createdAt: string;
  completedAt: string | null;
};

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PENDING_PAYMENT", label: "Pending Payment" },
  { value: "PAYMENT_SUBMITTED", label: "Payment Submitted" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function OrdersView({ orders }: { orders: OrderDTO[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === "ALL" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );
  const selected = orders.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value} className="text-xs sm:text-sm">
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title={orders.length === 0 ? "No orders yet" : "No orders match this filter"}
          description="Top up Free Fire diamonds to create your first order."
          action={
            <Button asChild size="sm">
              <Link href="/top-up">Browse top-up packages</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border/60 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>FF UID</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    aria-label={`View order ${o.orderNumber}`}
                    onClick={() => setSelectedId(o.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(o.id);
                      }
                    }}
                  >
                    <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                    <TableCell>
                      <div className="font-medium">{o.packageTitle}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.diamonds.toLocaleString()} diamonds
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{o.ffUid}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{formatRs(o.totalAmount)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  aria-label={`View order ${o.orderNumber}`}
                  className="w-full rounded-lg border border-border/60 bg-card/40 p-3 text-left transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{o.packageTitle}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{o.orderNumber}</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                    <span>
                      {o.diamonds.toLocaleString()} diamonds · UID {o.ffUid}
                    </span>
                    <span className="font-medium text-foreground">{formatRs(o.totalAmount)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 font-display">
                  <span className="font-mono text-base">{selected.orderNumber}</span>
                  <StatusBadge status={selected.status} />
                </DialogTitle>
                <DialogDescription>Placed {formatDateTime(selected.createdAt)}</DialogDescription>
              </DialogHeader>
              <OrderDetails
                order={selected}
                onDone={() => {
                  setSelectedId(null);
                  router.refresh();
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function OrderDetails({ order, onDone }: { order: OrderDTO; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <DetailRow label="Package" value={`${order.packageTitle} · ${order.diamonds.toLocaleString()} diamonds`} />
        <DetailRow label="Amount" value={formatRs(order.amount)} />
        {order.discount > 0 && (
          <DetailRow
            label="Coupon discount"
            value={`− ${formatRs(order.discount)}${order.couponCode ? ` (${order.couponCode})` : ""}`}
          />
        )}
        <DetailRow label="Total" value={<span className="text-primary">{formatRs(order.totalAmount)}</span>} />
        <DetailRow label="Free Fire UID" value={<span className="font-mono text-xs">{order.ffUid}</span>} />
        {order.ffServer && <DetailRow label="Server" value={order.ffServer} />}
        {order.paymentTrxId && (
          <DetailRow label="Transaction ID" value={<span className="font-mono text-xs">{order.paymentTrxId}</span>} />
        )}
        {order.paymentSubmittedAt && (
          <DetailRow label="Payment submitted" value={formatDateTime(order.paymentSubmittedAt)} />
        )}
        {order.completedAt && <DetailRow label="Completed" value={formatDateTime(order.completedAt)} />}
      </div>

      {order.adminNotes && (
        <Alert>
          <AlertTitle>Admin note</AlertTitle>
          <AlertDescription>{order.adminNotes}</AlertDescription>
        </Alert>
      )}
      {order.userNote && (
        <p className="text-xs text-muted-foreground">Your note: {order.userNote}</p>
      )}

      {order.status === "PENDING_PAYMENT" ? (
        <OrderPaymentForm order={order} onDone={onDone} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Payments are verified manually by admins. Status updates appear here and in your notifications.
        </p>
      )}
    </div>
  );
}

function OrderPaymentForm({ order, onDone }: { order: OrderDTO; onDone: () => void }) {
  const [trxId, setTrxId] = useState("");
  const [screenshotId, setScreenshotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (trxId.trim().length < 4) {
      toast.error("Enter the EasyPaisa transaction ID (at least 4 characters).");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/orders/${order.id}/payment`, {
        method: "POST",
        json: { trxId: trxId.trim(), screenshotUploadId: screenshotId ?? "" },
      });
      toast.success("Payment submitted — admins will verify it shortly.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="font-display text-sm font-semibold">Submit EasyPaisa payment</p>
      <p className="text-xs text-muted-foreground">
        Send {formatRs(order.totalAmount)} to the EasyPaisa account shown on the Top-Up page, then enter
        the transaction ID below.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`order-trx-${order.id}`}>EasyPaisa Transaction ID</Label>
        <Input
          id={`order-trx-${order.id}`}
          value={trxId}
          onChange={(e) => setTrxId(e.target.value)}
          placeholder="e.g. 4021337"
          maxLength={48}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`order-proof-${order.id}`}>Payment screenshot (optional)</Label>
        <ImageUpload
          kind="PAYMENT_PROOF"
          value={screenshotId}
          onChange={setScreenshotId}
          label="Upload payment screenshot"
        />
      </div>
      <Button type="submit" className="w-full font-display tracking-wide" disabled={busy}>
        {busy ? "Submitting…" : "Submit payment"}
      </Button>
    </form>
  );
}
