import { ApiError, apiSuccess, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/orders/[id] — the owner's view of a single order (admin notes excluded). */
export const GET = withApi<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const order = await db.topUpOrder.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      orderNumber: true,
      packageId: true,
      packageTitle: true,
      diamonds: true,
      amount: true,
      couponCode: true,
      discount: true,
      totalAmount: true,
      ffUid: true,
      ffServer: true,
      paymentMethod: true,
      paymentTrxId: true,
      paymentScreenshotId: true,
      paymentSubmittedAt: true,
      paymentVerifiedAt: true,
      status: true,
      userNote: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!order) throw new ApiError("Order not found.", 404);

  return apiSuccess(order);
});
