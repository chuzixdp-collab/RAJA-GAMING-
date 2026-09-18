import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  apiSuccess,
  withApi,
  readJson,
  ApiError,
  getClientIp,
} from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { tournamentCreateSchema, tournamentUpdateSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toDateOrNull(value: string | undefined | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export const GET = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const tournament = await db.tournament.findUnique({
      where: { id },
      include: {
        registrations: {
          orderBy: [{ slotNumber: "asc" }, { createdAt: "asc" }],
          include: { user: { select: { id: true, email: true, name: true } } },
        },
        rewards: { orderBy: { position: "asc" } },
        _count: { select: { registrations: true } },
      },
    });
    if (!tournament) throw new ApiError("Tournament not found.", 404);
    return apiSuccess({ tournament });
  }

  const tournaments = await db.tournament.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { registrations: true } } },
  });

  const approvedGroups = await db.tournamentRegistration.groupBy({
    by: ["tournamentId"],
    where: { status: "APPROVED" },
    _count: { _all: true },
  });
  const approvedMap = new Map(approvedGroups.map((g) => [g.tournamentId, g._count._all]));

  return apiSuccess({
    tournaments: tournaments.map((t) => ({
      ...t,
      approvedCount: approvedMap.get(t.id) ?? 0,
    })),
  });
});

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, tournamentCreateSchema);

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new ApiError("Invalid start date.", 400);
  const endsAt = toDateOrNull(input.endsAt ?? undefined);
  if (endsAt === null && input.endsAt) throw new ApiError("Invalid end date.", 400);

  const tournament = await db.tournament.create({
    data: {
      title: input.title,
      description: input.description,
      rules: input.rules,
      mode: input.mode,
      map: input.map,
      entryFee: input.entryFee,
      prizePool: input.prizePool ? input.prizePool : null,
      perKillReward: input.perKillReward,
      slots: input.slots,
      startsAt,
      endsAt: endsAt ?? null,
      status: "DRAFT",
      createdById: admin.id,
    },
  });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "TOURNAMENT_CREATE",
    entity: "Tournament",
    entityId: tournament.id,
    metadata: { title: tournament.title, mode: tournament.mode, slots: tournament.slots },
    ip: getClientIp(req),
  });

  return apiSuccess({ tournament }, 201);
});

export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, tournamentUpdateSchema.extend({ id: z.string().min(1) }));

  const existing = await db.tournament.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError("Tournament not found.", 404);

  const data: Prisma.TournamentUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.rules !== undefined) data.rules = input.rules;
  if (input.mode !== undefined) data.mode = input.mode;
  if (input.map !== undefined) data.map = input.map;
  if (input.entryFee !== undefined) data.entryFee = input.entryFee;
  if (input.prizePool !== undefined) data.prizePool = input.prizePool ? input.prizePool : null;
  if (input.perKillReward !== undefined) data.perKillReward = input.perKillReward;
  if (input.slots !== undefined) data.slots = input.slots;
  if (input.status !== undefined) data.status = input.status;
  // room credentials are stored as-is; roomReleased is only touched when explicitly provided
  if (input.roomCode !== undefined) data.roomCode = input.roomCode ? input.roomCode : null;
  if (input.roomPassword !== undefined)
    data.roomPassword = input.roomPassword ? input.roomPassword : null;
  if (input.roomReleased !== undefined) data.roomReleased = input.roomReleased;
  if (input.startsAt !== undefined) {
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new ApiError("Invalid start date.", 400);
    data.startsAt = startsAt;
  }
  if (input.endsAt !== undefined) {
    const endsAt = toDateOrNull(input.endsAt);
    if (endsAt === null && input.endsAt) throw new ApiError("Invalid end date.", 400);
    data.endsAt = endsAt ?? null;
  }

  if (Object.keys(data).length === 0) throw new ApiError("Nothing to update.", 400);

  const tournament = await db.tournament.update({ where: { id: input.id }, data });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "TOURNAMENT_UPDATE",
    entity: "Tournament",
    entityId: tournament.id,
    metadata: { fields: Object.keys(data), status: tournament.status },
    ip: getClientIp(req),
  });

  return apiSuccess({ tournament });
});

export const DELETE = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) throw new ApiError("Tournament id is required.", 400);

  const existing = await db.tournament.findUnique({
    where: { id },
    include: { _count: { select: { registrations: true } } },
  });
  if (!existing) throw new ApiError("Tournament not found.", 404);
  if (existing._count.registrations > 0) {
    throw new ApiError(
      "This tournament has registrations and cannot be deleted. Cancel it instead.",
      400
    );
  }

  await db.tournament.delete({ where: { id } });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "TOURNAMENT_DELETE",
    entity: "Tournament",
    entityId: id,
    metadata: { title: existing.title },
    ip: getClientIp(req),
  });

  return apiSuccess({ deleted: true });
});
