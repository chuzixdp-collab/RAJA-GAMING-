import { apiSuccess, getClientIp, readJson, withApi } from "@/lib/api";
import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { assertRateLimit } from "@/lib/rate-limit";
import { contactSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/contact — public, rate-limited contact form. */
export const POST = withApi(async (req: Request) => {
  const ip = getClientIp(req);
  await assertRateLimit(`contact:${ip}`, 4, 10 * 60_000);

  const input = await readJson(req, contactSchema);

  const message = await db.contactMessage.create({ data: input });

  await notifyAdmins({
    type: "ADMIN",
    title: "New contact message",
    body: `${input.name} (${input.email}): ${input.subject}`,
    link: "/admin/contact",
  });

  await logAudit({
    action: "CONTACT_MESSAGE",
    entity: "ContactMessage",
    entityId: message.id,
    metadata: { subject: input.subject },
    ip,
  });

  return apiSuccess({}, 201);
});
