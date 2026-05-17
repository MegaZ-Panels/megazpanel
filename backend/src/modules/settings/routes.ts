import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import { settingsService } from "./service";
import {
  bulkSettingsSchema,
  settingKeySchema,
  settingUpsertSchema,
} from "./schemas";

const keyParam = z.object({ key: settingKeySchema });

export async function settingsModule(app: FastifyInstance): Promise<void> {
  app.route({
    method: "GET",
    url: "/api/admin/settings",
    preHandler: [requireAuth, requireAdmin],
    handler: async () => ({ data: await settingsService.list() }),
  });

  app.route({
    method: "GET",
    url: "/api/admin/settings/:key",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { key } = keyParam.parse(req.params);
      return { data: await settingsService.get(key) };
    },
  });

  app.route({
    method: "PUT",
    url: "/api/admin/settings/:key",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { key } = keyParam.parse(req.params);
      const input = settingUpsertSchema.parse(req.body);
      const setting = await settingsService.upsert(key, input, req.auth!.user.id);
      return { data: setting };
    },
  });

  app.route({
    method: "POST",
    url: "/api/admin/settings/bulk",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const input = bulkSettingsSchema.parse(req.body);
      const settings = await settingsService.upsertMany(input, req.auth!.user.id);
      return { data: settings };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/settings/:key",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { key } = keyParam.parse(req.params);
      await settingsService.remove(key);
      reply.status(204);
      return null;
    },
  });
}
