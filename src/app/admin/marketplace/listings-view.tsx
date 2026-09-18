"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Gavel,
  ImageOff,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  Unlock,
} from "lucide-react";
import { apiFetch } from "@/lib/client";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { formatRs, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/shared/copy-button";
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

const QUEUE_TABS = ["PENDING", "UNDER_REVIEW", "DUPLICATE_REVIEW"] as const;
const ALL_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "SOLD",
  "CANCELLED",
  "SUSPENDED",
  "DUPLICATE_REVIEW",
] as const;

type ListingAction =
  | "UNDER_REVIEW"
  | "APPROVE"
  | "REJECT"
  | "SUSPEND"
  | "MARK_SOLD"
  | "CANCEL"
  | "NOTE"
  | "DELETE";

type ListingImageRow = { id: string; uploadId: string; sortOrder: number };

type ListingRow = {
  id: string;
  title: string;
  ffUid: string;
  description: string;
  level: number | null;
  price: number;
  verificationNote: string | null;
  sensitiveDataEncrypted: string | null;
  status: string;
  adminNotes: string | null;
  soldAt: string | null;
  createdAt: string;
  seller: { id: string; email: string; name: string };
  images: ListingImageRow[];
};

const STATUS_ACTIONS: Record<string, ListingAction[]> = {
  PENDING: ["UNDER_REVIEW", "APPROVE", "REJECT", "DELETE"],
  UNDER_REVIEW: ["APPROVE", "REJECT", "SUSPEND", "DELETE"],
  DUPLICATE_REVIEW: ["UNDER_REVIEW", "APPROVE", "REJECT", "SUSPEND"],
  APPROVED: ["SUSPEND", "MARK_SOLD", "CANCEL"],
  REJECTED: ["UNDER_REVIEW", "APPROVE", "DELETE"],
  SUSPENDED: ["UNDER_REVIEW", "APPROVE", "DELETE"],
  CANCELLED: ["DELETE"],
  SOLD: ["DELETE"],
};

const ACTION_LABELS: Record<ListingAction, string> = {
  UNDER_REVIEW: "Mark under review",
  APPROVE: "Approve",
  REJECT: "Reject",
  SUSPEND: "Suspend",
  MARK_SOLD: "Mark sold",
  CANCEL: "Cancel listing",
  NOTE: "Add note",
  DELETE: "Delete",
};

export function ListingsView() {
  const [listings, setListings] = useState<ListingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("PENDING");
  const [busyId, setBusyId] = useState<string | null>(null);

  // note dialog (REJECT / NOTE)
  const [noteTarget, setNoteTarget] = useState<{ listing: ListingRow; action: ListingAction } | null>(
    null
  );
  const [noteText, setNoteText] = useState("");
  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ListingRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  // screenshot enlarge
  const [screenshot, setScreenshot] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ listings: ListingRow[] }>("/api/admin/listings");
      setListings(data.listings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listings.");
      setListings([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: listings?.length ?? 0 };
    for (const s of ALL_STATUSES) c[s] = 0;
    for (const l of listings ?? []) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [listings]);

  const queueCount = useMemo(
    () =>
      QUEUE_TABS.reduce(
        (sum, s) => sum + (listings ?? []).filter((l) => l.status === s).length,
        0
      ),
    [listings]
  );

  const filtered = useMemo(
    () => (listings ?? []).filter((l) => tab === "ALL" || l.status === tab),
    [listings, tab]
  );

  async function runAction(listing: ListingRow, action: ListingAction, note?: string) {
    setBusyId(listing.id);
    try {
      await apiFetch("/api/admin/listings", {
        method: "PATCH",
        json: { listingId: listing.id, action, ...(note ? { note } : {}) },
      });
      toast.success(`${ACTION_LABELS[action]}: done.`);
      await load();
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : "Action failed.";
      if (status === 409) {
        toast.warning(message);
        await load();
      } else {
        toast.error(message);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch("/api/admin/listings", {
        method: "PATCH",
        json: { listingId: deleteTarget.id, action: "DELETE" },
      });
      toast.success("Listing deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete listing.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Marketplace listings"
        description="Review seller submissions, verify ownership proof and control what goes public."
      />

      <div className="mb-6 flex flex-wrap gap-2" aria-label="Listing summary">
        {ALL_STATUSES.map((s) => (
          <div
            key={s}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs"
          >
            <span className="text-muted-foreground">{s.replaceAll("_", " ")}</span>
            <span className="font-display font-bold text-primary">{counts[s] ?? 0}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Review queue</span>
          <span className="font-display font-bold text-primary">{queueCount}</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList className="h-auto flex-wrap">
          {QUEUE_TABS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s.replaceAll("_", " ")} ({counts[s] ?? 0})
            </TabsTrigger>
          ))}
          <TabsTrigger value="ALL">All ({counts.ALL})</TabsTrigger>
        </TabsList>
      </Tabs>

      {listings === null ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Could not load listings" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Gavel />}
          title="No listings here"
          description={
            tab === "ALL"
              ? "Seller submissions will appear here for review."
              : "The queue is clear for this status."
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              busy={busyId === listing.id}
              onAction={(action) => {
                if (action === "REJECT" || action === "NOTE") {
                  setNoteText("");
                  setNoteTarget({ listing, action });
                } else if (action === "DELETE") {
                  setDeleteTarget(listing);
                } else {
                  void runAction(listing, action);
                }
              }}
              onScreenshot={setScreenshot}
            />
          ))}
        </div>
      )}

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
              {noteTarget?.action === "REJECT" ? "Reject listing" : "Admin note"}
            </DialogTitle>
            <DialogDescription>
              {noteTarget?.action === "REJECT"
                ? "The seller is notified with this reason."
                : "Internal note, kept on the listing record."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="listing-note">Note</Label>
            <Textarea
              id="listing-note"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Reason or internal note..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!noteTarget) return;
                const { listing, action } = noteTarget;
                setNoteTarget(null);
                void runAction(listing, action, noteText);
              }}
              className={
                noteTarget?.action === "REJECT"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {noteTarget?.action === "REJECT" ? "Reject listing" : "Save note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE confirm */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.title}&quot; will be permanently deleted. Listings with existing
              purchase transactions cannot be deleted.
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

      {/* Screenshot enlarge */}
      <Dialog open={screenshot !== null} onOpenChange={(o) => !o && setScreenshot(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Listing screenshot</DialogTitle>
            <DialogDescription>Ownership proof submitted by the seller.</DialogDescription>
          </DialogHeader>
          {screenshot && (
             
            <img
              src={screenshot}
              alt="Listing screenshot enlarged"
              className="max-h-[70vh] w-full rounded-md border border-border object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListingCard({
  listing,
  busy,
  onAction,
  onScreenshot,
}: {
  listing: ListingRow;
  busy: boolean;
  onAction: (action: ListingAction) => void;
  onScreenshot: (src: string | null) => void;
}) {
  const actions = STATUS_ACTIONS[listing.status] ?? [];
  const encrypted = listing.sensitiveDataEncrypted === "yes";

  return (
    <Card className="card-raja p-0">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-medium leading-snug">{listing.title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              by {listing.seller.name} • {listing.seller.email} • {timeAgo(listing.createdAt)}
            </p>
          </div>
          <StatusBadge status={listing.status} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-display text-lg font-bold text-primary">
            {formatRs(listing.price)}
          </span>
          {listing.level !== null && (
            <Badge variant="outline" className="text-xs">
              Level {listing.level}
            </Badge>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            FF UID: <span className="font-mono text-foreground">{listing.ffUid}</span>
            <CopyButton value={listing.ffUid} label={listing.ffUid} />
          </span>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{listing.description}</p>

        {listing.verificationNote && (
          <p className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
            <span className="font-medium">Seller verification note:</span> {listing.verificationNote}
          </p>
        )}

        {listing.adminNotes && (
          <p className="mt-2 rounded-md border border-amber-600/30 bg-amber-600/10 p-2 text-xs text-amber-500">
            <span className="font-medium">Admin notes:</span> {listing.adminNotes}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              encrypted
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "text-muted-foreground"
            }
          >
            {encrypted ? (
              <Lock className="mr-1 h-3 w-3" aria-hidden />
            ) : (
              <Unlock className="mr-1 h-3 w-3" aria-hidden />
            )}
            Encrypted credentials stored: {encrypted ? "yes" : "no"}
          </Badge>
          {listing.soldAt && (
            <Badge variant="outline" className="text-xs">
              Sold {timeAgo(listing.soldAt)}
            </Badge>
          )}
        </div>

        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Screenshots
          </p>
          {listing.images.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageOff className="h-3.5 w-3.5" aria-hidden /> No screenshots submitted
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {listing.images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => onScreenshot(`/api/uploads/${img.uploadId}`)}
                  aria-label="Open listing screenshot"
                  className="transition-opacity hover:opacity-80"
                >
                  { }
                  <img
                    src={`/api/uploads/${img.uploadId}`}
                    alt="Listing screenshot"
                    className="h-16 w-24 rounded border border-border object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
            {actions.map((action) => (
              <Button
                key={action}
                size="sm"
                variant={action === "APPROVE" ? "default" : action === "DELETE" ? "ghost" : "outline"}
                disabled={busy}
                className={
                  action === "REJECT" || action === "DELETE" || action === "SUSPEND"
                    ? "text-destructive hover:text-destructive"
                    : ""
                }
                onClick={() => onAction(action)}
              >
                {action === "DELETE" && <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                {busy && action === "APPROVE" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : action === "APPROVE" ? (
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                ) : null}
                {ACTION_LABELS[action]}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
