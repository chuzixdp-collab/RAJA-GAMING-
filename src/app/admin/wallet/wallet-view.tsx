"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Search, Wallet as WalletIcon, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDateTime, formatRs } from "@/lib/format";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/app/admin/_components/confirm-dialog";

type TxRow = {
  id: string;
  userId: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  balanceAfter: number;
  reason: string;
  description: string;
  reference: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string } | null;
};

type WithdrawalRow = {
  id: string;
  userId: string;
  amount: number;
  accountName: string;
  accountNumber: string;
  method: string;
  status: "PENDING" | "APPROVED" | "PAID" | "REJECTED";
  adminNotes: string | null;
  processedAt: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string };
};

type WalletResponse = { transactions: TxRow[]; withdrawals: WithdrawalRow[] };

type UserOption = { id: string; email: string; name: string };

type WithdrawalAction = { withdrawal: WithdrawalRow; kind: "APPROVE" | "MARK_PAID" | "REJECT" };

const TX_REASONS = [
  "TOURNAMENT_PRIZE",
  "REFERRAL_REWARD",
  "SELLER_PAYOUT",
  "REFUND",
  "WITHDRAWAL",
  "ADMIN_ADJUSTMENT",
] as const;

export function WalletView() {
  const [data, setData] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState("ALL");
  const [reasonFilter, setReasonFilter] = useState("ALL");

  const [withdrawalAction, setWithdrawalAction] = useState<WithdrawalAction | null>(null);
  const [busy, setBusy] = useState(false);

  // adjust form
  const [userQuery, setUserQuery] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (reasonFilter !== "ALL") params.set("reason", reasonFilter);
      const res = await apiFetch<WalletResponse>(`/api/admin/wallet?${params.toString()}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wallet data.");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, reasonFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // user search for the adjust form (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (userQuery.trim().length < 2) {
        setUserOptions([]);
        return;
      }
      setSearchingUsers(true);
      try {
        const res = await apiFetch<{ users: { id: string; email: string; name: string }[] }>(
          `/api/admin/users?query=${encodeURIComponent(userQuery.trim())}`
        );
        setUserOptions(res.users.slice(0, 8).map((u) => ({ id: u.id, email: u.email, name: u.name })));
      } catch {
        setUserOptions([]);
      } finally {
        setSearchingUsers(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [userQuery]);

  const transactions = data?.transactions ?? [];
  const withdrawals = data?.withdrawals ?? [];

  async function runWithdrawalAction(kind: WithdrawalAction["kind"], note?: string) {
    if (!withdrawalAction) return;
    setBusy(true);
    try {
      await apiFetch("/api/admin/withdrawals", {
        method: "PATCH",
        json: { withdrawalId: withdrawalAction.withdrawal.id, action: kind, note },
      });
      toast.success(
        kind === "APPROVE"
          ? "Withdrawal approved"
          : kind === "MARK_PAID"
            ? "Withdrawal marked as paid"
            : "Withdrawal rejected and refunded"
      );
      setWithdrawalAction(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function adjustWallet() {
    const amountNum = Number(amount);
    if (!selectedUser) {
      toast.error("Select a user first.");
      return;
    }
    if (!Number.isInteger(amountNum) || amountNum === 0) {
      toast.error("Amount must be a non-zero whole number of rupees.");
      return;
    }
    if (description.trim().length < 3) {
      toast.error("Please describe the adjustment (min 3 characters).");
      return;
    }
    setAdjusting(true);
    try {
      await apiFetch("/api/admin/wallet", {
        method: "POST",
        json: { userId: selectedUser.id, amount: amountNum, description: description.trim() },
      });
      toast.success(
        `${formatRs(Math.abs(amountNum))} ${amountNum > 0 ? "credited to" : "debited from"} ${selectedUser.email}`
      );
      setSelectedUser(null);
      setUserQuery("");
      setUserOptions([]);
      setAmount("");
      setDescription("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Adjustment failed.");
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet"
        description="Platform-wide transactions, withdrawal requests and manual balance adjustments."
      />

      <Tabs defaultValue="transactions">
        <TabsList className="flex h-auto w-full flex-wrap gap-1 sm:flex-nowrap">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
          <TabsTrigger value="adjust">Adjust balance</TabsTrigger>
        </TabsList>

        {/* ---------- Transactions ---------- */}
        <TabsContent value="transactions">
          <Card className="card-raja">
            <CardContent className="p-4 sm:p-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full sm:w-40" aria-label="Filter by type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All types</SelectItem>
                    <SelectItem value="CREDIT">Credit</SelectItem>
                    <SelectItem value="DEBIT">Debit</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={reasonFilter} onValueChange={setReasonFilter}>
                  <SelectTrigger className="w-full sm:w-56" aria-label="Filter by reason">
                    <SelectValue placeholder="Reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All reasons</SelectItem>
                    {TX_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading transactions" />}
                <p className="text-xs text-muted-foreground sm:ml-auto">{transactions.length} transactions (max 150)</p>
              </div>

              {error ? (
                <EmptyState
                  icon={<WalletIcon />}
                  title="Could not load transactions"
                  description={error}
                  action={
                    <Button variant="outline" size="sm" onClick={() => void load()}>
                      Retry
                    </Button>
                  }
                />
              ) : loading && !data ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <EmptyState
                  icon={<WalletIcon />}
                  title="No transactions"
                  description="No wallet activity matches the current filters."
                />
              ) : (
                <div className="max-h-[70vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Balance after</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-xs text-muted-foreground">{formatDateTime(tx.createdAt)}</TableCell>
                          <TableCell className="max-w-[180px] truncate" title={tx.user?.email ?? tx.userId}>
                            {tx.user?.email ?? tx.userId}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                tx.type === "CREDIT"
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                  : "border-destructive/40 bg-destructive/10 text-destructive"
                              }
                            >
                              {tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell className={tx.type === "CREDIT" ? "text-emerald-400" : "text-destructive"}>
                            {tx.type === "CREDIT" ? "+" : "-"}
                            {formatRs(tx.amount)}
                          </TableCell>
                          <TableCell>{formatRs(tx.balanceAfter)}</TableCell>
                          <TableCell className="text-xs">{tx.reason.replaceAll("_", " ")}</TableCell>
                          <TableCell className="max-w-[220px] truncate text-xs" title={tx.description}>
                            {tx.description}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{tx.reference ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Withdrawals ---------- */}
        <TabsContent value="withdrawals">
          <Card className="card-raja">
            <CardContent className="p-4 sm:p-6">
              {error ? (
                <EmptyState icon={<WalletIcon />} title="Could not load withdrawals" description={error} />
              ) : loading && !data ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : withdrawals.length === 0 ? (
                <EmptyState
                  icon={<WalletIcon />}
                  title="No withdrawal requests"
                  description="User payout requests will appear here."
                />
              ) : (
                <div className="max-h-[70vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Processed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {withdrawals.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell className="text-xs text-muted-foreground">{formatDateTime(w.createdAt)}</TableCell>
                          <TableCell className="max-w-[180px] truncate" title={w.user.email}>
                            {w.user.email}
                          </TableCell>
                          <TableCell className="font-medium">{formatRs(w.amount)}</TableCell>
                          <TableCell>
                            <p className="text-xs font-medium">{w.accountName}</p>
                            <p className="font-mono text-xs text-muted-foreground">{w.accountNumber}</p>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={w.status} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDateTime(w.processedAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {w.status === "PENDING" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setWithdrawalAction({ withdrawal: w, kind: "APPROVE" })}
                                  >
                                    <Check className="h-4 w-4" aria-hidden="true" /> Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setWithdrawalAction({ withdrawal: w, kind: "REJECT" })}
                                  >
                                    <X className="h-4 w-4" aria-hidden="true" /> Reject
                                  </Button>
                                </>
                              )}
                              {w.status === "APPROVED" && (
                                <>
                                  <Button size="sm" onClick={() => setWithdrawalAction({ withdrawal: w, kind: "MARK_PAID" })}>
                                    Mark paid
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setWithdrawalAction({ withdrawal: w, kind: "REJECT" })}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Adjust ---------- */}
        <TabsContent value="adjust">
          <Card className="card-raja">
            <CardContent className="max-w-xl p-4 sm:p-6">
              <p className="mb-4 text-sm text-muted-foreground">
                Manually credit or debit a user wallet. Every adjustment is audit-logged and the user is notified.
                Use a negative amount to debit — debits fail if the balance is insufficient.
              </p>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="adj-user">User</Label>
                  {selectedUser ? (
                    <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                      <span className="truncate">
                        {selectedUser.name} &middot; {selectedUser.email}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)} aria-label="Clear selected user">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          id="adj-user"
                          value={userQuery}
                          onChange={(e) => setUserQuery(e.target.value)}
                          placeholder="Search by name or email..."
                          className="pl-9"
                          autoComplete="off"
                        />
                      </div>
                      {searchingUsers && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Searching users" />}
                      {userOptions.length > 0 && (
                        <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                          {userOptions.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                              onClick={() => {
                                setSelectedUser(u);
                                setUserOptions([]);
                                setUserQuery(u.email);
                              }}
                            >
                              <span className="truncate">{u.name}</span>
                              <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="adj-amount">Amount (Rs) — negative to debit</Label>
                  <Input
                    id="adj-amount"
                    type="number"
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 500 or -250"
                  />
                  {Number.isInteger(Number(amount)) && Number(amount) !== 0 && (
                    <p className={`text-xs ${Number(amount) > 0 ? "text-emerald-400" : "text-destructive"}`}>
                      {Number(amount) > 0 ? "Credit" : "Debit"} of {formatRs(Math.abs(Number(amount)))}
                    </p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="adj-desc">Description</Label>
                  <Input
                    id="adj-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Compensation for failed top-up"
                    maxLength={200}
                  />
                </div>

                <div>
                  <Button onClick={() => void adjustWallet()} disabled={adjusting} className="gap-2">
                    {adjusting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Apply adjustment
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Withdrawal confirm */}
      <ConfirmDialog
        open={!!withdrawalAction}
        onOpenChange={(open) => !open && setWithdrawalAction(null)}
        title={
          withdrawalAction
            ? withdrawalAction.kind === "APPROVE"
              ? `Approve withdrawal of ${formatRs(withdrawalAction.withdrawal.amount)}?`
              : withdrawalAction.kind === "MARK_PAID"
                ? `Mark ${formatRs(withdrawalAction.withdrawal.amount)} as paid?`
                : `Reject withdrawal of ${formatRs(withdrawalAction.withdrawal.amount)}?`
            : ""
        }
        description={
          withdrawalAction
            ? withdrawalAction.kind === "APPROVE"
              ? "The request is queued for transfer. The wallet was already debited when the user requested the withdrawal."
              : withdrawalAction.kind === "MARK_PAID"
                ? `Confirm you have transferred ${formatRs(
                    withdrawalAction.withdrawal.amount
                  )} to ${withdrawalAction.withdrawal.accountName} (${withdrawalAction.withdrawal.accountNumber}).`
                : "The amount will be refunded to the user wallet automatically."
            : ""
        }
        confirmLabel={
          withdrawalAction
            ? withdrawalAction.kind === "APPROVE"
              ? "Approve"
              : withdrawalAction.kind === "MARK_PAID"
                ? "Mark paid"
                : "Reject and refund"
            : "Confirm"
        }
        destructive={withdrawalAction?.kind === "REJECT"}
        note={withdrawalAction?.kind === "REJECT"}
        notePlaceholder="Reason (optional)"
        busy={busy}
        onConfirm={(noteText) => {
          if (!withdrawalAction) return Promise.resolve();
          return runWithdrawalAction(withdrawalAction.kind, noteText);
        }}
      />
    </div>
  );
}
