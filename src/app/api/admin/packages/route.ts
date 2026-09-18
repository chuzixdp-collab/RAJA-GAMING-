import { db } from "@/lib/db";
import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { packageSchema, packageUpdateSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/packages — all packages including inactive ones. */
export const GET = withApi(async () => {
  await requireAdmin();

  const packages = await db.diamondPackage.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { orders: true } } },
  });

  return apiSuccess({ packages });
});

/** POST /api/admin/packages — create a diamond package. */
export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, packageSchema);

  const pkg = await db.diamondPackage.create({
    data: {
      title: input.title,
      diamonds: input.diamonds,
      price: input.price,
      description: input.description ? input.description : null,
      badge: input.badge ? input.badge : null,
      active: input.active,
      sortOrder: input.sortOrder,
    },
  });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "PACKAGE_CREATE",
    entity: "DiamondPackage",
    entityId: pkg.id,
    metadata: { title: pkg.title, diamonds: pkg.diamonds, price: pkg.price },
    ip: getClientIp(req),
  });

  return apiSuccess(pkg, 201);
});

/** PATCH /api/admin/packages — update fields of a package. */
export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, packageUpdateSchema);

  const existing = await db.diamondPackage.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError("Package not found.", 404);

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.diamonds !== undefined) data.diamonds = input.diamonds;
  if (input.price !== undefined) data.price = input.price;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.badge !== undefined) data.badge = input.badge || null;
  if (input.active !== undefined) data.active = input.active;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  const pkg = await db.diamondPackage.update({ where: { id: input.id }, data });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "PACKAGE_UPDATE",
    entity: "DiamondPackage",
    entityId: pkg.id,
    metadata: { changes: Object.keys(data), title: pkg.title },
    ip: getClientIp(req),
  });

  return apiSuccess(pkg);
});

/** DELETE /api/admin/packages?id= — blocked once orders exist. */
export const DELETE = withApi(async (req: Request) => {
  const admin = await requireAdmin();

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) throw new ApiError("Missing package id.", 400);

  const pkg = await db.diamondPackage.findUnique({
    where: { id },
    include: { _count: { select: { orders: true } } },
  });
  if (!pkg) throw new ApiError("Package not found.", 404);
  if (pkg._count.orders > 0) {
    throw new ApiError("Package has orders — deactivate instead.", 400);
  }

  await db.diamondPackage.delete({ where: { id } });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "PACKAGE_DELETE",
    entity: "DiamondPackage",
    entityId: id,
    metadata: { title: pkg.title },
    ip: getClientIp(req),
  });

  return apiSuccess({ id });
});
