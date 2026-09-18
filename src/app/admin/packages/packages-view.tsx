"use client";

import { useCallback, useEffect, useState } from "react";
import { Gem, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatRs } from "@/lib/format";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/app/admin/_components/confirm-dialog";

type PackageRow = {
  id: string;
  title: string;
  diamonds: number;
  price: number;
  description: string | null;
  badge: string | null;
  active: boolean;
  sortOrder: number;
  _count: { orders: number };
};

type FormState = {
  title: string;
  diamonds: string;
  price: string;
  description: string;
  badge: string;
  active: boolean;
  sortOrder: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  diamonds: "",
  price: "",
  description: "",
  badge: "",
  active: true,
  sortOrder: "0",
};

export function PackagesView() {
  const [packages, setPackages] = useState<PackageRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PackageRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PackageRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ packages: PackageRow[] }>("/api/admin/packages");
      setPackages(res.packages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load packages.");
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

  function openEdit(pkg: PackageRow) {
    setEditing(pkg);
    setForm({
      title: pkg.title,
      diamonds: String(pkg.diamonds),
      price: String(pkg.price),
      description: pkg.description ?? "",
      badge: pkg.badge ?? "",
      active: pkg.active,
      sortOrder: String(pkg.sortOrder),
    });
    setDialogOpen(true);
  }

  async function save() {
    const diamonds = Number(form.diamonds);
    const price = Number(form.price);
    const sortOrder = Number(form.sortOrder || "0");
    if (!form.title.trim() || !Number.isInteger(diamonds) || diamonds <= 0 || !Number.isInteger(price) || price <= 0) {
      toast.error("Please provide a title, whole-number diamonds and price.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        diamonds,
        price,
        description: form.description.trim(),
        badge: form.badge.trim(),
        active: form.active,
        sortOrder,
      };
      if (editing) {
        await apiFetch("/api/admin/packages", { method: "PATCH", json: { id: editing.id, ...payload } });
        toast.success("Package updated");
      } else {
        await apiFetch("/api/admin/packages", { method: "POST", json: payload });
        toast.success("Package created");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(pkg: PackageRow, active: boolean) {
    // optimistic update
    setPackages((prev) =>
      prev ? prev.map((p) => (p.id === pkg.id ? { ...p, active } : p)) : prev
    );
    try {
      await apiFetch("/api/admin/packages", { method: "PATCH", json: { id: pkg.id, active } });
      toast.success(active ? "Package activated" : "Package deactivated");
    } catch (e) {
      setPackages((prev) =>
        prev ? prev.map((p) => (p.id === pkg.id ? { ...p, active: !active } : p)) : prev
      );
      toast.error(e instanceof Error ? e.message : "Could not update package.");
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/packages?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      toast.success("Package deleted");
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
        title="Diamond Packages"
        description="Top-up packages shown on the public store. Inactive packages are hidden from players."
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> New package
          </Button>
        }
      />

      <Card className="card-raja">
        <CardContent className="p-4 sm:p-6">
          {error ? (
            <EmptyState
              icon={<Gem />}
              title="Could not load packages"
              description={error}
              action={
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          ) : loading && !packages ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !packages || packages.length === 0 ? (
            <EmptyState
              icon={<Gem />}
              title="No packages yet"
              description="Create your first diamond package so players can top up."
              action={
                <Button size="sm" onClick={openCreate}>
                  Create package
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Diamonds</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Badge</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Sort</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map((pkg) => (
                    <TableRow key={pkg.id}>
                      <TableCell className="max-w-[220px]">
                        <p className="truncate font-medium" title={pkg.title}>
                          {pkg.title}
                        </p>
                        {pkg.description && (
                          <p className="max-w-[220px] truncate text-xs text-muted-foreground" title={pkg.description}>
                            {pkg.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-primary">{pkg.diamonds.toLocaleString("en-PK")}</TableCell>
                      <TableCell>{formatRs(pkg.price)}</TableCell>
                      <TableCell>
                        {pkg.badge ? (
                          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                            {pkg.badge}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={pkg.active}
                          onCheckedChange={(checked) => void toggleActive(pkg, checked)}
                          aria-label={`Toggle ${pkg.title} active`}
                        />
                      </TableCell>
                      <TableCell>{pkg.sortOrder}</TableCell>
                      <TableCell>{pkg._count.orders}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(pkg)} aria-label={`Edit ${pkg.title}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(pkg)}
                            aria-label={`Delete ${pkg.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Edit package" : "New package"}</DialogTitle>
            <DialogDescription>
              Prices are whole rupees. The server validates every field before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pkg-title">Title</Label>
              <Input
                id="pkg-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. 560 Diamonds"
                maxLength={60}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pkg-diamonds">Diamonds</Label>
                <Input
                  id="pkg-diamonds"
                  type="number"
                  min={1}
                  value={form.diamonds}
                  onChange={(e) => setForm((f) => ({ ...f, diamonds: e.target.value }))}
                  placeholder="560"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pkg-price">Price (Rs)</Label>
                <Input
                  id="pkg-price"
                  type="number"
                  min={1}
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="1400"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pkg-badge">Badge (optional)</Label>
                <Input
                  id="pkg-badge"
                  value={form.badge}
                  onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                  placeholder="POPULAR"
                  maxLength={20}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pkg-sort">Sort order</Label>
                <Input
                  id="pkg-sort"
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pkg-desc">Description (optional)</Label>
              <Textarea
                id="pkg-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                maxLength={300}
                placeholder="Short marketing line shown under the package"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 p-3">
              <div>
                <Label htmlFor="pkg-active">Active</Label>
                <p className="text-xs text-muted-foreground">Visible on the public top-up page</p>
              </div>
              <Switch
                id="pkg-active"
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
              {editing ? "Save changes" : "Create package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete "${deleteTarget.title}"?` : ""}
        description={
          deleteTarget && deleteTarget._count.orders > 0
            ? `This package already has ${deleteTarget._count.orders} orders — deletion will be rejected by the server. Deactivate it instead.`
            : "This permanently removes the package. Packages with existing orders cannot be deleted."
        }
        confirmLabel="Delete package"
        destructive
        busy={deleting}
        onConfirm={() => remove()}
      />
    </div>
  );
}
