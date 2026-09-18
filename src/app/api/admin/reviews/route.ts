import { db } from "@/lib/db";
import { apiSuccess, withApi, readJson, ApiError, getClientIp } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { reviewModerationSchema } from "@/lib/validations";
import type { ReviewStatus, Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Prisma.ReviewWhereInput = {};
  if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    where.status = status as ReviewStatus;
  }

  const reviews = await db.review.findMany({
    where,
    take: 100,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  return apiSuccess({ reviews });
});

export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, reviewModerationSchema);
  const ip = getClientIp(req);

  const review = await db.review.findUnique({
    where: { id: input.reviewId },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!review) throw new ApiError("Review not found.", 404);

  switch (input.action) {
    case "APPROVE": {
      const updated = await db.review.update({
        where: { id: review.id },
        data: {
          status: "APPROVED",
          moderationNote: input.note ? input.note : review.moderationNote,
        },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "REVIEW_APPROVE",
        entity: "Review",
        entityId: review.id,
        metadata: { user: review.user.email, targetType: review.targetType },
        ip,
      });
      return apiSuccess({ review: updated });
    }
    case "REJECT": {
      const updated = await db.review.update({
        where: { id: review.id },
        data: {
          status: "REJECTED",
          moderationNote: input.note ? input.note : review.moderationNote,
        },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "REVIEW_REJECT",
        entity: "Review",
        entityId: review.id,
        metadata: { user: review.user.email, targetType: review.targetType },
        ip,
      });
      return apiSuccess({ review: updated });
    }
    case "DELETE": {
      await db.review.delete({ where: { id: review.id } });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "REVIEW_DELETE",
        entity: "Review",
        entityId: review.id,
        metadata: { user: review.user.email, targetType: review.targetType },
        ip,
      });
      return apiSuccess({ deleted: true });
    }
    default:
      throw new ApiError("Unknown action.", 400);
  }
});
