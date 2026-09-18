"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownUp, FileQuestion, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COMMON_CATEGORIES = [
  "GENERAL",
  "TOPUP",
  "PAYMENT",
  "ORDERS",
  "TOURNAMENT",
  "MARKETPLACE",
  "ACCOUNT",
  "REFUNDS",
] as const;

type FaqRow = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
};

type FormState = {
  id: string | null;
  question: string;
  answer: string;
  category: string; // selected option or "CUSTOM"
  customCategory: string;
  sortOrder: number;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  id: null,
  question: "",
  answer: "",
  category: "GENERAL",
  customCategory: "",
  sortOrder: 0,
  active: true,
};

export function FaqsView() {
  const [faqs, setFaqs] = useState<FaqRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FaqRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ faqs: FaqRow[] }>("/api/admin/faqs");
      setFaqs(data.faqs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load FAQs.");
      setFaqs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, FaqRow[]>();
    for (const f of faqs ?? []) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.question.localeCompare(b.question));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [faqs]);

  const stats = useMemo(() => {
    const list = faqs ?? [];
    return { total: list.length, active: list.filter((f) => f.active).length };
  }, [faqs]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, sortOrder: (faqs?.reduce((m, f) => Math.max(m, f.sortOrder), 0) ?? 0) + 1 });
    setDialogOpen(true);
  }

  function openEdit(faq: FaqRow) {
    const isCommon = (COMMON_CATEGORIES as readonly string[]).includes(faq.category);
    setForm({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      category: isCommon ? faq.category : "CUSTOM",
      customCategory: isCommon ? "" : faq.category,
      sortOrder: faq.sortOrder,
      active: faq.active,
    });
    setDialogOpen(true);
  }

  async function save() {
    const category = form.category === "CUSTOM" ? form.customCategory.trim() : form.category;
    if (!category) {
      toast.error("Category is required.");
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await apiFetch("/api/admin/faqs", {
          method: "PATCH",
          json: {
            id: form.id,
            question: form.question,
            answer: form.answer,
            category,
            sortOrder: form.sortOrder,
            active: form.active,
          },
        });
        toast.success("FAQ updated.");
      } else {
        await apiFetch("/api/admin/faqs", {
          method: "POST",
          json: {
            question: form.question,
            answer: form.answer,
            category,
            sortOrder: form.sortOrder,
            active: form.active,
          },
        });
        toast.success("FAQ created.");
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save FAQ.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/faqs?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      toast.success("FAQ deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete FAQ.");
    } finally {
      setDeleting(false);
    }
  }

  async function reorder(faq: FaqRow, sortOrder: number) {
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999 || sortOrder === faq.sortOrder) {
      return;
    }
    try {
      await apiFetch("/api/admin/faqs", {
        method: "PATCH",
        json: { id: faq.id, sortOrder },
      });
      toast.success("Order updated.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order.");
    }
  }

  return (
    <div>
      <PageHeader
        title="FAQs"
        description="Public FAQ content, grouped by category. Use sort order to control ordering."
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden /> New FAQ
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2" aria-label="FAQ summary">
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Total</span>
          <span className="font-display font-bold text-primary">{stats.total}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Active</span>
          <span className="font-display font-bold text-primary">{stats.active}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Categories</span>
          <span className="font-display font-bold text-primary">{grouped.length}</span>
        </div>
      </div>

      {faqs === null ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Could not load FAQs" description={error} />
      ) : faqs.length === 0 ? (
        <EmptyState
          icon={<FileQuestion />}
          title="No FAQs yet"
          description="Create your first FAQ entry — it goes live on the public FAQ page immediately."
          action={
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden /> New FAQ
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <section key={category} aria-label={`FAQ category ${category}`}>
              <div className="mb-2 flex items-center gap-3">
                <h2 className="font-display text-lg font-bold uppercase tracking-wide text-primary">
                  {category}
                </h2>
                <Badge variant="outline" className="text-xs">
                  {items.length} {items.length === 1 ? "entry" : "entries"}
                </Badge>
              </div>
              <Accordion type="single" collapsible className="card-raja px-4">
                {items.map((faq) => (
                  <AccordionItem key={faq.id} value={faq.id}>
                    <div className="flex flex-wrap items-center gap-2 py-1">
                      <span className="min-w-0 flex-1">
                        <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                          <span className="flex items-center gap-2">
                            {faq.question}
                            {!faq.active && (
                              <StatusBadge status="INACTIVE" className="shrink-0 text-[10px]" />
                            )}
                          </span>
                        </AccordionTrigger>
                      </span>
                      <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex items-center gap-1">
                          <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          <Input
                            type="number"
                            min={0}
                            max={999}
                            defaultValue={faq.sortOrder}
                            key={`${faq.id}-${faq.sortOrder}`}
                            className="h-8 w-16"
                            aria-label={`Sort order for: ${faq.question}`}
                            onBlur={(e) => void reorder(faq, Number(e.target.value))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void reorder(faq, Number((e.target as HTMLInputElement).value));
                              }
                            }}
                          />
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label={`Edit: ${faq.question}`}
                          onClick={() => openEdit(faq)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label={`Delete: ${faq.question}`}
                          onClick={() => setDeleteTarget(faq)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </span>
                    </div>
                    <AccordionContent>
                      <p className="whitespace-pre-wrap pb-3 text-sm text-muted-foreground">
                        {faq.answer}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display">{form.id ? "Edit FAQ" : "Create FAQ"}</DialogTitle>
            <DialogDescription>
              FAQs appear on the public FAQ page grouped by category, ordered by sort order.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="faq-question">Question</Label>
              <Input
                id="faq-question"
                value={form.question}
                onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                maxLength={200}
                placeholder="How long does a top-up take?"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="faq-answer">Answer</Label>
              <Textarea
                id="faq-answer"
                value={form.answer}
                onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                rows={5}
                maxLength={3000}
                placeholder="Write a clear, helpful answer..."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="faq-category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger id="faq-category" className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                    <SelectItem value="CUSTOM">Custom...</SelectItem>
                  </SelectContent>
                </Select>
                {form.category === "CUSTOM" && (
                  <Input
                    value={form.customCategory}
                    onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
                    placeholder="Custom category name"
                    maxLength={30}
                    aria-label="Custom category name"
                  />
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="faq-sort">Sort order</Label>
                <Input
                  id="faq-sort"
                  type="number"
                  min={0}
                  max={999}
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="faq-active"
                checked={form.active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
              />
              <Label htmlFor="faq-active">Active (visible on the public FAQ page)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {form.id ? "Save changes" : "Create FAQ"}
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
            <AlertDialogTitle>Delete FAQ?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.question}&quot; will be permanently removed from the public FAQ
              page. This cannot be undone.
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
