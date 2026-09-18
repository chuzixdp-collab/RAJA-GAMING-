import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

type Tone = "gold" | "red" | "green" | "gray" | "orange" | "blue";

const TONE_CLASSES: Record<Tone, string> = {
  gold: "border-primary/40 bg-primary/10 text-primary",
  red: "border-destructive/40 bg-destructive/10 text-destructive",
  green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  gray: "border-border bg-muted text-muted-foreground",
  orange: "border-amber-600/40 bg-amber-600/10 text-amber-500",
  blue: "border-sky-600/40 bg-sky-600/10 text-sky-400",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const label = status.replaceAll("_", " ");
  const tone = statusToTone(status);
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", TONE_CLASSES[tone], className)}>
      {label}
    </Badge>
  );
}

function statusToTone(status: string): Tone {
  switch (status) {
    case "COMPLETED":
    case "APPROVED":
    case "PAID":
    case "ACTIVE":
    case "TRANSFER_VERIFIED":
    case "PAYMENT_VERIFIED":
      return "green";
    case "REJECTED":
    case "CANCELLED":
    case "BANNED":
    case "SUSPENDED":
    case "REFUNDED":
      return "red";
    case "PENDING":
    case "PENDING_PAYMENT":
    case "PAYMENT_PENDING":
    case "REQUESTED":
    case "DRAFT":
    case "NEW":
    case "OWNERSHIP_REVIEW":
    case "DUPLICATE_REVIEW":
      return "gray";
    case "PAYMENT_SUBMITTED":
    case "UNDER_REVIEW":
    case "PROCESSING":
    case "TRANSFER_PENDING":
    case "UPCOMING":
      return "orange";
    case "OPEN":
    case "LIVE":
    case "FULL":
      return "gold";
    case "DISPUTED":
    case "SOLD":
      return "blue";
    default:
      return "gray";
  }
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-wide sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-card/40 px-6 py-14 text-center",
        className
      )}
    >
      {icon && <div className="mb-3 text-muted-foreground [&>svg]:h-10 [&>svg]:w-10">{icon}</div>}
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
