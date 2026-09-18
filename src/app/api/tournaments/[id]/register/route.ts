import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify, notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { getSettingBool } from "@/lib/settings";
import { tournamentRegisterSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tournaments/[id]/register — register the current user.
 * Free tournaments are approved instantly (slot assigned); paid tournaments
 * start in PENDING_PAYMENT. Fills the tournament to FULL automatically.
 */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const input = await readJson(req, tournamentRegisterSchema);

  if (!(await getSettingBool("TOURNAMENTS_ENABLED", true))) {
    throw new ApiError("Tournament registration is temporarily disabled.", 400);
  }

  const tournament = await db.tournament.findUnique({ where: { id } });
  if (!tournament) throw new ApiError("Tournament not found.", 404);
  if (tournament.status !== "OPEN" && tournament.status !== "UPCOMING") {
    throw new ApiError("Registration is not open.", 400);
  }

  const existing = await db.tournamentRegistration.findUnique({
    where: { tournamentId_userId: { tournamentId: id, userId: user.id } },
  });
  if (existing) {
    throw new ApiError("You are already registered for this tournament.", 400);
  }

  const free = tournament.entryFee <= 0;

  const registration = await db.$transaction(async (tx) => {
    const activeCount = await tx.tournamentRegistration.count({
      where: { tournamentId: id, status: { notIn: ["CANCELLED", "REJECTED"] } },
    });
    if (activeCount >= tournament.slots) {
      throw new ApiError("Tournament is full.", 400);
    }

    const reg = await tx.tournamentRegistration.create({
      data: {
        tournamentId: id,
        userId: user.id,
        inGameName: input.inGameName,
        ffUid: input.ffUid,
        status: free ? "APPROVED" : "PENDING_PAYMENT",
        slotNumber: free ? activeCount + 1 : null,
      },
    });

    if (activeCount + 1 >= tournament.slots && (tournament.status === "OPEN" || tournament.status === "UPCOMING")) {
      await tx.tournament.update({ where: { id }, data: { status: "FULL" } });
    }

    return reg;
  });

  await notifyAdmins({
    type: "TOURNAMENT",
    title: "New tournament registration",
    body: `${user.name} (${registration.inGameName}) registered for "${tournament.title}"${
      free ? "." : " — entry payment pending."
    }`,
    link: "/admin/tournament-registrations",
  });

  if (free) {
    await notify({
      userId: user.id,
      type: "TOURNAMENT",
      title: "Registration confirmed",
      body: `You are registered for "${tournament.title}". Room details will be shared before the match.`,
      link: `/tournaments/${id}`,
    });
  }

  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "TOURNAMENT_REGISTER",
    entity: "TournamentRegistration",
    entityId: registration.id,
    metadata: { tournamentId: id, tournamentTitle: tournament.title, entryFee: tournament.entryFee },
  });

  return apiSuccess(registration, 201);
});
