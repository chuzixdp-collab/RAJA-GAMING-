import { apiSuccess, withApi } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the signed-in user owns in the marketplace:
 * listings (with admin notes), purchases (buyer side) and sales (seller side).
 * Sensitive encrypted credentials are NEVER included.
 */
export const GET = withApi(async () => {
  const user = await requireUser();

  const [listings, purchases, sales] = await Promise.all([
    db.listing.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        ffUid: true,
        description: true,
        level: true,
        price: true,
        verificationNote: true,
        status: true,
        adminNotes: true,
        soldAt: true,
        createdAt: true,
        images: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, uploadId: true, sortOrder: true },
        },
      },
    }),
    db.purchase.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        listingId: true,
        listingTitle: true,
        price: true,
        status: true,
        paymentTrxId: true,
        paymentSubmittedAt: true,
        disputeReason: true,
        buyerNote: true,
        adminNotes: true,
        createdAt: true,
        updatedAt: true,
        listing: { select: { title: true, status: true } },
      },
    }),
    db.purchase.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        listingId: true,
        listingTitle: true,
        price: true,
        status: true,
        payoutAmount: true,
        completedAt: true,
        adminNotes: true,
        createdAt: true,
        updatedAt: true,
        listing: { select: { title: true } },
      },
    }),
  ]);

  return apiSuccess({ listings, purchases, sales });
});
