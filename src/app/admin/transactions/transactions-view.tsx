"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { formatRs, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PIPELINE_TABS = [
  "REQUESTED",
  "PAYMENT_SUBMITTED",
  "PAYMENT_VERIFIED",
  "OWNERSHIP_REVIEW",
  "TRANSFER_PENDING",
  "TRANSFER_VERIFIED",
  "DISPUTED",
  "COMPLETED",
] as const;

const TERMINAL_STATUSES = ["REJECTED", "CANCELLED", "REFUNDED"] as const;

type PurchaseAction =
  | "VERIFY_PAYMENT"
  | "OWNERSHIP_VERIFIED"
  | "START_TRANSFER"
  | "TRANSFER_VERIFIED"
  | "COMPLETE"
  | "REJECT"
  | "CANCEL"
  | "REFUND"
  | "NOTE";

type PurchaseRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  buyer: { id: string; email: string; name: string };
  seller: { id: string; email: string; name: string };
  price: number;
  status: string;
  paymentTrxId: string | null;
  paymentScreenshotId: string | null;
  paymentSubmittedAt: string | null;
  paymentVerifiedAt: string | null;
  ownershipVerifiedAt: string | null;
  transferVerifiedAt: string | null;
  completedAt: string | null;
  refundedAt: string | null;
  payoutAmount: number | null;
  buyerNote: string | null;
  disputeReason: string | null;
  adminNotes: string | null;
  createdAt: string;
};

const STATUS_ACTIONS: Record<string, PurchaseAction[]> = {
  REQUESTED: ["REJECT", "CANCEL"],
  PAYMENT_PENDING: ["REJECT", "CANCEL"],
  PAYMENT_SUBMITTED: ["VERIFY_PAYMENT", "REJECT", "CANCEL"],
  PAYMENT_VERIFIED: ["OWNERSHIP_VERIFIED", "REFUND"],
  OWNERSHIP_REVIEW: ["START_TRANSFER", "REFUND"],
  TRANSFER_PENDING: ["TRANSFER_VERIFIED", "REFUND"],
  TRANSFER_VERIFIED: ["COMPLETE"],
  DISPUTED: ["START_TRANSFER", "COMPLETE", "REFUND"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  REFUNDED: [],
};

const ACTION_LABELS: Record<PurchaseAction, string> = {
  VERIFY_PAYMENT: "Verify payment",
  OWNERSHIP_VERIFIED: "Ownership verified",
  START_TRANSFER: "Start transfer",
  TRANSFER_VERIFIED: "Transfer verified",
  COMPLETE: "Complete trade",
  REJECT: "Reject",
  CANCEL: "Cancel",
  REFUND: "Refund",
  NOTE: "Add note",
};

export function TransactionsView() {
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("PAYMENT_SUBMITTED");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<{
    purchase: PurchaseRow;
    action: PurchaseAction;
  } | null>(null);
  const [noteTarget, setNoteTarget] = useState<PurchaseRow | null>(null);
  const [noteText, setNoteText] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ purchases: PurchaseRow[] }>("/api/admin/marketplace");
      setPurchases(data.purchases);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions.");
      setPurchases([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: purchases?.length ?? 0 };
    for (const s of PIPELINE_TABS) c[s] = 0;
    for (const s of TERMINAL_STATUSES) c[s] = 0;
    for (const p of purchases ?? []) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [purchases]);

  const filtered = useMemo(
    () => (purchases ?? []).filter((p) => tab === "ALL" || p.status === tab),
    [purchases, tab]
  );

  async function runAction(purchase: PurchaseRow, action: PurchaseAction, note?: string) {
    setBusyId(purchase.id);
    try {
      await apiFetch("/api/admin/marketplace", {
        method: "PATCH",
        json: { purchaseId: purchase.id, action, ...(note ? { note } : {}) },
      });
      toast.success(`${ACTION_LABELS[action]}: applied.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  function onAction(purchase: PurchaseRow, action: PurchaseAction) {
    if (action === "NOTE") {
      setNoteText(purchase.adminNotes ?? "");
      setNoteTarget(purchase);
      return;
    }
    if (action === "COMPLETE" || action === "REFUND") {
      setConfirmTarget({ purchase, action });
      return;
    }
    void runAction(purchase, action);
  }

  const inFlight = useMemo(
    () =>
      (purchases ?? []).filter((p) =>
        [
          "REQUESTED",
          "PAYMENT_PENDING",
          "PAYMENT_SUBMITTED",
          "PAYMENT_VERIFIED",
          "OWNERSHIP_REVIEW",
          "TRANSFER_PENDING",
          "TRANSFER_VERIFIED",
          "DISPUTED",
        ].includes(p.status)
      ).length,
    [purchases]
  );

  const escrow = useMemo(
    () =>
      (purchases ?? [])
        .filter((p) =>
          [
            "PAYMENT_VERIFIED",
            "OWNERSHIP_REVIEW",
            "TRANSFER_PENDING",
            "TRANSFER_VERIFIED",
            "DISPUTED",
          ].includes(p.status)
        )
        .reduce((sum, p) => sum + p.price, 0),
    [purchases]
  );

  return (
    <div>
      <PageHeader
        title="ID transactions"
        description="Marketplace purchase pipeline — verify payments, oversee transfers and release payouts."
      />

      <Alert className="mb-6 border-primary/30 bg-primary/5">
        <ShieldAlert className="h-4 w-4 text-primary" aria-hidden />
        <AlertTitle>Escrow safety rules</AlertTitle>
        <AlertDescription>
          Never release funds without verified payment + confirmed transfer. All actions are
          audit-logged.
        </AlertDescription>
      </Alert>

      <div className="mb-6 flex flex-wrap gap-2" aria-label="Transaction summary">
        <SummaryChip label="In flight" value={inFlight} highlight />
        <SummaryChip label="Held funds" value={formatRs(escrow)} />
        {PIPELINE_TABS.map((s) => (
          <SummaryChip key={s} label={s} value={counts[s] ?? 0} />
        ))}
        {TERMINAL_STATUSES.map((s) => (
          <SummaryChip key={s} label={s} value={counts[s] ?? 0} />
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList className="h-auto flex-wrap">
          {PIPELINE_TABS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s.replaceAll("_", " ")} ({counts[s] ?? 0})
            </TabsTrigger>
          ))}
          <TabsTrigger value="ALL">All ({counts.ALL})</TabsTrigger>
        </TabsList>
      </Tabs>

      {purchases === null ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Could not load transactions" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="No transactions here"
          description={
            tab === "ALL"
              ? "Purchase requests will appear here as buyers submit them."
              : "Nothing in this pipeline stage right now."
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((purchase) => (
            <PurchaseCard
              key={purchase.id}
              purchase={purchase}
              busy={busyId === purchase.id}
              onAction={onAction}
              onScreenshot={setScreenshot}
            />
          ))}
        </div>
      )}

      {/* NOTE dialog */}
      <Dialog
        open={noteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setNoteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Admin note</DialogTitle>
            <DialogDescription>
              Internal note on {noteTarget?.listingTitle}. Never shown to buyers or sellers.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="purchase-note">Note</Label>
            <Textarea
              id="purchase-note"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Internal note..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!noteTarget) return;
                const target = noteTarget;
                setNoteTarget(null);
                void runAction(target, "NOTE", noteText);
              }}
            >
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* COMPLETE / REFUND confirm */}
      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.action === "COMPLETE" ? "Complete trade?" : "Refund buyer?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.action === "COMPLETE" ? (
                <>
                  This marks the trade complete and releases payment to the seller.{" "}
                  {confirmTarget ? (
                    <span className="font-medium text-foreground">
                      {formatRs(confirmTarget.purchase.price)} will be credited to{" "}
                      {confirmTarget.purchase.seller.email}
                    </span>
                  ) : null}
                  . The listing will be marked SOLD. This is a financial action and is audit-logged.
                </>
              ) : (
                <>
                  Refunds are issued manually via EasyPaisa — no wallet credit is made
                  automatically. The buyer will be notified
                  {confirmTarget
                    ? ` for ${formatRs(confirmTarget.purchase.price)} on "${confirmTarget.purchase.listingTitle}"`
                    : null}
                  .
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!confirmTarget) return;
                const { purchase, action } = confirmTarget;
                setConfirmTarget(null);
                void runAction(purchase, action);
              }}
              className={
                confirmTarget?.action === "REFUND"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Screenshot enlarge */}
      <Dialog open={screenshot !== null} onOpenChange={(o) => !o && setScreenshot(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Payment screenshot</DialogTitle>
            <DialogDescription>Submitted by the buyer as payment proof.</DialogDescription>
          </DialogHeader>
          {screenshot && (
             
            <img
              src={screenshot}
              alt="Purchase payment screenshot enlarged"
              className="max-h-[70vh] w-full rounded-md border border-border object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PurchaseCard({
  purchase,
  busy,
  onAction,
  onScreenshot,
}: {
  purchase: PurchaseRow;
  busy: boolean;
  onAction: (purchase: PurchaseRow, action: PurchaseAction) => void;
  onScreenshot: (src: string | null) => void;
}) {
  const actions = STATUS_ACTIONS[purchase.status] ?? [];

  return (
    <Card className="card-raja p-0">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-medium leading-snug">{purchase.listingTitle}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Buyer: {purchase.buyer.email}
            </p>
            <p className="text-xs text-muted-foreground">Seller: {purchase.seller.email}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={purchase.status} />
            <span className="font-display text-lg font-bold text-primary">
              {formatRs(purchase.price)}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          {purchase.paymentTrxId ? (
            <p>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Payment TRX:{" "}
              </span>
              <span className="font-mono text-xs">{purchase.paymentTrxId}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Payment not submitted yet.</p>
          )}
          {purchase.paymentScreenshotId && (
            <button
              type="button"
              onClick={() => onScreenshot(`/api/uploads/${purchase.paymentScreenshotId}`)}
              className="block"
              aria-label="Open purchase payment screenshot"
            >
              { }
              <img
                src={`/api/uploads/${purchase.paymentScreenshotId}`}
                alt="Purchase payment screenshot"
                className="h-16 w-24 rounded border border-border object-cover transition-opacity hover:opacity-80"
              />
            </button>
          )}
          {purchase.buyerNote && (
            <p className="rounded-md border border-border bg-muted/40 p-2 text-xs">
              <span className="font-medium">Buyer note:</span> {purchase.buyerNote}
            </p>
          )}
          {purchase.disputeReason && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              <span className="font-medium">Dispute reason:</span> {purchase.disputeReason}
            </p>
          )}
          {purchase.adminNotes && (
            <p className="rounded-md border border-amber-600/30 bg-amber-600/10 p-2 text-xs text-amber-500">
              <span className="font-medium">Admin notes:</span> {purchase.adminNotes}
            </p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <p>Created: {formatDateTime(purchase.createdAt)}</p>
          <p>Payment verified: {formatDateTime(purchase.paymentVerifiedAt)}</p>
          <p>Ownership checked: {formatDateTime(purchase.ownershipVerifiedAt)}</p>
          <p>Transfer verified: {formatDateTime(purchase.transferVerifiedAt)}</p>
          {purchase.completedAt && <p>Completed: {formatDateTime(purchase.completedAt)}</p>}
          {purchase.refundedAt && <p>Refunded: {formatDateTime(purchase.refundedAt)}</p>}
        </div>

        {purchase.payoutAmount !== null && (
          <Badge
            variant="outline"
            className="mt-3 border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          >
            Payout released: {formatRs(purchase.payoutAmount)}
          </Badge>
        )}

        {actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
            {actions.map((action) => (
              <Button
                key={action}
                size="sm"
                variant={action === "NOTE" ? "ghost" : "outline"}
                disabled={busy}
                className={
                  action === "REJECT" || action === "CANCEL" || action === "REFUND"
                    ? "text-destructive hover:text-destructive"
                    : ""
                }
                onClick={() => onAction(purchase, action)}
              >
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                {ACTION_LABELS[action]}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryChip({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
        highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <span className="text-muted-foreground">{label.replaceAll("_", " ")}</span>
      <span className="font-display font-bold text-primary">{value}</span>
    </div>
  );
}
