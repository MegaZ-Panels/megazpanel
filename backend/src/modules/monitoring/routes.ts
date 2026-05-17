import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import {
  alertService,
  channelService,
  checkService,
} from "./service";
import {
  alertListQuerySchema,
  channelCreateSchema,
  channelUpdateSchema,
  checkCreateSchema,
  checkUpdateSchema,
  idSchema,
} from "./schemas";

const idParam = z.object({ id: idSchema });

function actorFrom(req: FastifyRequest) {
  return { id: req.auth!.user.id, email: req.auth!.user.email };
}

export async function monitoringModule(app: FastifyInstance): Promise<void> {
  // ── Channels ─────────────────────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/admin/notification-channels",
    preHandler: [requireAuth, requireAdmin],
    handler: async () => ({ data: await channelService.list() }),
  });

  app.route({
    method: "POST",
    url: "/api/admin/notification-channels",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = channelCreateSchema.parse(req.body);
      const data = await channelService.create(input, actorFrom(req));
      reply.status(201);
      return { data };
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/admin/notification-channels/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = channelUpdateSchema.parse(req.body);
      return { data: await channelService.update(id, input) };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/notification-channels/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await channelService.remove(id);
      reply.status(204);
      return null;
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/notification-channels/:id/test",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await channelService.test(id) };
    },
  });

  // ── Checks ───────────────────────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/admin/monitoring/checks",
    preHandler: [requireAuth, requireAdmin],
    handler: async () => ({ data: await checkService.list() }),
  });

  app.route({
    method: "GET",
    url: "/api/admin/monitoring/checks/:id",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await checkService.get(id) };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/monitoring/checks",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = checkCreateSchema.parse(req.body);
      const data = await checkService.create(input);
      reply.status(201);
      return { data };
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/admin/monitoring/checks/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = checkUpdateSchema.parse(req.body);
      return { data: await checkService.update(id, input) };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/monitoring/checks/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await checkService.remove(id);
      reply.status(204);
      return null;
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/monitoring/checks/:id/run",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await checkService.runOnce(id) };
    },
  });

  // ── Alerts ───────────────────────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/admin/monitoring/alerts",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const query = alertListQuerySchema.parse(req.query);
      return alertService.list(query);
    },
  });
}
