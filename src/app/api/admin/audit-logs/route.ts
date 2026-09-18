import { db } from "@/lib/db";
import { apiSuccess, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/audit-logs?entity=&take=&cursor= — newest audit entries. */
export const GET = withApi(async (req: Request) => {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity")?.trim() ?? "";
  const takeRaw = Number(searchParams.get("take") ?? "100");
  const take = Math.min(200, Math.max(1, Math.trunc(takeRaw) || 100));
  const cursor = searchParams.get("cursor")?.trim() || undefined;

  const logs = await db.auditLog.findMany({
    where: entity ? { entity } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  return apiSuccess({
    logs,
    nextCursor: logs.length === take ? (logs[logs.length - 1]?.id ?? null) : null,
  });
});
