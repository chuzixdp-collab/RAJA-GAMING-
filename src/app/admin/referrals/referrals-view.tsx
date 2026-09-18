"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Gift, Info, Loader2, Users } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { formatRs, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type ReferralRow = {
  id: string;
  referrer: { id: string; email: string; name: string };
  referred: { id: string; email: string; name: string };
  status: string;
  rewardAmount: number | null;
  rewardedAt: string | null;
  createdAt: string;
};

export function ReferralsView() {
  const [referrals, setReferrals] = useState<ReferralRow[] | null>(null);
  const [rewardConfigured, setRewardConfigured] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<ReferralRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReferralRow | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ referrals: ReferralRow[]; rewardConfigured: number }>(
        "/api/admin/referrals"
      );
      setReferrals(data.referrals);
      setRewardConfigured(data.rewardConfigured);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load referrals.");
      setReferrals([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const list = referrals ?? [];
    return {
      total: list.length,
      pending: list.filter((r) => r.status === "PENDING").length,
      paid: list.filter((r) => r.status === "COMPLETED" && (r.rewardAmount ?? 0) > 0).length,
      cancelled: list.filter((r) => r.status === "COMPLETED" && (r.rewardAmount ?? 0) === 0).length,
    };
  }, [referrals]);

  async function act(referral: ReferralRow, action: "PAY_REWARD" | "CANCEL") {
    setBusyId(referral.id);
    setActing(true);
    try {
      await apiFetch("/api/admin/referrals", {
        method: "PATCH",
        json: { referralId: referral.id, action },
      });
      toast.success(
        action === "PAY_REWARD"
          ? `Referral reward of ${formatRs(rewardConfigured)} paid to ${referral.referrer.email}.`
          : "Referral cancelled — no reward paid."
      );
      setPayTarget(null);
      setCancelTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
      setActing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Referrals"
        description="Referral rewards become payable once a referred user's first order payment is verified."
      />

      <Alert className="mb-6 border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" aria-hidden />
        <AlertTitle>How referral payment works</AlertTitle>
        <AlertDescription>
          Referrals are created automatically when a new user signs up with a referral code. When an
          admin verifies the referred user&apos;s first order payment, the reward is queued as
          PENDING. You can pay it manually here (credits the referrer&apos;s RAJA wallet) or cancel
          it. Current configured reward: {formatRs(rewardConfigured)}.
        </AlertDescription>
      </Alert>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total referrals" value={stats.total} icon={<Users />} />
        <StatCard title="Pending payout" value={stats.pending} tone="gold" icon={<Gift />} />
        <StatCard title="Rewards paid" value={stats.paid} tone="green" />
        <StatCard title="Cancelled" value={stats.cancelled} tone="red" />
      </div>

      {referrals === null ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Could not load referrals" description={error} />
      ) : referrals.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No referrals yet"
          description="Referrals appear here once users start inviting friends with their referral code."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card-raja hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referrer</TableHead>
                    <TableHead>Referred user</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reward</TableHead>
                    <TableHead>Rewarded at</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium">{r.referrer.name}</p>
                        <p className="text-xs text-muted-foreground">{r.referrer.email}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{r.referred.name}</p>
                        <p className="text-xs text-muted-foreground">{r.referred.email}</p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>
                        {r.status === "COMPLETED" && (r.rewardAmount ?? 0) === 0 ? (
                          <span className="text-xs text-muted-foreground">Cancelled</span>
                        ) : (
                          formatRs(r.rewardAmount ?? 0)
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(r.rewardedAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(r.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status === "PENDING" ? (
                          <div className="inline-flex gap-2">
                            <Button
                              size="sm"
                              disabled={busyId === r.id}
                              onClick={() => setPayTarget(r)}
                            >
                              {busyId === r.id && (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                              )}
                              Pay reward
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              disabled={busyId === r.id}
                              onClick={() => setCancelTarget(r)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 lg:hidden">
            {referrals.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Referrer
                    </p>
                    <p className="font-medium">{r.referrer.name}</p>
                    <p className="text-xs text-muted-foreground">{r.referrer.email}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Referred</p>
                  <p className="font-medium">{r.referred.name}</p>
                  <p className="text-xs text-muted-foreground">{r.referred.email}</p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <p>
                    Reward:{" "}
                    <span className="font-medium">
                      {r.status === "COMPLETED" && (r.rewardAmount ?? 0) === 0
                        ? "Cancelled"
                        : formatRs(r.rewardAmount ?? 0)}
                    </span>
                  </p>
                  <p>
                    Rewarded:{" "}
                    <span className="font-medium">{formatDateTime(r.rewardedAt)}</span>
                  </p>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Created: {formatDateTime(r.createdAt)}
                  </p>
                </div>
                {r.status === "PENDING" && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => setPayTarget(r)}
                    >
                      Pay reward
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === r.id}
                      onClick={() => setCancelTarget(r)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* PAY confirm */}
      <AlertDialog open={payTarget !== null} onOpenChange={(o) => !o && setPayTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pay referral reward?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatRs(rewardConfigured)} will be credited to{" "}
              <span className="font-medium text-foreground">{payTarget?.referrer.email}</span> (the
              referrer&apos;s RAJA wallet). This is a financial action and is audit-logged. Payment
              is idempotent — it can never be applied twice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (payTarget) void act(payTarget, "PAY_REWARD");
              }}
              disabled={acting}
            >
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Pay reward
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CANCEL confirm */}
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => !o && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel referral reward?</AlertDialogTitle>
            <AlertDialogDescription>
              The referral for <span className="font-medium text-foreground">{cancelTarget?.referred.email}</span>{" "}
              will be marked completed with a reward of Rs 0. The referrer will be notified that the
              referral was cancelled. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (cancelTarget) void act(cancelTarget, "CANCEL");
              }}
              disabled={acting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Cancel referral
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
