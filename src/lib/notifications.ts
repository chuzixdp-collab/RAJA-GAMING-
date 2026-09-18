/**
 * Database-backed notifications.
 */
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";

export function notify(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}) {
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    },
  });
}

export async function notifyAdmins(input: {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}) {
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length === 0) return;
  await db.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    })),
  });
}

export async function broadcast(input: {
  type?: NotificationType;
  title: string;
  body: string;
  link?: string;
}) {
  const users = await db.user.findMany({ where: { role: "USER" }, select: { id: true } });
  if (users.length === 0) return 0;
  await db.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: input.type ?? "ADMIN",
      title: input.title,
      body: input.body,
      link: input.link,
    })),
  });
  return users.length;
}
