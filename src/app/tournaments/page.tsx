import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Crosshair, Map, Ticket, Trophy, Users } from "lucide-react";
import { db } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDate, formatRs } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import type { RegistrationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournaments",
  description: "Compete in Free Fire tournaments on RAJA GAMING — diamond and cash prizes, verified results.",
};

const ACTIVE_REG_STATUSES: RegistrationStatus[] = ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "APPROVED"];
const UPCOMING_STATUSES = ["UPCOMING", "OPEN", "FULL", "LIVE"];

const CARD_HOVER =
  "card-raja card-glow hover:border-primary/45 hover:shadow-[0_12px_40px_-18px_rgba(245,185,11,0.35)]";

function excerpt(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export default async function TournamentsPage() {
  const [tournaments, settings] = await Promise.all([
    db.tournament.findMany({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        mode: true,
        map: true,
        entryFee: true,
        prizePool: true,
        perKillReward: true,
        slots: true,
        startsAt: true,
        status: true,
        _count: { select: { registrations: { where: { status: { in: ACTIVE_REG_STATUSES } } } } },
      },
    }),
    getSettings(),
  ]);

  const tournamentsEnabled = settings.TOURNAMENTS_ENABLED === "true" || settings.TOURNAMENTS_ENABLED === "1";
  const upcoming = tournaments.filter((t) => UPCOMING_STATUSES.includes(t.status));
  const completed = tournaments.filter((t) => t.status === "COMPLETED");

  return (
    <>
      <Navbar />
      <main className="min-h-[70vh]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <PageHeader
            title="Tournaments"
            description="Register for competitive Free Fire matches and win diamond and cash prizes."
          />

          {!tournamentsEnabled && (
            <Alert className="mb-8">
              <Trophy className="h-4 w-4" />
              <AlertTitle>Tournaments temporarily disabled</AlertTitle>
              <AlertDescription>
                Registration is paused right now. Results of past matches are still available below.
              </AlertDescription>
            </Alert>
          )}

          {/* Upcoming / open / live */}
          <section aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className="font-display text-xl font-bold tracking-wide">
              Upcoming &amp; Open
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={<Trophy />}
                title="No upcoming tournaments"
                description="New matches are announced regularly — check back soon."
              />
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((t) => {
                  const filled = t._count.registrations;
                  const pct = t.slots > 0 ? Math.min(100, Math.round((filled / t.slots) * 100)) : 0;
                  return (
                    <article key={t.id} className={`${CARD_HOVER} flex flex-col p-5`}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-lg font-bold leading-snug tracking-wide">{t.title}</h3>
                        <StatusBadge status={t.status} />
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{excerpt(t.description)}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1 font-medium">
                          <Users className="h-3 w-3" aria-hidden="true" /> {t.mode}
                        </Badge>
                        <Badge variant="outline" className="gap-1 font-medium">
                          <Map className="h-3 w-3" aria-hidden="true" /> {t.map}
                        </Badge>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">Entry Fee</dt>
                          <dd className="font-semibold">{t.entryFee > 0 ? formatRs(t.entryFee) : "FREE"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Prize Pool</dt>
                          <dd className="font-semibold text-primary">{t.prizePool || "See details"}</dd>
                        </div>
                        {t.perKillReward > 0 && (
                          <div className="col-span-2">
                            <dt className="text-xs text-muted-foreground">Per Kill Reward</dt>
                            <dd className="inline-flex items-center gap-1.5 font-semibold">
                              <Crosshair className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                              {formatRs(t.perKillReward)}
                            </dd>
                          </div>
                        )}
                      </dl>
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Ticket className="h-3.5 w-3.5" aria-hidden="true" /> {filled}/{t.slots} slots filled
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {formatDate(t.startsAt)}
                          </span>
                        </div>
                        <Progress value={pct} className="mt-2" aria-label={`${filled} of ${t.slots} slots filled`} />
                      </div>
                      <Button asChild variant="outline" size="sm" className="mt-4 font-semibold">
                        <Link href={`/tournaments/${t.id}`}>View Details &amp; Register</Link>
                      </Button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Completed */}
          <section aria-labelledby="completed-heading" className="mt-12">
            <h2 id="completed-heading" className="font-display text-xl font-bold tracking-wide">
              Completed
            </h2>
            {completed.length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={<Trophy />}
                title="No completed tournaments yet"
                description="Results and winners will appear here after each match ends."
              />
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completed.map((t) => {
                  const filled = t._count.registrations;
                  return (
                    <article key={t.id} className={`${CARD_HOVER} flex flex-col p-5`}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-lg font-bold leading-snug tracking-wide">{t.title}</h3>
                        <StatusBadge status={t.status} />
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{excerpt(t.description)}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1 font-medium">
                          <Users className="h-3 w-3" aria-hidden="true" /> {t.mode}
                        </Badge>
                        <Badge variant="outline" className="gap-1 font-medium">
                          <Map className="h-3 w-3" aria-hidden="true" /> {t.map}
                        </Badge>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {formatDate(t.startsAt)}
                        </span>
                        <span>
                          {filled}/{t.slots} players
                        </span>
                      </div>
                      <Button asChild variant="outline" size="sm" className="mt-4 font-semibold">
                        <Link href={`/tournaments/${t.id}`}>View Results</Link>
                      </Button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
