import { z } from "zod";
import { apiSuccess, readJson, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["read", "read_all"]),
  ids: z.array(z.string().min(1)).max(100).optional(),
});

/** My notifications (latest 100) + unread count. */
export const GET = withApi(async () => {
  const user = await requireUser();
  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        read: true,
        createdAt: true,
      },
    }),
    db.notification.count({ where: { userId: user.id, read: false } }),
  ]);
  return apiSuccess({ notifications, unreadCount });
});

/** Mark notifications read (single ids or all). */
export const POST = withApi(async (req: Request) => {
  const user = await requireUser();
  const input = await readJson(req, actionSchema);

  if (input.action === "read") {
    const ids = input.ids ?? [];
    if (ids.length === 0) return apiSuccess({ updated: 0 });
    const res = await db.notification.updateMany({
      where: { id: { in: ids }, userId: user.id },
      data: { read: true },
    });
    return apiSuccess({ updated: res.count });
  }

  const res = await db.notification.updateMany({
    where: { userId: user.id },
    data: { read: true },
  });
  return apiSuccess({ updated: res.count });
});
