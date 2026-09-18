"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Save,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/client";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { formatRs, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TournamentFormDialog,
  type TournamentFormData,
} from "../_components/tournament-form-dialog";

const STATUSES = [
  "DRAFT",
  "UPCOMING",
  "OPEN",
  "FULL",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

type RegUser = { id: string; email: string; name: string };

type RegistrationRow = {
  id: string;
  userId: string;
  user: RegUser;
  inGameName: string;
  ffUid: string;
  status: string;
  paymentTrxId: string | null;
  paymentScreenshotId: string | null;
  paymentSubmittedAt: string | null;
  paymentVerifiedAt: string | null;
  slotNumber: number | null;
  position: number | null;
  kills: number | null;
  rewardClaimed: boolean;
  rewardClaimedAt: string | null;
  adminNotes: string | null;
  createdAt: string;
};

type RewardRow = {
  id?: string;
  position: number;
  rewardType: string;
  diamondAmount: number | null;
  cashAmount: number | null;
  description: string | null;
};

type DetailTournament = TournamentFormData & {
  status: string;
  roomCode: string | null;
  roomPassword: string | null;
  roomReleased: boolean;
  createdAt: string;
  registrations: RegistrationRow[];
  rewards: RewardRow[];
  _count: { registrations: number };
};

type RegistrationAction =
  | "APPROVE"
  | "REJECT"
  | "VERIFY_PAYMENT"
  | "SET_POSITION"
  | "SET_KILLS"
  | "CLAIM_REWARD"
  | "NOTE";

export function ManageView({ tournamentId }: { tournamentId: string }) {
  const [tournament, setTournament] = useState<DetailTournament | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // room credentials form
  const [roomCode, setRoomCode] = useState("");
  const [roomPassword, setRoomPassword] = useState("");

  // per-row inputs for position / kills
  const [positionDraft, setPositionDraft] = useState<Record<string, string>>({});
  const [killsDraft, setKillsDraft] = useState<Record<string, string>>({});

  // dialogs
  const [editOpen, setEditOpen] = useState(false);
  const [noteTarget, setNoteTarget] = useState<RegistrationRow | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteAction, setNoteAction] = useState<RegistrationAction>("NOTE");
  const [claimTarget, setClaimTarget] = useState<RegistrationRow | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ tournament: DetailTournament }>(
        `/api/admin/tournaments?id=${encodeURIComponent(tournamentId)}`
      );
      setTournament(data.tournament);
      setRoomCode(data.tournament.roomCode ?? "");
      setRoomPassword(data.tournament.roomPassword ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tournament.");
      setTournament(null);
    }
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const regs = tournament?.registrations ?? [];
    return {
      total: regs.length,
      approved: regs.filter((r) => r.status === "APPROVED").length,
      awaitingReview: regs.filter(
        (r) => r.status === "PAYMENT_SUBMITTED" || r.status === "PENDING_PAYMENT"
      ).length,
      rewardsClaimed: regs.filter((r) => r.rewardClaimed).length,
    };
  }, [tournament]);

  async function patchRegistration(
    reg: RegistrationRow,
    action: RegistrationAction,
    extra?: { position?: number; kills?: number; note?: string },
    successMsg?: string
  ) {
    setBusy(true);
    try {
      await apiFetch("/api/admin/tournament-registrations", {
        method: "PATCH",
        json: { registrationId: reg.id, action, ...extra },
      });
      toast.success(successMsg ?? `Registration ${action.replaceAll("_", " ").toLowerCase()} applied.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRoom(overrides?: { roomReleased?: boolean }) {
    if (!tournament) return;
    setBusy(true);
    try {
      await apiFetch("/api/admin/tournaments", {
        method: "PATCH",
        json: {
          id: tournament.id,
          ...(overrides?.roomReleased !== undefined
            ? { roomReleased: overrides.roomReleased }
            : { roomCode, roomPassword }),
        },
      });
      toast.success(
        overrides?.roomReleased !== undefined
          ? overrides.roomReleased
            ? "Room credentials released to approved participants."
            : "Room credentials locked."
          : "Room credentials saved."
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save room credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    if (!tournament) return;
    setBusy(true);
    try {
      await apiFetch("/api/admin/tournaments", {
        method: "PATCH",
        json: { id: tournament.id, status },
      });
      toast.success(`Tournament marked ${status.replaceAll("_", " ").toLowerCase()}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div>
        <Button asChild variant="outline" size="sm" className="mb-4 gap-2">
          <Link href="/admin/tournaments">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All tournaments
          </Link>
        </Button>
        <EmptyState icon={<Trophy />} title="Could not load tournament" description={error} />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const standings = [...tournament.registrations]
    .filter((r) => r.position !== null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <div>
      <Button asChild variant="outline" size="sm" className="mb-4 gap-2">
        <Link href="/admin/tournaments">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All tournaments
        </Link>
      </Button>

      <PageHeader
        title={tournament.title}
        description={`${tournament.mode} • ${tournament.map} • ${formatRs(tournament.entryFee)} entry • starts ${formatDateTime(tournament.startsAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={tournament.status} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy}>
                  Set status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                {STATUSES.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => void setStatus(s)}>
                    <span className="flex-1">{s.replaceAll("_", " ")}</span>
                    {tournament.status === s && (
                      <Check className="h-4 w-4 text-primary" aria-hidden />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" aria-hidden /> Edit
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Registrations" value={stats.total} icon={<Trophy />} />
        <StatCard title="Approved" value={stats.approved} hint={`of ${tournament.slots} slots`} />
        <StatCard title="Awaiting review" value={stats.awaitingReview} tone="gold" />
        <StatCard title="Rewards claimed" value={stats.rewardsClaimed} tone="green" />
      </div>

      {/* ROOM CREDENTIALS */}
      <Card className="card-raja mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden /> Room credentials
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="room-code">Room code</Label>
              <Input
                id="room-code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="e.g. 482913"
                maxLength={32}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="room-password">Room password</Label>
              <Input
                id="room-password"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                placeholder="e.g. rajapass"
                maxLength={32}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="room-released">Release credentials</Label>
              <div className="flex items-center gap-3">
                <Switch
                  id="room-released"
                  checked={tournament.roomReleased}
                  onCheckedChange={(checked) => void saveRoom({ roomReleased: checked })}
                  disabled={busy}
                />
                <span className="text-sm text-muted-foreground">
                  {tournament.roomReleased ? "Released to approved participants" : "Locked"}
                </span>
              </div>
              <p className="text-xs text-amber-500">
                Warning: credentials are only visible to APPROVED participants, and only while
                released. Never release before the match window.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Button
              onClick={() => void saveRoom()}
              disabled={busy}
              size="sm"
              className="gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              Save credentials
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* REGISTRATIONS */}
      <Card className="card-raja mb-6">
        <CardHeader>
          <CardTitle className="font-display">
            Registrations ({tournament.registrations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tournament.registrations.length === 0 ? (
            <EmptyState
              title="No registrations yet"
              description="Players appear here once they register for this tournament."
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>In-game name</TableHead>
                      <TableHead>FF UID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Slot</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tournament.registrations.map((reg) => (
                      <TableRow key={reg.id}>
                        <TableCell>
                          <p className="font-medium">{reg.user.name}</p>
                          <p className="text-xs text-muted-foreground">{reg.user.email}</p>
                        </TableCell>
                        <TableCell>{reg.inGameName}</TableCell>
                        <TableCell className="font-mono text-xs">{reg.ffUid}</TableCell>
                        <TableCell>
                          <StatusBadge status={reg.status} />
                          {reg.rewardClaimed && (
                            <Badge variant="outline" className="mt-1 block w-fit border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                              reward claimed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {reg.paymentTrxId ? (
                            <>
                              <p className="font-mono text-xs">{reg.paymentTrxId}</p>
                              {reg.paymentScreenshotId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setScreenshot(`/api/uploads/${reg.paymentScreenshotId}`)
                                  }
                                  className="mt-1"
                                  aria-label="Open registration payment screenshot"
                                >
                                  { }
                                  <img
                                    src={`/api/uploads/${reg.paymentScreenshotId}`}
                                    alt="Registration payment screenshot"
                                    className="h-10 w-16 rounded border border-border object-cover transition-opacity hover:opacity-80"
                                  />
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not submitted</span>
                          )}
                        </TableCell>
                        <TableCell>{reg.slotNumber ?? "—"}</TableCell>
                        <TableCell>
                          <span className="text-xs">
                            Pos {reg.position ?? "—"} • Kills {reg.kills ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <RegActions
                            reg={reg}
                            slots={tournament.slots}
                            rewards={tournament.rewards}
                            busy={busy}
                            positionDraft={positionDraft[reg.id] ?? (reg.position !== null ? String(reg.position) : "")}
                            killsDraft={killsDraft[reg.id] ?? (reg.kills !== null ? String(reg.kills) : "")}
                            onPositionDraft={(v) => setPositionDraft((d) => ({ ...d, [reg.id]: v }))}
                            onKillsDraft={(v) => setKillsDraft((d) => ({ ...d, [reg.id]: v }))}
                            onAction={(action, extra) => void patchRegistration(reg, action, extra)}
                            onNote={(action) => {
                              setNoteAction(action);
                              setNoteTarget(reg);
                              setNoteText(reg.adminNotes ?? "");
                            }}
                            onClaim={() => setClaimTarget(reg)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="grid gap-3 lg:hidden">
                {tournament.registrations.map((reg) => (
                  <div key={reg.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{reg.inGameName}</p>
                        <p className="text-xs text-muted-foreground">
                          {reg.user.name} • {reg.user.email}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">UID {reg.ffUid}</p>
                      </div>
                      <StatusBadge status={reg.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <p>
                        Slot: <span className="font-medium">{reg.slotNumber ?? "—"}</span>
                      </p>
                      <p>
                        Result:{" "}
                        <span className="font-medium">
                          Pos {reg.position ?? "—"} • Kills {reg.kills ?? "—"}
                        </span>
                      </p>
                      <p className="col-span-2 font-mono text-xs">
                        {reg.paymentTrxId ?? "Payment not submitted"}
                      </p>
                    </div>
                    {reg.paymentScreenshotId && (
                      <button
                        type="button"
                        onClick={() => setScreenshot(`/api/uploads/${reg.paymentScreenshotId}`)}
                        className="mt-2"
                        aria-label="Open registration payment screenshot"
                      >
                        { }
                        <img
                          src={`/api/uploads/${reg.paymentScreenshotId}`}
                          alt="Registration payment screenshot"
                          className="h-16 w-24 rounded border border-border object-cover"
                        />
                      </button>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <RegActions
                        reg={reg}
                        slots={tournament.slots}
                        rewards={tournament.rewards}
                        busy={busy}
                        positionDraft={positionDraft[reg.id] ?? (reg.position !== null ? String(reg.position) : "")}
                        killsDraft={killsDraft[reg.id] ?? (reg.kills !== null ? String(reg.kills) : "")}
                        onPositionDraft={(v) => setPositionDraft((d) => ({ ...d, [reg.id]: v }))}
                        onKillsDraft={(v) => setKillsDraft((d) => ({ ...d, [reg.id]: v }))}
                        onAction={(action, extra) => void patchRegistration(reg, action, extra)}
                        onNote={(action) => {
                          setNoteAction(action);
                          setNoteTarget(reg);
                          setNoteText(reg.adminNotes ?? "");
                        }}
                        onClaim={() => setClaimTarget(reg)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* REWARDS CONFIG */}
      <RewardsConfig
        tournamentId={tournament.id}
        rewards={tournament.rewards}
        onChanged={load}
      />

      {/* RESULTS */}
      {tournament.status === "COMPLETED" && (
        <Card className="card-raja mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Star className="h-5 w-5 text-primary" aria-hidden /> Final standings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {standings.length === 0 ? (
              <EmptyState
                title="No positions recorded"
                description="Set positions on approved registrations to build the final standings."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Position</TableHead>
                      <TableHead>In-game name</TableHead>
                      <TableHead>Kills</TableHead>
                      <TableHead>Reward</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {standings.map((reg) => {
                      const reward = tournament.rewards.find((rw) => rw.position === reg.position);
                      return (
                        <TableRow key={reg.id}>
                          <TableCell className="font-display font-bold text-primary">
                            #{reg.position}
                          </TableCell>
                          <TableCell>{reg.inGameName}</TableCell>
                          <TableCell>{reg.kills ?? 0}</TableCell>
                          <TableCell>
                            {reg.rewardClaimed ? (
                              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                                claimed
                              </Badge>
                            ) : reward ? (
                              <span className="text-sm">
                                {reward.rewardType === "CASH"
                                  ? formatRs(reward.cashAmount ?? 0)
                                  : `${reward.diamondAmount ?? 0} diamonds`}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not configured</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <TournamentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        tournament={tournament}
        onSaved={load}
      />

      {/* NOTE / REJECT dialog */}
      <Dialog
        open={noteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setNoteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {noteAction === "REJECT" ? "Reject registration" : "Admin note"}
            </DialogTitle>
            <DialogDescription>
              {noteAction === "REJECT"
                ? "The player is notified with the reason. This cannot be undone."
                : "Internal note, never shown to the player."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reg-note">Note</Label>
            <Textarea
              id="reg-note"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={noteAction === "REJECT" ? "Reason for rejection..." : "Internal note..."}
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
                void patchRegistration(target, noteAction, { note: noteText });
              }}
              className={noteAction === "REJECT" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {noteAction === "REJECT" ? "Reject registration" : "Save note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLAIM_REWARD confirm */}
      <AlertDialog
        open={claimTarget !== null}
        onOpenChange={(o) => !o && setClaimTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark reward as claimed?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!claimTarget) return "";
                const reward = tournament.rewards.find(
                  (rw) => rw.position === claimTarget.position
                );
                if (claimTarget.position === null) {
                  return "This player has no position set. Set a position first — no reward can be paid without it.";
                }
                if (!reward) {
                  return `No reward is configured for position ${claimTarget.position}. Configure rewards before claiming.`;
                }
                return reward.rewardType === "CASH"
                  ? `Cash reward of ${formatRs(reward.cashAmount ?? 0)} will be credited to the player's RAJA wallet for position ${claimTarget.position}. This is a financial action and is audit-logged.`
                  : `${reward.diamondAmount ?? 0} diamonds will be marked as due for position ${claimTarget.position} and the player notified. Diamonds are delivered manually.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!claimTarget) return;
                const target = claimTarget;
                setClaimTarget(null);
                void patchRegistration(target, "CLAIM_REWARD");
              }}
            >
              Confirm claim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Screenshot enlarge */}
      <Dialog open={screenshot !== null} onOpenChange={(o) => !o && setScreenshot(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Payment screenshot</DialogTitle>
            <DialogDescription>Submitted by the player as payment proof.</DialogDescription>
          </DialogHeader>
          {screenshot && (
             
            <img
              src={screenshot}
              alt="Registration payment screenshot enlarged"
              className="max-h-[70vh] w-full rounded-md border border-border object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RegActions({
  reg,
  slots,
  rewards,
  busy,
  positionDraft,
  killsDraft,
  onPositionDraft,
  onKillsDraft,
  onAction,
  onNote,
  onClaim,
}: {
  reg: RegistrationRow;
  slots: number;
  rewards: RewardRow[];
  busy: boolean;
  positionDraft: string;
  killsDraft: string;
  onPositionDraft: (v: string) => void;
  onKillsDraft: (v: string) => void;
  onAction: (
    action: RegistrationAction,
    extra?: { position?: number; kills?: number; note?: string }
  ) => void;
  onNote: (action: RegistrationAction) => void;
  onClaim: () => void;
}) {
  const reward = rewards.find((rw) => rw.position === reg.position);
  const canVerify = reg.status === "PENDING_PAYMENT";
  const canApprove = reg.status === "PAYMENT_SUBMITTED";
  const canReject = reg.status === "PENDING_PAYMENT" || reg.status === "PAYMENT_SUBMITTED";
  const canEditResult = reg.status === "APPROVED";
  const canClaim =
    reg.status === "APPROVED" && reg.position !== null && !reg.rewardClaimed;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canVerify && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("VERIFY_PAYMENT")}>
          Verify payment
        </Button>
      )}
      {canApprove && (
        <Button size="sm" disabled={busy} onClick={() => onAction("APPROVE")}>
          Approve
        </Button>
      )}
      {canReject && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          className="text-destructive hover:text-destructive"
          onClick={() => onNote("REJECT")}
        >
          <X className="h-4 w-4" aria-hidden />
          <span className="sr-only">Reject registration</span>
        </Button>
      )}
      {canEditResult && (
        <>
          <span className="inline-flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={slots}
              value={positionDraft}
              onChange={(e) => onPositionDraft(e.target.value)}
              className="h-8 w-16"
              aria-label={`Position for ${reg.inGameName}`}
              placeholder="Pos"
            />
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={busy}
              aria-label={`Save position for ${reg.inGameName}`}
              onClick={() => {
                const pos = Number(positionDraft);
                if (!Number.isInteger(pos) || pos < 1 || pos > slots) {
                  toast.error(`Position must be between 1 and ${slots}.`);
                  return;
                }
                onAction("SET_POSITION", { position: pos });
              }}
            >
              <Check className="h-4 w-4" aria-hidden />
            </Button>
          </span>
          <span className="inline-flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={100}
              value={killsDraft}
              onChange={(e) => onKillsDraft(e.target.value)}
              className="h-8 w-16"
              aria-label={`Kills for ${reg.inGameName}`}
              placeholder="Kills"
            />
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={busy}
              aria-label={`Save kills for ${reg.inGameName}`}
              onClick={() => {
                const kills = Number(killsDraft);
                if (!Number.isInteger(kills) || kills < 0 || kills > 100) {
                  toast.error("Kills must be between 0 and 100.");
                  return;
                }
                onAction("SET_KILLS", { kills });
              }}
            >
              <Check className="h-4 w-4" aria-hidden />
            </Button>
          </span>
          {canClaim && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onClaim}>
              {reward?.rewardType === "CASH" ? "Pay reward" : "Claim reward"}
            </Button>
          )}
        </>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        aria-label={`Add note for ${reg.inGameName}`}
        onClick={() => onNote("NOTE")}
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

type RewardDraft = {
  key: string;
  position: number;
  rewardType: string;
  diamondAmount: number;
  cashAmount: number;
  description: string;
};

function RewardsConfig({
  tournamentId,
  rewards,
  onChanged,
}: {
  tournamentId: string;
  rewards: RewardRow[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<RewardDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [initializedFrom, setInitializedFrom] = useState<string | null>(null);

  useEffect(() => {
    // (re)initialize the draft whenever the server rewards change identity
    const signature = rewards.map((r) => `${r.position}:${r.rewardType}:${r.cashAmount}:${r.diamondAmount}`).join("|");
    if (initializedFrom === signature) return;
    setInitializedFrom(signature);
    setDraft(
      rewards.map((r, i) => ({
        key: `${r.id ?? "new"}-${r.position}-${i}`,
        position: r.position,
        rewardType: r.rewardType,
        diamondAmount: r.diamondAmount ?? 0,
        cashAmount: r.cashAmount ?? 0,
        description: r.description ?? "",
      }))
    );
  }, [rewards, initializedFrom]);

  function addRow() {
    const nextPos = draft.reduce((max, d) => Math.max(max, d.position), 0) + 1;
    setDraft((d) => [
      ...d,
      {
        key: `new-${Date.now()}`,
        position: nextPos,
        rewardType: "DIAMONDS",
        diamondAmount: 0,
        cashAmount: 0,
        description: "",
      },
    ]);
  }

  function updateRow(key: string, patch: Partial<RewardDraft>) {
    setDraft((d) => d.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function save() {
    if (draft.length === 0) {
      toast.error("Add at least one reward row.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/admin/tournament-rewards", {
        method: "POST",
        json: {
          tournamentId,
          rewards: draft.map((d) => ({
            position: d.position,
            rewardType: d.rewardType,
            diamondAmount: d.rewardType === "DIAMONDS" ? d.diamondAmount : undefined,
            cashAmount: d.rewardType === "CASH" ? d.cashAmount : undefined,
            description: d.description || undefined,
          })),
        },
      });
      toast.success("Rewards saved (upserted by position).");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rewards.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="card-raja">
      <CardHeader>
        <CardTitle className="font-display">Reward configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          One reward per position. CASH rewards are credited to the player wallet when you mark the
          reward claimed; DIAMONDS are delivered manually. Rows are upserted by position.
        </p>
        {draft.length === 0 ? (
          <EmptyState
            title="No rewards configured"
            description="Add reward rows for the positions you want to pay out."
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {draft.map((row) => (
              <div
                key={row.key}
                className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[80px_140px_1fr_2fr_40px] sm:items-end"
              >
                <div className="grid gap-1">
                  <Label htmlFor={`pos-${row.key}`} className="text-xs">
                    Position
                  </Label>
                  <Input
                    id={`pos-${row.key}`}
                    type="number"
                    min={1}
                    max={20}
                    value={row.position}
                    onChange={(e) => updateRow(row.key, { position: Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={row.rewardType}
                    onValueChange={(v) => updateRow(row.key, { rewardType: v })}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DIAMONDS">Diamonds</SelectItem>
                      <SelectItem value="CASH">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {row.rewardType === "DIAMONDS" ? (
                  <div className="grid gap-1">
                    <Label htmlFor={`dia-${row.key}`} className="text-xs">
                      Diamonds
                    </Label>
                    <Input
                      id={`dia-${row.key}`}
                      type="number"
                      min={0}
                      value={row.diamondAmount}
                      onChange={(e) => updateRow(row.key, { diamondAmount: Number(e.target.value) })}
                      className="h-9"
                    />
                  </div>
                ) : (
                  <div className="grid gap-1">
                    <Label htmlFor={`cash-${row.key}`} className="text-xs">
                      Cash (Rs)
                    </Label>
                    <Input
                      id={`cash-${row.key}`}
                      type="number"
                      min={0}
                      value={row.cashAmount}
                      onChange={(e) => updateRow(row.key, { cashAmount: Number(e.target.value) })}
                      className="h-9"
                    />
                  </div>
                )}
                <div className="grid gap-1">
                  <Label htmlFor={`desc-${row.key}`} className="text-xs">
                    Description
                  </Label>
                  <Input
                    id={`desc-${row.key}`}
                    value={row.description}
                    onChange={(e) => updateRow(row.key, { description: e.target.value })}
                    className="h-9"
                    maxLength={200}
                    placeholder="Winner prize"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 justify-self-end text-destructive hover:text-destructive"
                  aria-label={`Remove reward row for position ${row.position}`}
                  onClick={() => setDraft((d) => d.filter((r) => r.key !== row.key))}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addRow}>
                <Plus className="h-4 w-4" aria-hidden /> Add reward row
              </Button>
              <Button type="button" size="sm" className="gap-2" onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                <Save className="h-4 w-4" aria-hidden /> Save rewards
              </Button>
              <span className="text-xs text-muted-foreground">
                Removing a row here does not delete it on the server — rewards are upserted by
                position.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
