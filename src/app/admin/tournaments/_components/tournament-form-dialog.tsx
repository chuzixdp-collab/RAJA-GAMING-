"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TournamentFormValues = {
  title: string;
  description: string;
  rules: string;
  mode: string;
  map: string;
  entryFee: number;
  prizePool: string;
  perKillReward: number;
  slots: number;
  startsAt: string; // datetime-local value
  endsAt: string; // datetime-local value (may be empty)
};

export type TournamentFormData = {
  id: string;
  title: string;
  description: string;
  rules: string;
  mode: string;
  map: string;
  entryFee: number;
  prizePool: string | null;
  perKillReward: number;
  slots: number;
  startsAt: string;
  endsAt: string | null;
};

export const MODES = ["SOLO", "DUO", "SQUAD"] as const;
export const MAPS = ["BERMUDA", "PURGATORY", "KALAHARI", "ALPINE", "NEXTERRA"] as const;

const EMPTY_FORM: TournamentFormValues = {
  title: "",
  description: "",
  rules: "",
  mode: "SQUAD",
  map: "BERMUDA",
  entryFee: 0,
  prizePool: "",
  perKillReward: 0,
  slots: 48,
  startsAt: "",
  endsAt: "",
};

/** ISO date -> value usable by <input type="datetime-local"> (local time). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TournamentFormDialog({
  open,
  onOpenChange,
  tournament,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog edits an existing tournament (PATCH). */
  tournament?: TournamentFormData | null;
  onSaved: () => void;
}) {
  const editing = Boolean(tournament);
  const [values, setValues] = useState<TournamentFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (tournament) {
      setValues({
        title: tournament.title,
        description: tournament.description,
        rules: tournament.rules,
        mode: tournament.mode,
        map: tournament.map,
        entryFee: tournament.entryFee,
        prizePool: tournament.prizePool ?? "",
        perKillReward: tournament.perKillReward,
        slots: tournament.slots,
        startsAt: toLocalInput(tournament.startsAt),
        endsAt: toLocalInput(tournament.endsAt),
      });
    } else {
      setValues(EMPTY_FORM);
    }
  }, [open, tournament]);

  const set = <K extends keyof TournamentFormValues>(key: K, value: TournamentFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!values.startsAt) {
      toast.error("Start time is required.");
      return;
    }
    const startsAtIso = new Date(values.startsAt).toISOString();
    const endsAtIso = values.endsAt ? new Date(values.endsAt).toISOString() : "";
    setSaving(true);
    try {
      if (editing && tournament) {
        await apiFetch(`/api/admin/tournaments`, {
          method: "PATCH",
          json: {
            id: tournament.id,
            title: values.title,
            description: values.description,
            rules: values.rules,
            mode: values.mode,
            map: values.map,
            entryFee: values.entryFee,
            prizePool: values.prizePool,
            perKillReward: values.perKillReward,
            slots: values.slots,
            startsAt: startsAtIso,
            endsAt: endsAtIso,
          },
        });
        toast.success("Tournament updated.");
      } else {
        await apiFetch(`/api/admin/tournaments`, {
          method: "POST",
          json: {
            title: values.title,
            description: values.description,
            rules: values.rules,
            mode: values.mode,
            map: values.map,
            entryFee: values.entryFee,
            prizePool: values.prizePool,
            perKillReward: values.perKillReward,
            slots: values.slots,
            startsAt: startsAtIso,
            endsAt: endsAtIso,
          },
        });
        toast.success("Tournament created.");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            {editing ? "Edit Tournament" : "Create Tournament"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update tournament details. Room credentials are managed separately."
              : "Create a new Free Fire tournament. Status starts as DRAFT until you open registration."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="t-title">Title</Label>
            <Input
              id="t-title"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="RAJA SQUAD CLASH — Week 12"
              required
              minLength={4}
              maxLength={120}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-description">Description</Label>
            <Textarea
              id="t-description"
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe the tournament, format and prizes..."
              required
              minLength={10}
              maxLength={2000}
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-rules">Rules</Label>
            <Textarea
              id="t-rules"
              value={values.rules}
              onChange={(e) => set("rules", e.target.value)}
              placeholder="Match rules, conduct requirements, disqualification conditions..."
              required
              minLength={10}
              maxLength={5000}
              rows={4}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="t-mode">Mode</Label>
              <Select value={values.mode} onValueChange={(v) => set("mode", v)}>
                <SelectTrigger id="t-mode" className="w-full">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-map">Map</Label>
              <Select value={values.map} onValueChange={(v) => set("map", v)}>
                <SelectTrigger id="t-map" className="w-full">
                  <SelectValue placeholder="Select map" />
                </SelectTrigger>
                <SelectContent>
                  {MAPS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="t-entry-fee">Entry fee (Rs)</Label>
              <Input
                id="t-entry-fee"
                type="number"
                min={0}
                max={100000}
                value={values.entryFee}
                onChange={(e) => set("entryFee", Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-per-kill">Per kill reward (Rs)</Label>
              <Input
                id="t-per-kill"
                type="number"
                min={0}
                max={10000}
                value={values.perKillReward}
                onChange={(e) => set("perKillReward", Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-slots">Slots</Label>
              <Input
                id="t-slots"
                type="number"
                min={2}
                max={100}
                value={values.slots}
                onChange={(e) => set("slots", Number(e.target.value))}
                required
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-prize-pool">Prize pool (display text, optional)</Label>
            <Input
              id="t-prize-pool"
              value={values.prizePool}
              onChange={(e) => set("prizePool", e.target.value)}
              placeholder="Winner Rs 5,000 + 2,000 diamonds"
              maxLength={500}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="t-starts-at">Starts at</Label>
              <Input
                id="t-starts-at"
                type="datetime-local"
                value={values.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-ends-at">Ends at (optional)</Label>
              <Input
                id="t-ends-at"
                type="datetime-local"
                value={values.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {editing ? "Save changes" : "Create tournament"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
