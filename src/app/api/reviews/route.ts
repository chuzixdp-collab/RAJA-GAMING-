import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { getSettingBool } from "@/lib/settings";
import { reviewSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TARGET_TYPES = ["TOPUP", "TOURNAMENT", "MARKETPLACE"] as const;

/** GET /api/reviews — public. Filter by targetType+targetId, else latest 20 approved. */
export const GET = withApi(async (req: Request) => {
  const url = new URL(req.url);
  const targetType = url.searchParams.get("targetType") ?? "";
  const targetId = url.searchParams.get("targetId") ?? "";

  const filtered =
    targetId && (VALID_TARGET_TYPES as readonly string[]).includes(targetType)
      ? { status: "APPROVED" as const, targetType, targetId }
      : { status: "APPROVED" as const };

  const reviews = await db.review.findMany({
    where: filtered,
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      targetType: true,
      targetId: true,
      rating: true,
      comment: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  return apiSuccess(reviews);
});

/**
 * POST /api/reviews — submit (or resubmit) a review. The user must have
 * COMPLETED the corresponding top-up order / tournament / marketplace trade.
 */
export const POST = withApi(async (req: Request) => {
  const user = await requireUser();
  const input = await readJson(req, reviewSchema);

  let eligible = false;
  if (input.targetType === "TOPUP") {
    eligible = !!(await db.topUpOrder.findFirst({
      where: { id: input.targetId, userId: user.id, status: "COMPLETED" },
    }));
  } else if (input.targetType === "TOURNAMENT") {
    eligible = !!(await db.tournamentRegistration.findFirst({
      where: { tournamentId: input.targetId, userId: user.id, status: "APPROVED" },
    }));
  } else {
    eligible = !!(await db.purchase.findFirst({
      where: {
        listingId: input.targetId,
        status: "COMPLETED",
        OR: [{ buyerId: user.id }, { sellerId: user.id }],
      },
    }));
  }
  if (!eligible) {
    throw new ApiError("You can only review after completing this.", 403);
  }

  const autoApprove = await getSettingBool("REVIEWS_AUTO_APPROVE", false);
  const status = autoApprove ? "APPROVED" : "PENDING";

  const review = await db.review.upsert({
    where: {
      userId_targetType_targetId: {
        userId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    },
    update: { rating: input.rating, comment: input.comment, status, moderationNote: null },
    create: {
      userId: user.id,
      targetType: input.targetType,
      targetId: input.targetId,
      rating: input.rating,
      comment: input.comment,
      status,
    },
  });

  if (!autoApprove) {
    await notifyAdmins({
      type: "REVIEW",
      title: "Review awaiting moderation",
      body: `${user.name} submitted a ${input.rating}-star review for a ${input.targetType.toLowerCase()} target.`,
      link: "/admin/reviews",
    });
  }

  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "REVIEW_SUBMIT",
    entity: "Review",
    entityId: review.id,
    metadata: { targetType: input.targetType, targetId: input.targetId, rating: input.rating, status },
  });

  return apiSuccess(review, 201);
});
