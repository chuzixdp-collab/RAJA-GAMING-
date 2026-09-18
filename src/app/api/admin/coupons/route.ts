import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { couponSchema, couponUpdateSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Convert the client expiry value into a Date (or null to clear).
 * Returns undefined when the key was not provided at all (no change).
 */
function parseExpiresAt(raw: string | null | undefined): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new ApiError("Invalid expiry date.", 400);
  return d;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** GET /api/admin/coupons — all coupons with redemption counts. */
export const GET = withApi(async () => {
  await requireAdmin();

  const coupons = await db.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });

  return apiSuccess({ coupons });
});

/** POST /api/admin/coupons — create a coupon. */
export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, couponSchema);
  const expiresAt = parseExpiresAt(input.expiresAt) ?? null;

  try {
    const coupon = await db.coupon.create({
      data: {
        code: input.code,
        type: input.type,
        value: input.value,
        minOrder: input.minOrder,
        maxDiscount: input.maxDiscount ?? null,
        expiresAt,
        usageLimit: input.usageLimit ?? null,
        perUserLimit: input.perUserLimit,
        active: input.active,
      },
    });

    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "COUPON_CREATE",
      entity: "Coupon",
      entityId: coupon.id,
      metadata: { code: coupon.code, type: coupon.type, value: coupon.value },
      ip: getClientIp(req),
    });

    return apiSuccess(coupon, 201);
  } catch (e) {
    if (isUniqueViolation(e)) throw new ApiError("A coupon with this code already exists.", 409);
    throw e;
  }
});

/** PATCH /api/admin/coupons — update a coupon by id. */
export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, couponUpdateSchema);

  const existing = await db.coupon.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError("Coupon not found.", 404);

  const data: Record<string, unknown> = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.type !== undefined) data.type = input.type;
  if (input.value !== undefined) data.value = input.value;
  if (input.minOrder !== undefined) data.minOrder = input.minOrder;
  if (input.maxDiscount !== undefined) data.maxDiscount = input.maxDiscount ?? null;
  if (input.expiresAt !== undefined) {
    const parsedExpiry = parseExpiresAt(input.expiresAt);
    if (parsedExpiry !== undefined) data.expiresAt = parsedExpiry;
  }
  if (input.usageLimit !== undefined) data.usageLimit = input.usageLimit ?? null;
  if (input.perUserLimit !== undefined) data.perUserLimit = input.perUserLimit;
  if (input.active !== undefined) data.active = input.active;

  try {
    const coupon = await db.coupon.update({ where: { id: input.id }, data });

    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "COUPON_UPDATE",
      entity: "Coupon",
      entityId: coupon.id,
      metadata: { code: coupon.code, changes: Object.keys(data) },
      ip: getClientIp(req),
    });

    return apiSuccess(coupon);
  } catch (e) {
    if (isUniqueViolation(e)) throw new ApiError("A coupon with this code already exists.", 409);
    throw e;
  }
});

/** DELETE /api/admin/coupons?id= — blocked once the coupon has been used. */
export const DELETE = withApi(async (req: Request) => {
  const admin = await requireAdmin();

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) throw new ApiError("Missing coupon id.", 400);

  const coupon = await db.coupon.findUnique({
    where: { id },
    include: { _count: { select: { redemptions: true } } },
  });
  if (!coupon) throw new ApiError("Coupon not found.", 404);
  if (coupon.usedCount > 0 || coupon._count.redemptions > 0) {
    throw new ApiError("Coupon has redemptions — deactivate instead.", 400);
  }

  await db.coupon.delete({ where: { id } });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "COUPON_DELETE",
    entity: "Coupon",
    entityId: id,
    metadata: { code: coupon.code },
    ip: getClientIp(req),
  });

  return apiSuccess({ id });
});
