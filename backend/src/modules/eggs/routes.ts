import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import { eggService, nestService } from "./service";
import {
  eggExportFormatSchema,
  eggImportFormatSchema,
  eggInputSchema,
  eggUpdateSchema,
  idSchema,
  nestInputSchema,
} from "./schemas";

const idParam = z.object({ id: idSchema });
const formatQuery = z.object({ format: eggExportFormatSchema.default("json") });
const importQuery = z.object({ format: eggImportFormatSchema.default("json") });
const eggListQuery = z.object({
  nestId: idSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export async function eggsModule(app: FastifyInstance): Promise<void> {
  // ── Nests ────────────────────────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/admin/nests",
    preHandler: [requireAuth, requireAdmin],
    handler: async () => ({ data: await nestService.list() }),
  });

  app.route({
    method: "GET",
    url: "/api/admin/nests/:id",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await nestService.get(id) };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/nests",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = nestInputSchema.parse(req.body);
      const nest = await nestService.create(input);
      reply.status(201);
      return { data: nest };
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/admin/nests/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = nestInputSchema.partial().parse(req.body);
      const nest = await nestService.update(id, input);
      return { data: nest };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/nests/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await nestService.remove(id);
      reply.status(204);
      return null;
    },
  });

  // ── Eggs ─────────────────────────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/admin/eggs",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const filter = eggListQuery.parse(req.query);
      return { data: await eggService.list(filter) };
    },
  });

  app.route({
    method: "GET",
    url: "/api/admin/eggs/:id",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await eggService.get(id) };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/eggs",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = eggInputSchema.parse(req.body);
      const egg = await eggService.create(input);
      reply.status(201);
      return { data: egg };
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/admin/eggs/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = eggUpdateSchema.parse(req.body);
      const egg = await eggService.update(id, input);
      return { data: egg };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/eggs/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await eggService.remove(id);
      reply.status(204);
      return null;
    },
  });

  // ── Import / Export ──────────────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/admin/eggs/:id/export",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const { format } = formatQuery.parse(req.query);
      const { body, filename } = await eggService.export(id, format);
      reply.header(
        "Content-Type",
        format === "yaml" ? "application/yaml; charset=utf-8" : "application/json; charset=utf-8",
      );
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      return body;
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/eggs/import",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { format } = importQuery.parse(req.query);
      const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const egg = await eggService.importFromText(raw, format);
      reply.status(201);
      return { data: egg };
    },
  });
}
