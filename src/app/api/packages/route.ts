import { apiSuccess, withApi } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/packages — public list of active diamond packages. */
export const GET = withApi(async () => {
  const packages = await db.diamondPackage.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      diamonds: true,
      price: true,
      description: true,
      badge: true,
      sortOrder: true,
      // Presence-only supplier flag: lets the checkout offer the ALUU UID
      // verification without exposing game codes or any supplier detail.
      supplierSource: true,
    },
  });
  return apiSuccess(
    packages.map(({ supplierSource, ...pkg }) => ({
      ...pkg,
      supplierManaged: supplierSource === "ALUU",
    }))
  );
});
