import { cn } from "@/lib/utils";

/** RAJA GAMING crown mark — pure SVG, gold gradient. */
export function CrownMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rg-gold" x1="6" y1="8" x2="42" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7D774" />
          <stop offset="0.55" stopColor="#F5B90B" />
          <stop offset="1" stopColor="#D99A00" />
        </linearGradient>
      </defs>
      <path
        d="M6 34 L4 14 L15 22 L24 8 L33 22 L44 14 L42 34 Z"
        fill="url(#rg-gold)"
      />
      <rect x="6" y="36.5" width="36" height="5" rx="2" fill="url(#rg-gold)" opacity="0.92" />
      <circle cx="24" cy="27.5" r="2.4" fill="#1C1503" />
    </svg>
  );
}

export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <CrownMark className="h-8 w-8 shrink-0" />
      {!compact && (
        <span className="font-display text-lg font-bold leading-none tracking-wide sm:text-xl">
          <span className="text-gold-gradient">RAJA</span>{" "}
          <span className="text-foreground">GAMING</span>
        </span>
      )}
    </span>
  );
}
