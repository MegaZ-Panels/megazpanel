import { Prisma } from "@prisma/client";
import { prisma } from "@/core/db";
import { errors } from "@/core/errors";
import type { NotificationCreateInput, NotificationListQuery } from "./schemas";

export const adminNotificationService = {
  list: async (query: NotificationListQuery) => {
    const where: Prisma.AdminNotificationWhereInput = query.unreadOnly ? { read: false } : {};
    const items = await prisma.adminNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    });
    const hasMore = items.length > query.limit;
    const trimmed = hasMore ? items.slice(0, query.limit) : items;
    return { items: trimmed, nextCursor: hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null };
  },

  unreadCount: () => prisma.adminNotification.count({ where: { read: false } }),

  create: (input: NotificationCreateInput) =>
    prisma.adminNotification.create({
      data: {
        title: input.title,
        body: input.body ?? null,
        level: input.level,
        href: input.href ?? null,
      },
    }),

  markRead: async (id: string) => {
    const existing = await prisma.adminNotification.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Notification not found");
    return prisma.adminNotification.update({ where: { id }, data: { read: true } });
  },

  markAllRead: () => prisma.adminNotification.updateMany({ where: { read: false }, data: { read: true } }),

  remove: async (id: string) => {
    const existing = await prisma.adminNotification.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Notification not found");
    await prisma.adminNotification.delete({ where: { id } });
  },
};
