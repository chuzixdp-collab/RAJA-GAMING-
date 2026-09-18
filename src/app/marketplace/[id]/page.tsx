import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Fingerprint, ShieldCheck, UserRound } from "lucide-react";
import { db } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/shared/copy-button";
import { formatRs, timeAgo } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Gallery } from "./gallery";
import { BuyPanel } from "./buy-panel";

export const dynamic = "force-dynamic";

export default async function MarketplaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" }, select: { uploadId: true } },
      seller: { select: { name: true } },
    },
  });

  if (!listing || listing.status !== "APPROVED") {
    notFound();
  }

  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);

  const myPurchase = user
    ? await db.purchase.findFirst({
        where: { listingId: id, buyerId: user.id, status: { notIn: ["CANCELLED", "REJECTED", "REFUNDED"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, createdAt: true, price: true },
      })
    : null;

  return (
    <>
      <Navbar />
      <main className="min-h-[70vh]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
            <Link href="/marketplace">
              <ArrowLeft className="h-4 w-4" /> Back to Marketplace
            </Link>
          </Button>

          <div className="grid gap-8 lg:grid-cols-5">
            {/* Gallery */}
            <div className="lg:col-span-3">
              <Gallery images={listing.images} title={listing.title} />
            </div>

            {/* Info */}
            <div className="space-y-5 lg:col-span-2">
              <div className="card-raja p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h1 className="font-display text-2xl font-bold tracking-wide">{listing.title}</h1>
                  {listing.level ? (
                    <Badge className="badge-outline-gold border font-semibold">Level {listing.level}</Badge>
                  ) : null}
                </div>
                <p className="mt-2 font-display text-3xl font-bold text-gold-gradient">{formatRs(listing.price)}</p>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Fingerprint className="h-4 w-4" aria-hidden="true" /> Free Fire UID
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-display font-bold tracking-wide">{listing.ffUid}</span>
                      <CopyButton value={listing.ffUid} label="Free Fire UID" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <UserRound className="h-4 w-4" aria-hidden="true" /> Seller
                    </span>
                    <span className="font-medium">{listing.seller.name.split(" ")[0]}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" aria-hidden="true" /> Listed
                    </span>
                    <span className="font-medium">{timeAgo(listing.createdAt)}</span>
                  </div>
                </div>

                <div className="mt-4 border-t border-border/60 pt-4">
                  <p className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Description
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {listing.description}
                  </p>
                  {listing.verificationNote ? (
                    <p className="mt-3 rounded-lg border border-border bg-card/60 p-3 text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">Verification note: </span>
                      {listing.verificationNote}
                    </p>
                  ) : null}
                </div>
              </div>

              <BuyPanel
                listingId={listing.id}
                price={listing.price}
                isLoggedIn={!!user}
                marketplaceEnabled={settings.MARKETPLACE_ENABLED === "true" || settings.MARKETPLACE_ENABLED === "1"}
                myPurchase={
                  myPurchase
                    ? { id: myPurchase.id, status: myPurchase.status, createdAt: myPurchase.createdAt.toISOString() }
                    : null
                }
                payment={{
                  method: settings.PAYMENT_METHOD_NAME || "EasyPaisa",
                  accountTitle: settings.EASYPAISA_ACCOUNT_TITLE || "",
                  accountNumber: settings.EASYPAISA_ACCOUNT_NUMBER || "",
                  instructions: settings.EASYPAISA_INSTRUCTIONS || "",
                }}
              />

              <div className="rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Buyer &amp; Seller Protection
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  For your safety, never pay or share account details outside RAJA GAMING. Payments are verified
                  by our admins, transfers happen under supervision, and funds are only released to the seller
                  after the buyer confirms ownership.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
