"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ShieldAlert, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { useSession } from "@/components/providers/session-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldErrors = Partial<Record<"name" | "email" | "password" | "confirmPassword", string>>;

/** Static subscribe — the URL is read per snapshot, no live updates needed. */
const emptySubscribe = () => () => {};

/** Invite code from ?ref=... on the client; null on the server (pre-hydration). */
function useReferralFromUrl(): string | null {
  return useSyncExternalStore(
    emptySubscribe,
    () => {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (!ref) return null;
      return ref.trim().toUpperCase().slice(0, 24) || null;
    },
    () => null
  );
}

function validate(name: string, email: string, password: string, confirm: string): FieldErrors {
  const errors: FieldErrors = {};
  if (name.trim().length < 2) errors.name = "Name must be at least 2 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address.";
  if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = "Password must contain at least one letter and one number.";
  }
  if (confirm !== password) errors.confirmPassword = "Passwords do not match.";
  return errors;
}

export default function RegisterPage() {
  const { user, loading, refresh } = useSession();
  const refFromUrl = useReferralFromUrl();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [refTouched, setRefTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Straight to the dashboard.
  useEffect(() => {
    if (!loading && user) {
      window.location.href = "/dashboard";
    }
  }, [loading, user]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const errors = validate(name, email, password, confirmPassword);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const code = refTouched
        ? referralCode.trim().toUpperCase()
        : (referralCode.trim() || refFromUrl || "").toUpperCase();
      await apiFetch("/api/auth/register", {
        method: "POST",
        json: {
          name: name.trim(),
          email: email.trim(),
          password,
          referralCode: code || undefined,
        },
      });
      toast.success("Account created. Welcome to RAJA GAMING.");
      await refresh();
      window.location.href = "/dashboard";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create account. Please try again.";
      setError(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <header className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold tracking-wide sm:text-3xl">
          <span className="text-gold-gradient">Create your account</span>
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Join RAJA GAMING — top-ups, tournaments and rewards.
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
            <Label htmlFor="register-name">Name</Label>
            <Input
              id="register-name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              aria-required="true"
              aria-invalid={!!fieldErrors.name}
              aria-describedby={fieldErrors.name ? "register-name-error" : undefined}
              disabled={submitting}
            />
            {fieldErrors.name && (
              <p id="register-name-error" className="text-xs text-destructive">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-required="true"
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
              disabled={submitting}
            />
            {fieldErrors.email && (
              <p id="register-email-error" className="text-xs text-destructive">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-password">Password</Label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              placeholder="Min 8 characters, letter + number"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-required="true"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "register-password-error" : "register-password-hint"}
              disabled={submitting}
            />
            {fieldErrors.password ? (
              <p id="register-password-error" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            ) : (
              <p id="register-password-hint" className="text-xs text-muted-foreground">
                At least 8 characters with one letter and one number.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-confirm-password">Confirm password</Label>
            <Input
              id="register-confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              aria-required="true"
              aria-invalid={!!fieldErrors.confirmPassword}
              aria-describedby={fieldErrors.confirmPassword ? "register-confirm-error" : undefined}
              disabled={submitting}
            />
            {fieldErrors.confirmPassword && (
              <p id="register-confirm-error" className="text-xs text-destructive">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-referral">
              Referral code{" "}
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="register-referral"
              type="text"
              autoComplete="off"
              placeholder="e.g. RG1A2B3C"
              value={referralCode}
              onChange={(e) => {
                setReferralCode(e.target.value.toUpperCase());
                setRefTouched(true);
              }}
              maxLength={24}
              className="uppercase"
              disabled={submitting}
            />
            {!refTouched && !referralCode && refFromUrl && (
              <p className="text-xs text-muted-foreground">
                Invite code <span className="font-medium text-primary">{refFromUrl}</span> will
                be applied automatically.
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
                Creating account…
              </>
            ) : (
              <>
                <UserPlus aria-hidden="true" />
                Create account
              </>
            )}
          </Button>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
