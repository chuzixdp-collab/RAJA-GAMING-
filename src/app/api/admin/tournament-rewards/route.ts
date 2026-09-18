import { db } from "@/lib/db";
import { apiSuccess, withApi, readJson, ApiError, getClientIp } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rewardSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) throw new ApiError("tournamentId query parameter is required.", 400);

  const rewards = await db.tournamentReward.findMany({
    where: { tournamentId },
    orderBy: { position: "asc" },
  });

  return apiSuccess({ rewards });
});

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, rewardSchema);

  const tournament = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    select: { id: true, title: true },
  });
  if (!tournament) throw new ApiError("Tournament not found.", 404);

  // Upsert each reward by the unique [tournamentId, position] pair.
  for (const reward of input.rewards) {
    const data = {
      rewardType: reward.rewardType,
      diamondAmount: reward.rewardType === "DIAMONDS" ? (reward.diamondAmount ?? 0) : null,
      cashAmount: reward.rewardType === "CASH" ? (reward.cashAmount ?? 0) : null,
      description: reward.description ? reward.description : null,
    };
    await db.tournamentReward.upsert({
      where: {
        tournamentId_position: {
          tournamentId: input.tournamentId,
          position: reward.position,
        },
      },
      update: data,
      create: { tournamentId: input.tournamentId, position: reward.position, ...data },
    });
  }

  const rewards = await db.tournamentReward.findMany({
    where: { tournamentId: input.tournamentId },
    orderBy: { position: "asc" },
  });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "TOURNAMENT_REWARDS_UPSERT",
    entity: "TournamentReward",
    entityId: input.tournamentId,
    metadata: {
      tournament: tournament.title,
      positions: input.rewards.map((r) => r.position),
    },
    ip: getClientIp(req),
  });

  return apiSuccess({ rewards });
});
