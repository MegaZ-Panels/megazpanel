import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import { serverService } from "./service";
import {
  identifierSchema,
  idSchema,
  serverCreateSchema,
  serverListQuerySchema,
  serverMineQuerySchema,
  serverSuspendSchema,
  serverUpdateSchema,
} from "./schemas";

const idParam = z.object({ id: idSchema });
const identifierParam = z.object({ identifier: identifierSchema });

function actorFrom(req: FastifyRequest) {
  const ctx = req.auth!;
  return { id: ctx.user.id, email: ctx.user.email };
}

export async function serversModule(app: FastifyInstance): Promise<void> {
  // ── Admin endpoints ────────────────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/admin/servers",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const query = serverListQuerySchema.parse(req.query);
      return serverService.list(query);
    },
  });

  app.route({
    method: "GET",
    url: "/api/admin/servers/:id",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await serverService.get(id) };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/servers",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = serverCreateSchema.parse(req.body);
      const created = await serverService.create(input, actorFrom(req));
      reply.status(201);
      return { data: created };
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/admin/servers/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = serverUpdateSchema.parse(req.body);
      const updated = await serverService.update(id, input, actorFrom(req));
      return { data: updated };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/servers/:id/suspend",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const { suspended } = serverSuspendSchema.parse(req.body);
      const updated = await serverService.setSuspended(id, suspended, actorFrom(req));
      return { data: updated };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/servers/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await serverService.remove(id, actorFrom(req));
      reply.status(204);
      return null;
    },
  });

  // ── Client (owner) endpoints ───────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/client/servers",
    preHandler: [requireAuth],
    handler: async (req) => {
      const query = serverMineQuerySchema.parse(req.query);
      return serverService.listForOwner(req.auth!.user.id, query);
    },
  });

  app.route({
    method: "GET",
    url: "/api/client/servers/:identifier",
    preHandler: [requireAuth],
    handler: async (req) => {
      const { identifier } = identifierParam.parse(req.params);
      return {
        data: await serverService.getByIdentifierForOwner(
          identifier,
          req.auth!.user.id,
        ),
      };
    },
  });
}
