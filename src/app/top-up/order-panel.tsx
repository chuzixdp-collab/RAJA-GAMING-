"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Gem,
  Landmark,
  LogIn,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatRs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { ImageUpload } from "@/components/shared/image-upload";

export type PackageDto = {
  id: string;
  title: string;
  diamonds: number;
  price: number;
  badge: string | null;
  description: string | null;
};

export type PaymentSettingsDto = {
  paymentMethod: string;
  accountTitle: string;
  accountNumber: string;
  instructions: string;
  paymentsEnabled: boolean;
};

type OrderDto = {
  id: string;
  orderNumber: string;
  packageTitle: string;
  diamonds: number;
  totalAmount: number;
  status: string;
};

const CARD_HOVER =
  "card-raja card-glow hover:border-primary/45 hover:shadow-[0_12px_40px_-18px_rgba(245,185,11,0.35)]";

export function OrderPanel({
  packages,
  settings,
  isLoggedIn,
}: {
  packages: PackageDto[];
  settings: PaymentSettingsDto;
  isLoggedIn: boolean;
}) {
  const [selected, setSelected] = useState<PackageDto | null>(null);
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // order form
  const [ffUid, setFfUid] = useState("");
  const [ffServer, setFfServer] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [userNote, setUserNote] = useState("");

  // payment form
  const [trxId, setTrxId] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  async function createOrder() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const created = await apiFetch<OrderDto>("/api/orders", {
        method: "POST",
        json: {
          packageId: selected.id,
          ffUid,
          ffServer,
          couponCode,
          userNote,
        },
      });
      setOrder(created);
      toast.success(`Order ${created.orderNumber} created — complete your payment below.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create your order.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment() {
    if (!order || busy) return;
    setBusy(true);
    try {
      const updated = await apiFetch<OrderDto>(`/api/orders/${order.id}/payment`, {
        method: "POST",
        json: { trxId, screenshotUploadId: screenshot ?? "" },
      });
      setOrder(updated);
      setSubmitted(true);
      toast.success("Payment details submitted — our team will verify shortly.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit your payment.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSelected(null);
    setOrder(null);
    setSubmitted(false);
    setFfUid("");
    setFfServer("");
    setCouponCode("");
    setUserNote("");
    setTrxId("");
    setScreenshot(null);
  }

  return (
    <div className="space-y-8">
      {!settings.paymentsEnabled && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Payments temporarily unavailable</AlertTitle>
          <AlertDescription>
            We are not accepting payments right now. Please check back soon or contact support.
          </AlertDescription>
        </Alert>
      )}

      {!isLoggedIn && (
        <Alert className="border-primary/30">
          <LogIn className="h-4 w-4 text-primary" />
          <AlertTitle>Sign in to place an order</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>You need an account to order diamonds — it only takes a minute.</span>
            <Button asChild size="sm" className="shrink-0 font-semibold">
              <Link href="/login?next=%2Ftop-up">Sign In</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Step 1: pick a package */}
      <section aria-labelledby="choose-package">
        <h2 id="choose-package" className="font-display text-lg font-bold tracking-wide">
          1. Choose a Package
        </h2>
        {packages.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border/80 bg-card/40 px-6 py-10 text-center text-sm text-muted-foreground">
            No packages are available right now. Please check back soon.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => {
              const isSelected = selected?.id === pkg.id;
              return (
                <div
                  key={pkg.id}
                  className={cn(
                    CARD_HOVER,
                    "flex flex-col p-5",
                    isSelected && "border-primary/60 shadow-[0_0_0_1px_rgba(245,185,11,0.35)]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Gem className="h-5 w-5" aria-hidden="true" />
                    </div>
                    {pkg.badge ? (
                      <Badge className="badge-outline-gold border bg-transparent text-[11px] font-semibold uppercase tracking-wide">
                        {pkg.badge}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-4 font-display text-3xl font-bold text-gold-gradient">
                    {pkg.diamonds.toLocaleString("en-PK")}
                  </p>
                  <p className="mt-1 text-sm font-medium">{pkg.title}</p>
                  {pkg.description ? (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{pkg.description}</p>
                  ) : null}
                  <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4">
                    <span className="font-display text-lg font-bold">{formatRs(pkg.price)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      className="font-semibold"
                      disabled={!settings.paymentsEnabled || !isLoggedIn}
                      onClick={() => {
                        setSelected(pkg);
                        window.scrollTo({ top: 400, behavior: "smooth" });
                      }}
                    >
                      {isSelected ? "Selected" : "Top Up Now"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Step 2: order details */}
      {selected && !order && (
        <section aria-labelledby="order-details" className="card-raja p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="order-details" className="font-display text-lg font-bold tracking-wide">
              2. Order Details
            </h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
              <ArrowLeft className="h-4 w-4" /> Change
            </Button>
          </div>
          <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
            <span className="font-medium">{selected.title}</span>
            <span className="text-muted-foreground"> — {selected.diamonds.toLocaleString("en-PK")} diamonds for {formatRs(selected.price)}</span>
          </div>
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void createOrder();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="ffUid">Free Fire UID *</Label>
              <Input
                id="ffUid"
                name="ffUid"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 123456789"
                required
                value={ffUid}
                onChange={(e) => setFfUid(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
              />
              <p className="text-xs text-muted-foreground">6–12 digits — find it on your in-game profile.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ffServer">Server (optional)</Label>
              <Input
                id="ffServer"
                name="ffServer"
                placeholder="e.g. Pakistan / India"
                maxLength={30}
                value={ffServer}
                onChange={(e) => setFfServer(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="couponCode">Coupon Code (optional)</Label>
              <Input
                id="couponCode"
                name="couponCode"
                className="uppercase"
                placeholder="RAJA10"
                maxLength={24}
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="userNote">Note for our team (optional)</Label>
              <Textarea
                id="userNote"
                name="userNote"
                rows={3}
                maxLength={300}
                placeholder="Anything we should know about this order?"
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full font-semibold sm:w-auto" disabled={busy || !isLoggedIn || !settings.paymentsEnabled}>
                {busy ? "Creating order…" : `Create Order — ${formatRs(selected.price)}`}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Step 3: payment */}
      {order && !submitted && (
        <section aria-labelledby="payment-section" className="card-raja p-5 sm:p-6">
          <h2 id="payment-section" className="font-display text-lg font-bold tracking-wide">
            3. Complete Your Payment
          </h2>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* order summary */}
            <div className="rounded-lg border border-border bg-card/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Order Number</p>
                <CopyButton value={order.orderNumber} label="order number" />
              </div>
              <p className="mt-1 font-display text-xl font-bold tracking-wide text-primary">{order.orderNumber}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Package</dt>
                  <dd className="font-medium">{order.packageTitle}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Diamonds</dt>
                  <dd className="font-medium">{order.diamonds.toLocaleString("en-PK")}</dd>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2">
                  <dt className="font-medium">Total to Pay</dt>
                  <dd className="font-display text-lg font-bold text-primary">{formatRs(order.totalAmount)}</dd>
                </div>
              </dl>
            </div>

            {/* payment instructions */}
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
              <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-primary">
                <Landmark className="h-4 w-4" aria-hidden="true" /> Pay via {settings.paymentMethod}
              </p>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Account Title</dt>
                  <dd className="font-medium">{settings.accountTitle || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Account Number</dt>
                    <dd className="font-display text-lg font-bold tracking-wide">{settings.accountNumber || "—"}</dd>
                  </div>
                  {settings.accountNumber ? <CopyButton value={settings.accountNumber} label="account number" /> : null}
                </div>
              </dl>
              {settings.instructions ? (
                <p className="mt-3 whitespace-pre-line border-t border-primary/20 pt-3 text-xs leading-relaxed text-muted-foreground">
                  {settings.instructions}
                </p>
              ) : null}
            </div>
          </div>

          <form
            className="mt-6 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPayment();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="trxId">{settings.paymentMethod} Transaction ID *</Label>
              <Input
                id="trxId"
                name="trxId"
                required
                minLength={4}
                maxLength={48}
                autoComplete="off"
                placeholder="Enter the transaction ID from your payment receipt"
                value={trxId}
                onChange={(e) => setTrxId(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Payment Screenshot (optional but recommended)</Label>
              <ImageUpload kind="PAYMENT_PROOF" value={screenshot} onChange={setScreenshot} label="Upload payment screenshot" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit" className="font-semibold" disabled={busy || trxId.trim().length < 4}>
                {busy ? "Submitting…" : "Submit Payment Details"}
              </Button>
              <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
                Cancel Order
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Never share your EasyPaisa PIN with anyone. Our team will only ever ask for the transaction ID.
            </p>
          </form>
        </section>
      )}

      {/* Step 4: submitted */}
      {order && submitted && (
        <section aria-labelledby="submitted" className="card-raja p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <BadgeCheck className="h-7 w-7" aria-hidden="true" />
            </div>
            <h2 id="submitted" className="mt-4 font-display text-xl font-bold tracking-wide">
              Payment Details Submitted
            </h2>
            <div className="mt-2">
              <StatusBadge status={order.status} />
            </div>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              Our team will verify your payment shortly. You can track the progress of order{" "}
              <span className="font-medium text-foreground">{order.orderNumber}</span> from your dashboard.
            </p>
            <div className="mt-3">
              <CopyButton value={order.orderNumber} label="order number" />
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="outline" className="font-semibold">
                <Link href="/dashboard/orders">View My Orders</Link>
              </Button>
              <Button variant="ghost" onClick={reset}>
                <Sparkles className="h-4 w-4" /> Place Another Order
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* trust footer */}
      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
        Every payment is manually verified by the RAJA GAMING team before diamonds are delivered.
      </p>
    </div>
  );
}
