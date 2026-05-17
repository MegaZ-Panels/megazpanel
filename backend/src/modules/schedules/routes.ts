import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import { scheduleService } from "./service";
import {
  idSchema,
  scheduledTaskCreateSchema,
  scheduledTaskListQuerySchema,
  scheduledTaskUpdateSchema,
} from "./schemas";

const idParam = z.object({ id: idSchema });

export async function schedulesModule(app: FastifyInstance): Promise<void> {
  app.route({
    method: "GET",
    url: "/api/admin/schedules",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const query = scheduledTaskListQuerySchema.parse(req.query);
      return { data: await scheduleService.list(query) };
    },
  });

  app.route({
    method: "GET",
    url: "/api/admin/schedules/:id",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await scheduleService.get(id) };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/schedules",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = scheduledTaskCreateSchema.parse(req.body);
      const task = await scheduleService.create(input);
      reply.status(201);
      return { data: task };
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/admin/schedules/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = scheduledTaskUpdateSchema.parse(req.body);
      const updated = await scheduleService.update(id, input);
      return { data: updated };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/schedules/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await scheduleService.remove(id);
      reply.status(204);
      return null;
    },
  });
}
