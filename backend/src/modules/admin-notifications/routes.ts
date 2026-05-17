import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import { adminNotificationService } from "./service";
import { notificationCreateSchema, notificationListQuerySchema } from "./schemas";

const idParam = z.object({ id: z.string().uuid() });

export async function adminNotificationsModule(app: FastifyInstance): Promise<void> {
  app.route({
    method: "GET",
    url: "/api/admin/notifications",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const query = notificationListQuerySchema.parse(req.query);
      return adminNotificationService.list(query);
    },
  });

  app.route({
    method: "GET",
    url: "/api/admin/notifications/unread-count",
    preHandler: [requireAuth, requireAdmin],
    handler: async () => ({ unread: await adminNotificationService.unreadCount() }),
  });

  app.route({
    method: "POST",
    url: "/api/admin/notifications",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = notificationCreateSchema.parse(req.body);
      const created = await adminNotificationService.create(input);
      reply.status(201);
      return { data: created };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/notifications/:id/read",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const updated = await adminNotificationService.markRead(id);
      return { data: updated };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/notifications/read-all",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (_req, reply) => {
      await adminNotificationService.markAllRead();
      reply.status(204);
      return null;
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/notifications/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await adminNotificationService.remove(id);
      reply.status(204);
      return null;
    },
  });
}
