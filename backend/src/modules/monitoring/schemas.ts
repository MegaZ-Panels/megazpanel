import { z } from "zod";
import {
  MonitoringCheckKind,
  MonitoringSeverity,
  NotifyChannelType,
} from "@prisma/client";

const trimmed = z.string().trim();

export const idSchema = trimmed.uuid();

const nameSchema = trimmed.min(1).max(120);

// ── Channel configs by kind ──────────────────────────────────────────────────

export const telegramConfigSchema = z.object({
  botToken: trimmed.min(20).max(200),
  chatId: trimmed.min(1).max(64),
});

export const webhookConfigSchema = z.object({
  url: trimmed.url().max(2000),
  secret: trimmed.max(255).optional(),
});

export const emailConfigSchema = z.object({
  to: trimmed.email().max(254),
});

const channelConfigSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("telegram"), config: telegramConfigSchema }),
  z.object({ kind: z.literal("webhook"), config: webhookConfigSchema }),
  z.object({ kind: z.literal("email"), config: emailConfigSchema }),
]);

export const channelCreateSchema = z
  .object({ name: nameSchema, enabled: z.boolean().default(true) })
  .and(channelConfigSchema);

export const channelUpdateSchema = z.object({
  name: nameSchema.optional(),
  enabled: z.boolean().optional(),
  config: z
    .union([telegramConfigSchema, webhookConfigSchema, emailConfigSchema])
    .optional(),
});

// ── Check configs by kind ────────────────────────────────────────────────────

export const httpHealthConfigSchema = z.object({
  url: trimmed.url(),
  timeoutMs: z.coerce.number().int().min(500).max(60_000).default(5_000),
  expectStatusBelow: z.coerce.number().int().min(200).max(599).default(400),
});

export const tcpPortConfigSchema = z.object({
  host: trimmed.min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  timeoutMs: z.coerce.number().int().min(500).max(60_000).default(3_000),
});

export const systemdUnitConfigSchema = z.object({
  unit: trimmed.min(1).max(120),
});

export const postgresPingConfigSchema = z.object({}).strict();

export const backupAgeConfigSchema = z.object({
  maxAgeHours: z.coerce.number().int().min(1).max(24 * 90),
  scheduleId: idSchema.optional(),
  targetId: idSchema.optional(),
});

export const diskUsageConfigSchema = z.object({
  path: trimmed.min(1).max(500).default("/"),
  warnPercent: z.coerce.number().min(1).max(100).default(85),
});

export const memoryUsageConfigSchema = z.object({
  warnPercent: z.coerce.number().min(1).max(100).default(85),
});

export const certExpiryConfigSchema = z.object({
  host: trimmed.min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(443),
  warnDays: z.coerce.number().int().min(1).max(365).default(14),
  servername: trimmed.max(255).optional(),
});

export const scheduledTaskConfigSchema = z.object({
  taskName: trimmed.min(1).max(120),
  maxAgeMinutes: z.coerce.number().int().min(1).max(60 * 24 * 30).default(15),
});

const checkConfigByKind = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("http_health"), config: httpHealthConfigSchema }),
  z.object({ kind: z.literal("tcp_port"), config: tcpPortConfigSchema }),
  z.object({ kind: z.literal("systemd_unit"), config: systemdUnitConfigSchema }),
  z.object({ kind: z.literal("postgres_ping"), config: postgresPingConfigSchema }),
  z.object({ kind: z.literal("backup_age"), config: backupAgeConfigSchema }),
  z.object({ kind: z.literal("disk_usage"), config: diskUsageConfigSchema }),
  z.object({ kind: z.literal("memory_usage"), config: memoryUsageConfigSchema }),
  z.object({ kind: z.literal("cert_expiry"), config: certExpiryConfigSchema }),
  z.object({ kind: z.literal("scheduled_task"), config: scheduledTaskConfigSchema }),
]);

export const checkCreateSchema = z
  .object({
    name: nameSchema,
    description: trimmed.max(500).optional().nullable(),
    enabled: z.boolean().default(true),
    intervalSeconds: z.coerce.number().int().min(15).max(60 * 60 * 24).default(60),
    failureThreshold: z.coerce.number().int().min(1).max(20).default(2),
    severity: z.nativeEnum(MonitoringSeverity).default("warning"),
    channelIds: z.array(idSchema).max(16).default([]),
  })
  .and(checkConfigByKind);

export const checkUpdateSchema = z.object({
  name: nameSchema.optional(),
  description: trimmed.max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  intervalSeconds: z.coerce.number().int().min(15).max(60 * 60 * 24).optional(),
  failureThreshold: z.coerce.number().int().min(1).max(20).optional(),
  severity: z.nativeEnum(MonitoringSeverity).optional(),
  channelIds: z.array(idSchema).max(16).optional(),
  config: z.record(z.unknown()).optional(),
});

export const alertListQuerySchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(["firing", "resolved"]).optional(),
  checkId: idSchema.optional(),
});

export type ChannelCreateInput = z.infer<typeof channelCreateSchema>;
export type ChannelUpdateInput = z.infer<typeof channelUpdateSchema>;
export type CheckCreateInput = z.infer<typeof checkCreateSchema>;
export type CheckUpdateInput = z.infer<typeof checkUpdateSchema>;
export type AlertListQuery = z.infer<typeof alertListQuerySchema>;

export const checkConfigByKindMap = {
  http_health: httpHealthConfigSchema,
  tcp_port: tcpPortConfigSchema,
  systemd_unit: systemdUnitConfigSchema,
  postgres_ping: postgresPingConfigSchema,
  backup_age: backupAgeConfigSchema,
  disk_usage: diskUsageConfigSchema,
  memory_usage: memoryUsageConfigSchema,
  cert_expiry: certExpiryConfigSchema,
  scheduled_task: scheduledTaskConfigSchema,
} as const satisfies Record<MonitoringCheckKind, z.ZodTypeAny>;

export const channelKindEnum = NotifyChannelType;
export const checkKindEnum = MonitoringCheckKind;
