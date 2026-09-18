"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Share2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDate, formatRs } from "@/lib/format";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/status-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { StatCard } from "@/components/shared/stat-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type ReferralDTO = {
  id: string;
  status: string;
  rewardAmount: number | null;
  rewardedAt: string | null;
  createdAt: string;
  referred: { name: string; email: string; createdAt: string };
};

type ReferralsData = {
  referralCode: string;
  referrals: ReferralDTO[];
  totalEarned: number;
};

const STEPS = [
  {
    title: "1. Share your code",
    body: "Send your referral code or link to friends who play Free Fire.",
  },
  {
    title: "2. They sign up and buy",
    body: "Your friend registers with your code and completes a purchase.",
  },
  {
    title: "3. You earn rewards",
    body: "The referral reward is credited straight to your wallet.",
  },
];

function maskName(name: string): string {
  const n = name.trim();
  if (!n) return "Hidden";
  return `${n[0]}${"*".repeat(Math.max(1, Math.min(4, n.length - 1)))}`;
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "hidden";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

export function ReferralsView() {
  const [data, setData] = useState<ReferralsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<ReferralsData>("/api/referrals");
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load your referrals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    setOrigin(window.location.origin);
  }, [load]);

  const code = data?.referralCode ?? "";
  const shareLink = origin && code ? `${origin}/register?ref=${code}` : "";
  const totalReferred = data?.referrals.length ?? 0;
  const completed = data?.referrals.filter((r) => r.status === "COMPLETED").length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referrals"
        description="Invite friends and earn rewards when they join."
      />

      {/* Referral code card */}
      <section aria-label="Your referral code" className="card-raja card-glow p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-display text-lg font-semibold tracking-wide">
              <Share2 className="h-5 w-5 text-primary" aria-hidden="true" /> Your referral code
            </p>
            {loading ? (
              <Skeleton className="mt-3 h-9 w-40" />
            ) : (
              <p className="mt-2 font-mono text-3xl font-bold tracking-widest text-primary sm:text-4xl">
                {code}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              New users can paste your code at signup.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {code && <CopyButton value={code} label="referral code" className="justify-center" />}
            {shareLink ? (
              <div className="flex w-full items-center gap-2 sm:w-96">
                <Input value={shareLink} readOnly aria-label="Referral link" className="font-mono text-xs" />
                <CopyButton value={shareLink} label="referral link" />
              </div>
            ) : (
              <Skeleton className="h-8 w-full sm:w-96" />
            )}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section aria-label="Referral stats" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Total Referred" value={String(totalReferred)} icon={<Users />} hint="Friends who joined" />
        <StatCard
          title="Completed"
          value={String(completed)}
          icon={<CheckCircle2 />}
          hint="Finished their first purchase"
        />
        <StatCard title="Earned" value={formatRs(data?.totalEarned ?? 0)} icon={<UserPlus />} tone="gold" hint="Rewards credited to your wallet" />
      </section>

      {/* Referred users */}
      <section aria-label="Referred users" className="card-raja p-4 sm:p-5">
        <h2 className="mb-3 font-display text-lg font-semibold tracking-wide">Referred users</h2>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !data || data.referrals.length === 0 ? (
          <EmptyState
            title="No referrals yet"
            description="Share your code above — when a friend registers you will see them here."
          />
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {data.referrals.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{maskName(r.referred.name)}</p>
                  <p className="truncate text-xs text-muted-foreground">{maskEmail(r.referred.email)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-muted-foreground">Joined {formatDate(r.createdAt)}</span>
                  <span className="text-sm font-medium text-primary">
                    {r.rewardAmount != null ? formatRs(r.rewardAmount) : "—"}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* How it works */}
      <section aria-label="How referrals work" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.title} className="card-raja p-4">
            <p className="font-display font-semibold tracking-wide text-primary">{s.title}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
