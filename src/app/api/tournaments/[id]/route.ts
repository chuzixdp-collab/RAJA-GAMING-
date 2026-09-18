import { ApiError, apiSuccess, withApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { RegistrationStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_REG_STATUSES: RegistrationStatus[] = ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "APPROVED"];

/**
 * GET /api/tournaments/[id] — public tournament detail.
 * Room credentials are ONLY included when the caller has an APPROVED
 * registration and the admin has released the room. Everyone else gets
 * `room: null` — the raw roomCode/roomPassword fields are always stripped.
 */
export const GET = withApi<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();

  const tournament = await db.tournament.findUnique({
    where: { id },
    include: {
      rewards: { orderBy: { position: "asc" } },
      _count: { select: { registrations: { where: { status: { in: ACTIVE_REG_STATUSES } } } } },
    },
  });
  if (!tournament || tournament.status === "DRAFT") {
    throw new ApiError("Tournament not found.", 404);
  }

  const myRegistration = user
    ? await db.tournamentRegistration.findFirst({
        where: { tournamentId: id, userId: user.id, status: { notIn: ["CANCELLED", "REJECTED"] } },
        select: {
          id: true,
          status: true,
          inGameName: true,
          paymentTrxId: true,
          paymentSubmittedAt: true,
          slotNumber: true,
          position: true,
          kills: true,
          rewardClaimed: true,
        },
      })
    : null;

  const room =
    myRegistration &&
    myRegistration.status === "APPROVED" &&
    tournament.roomReleased &&
    tournament.roomCode
      ? { code: tournament.roomCode, password: tournament.roomPassword ?? "" }
      : null;

  const results =
    tournament.status === "COMPLETED"
      ? (
          await db.tournamentRegistration.findMany({
            where: { tournamentId: id, position: { not: null } },
            orderBy: { position: "asc" },
            select: { position: true, kills: true, inGameName: true, user: { select: { name: true } } },
          })
        ).map((r) => ({
          position: r.position,
          kills: r.kills,
          inGameName: r.inGameName,
          playerName: r.user.name.split(" ")[0],
        }))
      : [];

  // strip sensitive room fields from the payload
  const { roomCode: _roomCode, roomPassword: _roomPassword, ...safeTournament } = tournament;

  return apiSuccess({
    ...safeTournament,
    registrationsCount: tournament._count.registrations,
    myRegistration,
    room,
    results,
  });
});
