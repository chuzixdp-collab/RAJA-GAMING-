import { db } from "@/lib/db";
import { apiSuccess, withApi, readJson, ApiError, getClientIp } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { contactActionSchema } from "@/lib/validations";
import type { ContactStatus, Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Prisma.ContactMessageWhereInput = {};
  if (status && ["NEW", "READ", "REPLIED", "CLOSED"].includes(status)) {
    where.status = status as ContactStatus;
  }

  const messages = await db.contactMessage.findMany({
    where,
    take: 100,
    orderBy: { createdAt: "desc" },
  });

  return apiSuccess({ messages });
});

export const PATCH = withApi(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await readJson(req, contactActionSchema);
  const ip = getClientIp(req);

  const message = await db.contactMessage.findUnique({ where: { id: input.messageId } });
  if (!message) throw new ApiError("Message not found.", 404);

  switch (input.action) {
    case "MARK_READ": {
      const updated = await db.contactMessage.update({
        where: { id: message.id },
        data: { status: "READ" },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "CONTACT_MARK_READ",
        entity: "ContactMessage",
        entityId: message.id,
        metadata: { subject: message.subject },
        ip,
      });
      return apiSuccess({ message: updated });
    }
    case "REPLIED": {
      const updated = await db.contactMessage.update({
        where: { id: message.id },
        data: { status: "REPLIED" },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "CONTACT_REPLIED",
        entity: "ContactMessage",
        entityId: message.id,
        metadata: { subject: message.subject, email: message.email },
        ip,
      });
      return apiSuccess({ message: updated });
    }
    case "CLOSED": {
      const updated = await db.contactMessage.update({
        where: { id: message.id },
        data: { status: "CLOSED" },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "CONTACT_CLOSED",
        entity: "ContactMessage",
        entityId: message.id,
        metadata: { subject: message.subject },
        ip,
      });
      return apiSuccess({ message: updated });
    }
    case "NOTE": {
      const updated = await db.contactMessage.update({
        where: { id: message.id },
        data: { adminNotes: input.note ? input.note : message.adminNotes },
      });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "CONTACT_NOTE",
        entity: "ContactMessage",
        entityId: message.id,
        metadata: {},
        ip,
      });
      return apiSuccess({ message: updated });
    }
    case "DELETE": {
      await db.contactMessage.delete({ where: { id: message.id } });
      await logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "CONTACT_DELETE",
        entity: "ContactMessage",
        entityId: message.id,
        metadata: { subject: message.subject, email: message.email },
        ip,
      });
      return apiSuccess({ deleted: true });
    }
    default:
      throw new ApiError("Unknown action.", 400);
  }
});
