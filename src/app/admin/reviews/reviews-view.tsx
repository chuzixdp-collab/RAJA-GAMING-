"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Star, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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

const TABS = ["PENDING", "APPROVED", "REJECTED"] as const;

type ReviewRow = {
  id: string;
  user: { id: string; email: string; name: string };
  targetType: string;
  targetId: string;
  rating: number;
  comment: string;
  status: string;
  moderationNote: string | null;
  createdAt: string;
};

export function ReviewsView() {
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("PENDING");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ReviewRow | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ReviewRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ reviews: ReviewRow[] }>("/api/admin/reviews");
      setReviews(data.reviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reviews.");
      setReviews([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: reviews?.length ?? 0 };
    for (const s of TABS) c[s] = 0;
    for (const r of reviews ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [reviews]);

  const filtered = useMemo(
    () => (reviews ?? []).filter((r) => tab === "ALL" || r.status === tab),
    [reviews, tab]
  );

  async function act(review: ReviewRow, action: "APPROVE" | "REJECT" | "DELETE", note?: string) {
    setBusyId(review.id);
    try {
      await apiFetch("/api/admin/reviews", {
        method: "PATCH",
        json: { reviewId: review.id, action, ...(note ? { note } : {}) },
      });
      toast.success(`Review ${action.toLowerCase()}d.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch("/api/admin/reviews", {
        method: "PATCH",
        json: { reviewId: deleteTarget.id, action: "DELETE" },
      });
      toast.success("Review deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete review.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reviews"
        description="Moderate player reviews for top-ups, tournaments and marketplace trades."
      />

      <div className="mb-6 flex flex-wrap gap-2" aria-label="Review summary">
        {TABS.map((s) => (
          <div
            key={s}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs"
          >
            <span className="text-muted-foreground">{s}</span>
            <span className="font-display font-bold text-primary">{counts[s] ?? 0}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">All</span>
          <span className="font-display font-bold text-primary">{counts.ALL}</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList className="h-auto flex-wrap">
          {TABS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s} ({counts[s] ?? 0})
            </TabsTrigger>
          ))}
          <TabsTrigger value="ALL">All ({counts.ALL})</TabsTrigger>
        </TabsList>
      </Tabs>

      {reviews === null ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Could not load reviews" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Star />}
          title="No reviews here"
          description={
            tab === "ALL"
              ? "Player reviews appear here for moderation before they go public."
              : "No reviews with this status."
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((review) => (
            <Card key={review.id} className="card-raja p-0">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{review.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{review.user.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge status={review.status} />
                    <Badge variant="outline" className="text-xs">
                      {review.targetType}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Stars rating={review.rating} />
                  <span className="text-xs text-muted-foreground">
                    {review.rating}/5 • {timeAgo(review.createdAt)}
                  </span>
                </div>

                <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>

                <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                  target: {review.targetType}/{review.targetId}
                </p>

                {review.moderationNote && (
                  <p className="mt-2 rounded-md border border-amber-600/30 bg-amber-600/10 p-2 text-xs text-amber-500">
                    <span className="font-medium">Moderation note:</span> {review.moderationNote}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                  {review.status !== "APPROVED" && (
                    <Button
                      size="sm"
                      disabled={busyId === review.id}
                      onClick={() => void act(review, "APPROVE")}
                    >
                      {busyId === review.id ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      )}
                      Approve
                    </Button>
                  )}
                  {review.status !== "REJECTED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === review.id}
                      onClick={() => {
                        setRejectNote("");
                        setRejectTarget(review);
                      }}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Reject
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={busyId === review.id}
                    onClick={() => setDeleteTarget(review)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Delete
                  </Button>
                  <span className="ml-auto self-center text-xs text-muted-foreground">
                    {formatDateTime(review.createdAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* REJECT dialog */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(o) => !o && setRejectTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Reject review</DialogTitle>
            <DialogDescription>
              The review stays hidden from the site. Add an optional moderation note.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="review-note">Moderation note</Label>
            <Textarea
              id="review-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Reason for rejection..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!rejectTarget) return;
                const target = rejectTarget;
                setRejectTarget(null);
                void act(target, "REJECT", rejectNote);
              }}
            >
              Reject review
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
            <AlertDialogTitle>Delete review?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the review by {deleteTarget?.user.email}. This cannot be
              undone.
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

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < rating ? "fill-primary text-primary" : "text-muted-foreground"}`}
          aria-hidden
        />
      ))}
    </span>
  );
}
