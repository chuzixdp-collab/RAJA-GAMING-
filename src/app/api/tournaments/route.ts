import { apiSuccess, withApi } from "@/lib/api";
import { db } from "@/lib/db";
import type { RegistrationStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_REG_STATUSES: RegistrationStatus[] = ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "APPROVED"];

/** GET /api/tournaments — public list (drafts excluded), soonest first. */
export const GET = withApi(async () => {
  const tournaments = await db.tournament.findMany({
    where: { status: { not: "DRAFT" } },
    orderBy: { startsAt: "asc" },
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
      endsAt: true,
      status: true,
      _count: { select: { registrations: { where: { status: { in: ACTIVE_REG_STATUSES } } } } },
    },
  });
  return apiSuccess(tournaments);
});
