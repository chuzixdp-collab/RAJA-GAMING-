import { apiSuccess, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** My own reviews including moderation status (private to the author). */
export const GET = withApi(async () => {
  const user = await requireUser();
  const reviews = await db.review.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      targetType: true,
      targetId: true,
      rating: true,
      comment: true,
      status: true,
      moderationNote: true,
      createdAt: true,
    },
  });
  return apiSuccess({ reviews });
});
