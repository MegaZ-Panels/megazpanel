import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import { allocationService } from "./service";
import {
  allocationBulkCreateSchema,
  allocationCreateSchema,
  allocationListQuerySchema,
  allocationUpdateSchema,
  idSchema,
} from "./schemas";

const idParam = z.object({ id: idSchema });
const nodeIdParam = z.object({ nodeId: idSchema });

function actorFrom(req: FastifyRequest) {
  const ctx = req.auth!;
  return { id: ctx.user.id, email: ctx.user.email };
}

export async function allocationsModule(app: FastifyInstance): Promise<void> {
  app.route({
    method: "GET",
    url: "/api/admin/nodes/:nodeId/allocations",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { nodeId } = nodeIdParam.parse(req.params);
      const query = allocationListQuerySchema.parse(req.query);
      return allocationService.list(nodeId, query);
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/nodes/:nodeId/allocations",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { nodeId } = nodeIdParam.parse(req.params);
      const input = allocationCreateSchema.parse(req.body);
      const created = await allocationService.create(nodeId, input, actorFrom(req));
      reply.status(201);
      return { data: created };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/nodes/:nodeId/allocations/bulk",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { nodeId } = nodeIdParam.parse(req.params);
      const input = allocationBulkCreateSchema.parse(req.body);
      const result = await allocationService.createMany(nodeId, input, actorFrom(req));
      reply.status(201);
      return { data: result };
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/admin/allocations/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = allocationUpdateSchema.parse(req.body);
      const updated = await allocationService.update(id, input, actorFrom(req));
      return { data: updated };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/allocations/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await allocationService.remove(id, actorFrom(req));
      reply.status(204);
      return null;
    },
  });
}
