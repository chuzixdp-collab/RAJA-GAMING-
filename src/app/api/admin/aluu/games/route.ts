/**
 * GET /api/admin/aluu/games — list supplier games (admin only).
 * Wraps ALUU GET /api/v.1/games so the admin can resolve the Free Fire
 * Global game code without touching the raw supplier API.
 */
import { ApiError, apiSuccess, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { aluuErrorInfo, aluuRequest } from "@/lib/aluu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AluuGame = { Name?: unknown; gamecode?: unknown; totalProducts?: unknown };

export const GET = withApi(async () => {
  await requireAdmin();

  const { payload } = await aluuRequest<{ success?: boolean; data?: AluuGame[] }>(
    "GET",
    "/api/v.1/games"
  );

  if (!payload?.success || !Array.isArray(payload.data)) {
    const info = aluuErrorInfo(payload);
    // Upstream problem — surfaced as a 502 so the admin sees it is ALUU-side.
    throw new ApiError(`ALUU games list failed: ${info.message}`, 502);
  }

  const games = payload.data
    .filter((g) => typeof g?.Name === "string" && typeof g?.gamecode === "string")
    .map((g) => ({
      name: g.Name as string,
      gamecode: g.gamecode as string,
      totalProducts: typeof g.totalProducts === "number" ? g.totalProducts : null,
    }));

  return apiSuccess({ games });
});
