/**
 * GET /api/admin/fazercards/orders — all FazerCards supplier orders with
 * ids, statuses and error messages (admin only). Monitoring data only —
 * no secret material.
 */
import { apiSuccess, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  await requireAdmin();

  const orders = await db.supplierOrder.findMany({
    where: { supplier: "FAZERCARDS" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      partnerOrderNumber: true,
      fzrOrderId: true,
      gameCode: true,
      denom: true,
      userid: true,
      amountUsdCents: true,
      status: true,
      statusMessage: true,
      submittedAt: true,
      lastStatusAt: true,
      webhookAt: true,
    },
  });

  return apiSuccess({ orders });
});
