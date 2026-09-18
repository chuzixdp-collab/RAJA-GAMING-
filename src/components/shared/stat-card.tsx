import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function StatCard({
  title,
  value,
  icon,
  hint,
  tone = "default",
  className,
}: {
  title: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
  tone?: "default" | "gold" | "red" | "green";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card-raja card-glow p-4 sm:p-5",
        tone === "gold" && "border-primary/25",
        tone === "red" && "border-destructive/25",
        tone === "green" && "border-emerald-600/25",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
        {icon && <div className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</div>}
      </div>
      <p
        className={cn(
          "mt-2 font-display text-2xl font-bold tracking-wide",
          tone === "gold" && "text-primary",
          tone === "red" && "text-destructive",
          tone === "green" && "text-emerald-400"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="card-raja p-4 sm:p-5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-7 w-16" />
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-2xl text-center", className)}>
      {eyebrow && (
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-display text-2xl font-bold tracking-wide sm:text-3xl">{title}</h2>
      {description && <p className="mt-2 text-sm text-muted-foreground sm:text-base">{description}</p>}
    </div>
  );
}
