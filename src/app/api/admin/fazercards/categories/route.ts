/**
 * GET /api/admin/fazercards/categories — live FazerCards top-up categories
 * (admin only). Thin, validated proxy over the documented
 * `GET /api/v2/topups` endpoint.
 */
import { ApiError, apiSuccess, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { fazerErrorInfo, fazerRequest } from "@/lib/fazercards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FazerCategory = {
  category_id?: unknown;
  name?: unknown;
  note?: unknown;
};

export const GET = withApi(async () => {
  await requireAdmin();

  const { payload } = await fazerRequest<{ ok?: unknown; items?: unknown; error?: unknown }>(
    "GET",
    "/api/v2/topups?include_ui=0"
  );
  const p = payload as { ok?: unknown; items?: unknown };
  if (p?.ok !== true || !Array.isArray(p.items)) {
    throw new ApiError(`FazerCards categories fetch failed: ${fazerErrorInfo(payload).message}`, 502);
  }

  const categories = (p.items as FazerCategory[]).filter(
    (c): c is { category_id: string; name: string; note?: string } =>
      typeof c?.category_id === "string" &&
      c.category_id.trim() !== "" &&
      typeof c?.name === "string" &&
      c.name.trim() !== ""
  );

  return apiSuccess({ categories });
});
