import { z } from "zod";

export const notificationLevelSchema = z.enum(["info", "warning", "error", "success"]);

export const notificationCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(4000).optional().nullable(),
  level: notificationLevelSchema.default("info"),
  href: z.string().trim().url().max(500).optional().nullable(),
});

export const notificationListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type NotificationCreateInput = z.infer<typeof notificationCreateSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
