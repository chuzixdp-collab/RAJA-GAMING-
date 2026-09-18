import { ApiError, apiSuccess, withApi } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/[id] — public detail of an APPROVED listing.
 * Never includes sensitiveDataEncrypted or any credential fields.
 */
export const GET = withApi<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;

  const listing = await db.listing.findFirst({
    where: { id, status: "APPROVED" },
    select: {
      id: true,
      title: true,
      description: true,
      ffUid: true,
      level: true,
      price: true,
      verificationNote: true,
      createdAt: true,
      seller: { select: { name: true } },
      images: { orderBy: { sortOrder: "asc" }, select: { uploadId: true } },
    },
  });
  if (!listing) throw new ApiError("Listing not found.", 404);

  return apiSuccess({
    id: listing.id,
    title: listing.title,
    description: listing.description,
    ffUid: listing.ffUid,
    level: listing.level,
    price: listing.price,
    verificationNote: listing.verificationNote,
    createdAt: listing.createdAt,
    sellerFirstName: listing.seller.name.split(" ")[0],
    images: listing.images,
  });
});
