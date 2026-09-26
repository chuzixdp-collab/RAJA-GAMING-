import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/images/logo.png"
        alt="RAJA GAMING Logo"
        width={40}
        height={40}
        className="h-9 w-auto shrink-0 object-contain"
        priority
      />
      {!compact && (
        <span className="font-display text-lg font-bold leading-none tracking-wide sm:text-xl">
          <span className="text-gold-gradient">RAJA</span>{" "}
          <span className="text-foreground">GAMING</span>
        </span>
      )}
    </span>
  );
}
