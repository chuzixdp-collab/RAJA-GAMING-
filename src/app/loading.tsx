import { Logo } from "@/components/brand/logo";

/**
 * Root loading screen — animated RG monogram with a shimmering progress bar.
 * Uses the shared brand mark so it adapts to the active theme automatically.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background">
      <div className="rg-load-pulse">
        <Logo />
      </div>
      <div
        aria-hidden="true"
        className="h-1 w-44 overflow-hidden rounded-full bg-muted"
      >
        <div className="rg-load-bar h-full w-1/3 rounded-full bg-primary/80" />
      </div>
      <span className="sr-only">Loading RAJA GAMING…</span>
    </div>
  );
}
