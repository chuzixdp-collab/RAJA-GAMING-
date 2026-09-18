import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  Crosshair,
  Crown,
  Gem,
  Gift,
  Headset,
  ImageOff,
  Map,
  MessageSquareQuote,
  ShieldCheck,
  Star,
  Swords,
  Timer,
  Trophy,
  UserCheck,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { db } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SectionHeading } from "@/components/shared/stat-card";
import { EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatDate, formatRs } from "@/lib/format";
import type { RegistrationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const ACTIVE_REG_STATUSES: RegistrationStatus[] = ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "APPROVED"];

const CARD_HOVER =
  "card-raja card-glow hover:border-primary/45 hover:shadow-[0_12px_40px_-18px_rgba(245,185,11,0.35)]";

function displayName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] || "Player";
  const last = parts.length > 1 ? ` ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : "";
  return `${first}${last}`;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`Rated ${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={`h-4 w-4 ${i <= rating ? "fill-primary text-primary" : "text-muted-foreground/40"}`}
        />
      ))}
    </div>
  );
}

export default async function HomePage() {
  const [packages, tournaments, listings, faqs, reviews] = await Promise.all([
    db.diamondPackage.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      take: 6,
    }),
    db.tournament.findMany({
      where: { status: { in: ["OPEN", "UPCOMING", "LIVE"] } },
      orderBy: { startsAt: "asc" },
      take: 3,
      select: {
        id: true,
        title: true,
        mode: true,
        map: true,
        entryFee: true,
        prizePool: true,
        slots: true,
        startsAt: true,
        status: true,
        _count: { select: { registrations: { where: { status: { in: ACTIVE_REG_STATUSES } } } } },
      },
    }),
    db.listing.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        price: true,
        level: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { uploadId: true } },
      },
    }),
    db.faq.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 6,
    }),
    db.review.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, rating: true, comment: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <Navbar />
      <main className="min-h-[70vh]">
        {/* ---------------- HERO ---------------- */}
        <section className="relative overflow-hidden border-b border-border/60">
          <Image
            src="/images/hero-bg.jpg"
            alt="RAJA GAMING battle arena backdrop"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/75 via-background/85 to-background" />
          <div className="relative mx-auto flex max-w-7xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28 lg:py-32">
            <span className="badge-outline-gold inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]">
              <Crown className="h-4 w-4" aria-hidden="true" />
              Pakistan&apos;s Trusted Free Fire Hub
            </span>
            <h1 className="mt-6 font-display text-5xl font-bold tracking-wide sm:text-7xl">
              <span className="text-gold-gradient">RAJA</span> <span className="text-foreground">GAMING</span>
            </h1>
            <p className="mt-4 font-display text-sm font-semibold uppercase tracking-[0.3em] text-primary sm:text-base">
              Gaming • Tournaments • Rewards • Community
            </p>
            <p className="mt-5 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Instant Free Fire diamond delivery, verified tournaments with real prizes, and a safe
              admin-controlled ID marketplace — powered by secure EasyPaisa payments and round-the-clock support.
            </p>
            <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg" className="w-full font-semibold sm:w-auto">
                <Link href="/top-up">
                  <Gem className="h-4 w-4" aria-hidden="true" /> Top Up Diamonds
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full font-semibold sm:w-auto">
                <Link href="/tournaments">
                  <Trophy className="h-4 w-4" aria-hidden="true" /> Join Tournament
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="w-full font-semibold sm:w-auto">
                <Link href="/marketplace">Browse Marketplace</Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted-foreground sm:text-sm">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Manual verification
              </span>
              <span className="inline-flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" aria-hidden="true" /> Secure EasyPaisa payments
              </span>
              <span className="inline-flex items-center gap-2">
                <Headset className="h-4 w-4 text-primary" aria-hidden="true" /> 24/7 support
              </span>
            </div>
          </div>
        </section>

        {/* ---------------- DIAMOND PACKAGES ---------------- */}
        <section className="section-pad" aria-labelledby="packages-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Diamond Top-Up"
              title="Pick Your Diamond Package"
              description="Transparent pricing, instant manual delivery by our team after payment verification."
            />
            {packages.length === 0 ? (
              <EmptyState
                className="mt-10"
                icon={<Gem />}
                title="No packages available right now"
                description="Our diamond packages are being restocked. Please check back soon."
              />
            ) : (
              <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {packages.map((pkg) => (
                  <article key={pkg.id} className={`${CARD_HOVER} flex flex-col p-5`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Gem className="h-6 w-6" aria-hidden="true" />
                      </div>
                      {pkg.badge ? (
                        <Badge className="badge-outline-gold border bg-transparent font-semibold uppercase tracking-wide">
                          {pkg.badge}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-4 font-display text-4xl font-bold tracking-wide text-gold-gradient">
                      {pkg.diamonds.toLocaleString("en-PK")}
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">{pkg.title}</p>
                    {pkg.description ? (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{pkg.description}</p>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4">
                      <span className="font-display text-lg font-bold text-foreground">{formatRs(pkg.price)}</span>
                      <Button asChild size="sm" className="font-semibold">
                        <Link href="/top-up">Top Up Now</Link>
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---------------- TOURNAMENTS ---------------- */}
        <section className="section-pad border-t border-border/60" aria-labelledby="tournaments-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Compete & Win"
              title="Upcoming Tournaments"
              description="Register, drop in, and climb the leaderboard for diamond and cash prizes."
            />
            {tournaments.length === 0 ? (
              <EmptyState
                className="mt-10"
                icon={<Trophy />}
                title="No tournaments scheduled yet"
                description="New tournaments are announced regularly — check back soon or follow our community channels."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/tournaments">View all tournaments</Link>
                  </Button>
                }
              />
            ) : (
              <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tournaments.map((t) => {
                  const filled = t._count.registrations;
                  return (
                    <article key={t.id} className={`${CARD_HOVER} flex flex-col p-5`}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-lg font-bold leading-snug tracking-wide">{t.title}</h3>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1 font-medium">
                          <Users className="h-3 w-3" aria-hidden="true" /> {t.mode}
                        </Badge>
                        <Badge variant="outline" className="gap-1 font-medium">
                          <Map className="h-3 w-3" aria-hidden="true" /> {t.map}
                        </Badge>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">Entry</dt>
                          <dd className="font-semibold">{t.entryFee > 0 ? formatRs(t.entryFee) : "FREE"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Prize Pool</dt>
                          <dd className="font-semibold text-primary">{t.prizePool || "See details"}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Timer className="h-3.5 w-3.5" aria-hidden="true" /> {formatDate(t.startsAt)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" /> {filled}/{t.slots} slots
                        </span>
                      </div>
                      <Button asChild variant="outline" size="sm" className="mt-4 font-semibold">
                        <Link href="/tournaments">View Tournament</Link>
                      </Button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ---------------- MARKETPLACE PREVIEW ---------------- */}
        <section className="section-pad border-t border-border/60" aria-labelledby="marketplace-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="ID Marketplace"
              title="Verified Free Fire IDs"
              description="Buy and sell accounts safely — every trade is supervised by our admin team."
            />
            {listings.length === 0 ? (
              <EmptyState
                className="mt-10"
                icon={<UserCheck />}
                title="No IDs listed right now"
                description="Be the first to list your Free Fire ID — listings go live after admin review."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/marketplace">Visit marketplace</Link>
                  </Button>
                }
              />
            ) : (
              <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing) => (
                  <Link
                    key={listing.id}
                    href="/marketplace"
                    className={`${CARD_HOVER} group overflow-hidden`}
                    aria-label={`View ${listing.title} in marketplace`}
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
                    </div>
                    <div className="p-4">
                      <h3 className="truncate font-display text-base font-bold tracking-wide">{listing.title}</h3>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-display text-lg font-bold text-primary">{formatRs(listing.price)}</span>
                        {listing.level ? (
                          <Badge variant="outline" className="font-medium">Level {listing.level}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-8 text-center">
              <Button asChild variant="outline" size="lg" className="font-semibold">
                <Link href="/marketplace">Browse All Listings</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ---------------- HOW IT WORKS ---------------- */}
        <section className="section-pad border-t border-border/60" aria-labelledby="how-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="How It Works"
              title="Three Steps to Play"
              description="A simple, safe process designed around manual verification for your protection."
            />
            <ol className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  icon: <Gem className="h-6 w-6" aria-hidden="true" />,
                  title: "Pick Your Package",
                  body: "Choose a diamond package, tournament entry, or marketplace ID — whatever you need to play.",
                },
                {
                  icon: <Wallet className="h-6 w-6" aria-hidden="true" />,
                  title: "Pay via EasyPaisa",
                  body: "Send payment to our verified EasyPaisa account and submit the transaction ID with a screenshot.",
                },
                {
                  icon: <BadgeCheck className="h-6 w-6" aria-hidden="true" />,
                  title: "Admin Verifies & Delivers",
                  body: "Our team manually verifies every payment and delivers your diamonds, slot, or account details.",
                },
              ].map((step, idx) => (
                <li key={step.title} className={`${CARD_HOVER} relative p-6`}>
                  <span className="absolute right-5 top-5 font-display text-4xl font-bold text-primary/15" aria-hidden="true">
                    {idx + 1}
                  </span>
                  <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary">
                    {step.icon}
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold tracking-wide">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- WHY RAJA GAMING ---------------- */}
        <section className="section-pad border-t border-border/60" aria-labelledby="why-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Why Raja Gaming"
              title="Built on Trust, Made for Gamers"
              description="We run every order, trade, and payout by hand — so your money and accounts stay safe."
            />
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: <ShieldCheck className="h-6 w-6" aria-hidden="true" />,
                  title: "Verified Payments",
                  body: "Every EasyPaisa transaction is manually checked before delivery — no bots, no risks.",
                },
                {
                  icon: <UserCheck className="h-6 w-6" aria-hidden="true" />,
                  title: "Admin-Controlled Trades",
                  body: "Marketplace IDs and funds only move under direct admin supervision, protecting both sides.",
                },
                {
                  icon: <Zap className="h-6 w-6" aria-hidden="true" />,
                  title: "Fast Delivery",
                  body: "Verified orders are processed quickly so you are back in the game within minutes.",
                },
                {
                  icon: <Gift className="h-6 w-6" aria-hidden="true" />,
                  title: "Community Rewards",
                  body: "Earn referral bonuses, tournament prizes, and wallet rewards for being an active player.",
                },
              ].map((f) => (
                <div key={f.title} className={`${CARD_HOVER} p-6`}>
                  <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary">
                    {f.icon}
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold tracking-wide">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section className="section-pad border-t border-border/60" aria-labelledby="faq-heading">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="FAQ"
              title="Frequently Asked Questions"
              description="Quick answers about top-ups, payments, tournaments and the marketplace."
            />
            {faqs.length === 0 ? (
              <EmptyState
                className="mt-10"
                icon={<MessageSquareQuote />}
                title="No FAQs published yet"
                description="Have a question? Reach us any time from the contact page."
              />
            ) : (
              <Accordion type="single" collapsible className="mt-10">
                {faqs.map((faq) => (
                  <AccordionItem key={faq.id} value={faq.id}>
                    <AccordionTrigger className="text-left font-medium">{faq.question}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
            <div className="mt-8 text-center">
              <Button asChild variant="ghost" size="sm" className="text-primary">
                <Link href="/faq">View all FAQs</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ---------------- REVIEWS ---------------- */}
        <section className="section-pad border-t border-border/60" aria-labelledby="reviews-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Player Reviews"
              title="What the Community Says"
              description="Real feedback from verified players who completed orders on RAJA GAMING."
            />
            {reviews.length === 0 ? (
              <p className="mt-10 text-center text-sm text-muted-foreground">
                Be the first to leave a review after your first order.
              </p>
            ) : (
              <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reviews.map((review) => (
                  <figure key={review.id} className={`${CARD_HOVER} flex flex-col p-5`}>
                    <div className="flex items-center justify-between gap-3">
                      <Stars rating={review.rating} />
                      <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-400">
                        <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Verified player
                      </Badge>
                    </div>
                    <blockquote className="mt-4 flex-1 text-sm text-muted-foreground">
                      &ldquo;{review.comment}&rdquo;
                    </blockquote>
                    <figcaption className="mt-4 border-t border-border/60 pt-3 text-xs font-medium text-foreground">
                      {displayName(review.user.name)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---------------- CTA STRIP ---------------- */}
        <section className="section-pad border-t border-border/60" aria-labelledby="cta-heading">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-8 text-center sm:p-12">
              <Swords className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
              <h2 className="mt-4 font-display text-2xl font-bold tracking-wide sm:text-3xl">
                Ready to Rule the Battlefield?
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
                Top up your diamonds in minutes and join the next tournament before slots run out.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full font-semibold sm:w-auto">
                  <Link href="/top-up">
                    <Gem className="h-4 w-4" aria-hidden="true" /> Top Up Diamonds
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full font-semibold sm:w-auto">
                  <Link href="/tournaments">
                    <Crosshair className="h-4 w-4" aria-hidden="true" /> Join Tournament
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
