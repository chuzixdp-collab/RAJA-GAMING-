import { apiSuccess, withApi } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/marketplace — public list of approved listings with image upload ids. */
export const GET = withApi(async () => {
  const listings = await db.listing.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      title: true,
      price: true,
      level: true,
      ffUid: true,
      createdAt: true,
      images: { orderBy: { sortOrder: "asc" }, select: { uploadId: true } },
    },
  });
  return apiSuccess(listings);
});
