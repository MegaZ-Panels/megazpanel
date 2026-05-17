import { z } from "zod";

export const settingKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9._-]*$/i, "Invalid setting key");

export const settingValueSchema: z.ZodType<unknown> = z.unknown();

export const settingUpsertSchema = z.object({
  value: settingValueSchema,
  description: z.string().trim().max(500).optional().nullable(),
});

export const bulkSettingsSchema = z.array(
  z.object({
    key: settingKeySchema,
    value: settingValueSchema,
    description: z.string().trim().max(500).optional().nullable(),
  }),
);

export type SettingUpsert = z.infer<typeof settingUpsertSchema>;
export type BulkSettings = z.infer<typeof bulkSettingsSchema>;
