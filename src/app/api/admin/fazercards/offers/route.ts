/**
 * GET /api/admin/fazercards/offers?category_id=… — live FazerCards offers +
 * input-field spec for one category (admin only). Thin, validated proxy over
 * the documented `GET /api/v2/topups/offers` endpoint.
 */
import { ApiError, apiSuccess, withApi } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { fazerErrorInfo, fazerRequest } from "@/lib/fazercards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FazerOffer = {
  offer_id?: unknown;
  name?: unknown;
  price_usd?: unknown;
};

export const GET = withApi(async (req: Request) => {
  await requireAdmin();

  const categoryId = new URL(req.url).searchParams.get("category_id")?.trim() ?? "";
  if (!categoryId || categoryId.length > 120) {
    throw new ApiError("A valid category_id is required.", 400);
  }

  const { payload } = await fazerRequest<{ ok?: unknown; error?: unknown }>(
    "GET",
    `/api/v2/topups/offers?category_id=${encodeURIComponent(categoryId)}&include_ui=0`
  );
  const p = payload as { ok?: unknown; offers?: unknown; fields?: unknown; name?: unknown };
  if (p?.ok !== true || !Array.isArray(p.offers)) {
    throw new ApiError(`FazerCards offers fetch failed: ${fazerErrorInfo(payload).message}`, 502);
  }

  const offers = (p.offers as FazerOffer[]).filter(
    (o): o is { offer_id: string; name: string; price_usd: string } =>
      typeof o?.offer_id === "string" &&
      o.offer_id.trim() !== "" &&
      typeof o?.name === "string" &&
      o.name.trim() !== ""
  );

  return apiSuccess({
    categoryId,
    categoryName: typeof p.name === "string" ? p.name : categoryId,
    offers,
    fields: Array.isArray(p.fields) ? p.fields : [],
  });
});
