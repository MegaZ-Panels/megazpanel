import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import { nodeService } from "./service";
import {
  idSchema,
  nodeCreateSchema,
  nodeListQuerySchema,
  nodeUpdateSchema,
} from "./schemas";

const idParam = z.object({ id: idSchema });

function actorFrom(req: FastifyRequest) {
  const ctx = req.auth!;
  return { id: ctx.user.id, email: ctx.user.email };
}

export async function nodesModule(app: FastifyInstance): Promise<void> {
  app.route({
    method: "GET",
    url: "/api/admin/nodes",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const query = nodeListQuerySchema.parse(req.query);
      return nodeService.list(query);
    },
  });

  app.route({
    method: "GET",
    url: "/api/admin/nodes/:id",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await nodeService.get(id) };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/nodes",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = nodeCreateSchema.parse(req.body);
      const created = await nodeService.create(input, actorFrom(req));
      reply.status(201);
      return { data: created };
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/admin/nodes/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = nodeUpdateSchema.parse(req.body);
      const updated = await nodeService.update(id, input, actorFrom(req));
      return { data: updated };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/nodes/:id/rotate-token",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const updated = await nodeService.rotateToken(id, actorFrom(req));
      return { data: updated };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/nodes/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await nodeService.remove(id, actorFrom(req));
      reply.status(204);
      return null;
    },
  });
}
