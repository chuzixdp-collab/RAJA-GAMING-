"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDate } from "@/lib/format";
import { reviewSchema } from "@/lib/validations";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type MyReview = {
  id: string;
  targetType: string;
  targetId: string;
  rating: number;
  comment: string;
  status: string;
  moderationNote: string | null;
  createdAt: string;
};

const TARGET_LABELS: Record<string, string> = {
  TOPUP: "Top-Up Order",
  TOURNAMENT: "Tournament",
  MARKETPLACE: "Marketplace Trade",
};

const TARGET_OPTIONS = [
  { value: "TOPUP", label: "Top-Up Order" },
  { value: "TOURNAMENT", label: "Tournament" },
  { value: "MARKETPLACE", label: "Marketplace Trade" },
];

export function ReviewsView() {
  const [reviews, setReviews] = useState<MyReview[] | null>(null);
  const [targetType, setTargetType] = useState("TOPUP");
  const [targetId, setTargetId] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ reviews: MyReview[] }>("/api/reviews/mine");
      setReviews(data.reviews);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load your reviews.");
      setReviews([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = reviewSchema.safeParse({
      targetType,
      targetId: targetId.trim(),
      rating,
      comment: comment.trim(),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/reviews", { method: "POST", json: parsed.data });
      toast.success("Review submitted — it will appear publicly after moderation.");
      setTargetId("");
      setRating(5);
      setComment("");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit your review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Reviews"
        description="Rate your experience with orders, tournaments and trades."
      />

      <Alert>
        <Star className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>What can I review?</AlertTitle>
        <AlertDescription>
          You can review completed orders, tournaments you played, and marketplace trades you
          participated in. Reviews appear publicly after moderation.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Write a review */}
        <form onSubmit={handleSubmit} className="card-raja space-y-4 self-start p-4 sm:p-6">
          <h2 className="font-display text-lg font-semibold tracking-wide">Write a review</h2>
          <div className="space-y-1.5">
            <Label htmlFor="review-type">What are you reviewing?</Label>
            <Select value={targetType} onValueChange={setTargetType}>
              <SelectTrigger id="review-type" className="w-full">
                <SelectValue placeholder="Select target" />
              </SelectTrigger>
              <SelectContent>
                {TARGET_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-target">Target ID</Label>
            <Input
              id="review-target"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="Paste the order, tournament or listing ID"
              maxLength={64}
              required
            />
            <p className="text-xs text-muted-foreground">
              You can copy the ID from the order, registration or listing details.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label id="rating-label">Rating</Label>
            <div
              className="flex items-center gap-1"
              role="radiogroup"
              aria-labelledby="rating-label"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} star${value > 1 ? "s" : ""}`}
                  onClick={() => setRating(value)}
                  className="rounded p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "h-6 w-6",
                      value <= rating ? "fill-primary text-primary" : "text-muted-foreground"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-comment">Comment</Label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="How was the service, payout or tournament?"
              rows={4}
              maxLength={600}
              required
            />
          </div>
          <Button type="submit" className="font-display tracking-wide" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? "Submitting…" : "Submit review"}
          </Button>
        </form>

        {/* My reviews */}
        <section aria-label="My submitted reviews" className="card-raja p-4 sm:p-6">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-wide">My reviews</h2>
          {reviews === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <EmptyState
              title="No reviews yet"
              description="Your submitted reviews and their moderation status will appear here."
            />
          ) : (
            <ul className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {TARGET_LABELS[r.targetType] ?? r.targetType}
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        · {r.targetId.slice(0, 12)}…
                      </span>
                    </p>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-0.5" aria-label={`${r.rating} of 5 stars`}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <Star
                        key={v}
                        aria-hidden="true"
                        className={cn(
                          "h-3.5 w-3.5",
                          v <= r.rating ? "fill-primary text-primary" : "text-muted-foreground/40"
                        )}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{r.comment}</p>
                  {r.moderationNote && (
                    <p className="mt-2 rounded-md border border-amber-600/40 bg-amber-600/10 px-2 py-1.5 text-xs text-amber-500">
                      Moderator note: {r.moderationNote}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
