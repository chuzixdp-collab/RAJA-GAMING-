"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  ShieldX,
  User as UserIcon,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDateTime, formatRs } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/app/admin/_components/confirm-dialog";

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "USER" | "ADMIN";
  banned: boolean;
  banReason: string | null;
  referralCode: string;
  createdAt: string;
  wallet: { balance: number } | null;
  _count: { orders: number };
};

type UsersResponse = {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

type PendingAction = {
  user: AdminUserRow;
  action: "BAN" | "UNBAN" | "MAKE_ADMIN" | "MAKE_USER";
};

export function UsersView() {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const [detailUser, setDetailUser] = useState<AdminUserRow | null>(null);

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      params.set("page", String(page));
      const res = await apiFetch<UsersResponse>(`/api/admin/users?${params.toString()}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = pendingAction?.user ?? null;

  const dialogProps = useMemo(() => {
    if (!current) return null;
    switch (pendingAction?.action) {
      case "BAN":
        return {
          title: `Ban ${current.email}?`,
          description:
            "The user will be signed out everywhere and cannot sign in again. Enter the reason — it is stored on the account and audit log.",
          confirmLabel: "Ban user",
          destructive: true,
        };
      case "UNBAN":
        return {
          title: `Unban ${current.email}?`,
          description: "The user will be able to sign in again immediately.",
          confirmLabel: "Unban user",
          destructive: false,
        };
      case "MAKE_ADMIN":
        return {
          title: `Grant admin to ${current.email}?`,
          description:
            "Admins can verify payments, move money and change site settings. Only grant this to people you trust.",
          confirmLabel: "Make admin",
          destructive: false,
        };
      case "MAKE_USER":
        return {
          title: `Revoke admin from ${current.email}?`,
          description: "The account loses all administrator privileges and active sessions.",
          confirmLabel: "Revoke admin",
          destructive: true,
        };
      default:
        return null;
    }
  }, [current, pendingAction]);

  async function runAction(action: PendingAction["action"], noteText?: string) {
    if (!current) return;
    setBusy(true);
    try {
      await apiFetch("/api/admin/users", {
        method: "PATCH",
        json: { userId: current.id, action, note: noteText },
      });
      toast.success(
        action === "BAN"
          ? "User banned"
          : action === "UNBAN"
            ? "User unbanned"
            : action === "MAKE_ADMIN"
              ? "Admin access granted"
              : "Admin access revoked"
      );
      await load();
      setDetailUser((prev) =>
        prev && prev.id === current.id
          ? { ...prev, banned: action === "BAN" ? true : action === "UNBAN" ? false : prev.banned, role: action === "MAKE_ADMIN" ? "ADMIN" : action === "MAKE_USER" ? "USER" : prev.role }
          : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description={data ? `${data.total.toLocaleString("en-PK")} registered accounts` : "All registered accounts"}
      />

      <Card className="card-raja">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Search by name or email..."
                className="pl-9"
                aria-label="Search users"
              />
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading users" />}
          </div>

          {error ? (
            <EmptyState
              icon={<UsersIcon />}
              title="Could not load users"
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
          ) : !data || data.users.length === 0 ? (
            <EmptyState
              icon={<UsersIcon />}
              title="No users found"
              description={query ? `Nothing matches "${query}".` : "No accounts registered yet."}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Wallet</TableHead>
                      <TableHead>Orders</TableHead>
                      <TableHead>Referral code</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.users.map((user) => (
                      <TableRow
                        key={user.id}
                        className="cursor-pointer"
                        onClick={() => setDetailUser(user)}
                      >
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell className="max-w-[220px] truncate" title={user.email}>
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              user.role === "ADMIN"
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "text-muted-foreground"
                            }
                          >
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.banned ? (
                            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                              BANNED
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              ACTIVE
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatRs(user.wallet?.balance ?? 0)}</TableCell>
                        <TableCell>{user._count.orders}</TableCell>
                        <TableCell className="font-mono text-xs">{user.referralCode}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${user.email}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel>Manage user</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {user.banned ? (
                                <DropdownMenuItem onSelect={() => setPendingAction({ user, action: "UNBAN" })}>
                                  <ShieldCheck className="h-4 w-4" /> Unban
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => setPendingAction({ user, action: "BAN" })}
                                >
                                  <ShieldX className="h-4 w-4" /> Ban
                                </DropdownMenuItem>
                              )}
                              {user.role === "ADMIN" ? (
                                <DropdownMenuItem
                                  onSelect={() => setPendingAction({ user, action: "MAKE_USER" })}
                                >
                                  <UserIcon className="h-4 w-4" /> Make user
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => setPendingAction({ user, action: "MAKE_ADMIN" })}>
                                  <ShieldCheck className="h-4 w-4" /> Make admin
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {data.page} of {data.pages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pages || loading}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Next page"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Ban / role confirm dialog */}
      <ConfirmDialog
        open={!!pendingAction && dialogProps !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={dialogProps?.title ?? ""}
        description={dialogProps?.description ?? ""}
        confirmLabel={dialogProps?.confirmLabel ?? "Confirm"}
        destructive={dialogProps?.destructive}
        note={pendingAction?.action === "BAN"}
        notePlaceholder="Reason for ban (stored on the account)"
        busy={busy}
        onConfirm={(noteText) => {
          if (!pendingAction) return Promise.resolve();
          return runAction(pendingAction.action, noteText);
        }}
      />

      {/* User detail dialog */}
      <Dialog open={!!detailUser} onOpenChange={(open) => !open && setDetailUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">User details</DialogTitle>
            <DialogDescription>Profile, wallet and activity snapshot.</DialogDescription>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <p className="font-medium">{detailUser.name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="truncate font-medium" title={detailUser.email}>
                    {detailUser.email}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <p className="font-medium">{detailUser.phone || "Not set"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Role</Label>
                  <p className="font-medium">{detailUser.role}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Wallet balance</Label>
                  <p className="font-medium text-primary">{formatRs(detailUser.wallet?.balance ?? 0)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Orders placed</Label>
                  <p className="font-medium">{detailUser._count.orders}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Referral code</Label>
                  <p className="font-mono text-xs">{detailUser.referralCode}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Joined</Label>
                  <p className="text-xs">{formatDateTime(detailUser.createdAt)}</p>
                </div>
              </div>
              {detailUser.banned && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <p className="font-medium text-destructive">This account is banned</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reason: {detailUser.banReason || "No reason recorded"}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
