import Link from "next/link";
import { TicketPercent } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate, formatRs } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/shared/status-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Coupons" };

export default async function DashboardCouponsPage() {
  const now = new Date();
  const coupons = await db.coupon.findMany({
    where: {
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // Field-vs-field usage limit comparison is not supported in a single where — filter in the app layer.
  const available = coupons.filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Coupons & Offers"
        description="Active discount codes you can apply at checkout."
      />

      {available.length === 0 ? (
        <EmptyState
          icon={<TicketPercent />}
          title="No coupons right now"
          description="Check back soon — we drop new offers for tournaments and diamond top-ups regularly."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {available.map((c) => (
            <li key={c.id} className="card-raja flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-lg font-bold tracking-widest text-primary">{c.code}</p>
                  <p className="mt-1 font-display text-2xl font-bold tracking-wide">
                    {c.type === "PERCENTAGE" ? `${c.value}% OFF` : `${formatRs(c.value)} OFF`}
                  </p>
                </div>
                <CopyButton value={c.code} label={`coupon code ${c.code}`} />
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  Min order:{" "}
                  <span className="font-medium text-foreground">
                    {c.minOrder > 0 ? formatRs(c.minOrder) : "No minimum"}
                  </span>
                </li>
                {c.type === "PERCENTAGE" && c.maxDiscount != null && (
                  <li>
                    Max discount: <span className="font-medium text-foreground">{formatRs(c.maxDiscount)}</span>
                  </li>
                )}
                <li>
                  Expires:{" "}
                  <span className="font-medium text-foreground">
                    {c.expiresAt ? formatDate(c.expiresAt) : "No expiry"}
                  </span>
                </li>
                <li>
                  Limit: <span className="font-medium text-foreground">{c.perUserLimit}</span> per user
                </li>
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Alert>
        <TicketPercent className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>How to use</AlertTitle>
        <AlertDescription>
          Apply during checkout on the Top-Up page.{" "}
          <Link href="/top-up" className="font-medium text-primary hover:underline">
            Go to Top-Up
          </Link>
          .
        </AlertDescription>
      </Alert>
    </div>
  );
}
