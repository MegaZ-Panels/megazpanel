import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import {
  backupListQuerySchema,
  backupScheduleCreateSchema,
  backupScheduleUpdateSchema,
  idSchema,
  manualBackupSchema,
  targetCreateSchema,
  targetUpdateSchema,
} from "./schemas";
import {
  backupScheduleService,
  backupService,
  targetService,
} from "./service";
import { runRetentionSweep } from "./retention";

const idParam = z.object({ id: idSchema });

export async function backupsModule(app: FastifyInstance): Promise<void> {
  // ── Targets ──────────────────────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/admin/backup-targets",
    preHandler: [requireAuth, requireAdmin],
    handler: async () => ({ data: await targetService.list() }),
  });
  app.route({
    method: "GET",
    url: "/api/admin/backup-targets/:id",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await targetService.get(id) };
    },
  });
  app.route({
    method: "POST",
    url: "/api/admin/backup-targets",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = targetCreateSchema.parse(req.body);
      const data = await targetService.create(input, { id: req.auth!.user.id, email: req.auth!.user.email });
      reply.status(201);
      return { data };
    },
  });
  app.route({
    method: "PATCH",
    url: "/api/admin/backup-targets/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = targetUpdateSchema.parse(req.body);
      return {
        data: await targetService.update(id, input, {
          id: req.auth!.user.id,
          email: req.auth!.user.email,
        }),
      };
    },
  });
  app.route({
    method: "DELETE",
    url: "/api/admin/backup-targets/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await targetService.remove(id, { id: req.auth!.user.id, email: req.auth!.user.email });
      reply.status(204);
      return null;
    },
  });

  // ── Backup schedules ─────────────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/admin/backup-schedules",
    preHandler: [requireAuth, requireAdmin],
    handler: async () => ({ data: await backupScheduleService.list() }),
  });
  app.route({
    method: "GET",
    url: "/api/admin/backup-schedules/:id",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await backupScheduleService.get(id) };
    },
  });
  app.route({
    method: "POST",
    url: "/api/admin/backup-schedules",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = backupScheduleCreateSchema.parse(req.body);
      const data = await backupScheduleService.create(input, {
        id: req.auth!.user.id,
        email: req.auth!.user.email,
      });
      reply.status(201);
      return { data };
    },
  });
  app.route({
    method: "PATCH",
    url: "/api/admin/backup-schedules/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      const input = backupScheduleUpdateSchema.parse(req.body);
      return {
        data: await backupScheduleService.update(id, input, {
          id: req.auth!.user.id,
          email: req.auth!.user.email,
        }),
      };
    },
  });
  app.route({
    method: "DELETE",
    url: "/api/admin/backup-schedules/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await backupScheduleService.remove(id, {
        id: req.auth!.user.id,
        email: req.auth!.user.email,
      });
      reply.status(204);
      return null;
    },
  });

  // ── Backups ──────────────────────────────────────────────────────────────
  app.route({
    method: "GET",
    url: "/api/admin/backups",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const query = backupListQuerySchema.parse(req.query);
      return backupService.list(query);
    },
  });
  app.route({
    method: "GET",
    url: "/api/admin/backups/:id",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await backupService.get(id) };
    },
  });
  app.route({
    method: "POST",
    url: "/api/admin/backups",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const input = manualBackupSchema.parse(req.body);
      const data = await backupService.manual(input, {
        id: req.auth!.user.id,
        email: req.auth!.user.email,
      });
      reply.status(202);
      return { data };
    },
  });
  app.route({
    method: "DELETE",
    url: "/api/admin/backups/:id",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await backupService.remove(id, { id: req.auth!.user.id, email: req.auth!.user.email });
      reply.status(204);
      return null;
    },
  });
  app.route({
    method: "GET",
    url: "/api/admin/backups/:id/download",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const result = await backupService.download(id);
      if (result.mode === "redirect") {
        reply.redirect(result.url, 302);
        return null;
      }
      reply.header("Content-Type", "application/octet-stream");
      reply.header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(result.backup.name)}.bin"`,
      );
      return reply.send(result.stream);
    },
  });
  app.route({
    method: "POST",
    url: "/api/admin/backups/:id/validate",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await backupService.validate(id) };
    },
  });

  // ── Retention sweep (manual trigger) ─────────────────────────────────────
  app.route({
    method: "POST",
    url: "/api/admin/backups/retention/run",
    preHandler: [requireAuth, requireAdmin, requireCsrf],
    handler: async () => ({ data: await runRetentionSweep() }),
  });
}
