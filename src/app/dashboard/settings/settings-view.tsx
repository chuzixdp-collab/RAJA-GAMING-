"use client";

import { type FormEvent, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { formatDate } from "@/lib/format";
import { useSession } from "@/components/providers/session-provider";
import { CopyButton } from "@/components/shared/copy-button";
import { PageHeader } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export function SettingsView() {
  const { user, loading, logout } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error("New password must be 8+ characters with a letter and a number.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        json: { currentPassword, newPassword },
      });
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update your password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Account information, password and session controls."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Account summary */}
        <section aria-label="Account information" className="card-raja self-start p-4 sm:p-6">
          <h2 className="font-display text-lg font-semibold tracking-wide">Account information</h2>
          {loading || !user ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          ) : (
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
                <dt className="text-xs text-muted-foreground">Name</dt>
                <dd className="font-medium">{user.name}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="font-medium">{user.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd className="font-medium">{user.phone || "Not set"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
                <dt className="text-xs text-muted-foreground">Role</dt>
                <dd className="font-medium">{user.role === "ADMIN" ? "Administrator" : "Player"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
                <dt className="text-xs text-muted-foreground">Referral code</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-primary">
                    {user.referralCode}
                  </span>
                  <CopyButton value={user.referralCode} label="referral code" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-muted-foreground">Member since</dt>
                <dd className="font-medium">{formatDate(user.createdAt)}</dd>
              </div>
            </dl>
          )}
        </section>

        <div className="space-y-6">
          {/* Change password */}
          <section aria-label="Change password" className="card-raja p-4 sm:p-6">
            <h2 className="font-display text-lg font-semibold tracking-wide">Change password</h2>
            <Alert className="mt-3">
              <AlertTitle>Security note</AlertTitle>
              <AlertDescription>
                Changing your password signs you out of all other devices. Your current session stays
                active.
              </AlertDescription>
            </Alert>
            <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  At least 8 characters, with a letter and a number.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                />
              </div>
              <Button type="submit" className="font-display tracking-wide" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {saving ? "Updating…" : "Update password"}
              </Button>
            </form>
          </section>

          {/* Session */}
          <section aria-label="Session" className="card-raja p-4 sm:p-6">
            <h2 className="font-display text-lg font-semibold tracking-wide">Session</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {user?.email ?? "…"} on this device.
            </p>
            <Button
              variant="destructive"
              className="mt-4 font-display tracking-wide"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
