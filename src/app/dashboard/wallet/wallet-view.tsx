"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { HandCoins, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDateTime, formatRs } from "@/lib/format";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TxDTO = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  description: string;
  createdAt: string;
};

type WdDTO = {
  id: string;
  amount: number;
  accountName: string;
  accountNumber: string;
  method: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
};

type WalletData = {
  wallet: { balance: number };
  transactions: TxDTO[];
  withdrawals: WdDTO[];
};

export function WalletView() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [wdOpen, setWdOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<WalletData>("/api/wallet");
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load your wallet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const balance = data?.wallet.balance ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet"
        description="Your balance, transactions and withdrawal requests."
        actions={
          <Button onClick={() => setWdOpen(true)} className="font-display tracking-wide">
            <HandCoins className="h-4 w-4" aria-hidden="true" /> Request Withdrawal
          </Button>
        }
      />

      <section aria-label="Wallet balance">
        <StatCard
          title="Available Balance"
          value={loading ? "…" : formatRs(balance)}
          icon={<Wallet />}
          tone="gold"
          hint="Withdrawals are paid via EasyPaisa after admin approval"
          className="max-w-md"
        />
      </section>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Transactions */}
          <section aria-label="Wallet transactions" className="card-raja p-4 sm:p-5">
            <h2 className="mb-3 font-display text-lg font-semibold tracking-wide">Transactions</h2>
            {!data || data.transactions.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                description="Tournament prizes, referral rewards and marketplace payouts will appear here."
              />
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {/* Desktop table */}
                <div className="hidden overflow-x-auto rounded-md border border-border/60 md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.transactions.map((t) => (
                        <TxRow key={t.id} tx={t} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Mobile cards */}
                <ul className="space-y-2 md:hidden">
                  {data.transactions.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5"
                    >
                      <TxRow tx={t} mobile />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Withdrawals */}
          <section aria-label="Withdrawal requests" className="card-raja p-4 sm:p-5">
            <h2 className="mb-3 font-display text-lg font-semibold tracking-wide">
              Withdrawal Requests
            </h2>
            {!data || data.withdrawals.length === 0 ? (
              <EmptyState
                title="No withdrawals yet"
                description="Request a withdrawal and admins will pay it out via EasyPaisa."
              />
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {data.withdrawals.map((w) => (
                  <li
                    key={w.id}
                    className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{formatRs(w.amount)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {w.accountName} · <span className="font-mono">{w.accountNumber}</span> ·{" "}
                          {formatDateTime(w.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={w.status} />
                    </div>
                    {w.adminNotes && (
                      <p className="mt-2 rounded-md border border-amber-600/40 bg-amber-600/10 px-2 py-1.5 text-xs text-amber-500">
                        Admin note: {w.adminNotes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Alert>
        <Wallet className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>About your wallet</AlertTitle>
        <AlertDescription>
          Wallet funds come from tournament prizes, referral rewards and marketplace payouts.
          Withdrawals are paid manually via EasyPaisa after admin approval.
        </AlertDescription>
      </Alert>

      <WithdrawDialog
        open={wdOpen}
        balance={balance}
        onOpenChange={setWdOpen}
        onRequested={() => {
          setWdOpen(false);
          void load();
        }}
      />
    </div>
  );
}

function reasonLabel(reason: string): string {
  return reason.toLowerCase().replaceAll("_", " ");
}

function TxRow({ tx, mobile = false }: { tx: TxDTO; mobile?: boolean }) {
  const isCredit = tx.type === "CREDIT";
  const amount = (
    <span
      className={`whitespace-nowrap font-display font-bold ${
        isCredit ? "text-emerald-400" : "text-destructive"
      }`}
    >
      {isCredit ? "+ " : "− "}
      {formatRs(tx.amount)}
    </span>
  );

  if (mobile) {
    return (
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{tx.description}</p>
          {amount}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
          <Badge
            variant="outline"
            className={
              isCredit
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }
          >
            {isCredit ? "Credit" : "Debit"}
          </Badge>
          <span>
            {reasonLabel(tx.reason)} · balance {formatRs(tx.balanceAfter)} ·{" "}
            {formatDateTime(tx.createdAt)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDateTime(tx.createdAt)}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            isCredit
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }
        >
          {isCredit ? "Credit" : "Debit"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="font-medium">{tx.description}</div>
        <div className="text-xs text-muted-foreground">{reasonLabel(tx.reason)}</div>
      </TableCell>
      <TableCell className="text-right">{amount}</TableCell>
      <TableCell className="whitespace-nowrap text-right text-sm">
        {formatRs(tx.balanceAfter)}
      </TableCell>
    </TableRow>
  );
}

function WithdrawDialog({
  open,
  balance,
  onOpenChange,
  onRequested,
}: {
  open: boolean;
  balance: number;
  onOpenChange: (v: boolean) => void;
  onRequested: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);

  const amountNum = Number(amount);
  const exceedsBalance =
    amount.trim() !== "" && Number.isFinite(amountNum) && amountNum > balance;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!Number.isInteger(amountNum) || amountNum < 1) {
      toast.error("Enter a valid amount in whole rupees.");
      return;
    }
    if (amountNum > balance) {
      toast.error("Amount exceeds your available balance.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/withdrawals", {
        method: "POST",
        json: {
          amount: amountNum,
          accountName: accountName.trim(),
          accountNumber: accountNumber.trim(),
        },
      });
      toast.success("Withdrawal request submitted — admins will review and pay it out.");
      setAmount("");
      setAccountName("");
      setAccountNumber("");
      onRequested();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit withdrawal request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Request Withdrawal</DialogTitle>
          <DialogDescription>
            Payouts are sent manually via EasyPaisa after admin approval.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wd-amount">Amount (Rs)</Label>
            <Input
              id="wd-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 500"
              inputMode="numeric"
              maxLength={8}
              required
            />
            <p className="text-xs text-muted-foreground">
              Available: {formatRs(balance)}
            </p>
            {exceedsBalance && (
              <p className="text-xs font-medium text-destructive">
                Amount exceeds your available balance.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wd-name">EasyPaisa account title</Label>
            <Input
              id="wd-name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Full name on the account"
              maxLength={60}
              minLength={3}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wd-number">EasyPaisa account number</Label>
            <Input
              id="wd-number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="03xxxxxxxxx"
              inputMode="tel"
              maxLength={24}
              minLength={5}
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || exceedsBalance}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {busy ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
