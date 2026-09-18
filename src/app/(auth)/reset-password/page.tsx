"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Phase = "checking" | "form" | "success" | "error";

/** Static subscribe — the URL is read per snapshot, no live updates needed. */
const emptySubscribe = () => () => {};

/** True after hydration; false on the server render. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

/** Reads ?token=... on the client; null on the server (pre-hydration). */
function useResetToken(): string | null {
  return useSyncExternalStore(
    emptySubscribe,
    () => {
      const t = new URLSearchParams(window.location.search).get("token");
      return t && t.length >= 10 && t.length <= 128 ? t : null;
    },
    () => null
  );
}

export default function ResetPasswordPage() {
  const hydrated = useHydrated();
  const urlToken = useResetToken();

  const [resetDone, setResetDone] = useState(false);
  const [deadLink, setDeadLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"password" | "confirmPassword", string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // success > dead link > form (valid token) > error (checked, no token) > checking (pre-hydration).
  const phase: Phase = resetDone
    ? "success"
    : deadLink
      ? "error"
      : urlToken
        ? "form"
        : hydrated
          ? "error"
          : "checking";

  function validate(): boolean {
    const errors: Partial<Record<"password" | "confirmPassword", string>> = {};
    if (password.length < 8) errors.password = "Password must be at least 8 characters.";
    else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = "Password must contain at least one letter and one number.";
    }
    if (confirmPassword !== password) errors.confirmPassword = "Passwords do not match.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !urlToken) return;
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        json: { token: urlToken, password },
      });
      setResetDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reset password. Please try again.";
      if (message.toLowerCase().includes("invalid or expired")) {
        // Dead link — swap to the dedicated error state.
        setDeadLink(true);
      } else {
        setError(message);
        toast.error(message);
      }
      setSubmitting(false);
    }
  }

  if (phase === "checking") {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading reset form">
        <Skeleton className="mx-auto h-8 w-3/4" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
          <ShieldX className="size-6 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-wide">Link no longer valid</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          This reset link is missing, invalid or has expired. Request a fresh one and
          our team will assist you.
        </p>
        <div className="mt-6 space-y-3">
          <Button asChild className="w-full" size="lg">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
          <Button asChild variant="outline" className="w-full" size="lg">
            <Link href="/login">
              <ArrowLeft aria-hidden="true" />
              Back to sign in
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
          <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-wide">
          <span className="text-gold-gradient">Password reset</span>
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Your password has been updated. All previous sessions were signed out —
          sign in with your new password to continue.
        </p>
        <Button asChild className="mt-6 w-full" size="lg">
          <Link href="/login">
            <KeyRound aria-hidden="true" />
            Sign in with new password
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold tracking-wide sm:text-3xl">
          <span className="text-gold-gradient">Set a new password</span>
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Choose a strong password for your RAJA GAMING account.
        </p>
      </header>

      <form onSubmit={onSubmit} noValidate>
        {error && (
          <Alert variant="destructive" className="mb-4" aria-live="assertive">
            <ShieldAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              placeholder="Min 8 characters, letter + number"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-required="true"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "reset-password-error" : "reset-password-hint"}
              disabled={submitting}
            />
            {fieldErrors.password ? (
              <p id="reset-password-error" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            ) : (
              <p id="reset-password-hint" className="text-xs text-muted-foreground">
                At least 8 characters with one letter and one number.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-confirm-password">Confirm new password</Label>
            <Input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              aria-required="true"
              aria-invalid={!!fieldErrors.confirmPassword}
              aria-describedby={fieldErrors.confirmPassword ? "reset-confirm-error" : undefined}
              disabled={submitting}
            />
            {fieldErrors.confirmPassword && (
              <p id="reset-confirm-error" className="text-xs text-destructive">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? (
              <>
                <span
                  className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                  aria-hidden="true"
                />
                Updating password…
              </>
            ) : (
              <>
                <KeyRound aria-hidden="true" />
                Reset password
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
