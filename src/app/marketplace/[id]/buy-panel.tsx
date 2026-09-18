"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Landmark,
  LogIn,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatRs } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { ImageUpload } from "@/components/shared/image-upload";

type MyPurchase = {
  id: string;
  status: string;
  createdAt: string;
} | null;

type PurchaseApiResponse = {
  id: string;
  status: string;
};

const STATUS_TEXT: Record<string, string> = {
  REQUESTED:
    "Your purchase request has been sent. Pay via EasyPaisa and submit your transaction ID below to proceed.",
  PAYMENT_PENDING:
    "Pay via EasyPaisa and submit your transaction ID below to proceed with the purchase.",
  PAYMENT_SUBMITTED:
    "Payment submitted — the admin will verify your payment and coordinate the transfer.",
  PAYMENT_VERIFIED:
    "Your payment has been verified. Admins are now reviewing the account ownership.",
  OWNERSHIP_REVIEW: "Admins are verifying the account ownership with the seller.",
  TRANSFER_PENDING:
    "Ownership verified — the account transfer is in progress under admin supervision.",
  TRANSFER_VERIFIED: "The transfer has been verified. Your purchase is being finalized.",
  COMPLETED: "Purchase completed — the account is now yours. Enjoy your new ID!",
  DISPUTED: "A dispute is open on this purchase. Our team will contact you shortly.",
};

const CARD_HOVER =
  "card-raja card-glow hover:border-primary/45 hover:shadow-[0_12px_40px_-18px_rgba(245,185,11,0.35)]";

type PaymentInfo = {
  method: string;
  accountTitle: string;
  accountNumber: string;
  instructions: string;
};

export function BuyPanel({
  listingId,
  price,
  isLoggedIn,
  marketplaceEnabled,
  myPurchase,
  payment,
}: {
  listingId: string;
  price: number;
  isLoggedIn: boolean;
  marketplaceEnabled: boolean;
  myPurchase: MyPurchase;
  payment: PaymentInfo;
}) {
  const [purchase, setPurchase] = useState<MyPurchase>(myPurchase);
  const [buyerNote, setBuyerNote] = useState("");
  const [trxId, setTrxId] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestToBuy() {
    if (busy) return;
    setBusy(true);
    try {
      const created = await apiFetch<PurchaseApiResponse>(`/api/marketplace/${listingId}/purchase`, {
        method: "POST",
        json: { buyerNote },
      });
      setPurchase({ id: created.id, status: created.status, createdAt: new Date().toISOString() });
      toast.success("Request sent — complete your payment below.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send your purchase request.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment() {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await apiFetch<PurchaseApiResponse>(`/api/marketplace/${listingId}/payment`, {
        method: "POST",
        json: { trxId, screenshotUploadId: screenshot ?? "" },
      });
      setPurchase((prev) => (prev ? { ...prev, status: updated.status } : prev));
      setScreenshot(null);
      toast.success("Payment details submitted — our team will verify shortly.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit your payment.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- anonymous ---------- */
  if (!isLoggedIn) {
    return (
      <div className={`${CARD_HOVER} p-6`}>
        <Alert className="border-primary/30">
          <LogIn className="h-4 w-4 text-primary" />
          <AlertTitle>Sign in to buy this ID</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>You need an account to request a purchase.</span>
            <Button asChild size="sm" className="shrink-0 font-semibold">
              <Link href={`/login?next=${encodeURIComponent(`/marketplace/${listingId}`)}`}>Sign In</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  /* ---------- existing purchase: status timeline ---------- */
  if (purchase) {
    const canSubmitPayment = purchase.status === "REQUESTED" || purchase.status === "PAYMENT_PENDING";
    return (
      <div className={`${CARD_HOVER} p-6`}>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
          <ShoppingCart className="h-5 w-5 text-primary" aria-hidden="true" /> Your Purchase
        </h2>
        <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 p-3">
          <span className="text-sm text-muted-foreground">Status</span>
          <StatusBadge status={purchase.status} />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {STATUS_TEXT[purchase.status] ?? "Our team is processing your purchase."}
        </p>
        {canSubmitPayment && marketplaceEnabled && (
          <PaymentForm
            payment={payment}
            price={price}
            trxId={trxId}
            setTrxId={setTrxId}
            screenshot={screenshot}
            setScreenshot={setScreenshot}
            busy={busy}
            onSubmit={submitPayment}
          />
        )}
      </div>
    );
  }

  /* ---------- fresh request ---------- */
  return (
    <div className={`${CARD_HOVER} p-6`}>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
        <ShoppingCart className="h-5 w-5 text-primary" aria-hidden="true" /> Buy This ID
      </h2>

      {!marketplaceEnabled && (
        <Alert className="mt-4">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Purchases temporarily paused</AlertTitle>
          <AlertDescription>
            Marketplace transactions are disabled right now. Please check back soon.
          </AlertDescription>
        </Alert>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Request to buy for{" "}
        <span className="font-display text-base font-bold text-primary">{formatRs(price)}</span>. The seller and our
        admin team will be notified, and the transfer will be supervised end to end.
      </p>
      <div className="mt-4 grid gap-2">
        <Label htmlFor="buyerNote">Note to the seller (optional)</Label>
        <Textarea
          id="buyerNote"
          rows={3}
          maxLength={300}
          placeholder="e.g. When can you transfer the account?"
          value={buyerNote}
          onChange={(e) => setBuyerNote(e.target.value)}
        />
      </div>
      <Button
        type="button"
        className="mt-4 w-full font-semibold sm:w-auto"
        disabled={busy || !marketplaceEnabled}
        onClick={() => void requestToBuy()}
      >
        {busy ? "Sending request…" : "Request to Buy"}
      </Button>
    </div>
  );
}

function PaymentForm({
  payment,
  price,
  trxId,
  setTrxId,
  screenshot,
  setScreenshot,
  busy,
  onSubmit,
}: {
  payment: PaymentInfo;
  price: number;
  trxId: string;
  setTrxId: (v: string) => void;
  screenshot: string | null;
  setScreenshot: (v: string | null) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      className="mt-5 grid gap-4 border-t border-border/60 pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
        <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-primary">
          <Landmark className="h-4 w-4" aria-hidden="true" /> Pay {formatRs(price)} via {payment.method}
        </p>
        <div className="mt-3 space-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Account Title</p>
            <p className="font-medium">{payment.accountTitle || "—"}</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Account Number</p>
              <p className="font-display text-base font-bold tracking-wide">{payment.accountNumber || "—"}</p>
            </div>
            {payment.accountNumber ? <CopyButton value={payment.accountNumber} label="account number" /> : null}
          </div>
        </div>
        {payment.instructions ? (
          <p className="mt-3 whitespace-pre-line border-t border-primary/20 pt-3 text-xs leading-relaxed text-muted-foreground">
            {payment.instructions}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="m-trxId">{payment.method} Transaction ID *</Label>
        <Input
          id="m-trxId"
          required
          minLength={4}
          maxLength={48}
          autoComplete="off"
          placeholder="Enter your transaction ID"
          value={trxId}
          onChange={(e) => setTrxId(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label>Payment Screenshot (optional)</Label>
        <ImageUpload kind="PAYMENT_PROOF" value={screenshot} onChange={setScreenshot} label="Upload payment screenshot" />
      </div>
      <Button type="submit" className="font-semibold" disabled={busy || trxId.trim().length < 4}>
        {busy ? "Submitting…" : "Submit Payment Details"}
      </Button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
        Funds are held safely — the seller is only paid after you confirm ownership of the account.
      </p>
    </form>
  );
}
