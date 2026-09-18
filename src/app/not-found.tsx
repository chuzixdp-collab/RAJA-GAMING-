import Link from "next/link";
import { CrownMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <CrownMark className="h-14 w-14" />
      <h1 className="mt-6 font-display text-5xl font-bold text-gold-gradient">404</h1>
      <p className="mt-2 font-display text-xl font-semibold">Page not found</p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to Home</Link>
      </Button>
    </main>
  );
}
