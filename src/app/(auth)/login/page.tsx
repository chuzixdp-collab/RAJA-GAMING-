"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { LogIn, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { useSession } from "@/components/providers/session-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Only allow same-site relative redirect targets (defense against open redirects). */
function safeNext(): string {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

export default function LoginPage() {
  const { user, loading, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in? Send the user where they were headed.
  useEffect(() => {
    if (!loading && user) {
      window.location.href = safeNext();
    }
  }, [loading, user]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        json: { email: email.trim(), password },
      });
      toast.success("Signed in. Welcome back.");
      await refresh();
      window.location.href = safeNext();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in. Please try again.";
      setError(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <header className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold tracking-wide sm:text-3xl">
          <span className="text-gold-gradient">Welcome back</span>
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign in to continue to RAJA GAMING.
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
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-required="true"
              aria-invalid={!!error}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="login-password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-required="true"
              aria-invalid={!!error}
              disabled={submitting}
            />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? (
              <>
                <span
                  className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                  aria-hidden="true"
                />
                Signing in…
              </>
            ) : (
              <>
                <LogIn aria-hidden="true" />
                Sign in
              </>
            )}
          </Button>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to RAJA GAMING?{" "}
        <Link
          href="/register"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create account
        </Link>
      </p>
    </div>
  );
}
