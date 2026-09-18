import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Crosshair,
  Crown,
  Map,
  Medal,
  ScrollText,
  Ticket,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDateTime, formatRs } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { RegisterPanel } from "./register-panel";
import type { RegistrationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const ACTIVE_REG_STATUSES: RegistrationStatus[] = ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "APPROVED"];

function positionLabel(position: number): string {
  const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  const suffix = suffixes[position % 10] && ![11, 12, 13].includes(position % 100) ? suffixes[position % 10] : "th";
  return `${position}${suffix}`;
}

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);

  const tournament = await db.tournament.findUnique({
    where: { id },
    include: {
      rewards: { orderBy: { position: "asc" } },
      _count: { select: { registrations: { where: { status: { in: ACTIVE_REG_STATUSES } } } } },
    },
  });

  if (!tournament || tournament.status === "DRAFT") {
    notFound();
  }

  const myRegistration = user
    ? await db.tournamentRegistration.findFirst({
        where: { tournamentId: id, userId: user.id, status: { notIn: ["CANCELLED", "REJECTED"] } },
        select: {
          status: true,
          inGameName: true,
          paymentSubmittedAt: true,
          slotNumber: true,
          position: true,
          kills: true,
        },
      })
    : null;

  const results =
    tournament.status === "COMPLETED"
      ? await db.tournamentRegistration.findMany({
          where: { tournamentId: id, position: { not: null } },
          orderBy: { position: "asc" },
          select: { position: true, kills: true, inGameName: true, user: { select: { name: true } } },
        })
      : [];

  const filled = tournament._count.registrations;
  const pct = tournament.slots > 0 ? Math.min(100, Math.round((filled / tournament.slots) * 100)) : 0;
  const room =
    myRegistration && myRegistration.status === "APPROVED" && tournament.roomReleased && tournament.roomCode
      ? { code: tournament.roomCode, password: tournament.roomPassword ?? "" }
      : null;

  return (
    <>
      <Navbar />
      <main className="min-h-[70vh]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
            <Link href="/tournaments">
              <ArrowLeft className="h-4 w-4" /> All Tournaments
            </Link>
          </Button>

          {/* Header */}
          <div className="card-raja p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-wide sm:text-3xl">{tournament.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={tournament.status} />
                  <Badge variant="outline" className="gap-1 font-medium">
                    <Users className="h-3 w-3" aria-hidden="true" /> {tournament.mode}
                  </Badge>
                  <Badge variant="outline" className="gap-1 font-medium">
                    <Map className="h-3 w-3" aria-hidden="true" /> {tournament.map}
                  </Badge>
                </div>
              </div>
              <div className="shrink-0 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm">
                <p className="inline-flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
                  Starts {formatDateTime(tournament.startsAt)}
                </p>
                {tournament.endsAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">Ends {formatDateTime(tournament.endsAt)}</p>
                ) : null}
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-card/60 p-4">
                <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                  <Ticket className="h-3.5 w-3.5" aria-hidden="true" /> Entry Fee
                </dt>
                <dd className="mt-1 font-display text-xl font-bold">
                  {tournament.entryFee > 0 ? formatRs(tournament.entryFee) : "FREE"}
                </dd>
              </div>
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                  <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Prize Pool
                </dt>
                <dd className="mt-1 font-display text-xl font-bold text-primary">{tournament.prizePool || "See rewards"}</dd>
              </div>
              <div className="rounded-lg border border-border bg-card/60 p-4">
                <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                  <Crosshair className="h-3.5 w-3.5" aria-hidden="true" /> Per Kill
                </dt>
                <dd className="mt-1 font-display text-xl font-bold">{formatRs(tournament.perKillReward)}</dd>
              </div>
              <div className="rounded-lg border border-border bg-card/60 p-4">
                <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" /> Slots
                </dt>
                <dd className="mt-1 font-display text-xl font-bold">
                  {filled}/{tournament.slots}
                </dd>
                <Progress value={pct} className="mt-2 h-1.5" aria-label={`${filled} of ${tournament.slots} slots filled`} />
              </div>
            </dl>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-5">
            {/* Left column: description, rules, rewards */}
            <div className="space-y-6 lg:col-span-3">
              <section aria-labelledby="about-heading" className="card-raja p-5 sm:p-6">
                <h2 id="about-heading" className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
                  <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" /> About This Tournament
                </h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {tournament.description}
                </p>
              </section>

              <section aria-labelledby="rules-heading" className="card-raja p-5 sm:p-6">
                <h2 id="rules-heading" className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
                  <ScrollText className="h-5 w-5 text-primary" aria-hidden="true" /> Rules
                </h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {tournament.rules}
                </p>
              </section>

              {tournament.rewards.length > 0 && (
                <section aria-labelledby="rewards-heading" className="card-raja p-5 sm:p-6">
                  <h2 id="rewards-heading" className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
                    <Medal className="h-5 w-5 text-primary" aria-hidden="true" /> Rewards
                  </h2>
                  <ul className="mt-4 space-y-3">
                    {tournament.rewards.map((reward) => {
                      const value =
                        reward.rewardType === "DIAMONDS"
                          ? `${(reward.diamondAmount ?? 0).toLocaleString("en-PK")} Diamonds`
                          : formatRs(reward.cashAmount ?? 0);
                      return (
                        <li
                          key={reward.id}
                          className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${
                            reward.position <= 3 ? "border-primary/30 bg-primary/5" : "border-border bg-card/60"
                          }`}
                        >
                          <span className="inline-flex items-center gap-2 font-medium">
                            {reward.position === 1 ? (
                              <Crown className="h-4 w-4 text-primary" aria-hidden="true" />
                            ) : (
                              <Medal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            )}
                            {positionLabel(reward.position)} Place
                          </span>
                          <span className="font-display font-bold text-primary">{value}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* Results */}
              {tournament.status === "COMPLETED" && (
                <section aria-labelledby="results-heading" className="card-raja p-5 sm:p-6">
                  <h2 id="results-heading" className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
                    <Trophy className="h-5 w-5 text-primary" aria-hidden="true" /> Final Results
                  </h2>
                  {results.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Results are being finalized by our team.</p>
                  ) : (
                    <ol className="mt-4 space-y-2">
                      {results.map((r) => (
                        <li
                          key={`${r.position}-${r.inGameName}`}
                          className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${
                            (r.position ?? 99) <= 3 ? "border-primary/30 bg-primary/5" : "border-border bg-card/60"
                          }`}
                        >
                          <span className="inline-flex min-w-0 items-center gap-3">
                            <span className={`font-display text-base font-bold ${(r.position ?? 99) <= 3 ? "text-primary" : "text-muted-foreground"}`}>
                              #{r.position}
                            </span>
                            <span className="truncate font-medium">{r.inGameName}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {r.user.name.split(" ")[0]} • {r.kills ?? 0} kills
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
            </div>

            {/* Right column: registration */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-20">
                <RegisterPanel
                  tournamentId={tournament.id}
                  tournamentStatus={tournament.status}
                  entryFee={tournament.entryFee}
                  slots={tournament.slots}
                  filled={filled}
                  isLoggedIn={!!user}
                  initialRegistration={
                    myRegistration
                      ? {
                          status: myRegistration.status,
                          inGameName: myRegistration.inGameName,
                          slotNumber: myRegistration.slotNumber,
                          paymentSubmittedAt: myRegistration.paymentSubmittedAt
                            ? myRegistration.paymentSubmittedAt.toISOString()
                            : null,
                        }
                      : null
                  }
                  room={room}
                  registrationPaymentNote={settings.REGISTRATION_PAYMENT_NOTE || ""}
                  payment={{
                    method: settings.PAYMENT_METHOD_NAME || "EasyPaisa",
                    accountTitle: settings.EASYPAISA_ACCOUNT_TITLE || "",
                    accountNumber: settings.EASYPAISA_ACCOUNT_NUMBER || "",
                    instructions: settings.EASYPAISA_INSTRUCTIONS || "",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
