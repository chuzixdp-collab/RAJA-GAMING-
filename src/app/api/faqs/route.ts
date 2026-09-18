import { apiSuccess, withApi } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/faqs — public active FAQs ordered by category then sortOrder. */
export const GET = withApi(async () => {
  const faqs = await db.faq.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    select: { id: true, question: true, answer: true, category: true, sortOrder: true },
  });
  return apiSuccess(faqs);
});
