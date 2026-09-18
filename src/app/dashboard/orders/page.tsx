import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/status-badge";
import { OrdersView, type OrderDTO } from "./orders-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Orders" };

export default async function DashboardOrdersPage() {
  const user = await getCurrentUser();
  if (!user) return null; // layout guards this

  const orders = await db.topUpOrder.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const dto: OrderDTO[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    packageTitle: o.packageTitle,
    diamonds: o.diamonds,
    amount: o.amount,
    discount: o.discount,
    couponCode: o.couponCode,
    totalAmount: o.totalAmount,
    ffUid: o.ffUid,
    ffServer: o.ffServer,
    paymentMethod: o.paymentMethod,
    paymentTrxId: o.paymentTrxId,
    paymentSubmittedAt: o.paymentSubmittedAt?.toISOString() ?? null,
    status: o.status,
    userNote: o.userNote,
    adminNotes: o.adminNotes,
    createdAt: o.createdAt.toISOString(),
    completedAt: o.completedAt?.toISOString() ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="My Orders"
        description="Track your diamond top-ups and submit pending payments."
      />
      <OrdersView orders={dto} />
    </div>
  );
}
