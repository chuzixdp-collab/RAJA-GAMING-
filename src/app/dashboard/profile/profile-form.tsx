"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDate } from "@/lib/format";
import { useSession } from "@/components/providers/session-provider";
import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type ProfileUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  referralCode: string;
  createdAt: string;
};

export function ProfileForm() {
  const { refresh } = useSession();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: ProfileUser }>("/api/profile");
      setUser(data.user);
      setName(data.user.name);
      setPhone(data.user.phone ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const data = await apiFetch<{ user: ProfileUser }>("/api/profile", {
        method: "PATCH",
        json: { name: name.trim(), phone: phone.trim() },
      });
      setUser(data.user);
      setName(data.user.name);
      setPhone(data.user.phone ?? "");
      toast.success("Profile updated.");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        Could not load your profile. Try refreshing the page.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form onSubmit={handleSubmit} className="card-raja space-y-4 self-start p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold tracking-wide">Account details</h2>
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Full name</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            minLength={2}
            required
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-phone">Phone (optional)</Label>
          <Input
            id="profile-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="03xx-xxxxxxx"
            maxLength={20}
            inputMode="tel"
            autoComplete="tel"
          />
          <p className="text-xs text-muted-foreground">Used by admins for payment support.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-email">Email (read-only)</Label>
          <Input id="profile-email" value={user.email} readOnly disabled />
        </div>
        <Button type="submit" disabled={saving} className="font-display tracking-wide">
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="space-y-4">
        <div className="card-raja space-y-3 p-4 sm:p-6">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-wide">Referral code</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Share this code — new users can paste it at signup and you both benefit.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
            <span className="font-mono text-lg font-bold tracking-widest text-primary">
              {user.referralCode}
            </span>
            <CopyButton value={user.referralCode} label="referral code" />
          </div>
        </div>
        <div className="card-raja space-y-1.5 p-4 sm:p-6">
          <h2 className="font-display text-lg font-semibold tracking-wide">Membership</h2>
          <p className="text-sm text-muted-foreground">Member since {formatDate(user.createdAt)}</p>
          <p className="text-sm text-muted-foreground">
            Role: {user.role === "ADMIN" ? "Administrator" : "Player"}
          </p>
        </div>
      </div>
    </div>
  );
}
