import { db } from "@/lib/db";
import { apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { broadcastSchema } from "@/lib/validations";
import { broadcast } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/notifications — recent 50 sent notifications + total. */
export const GET = withApi(async () => {
  await requireAdmin();

  const [notifications, total] = await Promise.all([
    db.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
    db.notification.count(),
  ]);

  return apiSuccess({ notifications, total });
});

/** POST /api/admin/notifications — broadcast to every non-admin user. */
export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, broadcastSchema);

  const count = await broadcast({
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link ? input.link : undefined,
  });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "BROADCAST",
    entity: "Notification",
    metadata: { type: input.type, title: input.title, recipients: count, link: input.link ?? null },
    ip: getClientIp(req),
  });

  return apiSuccess({ recipients: count });
});
