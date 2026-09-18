"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Trophy } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDateTime, formatRs } from "@/lib/format";
import { CopyButton } from "@/components/shared/copy-button";
import { EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { ImageUpload } from "@/components/shared/image-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MyRegistrationDTO = {
  id: string;
  tournamentId: string;
  status: string;
  inGameName: string;
  ffUid: string;
  slotNumber: number | null;
  position: number | null;
  kills: number | null;
  rewardClaimed: boolean;
  adminNotes: string | null;
  createdAt: string;
  tournament: {
    id: string;
    title: string;
    status: string;
    mode: string;
    map: string;
    entryFee: number;
    startsAt: string;
    roomCode: string | null;
    roomPassword: string | null;
    roomReleased: boolean;
  };
};

export function MyTournaments({ registrations }: { registrations: MyRegistrationDTO[] }) {
  if (registrations.length === 0) {
    return (
      <EmptyState
        icon={<Trophy />}
        title="No tournament registrations"
        description="Join a tournament to compete for prizes and glory."
        action={
          <Button asChild size="sm">
            <Link href="/tournaments">Browse tournaments</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="space-y-4">
      {registrations.map((r) => (
        <RegistrationCard key={r.id} reg={r} />
      ))}
    </ul>
  );
}

function RegistrationCard({ reg }: { reg: MyRegistrationDTO }) {
  const hasResults = reg.position !== null || reg.kills !== null || reg.rewardClaimed;
  const showRoom =
    reg.status === "APPROVED" && reg.tournament.roomReleased && !!reg.tournament.roomCode;

  return (
    <li className="card-raja space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/tournaments/${reg.tournamentId}`}
            className="font-display text-lg font-semibold tracking-wide hover:text-primary"
          >
            {reg.tournament.title}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-medium">
              {reg.tournament.mode}
            </Badge>
            <Badge variant="outline" className="font-medium">
              {reg.tournament.map}
            </Badge>
            <span>Starts {formatDateTime(reg.tournament.startsAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={reg.tournament.status} />
          <StatusBadge status={reg.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted-foreground">In-game name: </span>
          <span className="font-medium">{reg.inGameName}</span>
        </p>
        <p>
          <span className="text-muted-foreground">FF UID: </span>
          <span className="font-mono text-xs">{reg.ffUid}</span>
        </p>
        {reg.slotNumber !== null && (
          <p>
            <span className="text-muted-foreground">Slot: </span>
            <span className="font-medium">#{reg.slotNumber}</span>
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Entry fee: </span>
          <span className="font-medium">
            {reg.tournament.entryFee > 0 ? formatRs(reg.tournament.entryFee) : "Free"}
          </span>
        </p>
      </div>

      {hasResults && (
        <div className="flex flex-wrap items-center gap-2">
          {reg.position !== null && (
            <Badge variant="outline" className="border-amber-600/40 bg-amber-600/10 text-amber-500">
              Position #{reg.position}
            </Badge>
          )}
          {reg.kills !== null && (
            <Badge variant="outline" className="font-medium">
              {reg.kills} kills
            </Badge>
          )}
          {reg.rewardClaimed && (
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
              Reward claimed
            </Badge>
          )}
        </div>
      )}

      {reg.adminNotes && (
        <p className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          Admin note: {reg.adminNotes}
        </p>
      )}

      {showRoom && reg.tournament.roomCode && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 font-display text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" /> Room credentials
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Room code</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">{reg.tournament.roomCode}</span>
              <CopyButton value={reg.tournament.roomCode} label="room code" />
            </span>
          </div>
          {reg.tournament.roomPassword && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Room password</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">{reg.tournament.roomPassword}</span>
                <CopyButton value={reg.tournament.roomPassword} label="room password" />
              </span>
            </div>
          )}
          <Alert className="border-amber-600/40 bg-amber-600/10">
            <AlertDescription className="text-amber-500">
              Share only with your teammates.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {reg.status === "PENDING_PAYMENT" && (
        <RegistrationPaymentForm reg={reg} />
      )}
    </li>
  );
}

function RegistrationPaymentForm({ reg }: { reg: MyRegistrationDTO }) {
  const router = useRouter();
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
      await apiFetch(`/api/tournaments/${reg.tournamentId}/payment`, {
        method: "POST",
        json: { trxId: trxId.trim(), screenshotUploadId: screenshotId ?? "" },
      });
      toast.success("Payment submitted — admins will verify your slot shortly.");
      router.refresh();
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
        Send {formatRs(reg.tournament.entryFee)} to the EasyPaisa account shown on the tournament page,
        then enter the transaction ID below to confirm your slot.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`reg-trx-${reg.id}`}>EasyPaisa Transaction ID</Label>
        <Input
          id={`reg-trx-${reg.id}`}
          value={trxId}
          onChange={(e) => setTrxId(e.target.value)}
          placeholder="e.g. 4021337"
          maxLength={48}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`reg-proof-${reg.id}`}>Payment screenshot (optional)</Label>
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
