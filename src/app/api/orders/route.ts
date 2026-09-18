import { ApiError, apiSuccess, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateOrderNumber } from "@/lib/orders";
import { validateCoupon } from "@/lib/coupons";
import { notify, notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { createOrderSchema } from "@/lib/validations";
import { formatRs } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orders — create a diamond top-up order.
 * The price is always recomputed from the package server-side; client amounts
 * are never trusted. Coupon validation runs inside the same transaction.
 */
export const POST = withApi(async (req: Request) => {
  const user = await requireUser();
  const input = await readJson(req, createOrderSchema);

  const pkg = await db.diamondPackage.findUnique({ where: { id: input.packageId } });
  if (!pkg || !pkg.active) {
    throw new ApiError("This package is no longer available.", 400);
  }

  const ffServer = input.ffServer?.trim() || null;
  const couponCode = input.couponCode?.trim().toUpperCase() || null;
  const userNote = input.userNote?.trim() || null;

  const order = await db.$transaction(async (tx) => {
    let discount = 0;
    let appliedCode: string | null = null;
    if (couponCode) {
      const applied = await validateCoupon(tx, {
        userId: user.id,
        code: couponCode,
        orderAmount: pkg.price,
      });
      discount = applied.discount;
      appliedCode = applied.code;
    }
    return tx.topUpOrder.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: user.id,
        packageId: pkg.id,
        packageTitle: pkg.title,
        diamonds: pkg.diamonds,
        amount: pkg.price,
        couponCode: appliedCode,
        discount,
        totalAmount: pkg.price - discount,
        ffUid: input.ffUid,
        ffServer,
        userNote,
        status: "PENDING_PAYMENT",
        paymentMethod: "EASYPAISA",
      },
    });
  });

  await notifyAdmins({
    type: "ORDER",
    title: "New top-up order",
    body: `${user.name} ordered ${order.diamonds} diamonds (${order.packageTitle}) for ${formatRs(order.totalAmount)}.`,
    link: "/admin/orders",
  });

  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "ORDER_CREATE",
    entity: "TopUpOrder",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, packageTitle: order.packageTitle, totalAmount: order.totalAmount },
  });

  return apiSuccess(order, 201);
});

/** GET /api/orders — the current user's orders (latest 100). */
export const GET = withApi(async () => {
  const user = await requireUser();
  const orders = await db.topUpOrder.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { package: { select: { title: true } } },
  });
  return apiSuccess(orders);
});
