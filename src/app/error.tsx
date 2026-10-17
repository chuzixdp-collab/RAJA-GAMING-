'use client';

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <Logo className="h-14 w-14" />
          <h1 className="mt-6 font-display text-3xl font-bold text-gold-gradient">
            Something went wrong
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            An unexpected error occurred. Please try again – if the problem persists, contact support.
          </p>
          <div className="mt-8 flex gap-4">
            <Button onClick={() => reset()}>Try again</Button>
            <Button variant="outline" asChild>
              <Link href="/">Go home</Link>
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
