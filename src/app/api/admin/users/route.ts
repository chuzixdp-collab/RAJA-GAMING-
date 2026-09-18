import { db } from "@/lib/db";
import { ApiError, apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { userAdminSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** GET /api/admin/users?query=&page= — search users with wallet + order counts. */
export const GET = withApi(async (req: Request) => {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page") ?? "1")) || 1);

  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        banned: true,
        banReason: true,
        referralCode: true,
        createdAt: true,
        wallet: { select: { balance: true } },
        _count: { select: { orders: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  return apiSuccess({
    users,
    total,
    page,
    pageSize: PAGE_SIZE,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
});

/** PATCH /api/admin/users — ban / unban / role changes / note. */
export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, userAdminSchema);

  // Prevent an admin from locking themselves out of the panel.
  if ((input.action === "BAN" || input.action === "MAKE_USER") && input.userId === admin.id) {
    throw new ApiError("You cannot ban or demote your own account.", 400);
  }

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, role: true, banned: true },
  });
  if (!target) throw new ApiError("User not found.", 404);

  const note = input.note?.trim() || undefined;
  let data: Record<string, unknown> | null = null;

  switch (input.action) {
    case "BAN":
      data = {
        banned: true,
        banReason: note ?? "Banned by administrator",
        // bump tokenVersion to invalidate all existing sessions
        tokenVersion: { increment: 1 },
      };
      break;
    case "UNBAN":
      data = { banned: false, banReason: null };
      break;
    case "MAKE_ADMIN":
      if (target.role !== "ADMIN") data = { role: "ADMIN", tokenVersion: { increment: 1 } };
      break;
    case "MAKE_USER":
      if (target.role !== "USER") data = { role: "USER", tokenVersion: { increment: 1 } };
      break;
    case "NOTE":
      data = null; // audit-only entry
      break;
  }

  if (data) {
    await db.user.update({ where: { id: target.id }, data });
  }

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: `USER_${input.action}`,
    entity: "User",
    entityId: target.id,
    metadata: { targetEmail: target.email, note: note ?? null },
    ip: getClientIp(req),
  });

  return apiSuccess({ id: target.id, action: input.action });
});
