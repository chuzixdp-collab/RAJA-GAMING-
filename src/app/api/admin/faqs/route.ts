import { db } from "@/lib/db";
import { apiSuccess, withApi, readJson, ApiError, getClientIp } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { faqSchema, faqUpdateSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const admin = await requireAdmin();

  const faqs = await db.faq.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return apiSuccess({ faqs });
});

export const POST = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, faqSchema);

  const faq = await db.faq.create({
    data: {
      question: input.question,
      answer: input.answer,
      category: input.category || "GENERAL",
      sortOrder: input.sortOrder,
      active: input.active,
    },
  });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "FAQ_CREATE",
    entity: "Faq",
    entityId: faq.id,
    metadata: { question: faq.question, category: faq.category },
    ip: getClientIp(req),
  });

  return apiSuccess({ faq }, 201);
});

export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, faqUpdateSchema);

  const existing = await db.faq.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError("FAQ not found.", 404);

  const faq = await db.faq.update({
    where: { id: input.id },
    data: {
      ...(input.question !== undefined ? { question: input.question } : {}),
      ...(input.answer !== undefined ? { answer: input.answer } : {}),
      ...(input.category !== undefined ? { category: input.category || "GENERAL" } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "FAQ_UPDATE",
    entity: "Faq",
    entityId: faq.id,
    metadata: { category: faq.category, active: faq.active, sortOrder: faq.sortOrder },
    ip: getClientIp(req),
  });

  return apiSuccess({ faq });
});

export const DELETE = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) throw new ApiError("FAQ id is required.", 400);

  const existing = await db.faq.findUnique({ where: { id } });
  if (!existing) throw new ApiError("FAQ not found.", 404);

  await db.faq.delete({ where: { id } });

  await logAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "FAQ_DELETE",
    entity: "Faq",
    entityId: id,
    metadata: { question: existing.question },
    ip: getClientIp(req),
  });

  return apiSuccess({ deleted: true });
});
