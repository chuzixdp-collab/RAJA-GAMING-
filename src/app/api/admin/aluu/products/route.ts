/**
 * GET /api/admin/aluu/products?gamecode= — live supplier pack preview
 * (admin only, READ-ONLY: nothing is written to the database here).
 *
 * Returns the exact ALUU denominations ("Pack") and supplier USD prices so
 * the admin can review them before running the sync.
 * Defaults to the configured ALUU_FF_GAMECODE setting when no param is given.
 */
import { ApiError, apiSuccess, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { aluuErrorInfo, aluuRequest, parseDiamondsFromName } from "@/lib/aluu";
import { getSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AluuProduct = {
  name?: unknown;
  gamecode?: unknown;
  Pack?: unknown;
  requiresUserId?: unknown;
  price?: unknown;
  stockStatus?: unknown;
  updatedAt?: unknown;
};

export const GET = withApi(async (req: Request) => {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("gamecode")?.trim() ?? "";
  const gameCode = param || (await getSetting("ALUU_FF_GAMECODE"));
  if (!gameCode) {
    throw new ApiError("No game code given and none saved yet — pick one from the games list first.", 400);
  }
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(gameCode)) {
    throw new ApiError("Invalid game code.", 400);
  }

  const { payload } = await aluuRequest<{ success?: boolean; count?: number; data?: AluuProduct[] }>(
    "GET",
    `/api/v.1/products/${encodeURIComponent(gameCode)}`
  );

  if (!payload?.success || !Array.isArray(payload.data)) {
    const info = aluuErrorInfo(payload);
    throw new ApiError(`ALUU products fetch failed: ${info.message}`, 502);
  }

  const products = payload.data
    .filter((p) => typeof p?.name === "string" && p.name.trim() && typeof p?.Pack === "string" && p.Pack.trim())
    .map((p) => ({
      name: (p.name as string).trim(),
      gamecode: typeof p.gamecode === "string" ? p.gamecode : gameCode,
      pack: (p.Pack as string).trim(),
      diamonds: parseDiamondsFromName(p.name as string),
      requiresUserId: p.requiresUserId === true,
      priceUsd: typeof p.price === "number" ? p.price : null,
      priceUsdCents: typeof p.price === "number" ? Math.round(p.price * 100) : null,
      stockStatus: typeof p.stockStatus === "string" ? p.stockStatus : null,
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : null,
    }));

  return apiSuccess({ gameCode, count: products.length, products });
});
