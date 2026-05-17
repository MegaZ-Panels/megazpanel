import { z } from "zod";
import { ScheduleKind, ScheduleStatus } from "@prisma/client";

const trimmed = z.string().trim();

export const idSchema = trimmed.uuid();

const cronSchema = trimmed.min(1).max(120);
const tzSchema = trimmed.min(1).max(80).default("UTC");
const nameSchema = trimmed.min(1).max(120);

export const scheduledTaskCreateSchema = z.object({
  name: nameSchema,
  description: trimmed.max(500).optional().nullable(),
  kind: z.nativeEnum(ScheduleKind),
  enabled: z.boolean().default(true),
  cron: cronSchema,
  timezone: tzSchema,
  payload: z.record(z.unknown()).default({}),
});

export const scheduledTaskUpdateSchema = z.object({
  name: nameSchema.optional(),
  description: trimmed.max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  cron: cronSchema.optional(),
  timezone: tzSchema.optional(),
  payload: z.record(z.unknown()).optional(),
  status: z.nativeEnum(ScheduleStatus).optional(),
});

export const scheduledTaskListQuerySchema = z.object({
  enabled: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  kind: z.nativeEnum(ScheduleKind).optional(),
});

export type ScheduledTaskCreate = z.infer<typeof scheduledTaskCreateSchema>;
export type ScheduledTaskUpdate = z.infer<typeof scheduledTaskUpdateSchema>;
export type ScheduledTaskListQuery = z.infer<typeof scheduledTaskListQuerySchema>;
