import { z } from "zod";
import { BackupKind, StorageProviderType } from "@prisma/client";

const trimmed = z.string().trim();

export const idSchema = trimmed.uuid();

const cronSchema = trimmed.min(1).max(120);
const tzSchema = trimmed.min(1).max(80).default("UTC");
const nameSchema = trimmed.min(1).max(120);

export const targetCreateSchema = z
  .object({
    name: nameSchema,
    description: trimmed.max(500).optional().nullable(),
    provider: z.nativeEnum(StorageProviderType),
    bucket: trimmed.max(120).optional().nullable(),
    prefix: trimmed.max(255).optional().nullable(),
    endpoint: trimmed.max(255).optional().nullable(),
    region: trimmed.max(80).optional().nullable(),
    localPath: trimmed.max(500).optional().nullable(),
    accessKey: trimmed.max(255).optional().nullable(),
    secretKey: trimmed.max(255).optional().nullable(),
    enabled: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.provider === "local") {
      if (!data.localPath) {
        ctx.addIssue({ code: "custom", path: ["localPath"], message: "Required for local provider" });
      }
    } else {
      if (!data.bucket) {
        ctx.addIssue({ code: "custom", path: ["bucket"], message: "Required for s3/b2" });
      }
      if (!data.endpoint) {
        ctx.addIssue({ code: "custom", path: ["endpoint"], message: "Required for s3/b2" });
      }
      if (!data.accessKey) {
        ctx.addIssue({ code: "custom", path: ["accessKey"], message: "Required for s3/b2" });
      }
      if (!data.secretKey) {
        ctx.addIssue({ code: "custom", path: ["secretKey"], message: "Required for s3/b2" });
      }
    }
  });

export const targetUpdateSchema = z.object({
  name: nameSchema.optional(),
  description: trimmed.max(500).optional().nullable(),
  bucket: trimmed.max(120).optional().nullable(),
  prefix: trimmed.max(255).optional().nullable(),
  endpoint: trimmed.max(255).optional().nullable(),
  region: trimmed.max(80).optional().nullable(),
  localPath: trimmed.max(500).optional().nullable(),
  accessKey: trimmed.max(255).optional().nullable(),
  secretKey: trimmed.max(255).optional().nullable(),
  enabled: z.boolean().optional(),
});

export const backupScheduleCreateSchema = z.object({
  name: nameSchema,
  description: trimmed.max(500).optional().nullable(),
  enabled: z.boolean().default(true),
  cron: cronSchema,
  timezone: tzSchema,
  kind: z.nativeEnum(BackupKind),
  source: trimmed.max(255).optional().nullable(),
  targetId: idSchema,
  retentionCount: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  retentionDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
});

export const backupScheduleUpdateSchema = backupScheduleCreateSchema.partial();

export const manualBackupSchema = z.object({
  name: nameSchema,
  kind: z.nativeEnum(BackupKind),
  source: trimmed.max(255).optional().nullable(),
  targetId: idSchema,
  expiresAt: z.coerce.date().optional().nullable(),
});

export const backupListQuerySchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z
    .enum(["pending", "running", "succeeded", "failed", "expired"])
    .optional(),
  targetId: idSchema.optional(),
  scheduleId: idSchema.optional(),
});

export type TargetCreateInput = z.infer<typeof targetCreateSchema>;
export type TargetUpdateInput = z.infer<typeof targetUpdateSchema>;
export type BackupScheduleCreateInput = z.infer<typeof backupScheduleCreateSchema>;
export type BackupScheduleUpdateInput = z.infer<typeof backupScheduleUpdateSchema>;
export type ManualBackupInput = z.infer<typeof manualBackupSchema>;
export type BackupListQuery = z.infer<typeof backupListQuerySchema>;
