import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/status-badge";
import { MyTournaments, type MyRegistrationDTO } from "./my-tournaments";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Tournaments" };

export default async function DashboardTournamentsPage() {
  const user = await getCurrentUser();
  if (!user) return null; // layout guards this

  const registrations = await db.tournamentRegistration.findMany({
    where: { userId: user.id },
    include: {
      tournament: {
        select: {
          id: true,
          title: true,
          status: true,
          mode: true,
          map: true,
          entryFee: true,
          startsAt: true,
          roomCode: true,
          roomPassword: true,
          roomReleased: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const dto: MyRegistrationDTO[] = registrations.map((r) => ({
    id: r.id,
    tournamentId: r.tournamentId,
    status: r.status,
    inGameName: r.inGameName,
    ffUid: r.ffUid,
    slotNumber: r.slotNumber,
    position: r.position,
    kills: r.kills,
    rewardClaimed: r.rewardClaimed,
    adminNotes: r.adminNotes,
    createdAt: r.createdAt.toISOString(),
    tournament: {
      id: r.tournament.id,
      title: r.tournament.title,
      status: r.tournament.status,
      mode: r.tournament.mode,
      map: r.tournament.map,
      entryFee: r.tournament.entryFee,
      startsAt: r.tournament.startsAt.toISOString(),
      roomCode: r.tournament.roomCode,
      roomPassword: r.tournament.roomPassword,
      roomReleased: r.tournament.roomReleased,
    },
  }));

  return (
    <div>
      <PageHeader
        title="My Tournaments"
        description="Your registrations, room credentials and results."
      />
      <MyTournaments registrations={dto} />
    </div>
  );
}
