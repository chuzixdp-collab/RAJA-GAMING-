"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";
import { apiFetch } from "@/lib/client";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { formatRs, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  TournamentFormDialog,
  toLocalInput,
  type TournamentFormData,
} from "./_components/tournament-form-dialog";

const STATUSES = [
  "DRAFT",
  "UPCOMING",
  "OPEN",
  "FULL",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

type TournamentRow = TournamentFormData & {
  status: string;
  roomCode: string | null;
  roomPassword: string | null;
  roomReleased: boolean;
  createdAt: string;
  approvedCount: number;
  _count: { registrations: number };
};

export function TournamentsView() {
  const [tournaments, setTournaments] = useState<TournamentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TournamentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TournamentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ tournaments: TournamentRow[] }>("/api/admin/tournaments");
      setTournaments(data.tournaments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tournaments.");
      setTournaments([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: tournaments?.length ?? 0 };
    for (const s of STATUSES) c[s] = 0;
    for (const t of tournaments ?? []) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [tournaments]);

  const filtered = useMemo(
    () => (tournaments ?? []).filter((t) => tab === "ALL" || t.status === tab),
    [tournaments, tab]
  );

  async function setStatus(t: TournamentRow, status: string) {
    setBusyId(t.id);
    try {
      await apiFetch("/api/admin/tournaments", {
        method: "PATCH",
        json: { id: t.id, status },
      });
      toast.success(`Tournament marked ${status.replaceAll("_", " ").toLowerCase()}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/tournaments?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      toast.success("Tournament deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tournament.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tournaments"
        description="Create tournaments, manage status and jump into per-tournament management."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden /> New tournament
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2" aria-label="Tournament summary">
        <SummaryChip label="Total" value={counts.ALL} />
        {STATUSES.map((s) => (
          <SummaryChip key={s} label={s} value={counts[s] ?? 0} />
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="ALL">All ({counts.ALL})</TabsTrigger>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s.replaceAll("_", " ")} ({counts[s] ?? 0})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tournaments === null ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error ? (
        <EmptyState title="Could not load tournaments" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title="No tournaments found"
          description={
            tab === "ALL"
              ? "Create your first tournament to start taking registrations."
              : "No tournaments with this status yet."
          }
          action={
            tab === "ALL" ? (
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" aria-hidden /> New tournament
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card-raja hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tournament</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Entry fee</TableHead>
                    <TableHead>Slots</TableHead>
                    <TableHead>Starts at</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link
                          href={`/admin/tournaments/${t.id}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {t.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.mode} • {t.map} • {t._count.registrations} registration
                          {t._count.registrations === 1 ? "" : "s"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell>{formatRs(t.entryFee)}</TableCell>
                      <TableCell>
                        <span className="font-medium">{t.approvedCount}</span>
                        <span className="text-muted-foreground"> / {t.slots}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(t.startsAt)}
                      </TableCell>
                      <TableCell>
                        {t.roomReleased ? (
                          <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400" variant="outline">
                            <Check className="mr-1 h-3 w-3" aria-hidden /> Released
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Lock className="mr-1 h-3 w-3" aria-hidden /> Locked
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          t={t}
                          busy={busyId === t.id}
                          onStatus={setStatus}
                          onEdit={() => setEditTarget(t)}
                          onDelete={() => setDeleteTarget(t)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((t) => (
              <Card key={t.id} className="card-raja p-0">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/admin/tournaments/${t.id}`}
                      className="font-medium leading-snug hover:text-primary"
                    >
                      {t.title}
                    </Link>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.mode} • {t.map}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Entry fee</p>
                      <p className="font-medium">{formatRs(t.entryFee)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Slots</p>
                      <p className="font-medium">
                        {t.approvedCount}/{t.slots}
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          ({t._count.registrations} regs)
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Starts at</p>
                      <p className="font-medium">{formatDateTime(t.startsAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Room</p>
                      {t.roomReleased ? (
                        <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400" variant="outline">
                          <Check className="mr-1 h-3 w-3" aria-hidden /> Released
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          <Lock className="mr-1 h-3 w-3" aria-hidden /> Locked
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/tournaments/${t.id}`}>Manage</Link>
                    </Button>
                    <RowActions
                      t={t}
                      busy={busyId === t.id}
                      onStatus={setStatus}
                      onEdit={() => setEditTarget(t)}
                      onDelete={() => setDeleteTarget(t)}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <TournamentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={load}
      />
      <TournamentFormDialog
        open={editTarget !== null}
        onOpenChange={(o) => !o && setEditTarget(null)}
        tournament={editTarget}
        onSaved={load}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tournament?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.title} will be permanently deleted. This is only possible while the
              tournament has zero registrations — the server rejects deletion otherwise.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RowActions({
  t,
  busy,
  onStatus,
  onEdit,
  onDelete,
}: {
  t: TournamentRow;
  busy: boolean;
  onStatus: (t: TournamentRow, status: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="inline-flex items-center justify-end gap-1">
      <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
        <Link href={`/admin/tournaments/${t.id}`}>Manage</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" disabled={busy} aria-label={`Actions for ${t.title}`}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Set status</DropdownMenuLabel>
          {STATUSES.map((s) => (
            <DropdownMenuItem key={s} onClick={() => onStatus(t, s)}>
              <span className="flex-1">{s.replaceAll("_", " ")}</span>
              {t.status === s && <Check className="h-4 w-4 text-primary" aria-hidden />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" aria-hidden /> Edit details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: number }) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card px-3 py-1.5 text-xs",
        "flex items-center gap-2"
      )}
    >
      <span className="text-muted-foreground">{label.replaceAll("_", " ")}</span>
      <span className="font-display font-bold text-primary">{value}</span>
    </div>
  );
}


