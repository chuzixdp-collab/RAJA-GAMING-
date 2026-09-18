"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  KeyRound,
  Landmark,
  LogIn,
  ReceiptText,
  RefreshCw,
  Trophy,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatRs } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, EmptyState } from "@/components/shared/status-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { ImageUpload } from "@/components/shared/image-upload";

type RegistrationDto = {
  status: string;
  inGameName: string;
  slotNumber: number | null;
  paymentSubmittedAt: string | null;
};

type RegistrationApiResponse = {
  id: string;
  status: string;
  inGameName: string;
  slotNumber: number | null;
  paymentSubmittedAt: string | null;
};

const CARD_HOVER =
  "card-raja card-glow hover:border-primary/45 hover:shadow-[0_12px_40px_-18px_rgba(245,185,11,0.35)]";

export function RegisterPanel({
  tournamentId,
  tournamentStatus,
  entryFee,
  slots,
  filled,
  isLoggedIn,
  initialRegistration,
  room,
  registrationPaymentNote,
  payment,
}: {
  tournamentId: string;
  tournamentStatus: string;
  entryFee: number;
  slots: number;
  filled: number;
  isLoggedIn: boolean;
  initialRegistration: RegistrationDto | null;
  room: { code: string; password: string } | null;
  registrationPaymentNote: string;
  payment: { method: string; accountTitle: string; accountNumber: string; instructions: string };
}) {
  const router = useRouter();
  const [registration, setRegistration] = useState<RegistrationDto | null>(initialRegistration);

  const [inGameName, setInGameName] = useState("");
  const [ffUid, setFfUid] = useState("");
  const [trxId, setTrxId] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const registrationOpen = tournamentStatus === "OPEN" || tournamentStatus === "UPCOMING";
  const status = registration?.status ?? null;

  async function register() {
    if (busy) return;
    setBusy(true);
    try {
      const created = await apiFetch<RegistrationApiResponse>(`/api/tournaments/${tournamentId}/register`, {
        method: "POST",
        json: { inGameName, ffUid },
      });
      setRegistration({
        status: created.status,
        inGameName: created.inGameName,
        slotNumber: created.slotNumber,
        paymentSubmittedAt: created.paymentSubmittedAt,
      });
      toast.success(
        entryFee > 0
          ? "Registered — complete your entry payment below."
          : "You are registered for this tournament."
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not register for this tournament.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment() {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await apiFetch<RegistrationApiResponse>(`/api/tournaments/${tournamentId}/payment`, {
        method: "POST",
        json: { trxId, screenshotUploadId: screenshot ?? "" },
      });
      setRegistration((prev) => (prev ? { ...prev, status: updated.status, paymentSubmittedAt: updated.paymentSubmittedAt } : prev));
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
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
          <Trophy className="h-5 w-5 text-primary" aria-hidden="true" /> Join This Tournament
        </h2>
        <Alert className="mt-4 border-primary/30">
          <LogIn className="h-4 w-4 text-primary" />
          <AlertTitle>Sign in to register</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>You need an account to join tournaments.</span>
            <Button asChild size="sm" className="shrink-0 font-semibold">
              <Link href={`/login?next=${encodeURIComponent(`/tournaments/${tournamentId}`)}`}>Sign In</Link>
            </Button>
          </AlertDescription>
        </Alert>
        <p className="mt-4 text-sm text-muted-foreground">
          Entry fee: <span className="font-semibold text-foreground">{entryFee > 0 ? formatRs(entryFee) : "FREE"}</span> •{" "}
          {filled}/{slots} slots filled
        </p>
      </div>
    );
  }

  /* ---------- registered: status, room, payment ---------- */
  if (registration) {
    return (
      <div className={`${CARD_HOVER} p-6`}>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
          <UserCheck className="h-5 w-5 text-primary" aria-hidden="true" /> Your Registration
        </h2>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge status={registration.status} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">In-game name</span>
            <span className="font-medium">{registration.inGameName}</span>
          </div>
          {registration.slotNumber ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Slot</span>
              <span className="font-medium">#{registration.slotNumber}</span>
            </div>
          ) : null}
        </div>

        {/* Room credentials — only rendered when the server confirmed access */}
        {room && (
          <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-primary">
              <KeyRound className="h-4 w-4" aria-hidden="true" /> Room Credentials
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Room Code</p>
                  <p className="font-display text-base font-bold tracking-wide">{room.code}</p>
                </div>
                <CopyButton value={room.code} label="room code" />
              </div>
              {room.password ? (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Room Password</p>
                    <p className="font-display text-base font-bold tracking-wide">{room.password}</p>
                  </div>
                  <CopyButton value={room.password} label="room password" />
                </div>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Share these details only with your teammates. Leaking room info leads to disqualification.
            </p>
          </div>
        )}

        {status === "PENDING_PAYMENT" && (
          <form
            className="mt-5 grid gap-4 border-t border-border/60 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPayment();
            }}
          >
            <p className="text-sm">
              Entry fee: <span className="font-display font-bold text-primary">{formatRs(entryFee)}</span> — pay via{" "}
              {payment.method} to <span className="font-medium">{payment.accountTitle}</span>{" "}
              {payment.accountNumber ? <span className="font-display font-semibold">({payment.accountNumber})</span> : null}
            </p>
            {registrationPaymentNote ? (
              <p className="whitespace-pre-line rounded-lg border border-border bg-card/60 p-3 text-xs leading-relaxed text-muted-foreground">
                {registrationPaymentNote}
              </p>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="t-trxId">{payment.method} Transaction ID *</Label>
              <Input
                id="t-trxId"
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
              {busy ? "Submitting…" : "Submit Entry Payment"}
            </Button>
          </form>
        )}

        {status === "PAYMENT_SUBMITTED" && (
          <Alert className="mt-5">
            <ReceiptText className="h-4 w-4" />
            <AlertTitle>Payment submitted</AlertTitle>
            <AlertDescription>
              Our team will verify your entry payment shortly. Room credentials appear here once you are approved.
            </AlertDescription>
          </Alert>
        )}

        {status === "APPROVED" && !room && (
          <Alert className="mt-5">
            <BadgeCheck className="h-4 w-4" />
            <AlertTitle>You are confirmed</AlertTitle>
            <AlertDescription>
              Room credentials will be shared here before the match starts. Keep an eye on your notifications.
            </AlertDescription>
          </Alert>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-4 text-muted-foreground"
          onClick={() => router.refresh()}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh status
        </Button>
      </div>
    );
  }

  /* ---------- not registered ---------- */
  if (!registrationOpen) {
    return (
      <EmptyState
        icon={<Trophy />}
        title={tournamentStatus === "FULL" ? "Tournament is full" : "Registration is closed"}
        description={
          tournamentStatus === "FULL"
            ? "All slots have been taken. Follow us so you do not miss the next match."
            : "This tournament is no longer accepting registrations."
        }
      />
    );
  }

  return (
    <div className={`${CARD_HOVER} p-6`}>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
        <Trophy className="h-5 w-5 text-primary" aria-hidden="true" /> Register Now
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Entry fee:{" "}
        <span className="font-display font-bold text-primary">{entryFee > 0 ? formatRs(entryFee) : "FREE"}</span> •{" "}
        {filled}/{slots} slots filled
      </p>
      <form
        className="mt-5 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void register();
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="inGameName">In-game Name *</Label>
          <Input
            id="inGameName"
            required
            minLength={2}
            maxLength={30}
            placeholder="Your exact in-game name"
            value={inGameName}
            onChange={(e) => setInGameName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="t-ffUid">Free Fire UID *</Label>
          <Input
            id="t-ffUid"
            required
            inputMode="numeric"
            autoComplete="off"
            placeholder="6–12 digits"
            value={ffUid}
            onChange={(e) => setFfUid(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
          />
        </div>
        {entryFee > 0 && (
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Landmark className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> How payment works
            </span>
            <p className="mt-1">
              After registering, send {formatRs(entryFee)} via {payment.method} and submit your transaction ID here.
              {registrationPaymentNote ? ` ${registrationPaymentNote}` : ""}
            </p>
          </div>
        )}
        <Button type="submit" className="font-semibold" disabled={busy}>
          {busy ? "Registering…" : entryFee > 0 ? "Register & Pay Entry Fee" : "Register for Free"}
        </Button>
      </form>
    </div>
  );
}
