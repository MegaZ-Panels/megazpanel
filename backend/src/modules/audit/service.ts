import { Prisma } from "@prisma/client";
import { prisma } from "@/core/db";
import { logger } from "@/core/logger";
import type { AuditEvent, AuditListQuery } from "./schemas";

export const auditService = {
  async record(event: AuditEvent): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: event.action,
          actorId: event.actorId ?? null,
          actorEmail: event.actorEmail ?? null,
          targetKind: event.targetKind ?? null,
          targetId: event.targetId ?? null,
          meta: (event.meta ?? {}) as Prisma.InputJsonValue,
          ip: event.ip ?? null,
          userAgent: event.userAgent ?? null,
        },
      });
    } catch (err) {
      // Never let audit logging interfere with the primary operation.
      logger.error({ err, event }, "failed to write audit log");
    }
  },

  async list(query: AuditListQuery) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.actorId) where.actorId = query.actorId;
    if (query.search) {
      where.OR = [
        { action: { contains: query.search, mode: "insensitive" } },
        { actorEmail: { contains: query.search, mode: "insensitive" } },
        { targetKind: { contains: query.search, mode: "insensitive" } },
        { targetId: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    });

    const hasMore = items.length > query.limit;
    const trimmed = hasMore ? items.slice(0, query.limit) : items;
    const nextCursor = hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null;
    return { items: trimmed, nextCursor };
  },
};
