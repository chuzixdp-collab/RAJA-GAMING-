import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ImageOff, Plus, ShieldCheck, UserCheck } from "lucide-react";
import { db } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PageHeader, EmptyState } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatRs, timeAgo } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ID Marketplace",
  description: "Buy and sell Free Fire IDs safely — every trade is supervised by RAJA GAMING admins.",
};

const CARD_HOVER =
  "card-raja card-glow hover:border-primary/45 hover:shadow-[0_12px_40px_-18px_rgba(245,185,11,0.35)]";

export default async function MarketplacePage() {
  const [settings, user, listings] = await Promise.all([
    getSettings(),
    getCurrentUser(),
    db.listing.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        title: true,
        price: true,
        level: true,
        createdAt: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { uploadId: true } },
      },
    }),
  ]);

  const marketplaceEnabled = settings.MARKETPLACE_ENABLED === "true" || settings.MARKETPLACE_ENABLED === "1";
  const sellHref = user ? "/dashboard/marketplace" : `/login?next=${encodeURIComponent("/marketplace")}`;

  return (
    <>
      <Navbar />
      <main className="min-h-[70vh]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <PageHeader
            title="Free Fire ID Marketplace"
            description="Verified accounts, protected payments — buy and sell under admin supervision."
            actions={
              <Button asChild className="font-semibold">
                <Link href={sellHref}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Sell Your ID
                </Link>
              </Button>
            }
          />

          <div className="card-raja flex flex-col gap-3 border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Every trade is supervised by RAJA GAMING admins — buyers pay first, sellers transfer under
              verification, and funds are only released to the seller after the buyer confirms ownership.
            </p>
          </div>

          {!marketplaceEnabled && (
            <Alert className="mt-6">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Marketplace temporarily paused</AlertTitle>
              <AlertDescription>
                New purchases are disabled right now. You can still browse the listings below.
              </AlertDescription>
            </Alert>
          )}

          {listings.length === 0 ? (
            <EmptyState
              className="mt-8"
              icon={<UserCheck />}
              title="No IDs listed right now"
              description="Listings go live after admin review — check back soon or sell your own ID."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={sellHref}>Sell Your ID</Link>
                </Button>
              }
            />
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/marketplace/${listing.id}`}
                  className={`${CARD_HOVER} group overflow-hidden`}
                  aria-label={`View listing: ${listing.title}`}
                >
                  <div className="relative h-44 w-full overflow-hidden bg-muted">
                    {listing.images[0] ? (
                      <img
                        src={`/api/uploads/${listing.images[0].uploadId}`}
                        alt={`Screenshot of ${listing.title}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-muted-foreground">
                        <ImageOff className="h-8 w-8" aria-hidden="true" />
                      </div>
                    )}
                    {listing.level ? (
                      <Badge className="badge-outline-gold absolute left-3 top-3 border bg-background/80 font-semibold backdrop-blur">
                        Level {listing.level}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <h2 className="truncate font-display text-base font-bold tracking-wide">{listing.title}</h2>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-display text-lg font-bold text-primary">{formatRs(listing.price)}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden="true" /> {timeAgo(listing.createdAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
