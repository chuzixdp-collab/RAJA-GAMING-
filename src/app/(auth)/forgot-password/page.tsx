"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, MailCheck, SendHorizonal, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GENERIC_SUCCESS =
  "If the email exists, our team will verify your request and issue a secure reset link via your registered contact channel.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        json: { email: email.trim() },
      });
      // Generic success regardless of whether the email exists (no enumeration).
      setSent(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to submit request. Please try again.";
      setError(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
          <MailCheck className="size-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-wide">
          <span className="text-gold-gradient">Request received</span>
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {GENERIC_SUCCESS}
        </p>
        <Button asChild variant="outline" className="mt-6 w-full" size="lg">
          <Link href="/login">
            <ArrowLeft aria-hidden="true" />
            Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold tracking-wide sm:text-3xl">
          <span className="text-gold-gradient">Forgot password</span>
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter your account email and our team will assist you.
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
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-required="true"
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
                Submitting…
              </>
            ) : (
              <>
                <SendHorizonal aria-hidden="true" />
                Request reset
              </>
            )}
          </Button>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
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
