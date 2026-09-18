"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, TicketPercent, Trash2 } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { ConfirmDialog } from "@/app/admin/_components/confirm-dialog";

type CouponRow = {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  active: boolean;
  _count: { redemptions: number };
};

type FormState = {
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: string;
  minOrder: string;
  maxDiscount: string;
  expiresAt: string; // datetime-local value
  usageLimit: string;
  perUserLimit: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  code: "",
  type: "FIXED",
  value: "",
  minOrder: "0",
  maxDiscount: "",
  expiresAt: "",
  usageLimit: "",
  perUserLimit: "1",
  active: true,
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function displayValue(coupon: CouponRow): string {
  return coupon.type === "PERCENTAGE" ? `${coupon.value}%` : formatRs(coupon.value);
}

export function CouponsView() {
  const [coupons, setCoupons] = useState<CouponRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CouponRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ coupons: CouponRow[] }>("/api/admin/coupons");
      setCoupons(res.coupons);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load coupons.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(coupon: CouponRow) {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: String(coupon.value),
      minOrder: String(coupon.minOrder),
      maxDiscount: coupon.maxDiscount === null ? "" : String(coupon.maxDiscount),
      expiresAt: toLocalInput(coupon.expiresAt),
      usageLimit: coupon.usageLimit === null ? "" : String(coupon.usageLimit),
      perUserLimit: String(coupon.perUserLimit),
      active: coupon.active,
    });
    setDialogOpen(true);
  }

  async function save() {
    const value = Number(form.value);
    const minOrder = Number(form.minOrder || "0");
    const perUserLimit = Number(form.perUserLimit || "1");
    if (!/^[A-Z0-9_-]{3,24}$/.test(form.code.trim().toUpperCase())) {
      toast.error("Code must be 3-24 letters, numbers, dashes or underscores.");
      return;
    }
    if (!Number.isInteger(value) || value <= 0) {
      toast.error("Value must be a positive whole number.");
      return;
    }
    if (form.type === "PERCENTAGE" && value > 100) {
      toast.error("Percentage value cannot exceed 100.");
      return;
    }
    const payload: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value,
      minOrder,
      maxDiscount: form.maxDiscount === "" ? null : Number(form.maxDiscount) || null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : "",
      usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit) || null,
      perUserLimit,
      active: form.active,
    };
    setSaving(true);
    try {
      if (editing) {
        await apiFetch("/api/admin/coupons", { method: "PATCH", json: { id: editing.id, ...payload } });
        toast.success("Coupon updated");
      } else {
        await apiFetch("/api/admin/coupons", { method: "POST", json: payload });
        toast.success("Coupon created");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(coupon: CouponRow, active: boolean) {
    setCoupons((prev) => (prev ? prev.map((c) => (c.id === coupon.id ? { ...c, active } : c)) : prev));
    try {
      await apiFetch("/api/admin/coupons", { method: "PATCH", json: { id: coupon.id, active } });
      toast.success(active ? "Coupon activated" : "Coupon deactivated");
    } catch (e) {
      setCoupons((prev) => (prev ? prev.map((c) => (c.id === coupon.id ? { ...c, active: !active } : c)) : prev));
      toast.error(e instanceof Error ? e.message : "Could not update coupon.");
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/coupons?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      toast.success("Coupon deleted");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coupons"
        description="Discount codes for top-up orders. Redeemed coupons should be deactivated, not deleted."
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> New coupon
          </Button>
        }
      />

      <Card className="card-raja">
        <CardContent className="p-4 sm:p-6">
          {error ? (
            <EmptyState
              icon={<TicketPercent />}
              title="Could not load coupons"
              description={error}
              action={
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          ) : loading && !coupons ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !coupons || coupons.length === 0 ? (
            <EmptyState
              icon={<TicketPercent />}
              title="No coupons yet"
              description="Create discount codes to reward players and drive sales."
              action={
                <Button size="sm" onClick={openCreate}>
                  Create coupon
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Min order</TableHead>
                    <TableHead>Max discount</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Per user</TableHead>
                    <TableHead>Redemptions</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((coupon) => {
                    const expired = coupon.expiresAt ? new Date(coupon.expiresAt).getTime() < Date.now() : false;
                    return (
                      <TableRow key={coupon.id}>
                        <TableCell className="font-mono text-xs font-semibold">{coupon.code}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={coupon.type === "PERCENTAGE" ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground"}>
                            {coupon.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{displayValue(coupon)}</TableCell>
                        <TableCell>{coupon.minOrder > 0 ? formatRs(coupon.minOrder) : "—"}</TableCell>
                        <TableCell>{coupon.maxDiscount ? formatRs(coupon.maxDiscount) : "—"}</TableCell>
                        <TableCell className={expired ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                          {coupon.expiresAt ? formatDateTime(coupon.expiresAt) : "Never"}
                          {expired ? " (expired)" : ""}
                        </TableCell>
                        <TableCell className="text-xs">
                          {coupon.usedCount}
                          {coupon.usageLimit ? ` / ${coupon.usageLimit}` : " used"}
                        </TableCell>
                        <TableCell>{coupon.perUserLimit}</TableCell>
                        <TableCell>{coupon._count.redemptions}</TableCell>
                        <TableCell>
                          <Switch
                            checked={coupon.active}
                            onCheckedChange={(checked) => void toggleActive(coupon, checked)}
                            aria-label={`Toggle ${coupon.code} active`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(coupon)} aria-label={`Edit ${coupon.code}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(coupon)}
                              aria-label={`Delete ${coupon.code}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Edit coupon" : "New coupon"}</DialogTitle>
            <DialogDescription>
              FIXED gives rupees off, PERCENTAGE gives a percent off (cap it with max discount).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="coupon-code">Code</Label>
                <Input
                  id="coupon-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="RAJA10"
                  maxLength={24}
                  className="font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as FormState["type"] }))}>
                  <SelectTrigger aria-label="Coupon type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Fixed (Rs off)</SelectItem>
                    <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="coupon-value">{form.type === "PERCENTAGE" ? "Percent off" : "Amount off (Rs)"}</Label>
                <Input
                  id="coupon-value"
                  type="number"
                  min={1}
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coupon-min">Min order (Rs)</Label>
                <Input
                  id="coupon-min"
                  type="number"
                  min={0}
                  value={form.minOrder}
                  onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="coupon-max">Max discount (Rs, optional)</Label>
                <Input
                  id="coupon-max"
                  type="number"
                  min={1}
                  value={form.maxDiscount}
                  onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))}
                  placeholder="Only for percentage"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coupon-expiry">Expires at (optional)</Label>
                <Input
                  id="coupon-expiry"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="coupon-limit">Total usage limit (optional)</Label>
                <Input
                  id="coupon-limit"
                  type="number"
                  min={1}
                  value={form.usageLimit}
                  onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                  placeholder="Unlimited if empty"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coupon-peruser">Per-user limit</Label>
                <Input
                  id="coupon-peruser"
                  type="number"
                  min={1}
                  max={100}
                  value={form.perUserLimit}
                  onChange={(e) => setForm((f) => ({ ...f, perUserLimit: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 p-3">
              <div>
                <Label htmlFor="coupon-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive codes are rejected at checkout</p>
              </div>
              <Switch
                id="coupon-active"
                checked={form.active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save changes" : "Create coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete coupon ${deleteTarget.code}?` : ""}
        description={
          deleteTarget && (deleteTarget.usedCount > 0 || deleteTarget._count.redemptions > 0)
            ? "This coupon has redemptions — the server will reject deletion. Deactivate it instead."
            : "This permanently removes the coupon."
        }
        confirmLabel="Delete coupon"
        destructive
        busy={deleting}
        onConfirm={() => remove()}
      />
    </div>
  );
}
