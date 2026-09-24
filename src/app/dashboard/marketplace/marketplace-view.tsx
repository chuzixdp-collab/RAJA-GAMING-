"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, Loader2, Plus, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDateTime, formatRs } from "@/lib/format";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/status-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { ImageUpload } from "@/components/shared/image-upload";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type ListingImageDTO = { id: string; uploadId: string; sortOrder: number };

type ListingMine = {
  id: string;
  title: string;
  ffUid: string;
  description: string;
  level: number | null;
  price: number;
  verificationNote: string | null;
  status: string;
  adminNotes: string | null;
  soldAt: string | null;
  createdAt: string;
  images: ListingImageDTO[];
};

type ListingCredentials = {
  accountEmail: string | null;
  accountPassword: string | null;
  recoveryEmail: string | null;
  recoveryPassword: string | null;
  extra: string | null;
};

type PurchaseMine = {
  id: string;
  listingId: string;
  listingTitle: string;
  price: number;
  status: string;
  paymentTrxId: string | null;
  paymentSubmittedAt: string | null;
  disputeReason: string | null;
  buyerNote: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  listing: { title: string; status: string };
};

type SaleMine = {
  id: string;
  listingId: string;
  listingTitle: string;
  price: number;
  status: string;
  payoutAmount: number | null;
  completedAt: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  listing: { title: string };
};

type MyData = { listings: ListingMine[]; purchases: PurchaseMine[]; sales: SaleMine[] };

const PURCHASE_STATUS_TEXT: Record<string, string> = {
  REQUESTED: "Request sent — waiting for admin review.",
  PAYMENT_PENDING: "Send the payment and submit the transaction ID below.",
  PAYMENT_SUBMITTED: "Payment submitted — an admin is verifying it.",
  PAYMENT_VERIFIED: "Payment verified — account ownership is being checked.",
  OWNERSHIP_REVIEW: "Admin is verifying account ownership.",
  TRANSFER_PENDING: "Account transfer in progress.",
  TRANSFER_VERIFIED: "Transfer verified — your ID credentials are unlocked below.",
  COMPLETED: "Trade completed — the account is yours. Credentials are unlocked below.",
  REJECTED: "This request was rejected by admins.",
  CANCELLED: "This transaction was cancelled.",
  DISPUTED: "A dispute was opened — admins are reviewing.",
  REFUNDED: "Your payment was refunded.",
};

const SALE_STATUS_TEXT: Record<string, string> = {
  REQUESTED: "Buyer requested this account — waiting for admin to contact you.",
  PAYMENT_PENDING: "Awaiting buyer payment.",
  PAYMENT_SUBMITTED: "Buyer submitted payment — an admin is verifying it.",
  PAYMENT_VERIFIED: "Payment verified — the account is being checked.",
  OWNERSHIP_REVIEW: "Admin is verifying account ownership.",
  TRANSFER_PENDING: "Account transfer in progress.",
  TRANSFER_VERIFIED: "Transfer verified — completing the trade.",
  COMPLETED: "Trade completed. Seller payout credited to your wallet.",
  REJECTED: "The buyer request was rejected.",
  CANCELLED: "This transaction was cancelled.",
  DISPUTED: "A dispute was opened — admins are reviewing.",
  REFUNDED: "The buyer was refunded.",
};

export function MarketplaceView() {
  const [data, setData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sellOpen, setSellOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<MyData>("/api/marketplace/my");
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load your marketplace activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Marketplace"
        description="Sell your Free Fire ID and track purchases and sales."
        actions={
          <Button onClick={() => setSellOpen(true)} className="font-display tracking-wide">
            <Plus className="h-4 w-4" aria-hidden="true" /> Sell an ID
          </Button>
        }
      />

      <Alert>
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Admin-controlled process</AlertTitle>
        <AlertDescription>
          Every marketplace trade is handled end-to-end by RAJA GAMING admins to protect both sides.
          Payments are verified, credentials are transferred by admins, and payouts are credited to
          your wallet after completion.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="listings">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="listings" className="text-xs sm:text-sm">
              My Listings{data ? ` (${data.listings.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="purchases" className="text-xs sm:text-sm">
              Purchases{data ? ` (${data.purchases.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="sales" className="text-xs sm:text-sm">
              Sales{data ? ` (${data.sales.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="listings" className="mt-4">
            {!data || data.listings.length === 0 ? (
              <EmptyState
                icon={<Store />}
                title="No listings yet"
                description="Sell your Free Fire ID through our admin-verified marketplace."
                action={
                  <Button size="sm" onClick={() => setSellOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Sell an ID
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {data.listings.map((l) => (
                  <li key={l.id} className="card-raja p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/marketplace/${l.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {l.title}
                        </Link>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          UID {l.ffUid}
                          {l.level ? ` · Level ${l.level}` : ""} · {l.images.length} screenshot
                          {l.images.length === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 line-clamp-2 max-w-prose text-xs text-muted-foreground">
                          {l.description}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-display font-bold text-primary">{formatRs(l.price)}</span>
                        <StatusBadge status={l.status} />
                      </div>
                    </div>
                    {l.status === "SOLD" && l.soldAt && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Sold on {formatDateTime(l.soldAt)}
                      </p>
                    )}
                    {(l.status === "REJECTED" ||
                      l.status === "SUSPENDED" ||
                      l.status === "DUPLICATE_REVIEW") &&
                      l.adminNotes && (
                        <Alert className="mt-3 border-amber-600/40 bg-amber-600/10">
                          <AlertTitle>Admin note</AlertTitle>
                          <AlertDescription className="text-amber-500">{l.adminNotes}</AlertDescription>
                        </Alert>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="purchases" className="mt-4">
            {!data || data.purchases.length === 0 ? (
              <EmptyState
                icon={<Store />}
                title="No purchases yet"
                description="Browse verified Free Fire accounts and request one to buy."
                action={
                  <Button asChild size="sm">
                    <Link href="/marketplace">Browse marketplace</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {data.purchases.map((p) => (
                  <PurchaseCard key={p.id} purchase={p} onChanged={() => void load()} />
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="sales" className="mt-4">
            {!data || data.sales.length === 0 ? (
              <EmptyState
                icon={<Store />}
                title="No sales yet"
                description="When buyers request your listings, the trades appear here."
                action={
                  <Button size="sm" onClick={() => setSellOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Sell an ID
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {data.sales.map((s) => (
                  <li key={s.id} className="card-raja space-y-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{s.listingTitle}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Requested {formatDateTime(s.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-display font-bold text-primary">{formatRs(s.price)}</span>
                        <StatusBadge status={s.status} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {SALE_STATUS_TEXT[s.status] ?? "Status updates appear here."}
                    </p>
                    {s.status === "COMPLETED" && (
                      <p className="text-xs font-medium text-emerald-400">
                        Seller payout{s.payoutAmount ? ` (${formatRs(s.payoutAmount)})` : ""} credited to
                        your wallet.
                      </p>
                    )}
                    {s.adminNotes && (
                      <p className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                        Admin note: {s.adminNotes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}

      <SellDialog open={sellOpen} onOpenChange={setSellOpen} onCreated={() => void load()} />
    </div>
  );
}

function PurchaseCard({ purchase: p, onChanged }: { purchase: PurchaseMine; onChanged: () => void }) {
  const [trxId, setTrxId] = useState("");
  const [screenshotId, setScreenshotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const [creds, setCreds] = useState<ListingCredentials | null>(null);
  const [credsBusy, setCredsBusy] = useState(false);
  const canPay = p.status === "REQUESTED" || p.status === "PAYMENT_PENDING";
  // Credentials unlock once the team has verified the account transfer.
  const credsUnlocked = p.status === "TRANSFER_VERIFIED" || p.status === "COMPLETED";

  async function openCredentials() {
    if (credsBusy) return;
    setCredsOpen(true);
    setCredsBusy(true);
    try {
      const d = await apiFetch<{ credentials: ListingCredentials }>(
        `/api/purchases/${p.id}/credentials`
      );
      setCreds(d.credentials);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load credentials.");
      setCredsOpen(false);
    } finally {
      setCredsBusy(false);
    }
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (trxId.trim().length < 4) {
      toast.error("Enter the EasyPaisa transaction ID (at least 4 characters).");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/marketplace/${p.listingId}/payment`, {
        method: "POST",
        json: { trxId: trxId.trim(), screenshotUploadId: screenshotId ?? "" },
      });
      toast.success("Payment submitted — admins will verify it.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit payment.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPurchase() {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/purchases/${p.id}/cancel`, { method: "POST" });
      toast.success("Purchase cancelled.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel the purchase.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card-raja space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/marketplace/${p.listingId}`} className="font-medium hover:text-primary">
            {p.listingTitle}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Requested {formatDateTime(p.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-display font-bold text-primary">{formatRs(p.price)}</span>
          <StatusBadge status={p.status} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {PURCHASE_STATUS_TEXT[p.status] ?? "Status updates appear here."}
      </p>

      {p.paymentTrxId && (
        <p className="text-xs text-muted-foreground">
          Transaction ID: <span className="font-mono text-foreground">{p.paymentTrxId}</span>
          {p.paymentSubmittedAt ? ` · submitted ${formatDateTime(p.paymentSubmittedAt)}` : ""}
        </p>
      )}

      {p.status === "DISPUTED" && p.disputeReason && (
        <Alert className="border-destructive/40 bg-destructive/10">
          <AlertTitle>Dispute opened</AlertTitle>
          <AlertDescription className="text-destructive">{p.disputeReason}</AlertDescription>
        </Alert>
      )}

      {p.adminNotes && (
        <p className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          Admin note: {p.adminNotes}
        </p>
      )}

      {credsUnlocked && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
          <p className="font-display flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden /> ID delivered — Gmail &amp; password
            unlocked
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The team verified this transfer. Open the secure vault to view the account credentials.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3 font-display tracking-wide"
            onClick={() => void openCredentials()}
          >
            <KeyRound className="mr-2 h-4 w-4" aria-hidden /> View Gmail &amp; Password
          </Button>
        </div>
      )}

      {canPay && (
        <form onSubmit={submitPayment} className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="font-display text-sm font-semibold">Submit EasyPaisa payment</p>
          <p className="text-xs text-muted-foreground">
            Send {formatRs(p.price)} to the EasyPaisa account shown on the listing page, then enter the
            transaction ID below.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`purchase-trx-${p.id}`}>EasyPaisa Transaction ID</Label>
            <Input
              id={`purchase-trx-${p.id}`}
              value={trxId}
              onChange={(e) => setTrxId(e.target.value)}
              placeholder="e.g. 4021337"
              maxLength={48}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`purchase-proof-${p.id}`}>Payment screenshot (optional)</Label>
            <ImageUpload
              kind="PAYMENT_PROOF"
              value={screenshotId}
              onChange={setScreenshotId}
              label="Upload payment screenshot"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="flex-1 font-display tracking-wide" disabled={busy}>
              {busy ? "Submitting…" : "Submit payment"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 font-display tracking-wide"
              onClick={() => void cancelPurchase()}
              disabled={busy}
            >
              Cancel request
            </Button>
          </div>
        </form>
      )}

      <Dialog open={credsOpen} onOpenChange={setCredsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Secure credential vault</DialogTitle>
            <DialogDescription>
              {p.listingTitle} — delivered to you by the RAJA GAMING team.
            </DialogDescription>
          </DialogHeader>
          {credsBusy ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
            </div>
          ) : creds ? (
            <div className="space-y-3">
              {([
                ["Account Gmail", creds.accountEmail],
                ["Account Password", creds.accountPassword],
                ["Recovery Gmail", creds.recoveryEmail],
                ["Recovery Password", creds.recoveryPassword],
              ] as const)
                .filter(([, value]) => value !== null)
                .map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {label}
                      </p>
                      <p className="truncate font-mono text-sm text-foreground">{value}</p>
                    </div>
                    <CopyButton value={value} label={label} />
                  </div>
                ))}
              {creds.extra && (
                <p className="rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                  <span className="font-medium">Extra note:</span> {creds.extra}
                </p>
              )}
              <Alert className="border-amber-600/40 bg-amber-600/10">
                <AlertTitle>Keep this ID safe</AlertTitle>
                <AlertDescription>
                  Change the account password immediately and never share these details. RAJA
                  GAMING staff will never ask for them again.
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </li>
  );
}

function SellDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [ffUid, setFfUid] = useState("");
  const [level, setLevel] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [verificationNote, setVerificationNote] = useState("");
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [credsOpen, setCredsOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);

  function handleScreenshotChange(i: number, id: string | null) {
    setScreenshots((prev) => {
      const next = [...prev];
      if (id === null) {
        next.splice(i, 1);
      } else if (i < next.length) {
        next[i] = id;
      } else {
        next.push(id);
      }
      return next;
    });
  }

  // Show one empty upload slot while under the 6-screenshot limit.
  const slotCount = Math.min(screenshots.length + (screenshots.length < 6 ? 1 : 0), 6);

  function reset() {
    setTitle("");
    setFfUid("");
    setLevel("");
    setPrice("");
    setDescription("");
    setVerificationNote("");
    setScreenshots([]);
    setCredsOpen(false);
    setAccountEmail("");
    setAccountPassword("");
    setRecoveryEmail("");
    setRecoveryPassword("");
    setExtra("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const priceNum = Number(price);
    const levelNum = level.trim() === "" ? undefined : Number(level);
    if (title.trim().length < 6) {
      toast.error("Title must be at least 6 characters.");
      return;
    }
    if (!/^[0-9]{6,12}$/.test(ffUid.trim())) {
      toast.error("Free Fire UID must be 6-12 digits.");
      return;
    }
    if (description.trim().length < 20) {
      toast.error("Please describe the account (min 20 characters).");
      return;
    }
    if (!Number.isInteger(priceNum) || priceNum < 1) {
      toast.error("Enter a valid price in whole rupees.");
      return;
    }
    if (levelNum !== undefined && (!Number.isInteger(levelNum) || levelNum < 1 || levelNum > 100)) {
      toast.error("Level must be between 1 and 100.");
      return;
    }
    const hasCreds = [accountEmail, accountPassword, recoveryEmail, recoveryPassword, extra].some(
      (v) => v.trim().length > 0
    );
    setBusy(true);
    try {
      await apiFetch("/api/marketplace/sell", {
        method: "POST",
        json: {
          title: title.trim(),
          ffUid: ffUid.trim(),
          description: description.trim(),
          ...(levelNum !== undefined ? { level: levelNum } : {}),
          price: priceNum,
          verificationNote: verificationNote.trim(),
          screenshotUploadIds: screenshots,
          ...(hasCreds
            ? {
                sensitiveData: {
                  accountEmail: accountEmail.trim(),
                  accountPassword: accountPassword.trim(),
                  recoveryEmail: recoveryEmail.trim(),
                  recoveryPassword: recoveryPassword.trim(),
                  extra: extra.trim(),
                },
              }
            : {}),
        },
      });
      toast.success("Listing submitted — admins will review it shortly.");
      reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create the listing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display">Sell an ID</DialogTitle>
          <DialogDescription>
            List your Free Fire account. Admins review every listing before it goes public.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sell-title">Listing title</Label>
            <Input
              id="sell-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Level 65 account with 3 evo guns"
              maxLength={100}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="sell-ffuid">Free Fire UID</Label>
              <Input
                id="sell-ffuid"
                value={ffUid}
                onChange={(e) => setFfUid(e.target.value)}
                placeholder="6-12 digits"
                inputMode="numeric"
                maxLength={12}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sell-level">Level (optional)</Label>
              <Input
                id="sell-level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="e.g. 65"
                inputMode="numeric"
                maxLength={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sell-price">Price (Rs)</Label>
              <Input
                id="sell-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 5000"
                inputMode="numeric"
                maxLength={8}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sell-description">Description</Label>
            <Textarea
              id="sell-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the account: characters, skins, weapons, achievements…"
              rows={4}
              maxLength={3000}
              required
            />
            <p className="text-xs text-muted-foreground">{description.trim().length}/20 characters minimum</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sell-verification">Verification note (optional)</Label>
            <Input
              id="sell-verification"
              value={verificationNote}
              onChange={(e) => setVerificationNote(e.target.value)}
              placeholder="e.g. Bound email can be changed, first owner"
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label>Screenshots (up to 6)</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: slotCount }).map((_, i) => (
                <ImageUpload
                  key={screenshots[i] ?? `empty-${i}`}
                  kind="LISTING_SCREENSHOT"
                  value={screenshots[i] ?? null}
                  onChange={(id) => handleScreenshotChange(i, id)}
                  label={i === 0 ? "Upload account screenshot" : `Add screenshot ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <Collapsible open={credsOpen} onOpenChange={setCredsOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-between">
                Account credentials for admin transfer (optional)
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${credsOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Encrypted and only visible to admins, deleted after transfer. Never share credentials
                publicly.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sell-account-email">Account email</Label>
                  <Input
                    id="sell-account-email"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                    maxLength={120}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sell-account-password">Account password</Label>
                  <Input
                    id="sell-account-password"
                    type="password"
                    value={accountPassword}
                    onChange={(e) => setAccountPassword(e.target.value)}
                    maxLength={120}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sell-recovery-email">Recovery email</Label>
                  <Input
                    id="sell-recovery-email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    maxLength={120}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sell-recovery-password">Recovery email password</Label>
                  <Input
                    id="sell-recovery-password"
                    type="password"
                    value={recoveryPassword}
                    onChange={(e) => setRecoveryPassword(e.target.value)}
                    maxLength={120}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sell-extra">Extra details (optional)</Label>
                <Textarea
                  id="sell-extra"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Anything else the admin needs for the transfer"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Button type="submit" className="w-full font-display tracking-wide" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? "Submitting…" : "Submit listing for review"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
