import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import { userService } from "./service";
import {
  idSchema,
  userCreateSchema,
  userListQuerySchema,
  userRolesUpdateSchema,
  userUpdateSchema,
} from "./schemas";

const idParam = z.object({ id: idSchema });

function actorFrom(req: FastifyRequest) {
  const ctx = req.auth!;
  return { id: ctx.user.id, email: ctx.user.email };
}

export async function usersModule(app: FastifyInstance): Promise<void> {
  app.route({
    method: "GET",
    url: "/api/admin/users",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const query = userListQuerySchema.parse(req.query);
      return userService.list(query);
    },
  });

  app.route({
    method: "GET",
    url: "/api/admin/users/:id",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await userService.get(id) };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/users",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = userCreateSchema.parse(req.body);
      const created = await userService.create(input, actorFrom(req));
      reply.status(201);
      return { data: created };
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/admin/users/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = userUpdateSchema.parse(req.body);
      const updated = await userService.update(id, input, actorFrom(req));
      return { data: updated };
    },
  });

  app.route({
    method: "PUT",
    url: "/api/admin/users/:id/roles",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = userRolesUpdateSchema.parse(req.body);
      const updated = await userService.setRoles(id, input, actorFrom(req));
      return { data: updated };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/users/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await userService.remove(id, actorFrom(req));
      reply.status(204);
      return null;
    },
  });
}
