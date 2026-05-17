import { z } from "zod";

const trimmed = z.string().trim();

export const idSchema = trimmed.uuid("Invalid id");

export const dockerImagesSchema = z
  .record(trimmed.min(1), trimmed.min(1))
  .refine((v) => Object.keys(v).length > 0, "At least one Docker image is required");

const variableRulesSchema = trimmed
  .min(1, "Validation rules are required")
  .max(255, "Validation rules are too long")
  .regex(
    /^([a-z_]+(:[^|]+)?)(\|[a-z_]+(:[^|]+)?)*$/i,
    "Use pipe-separated rules, e.g. 'required|string|max:64'",
  );

export const variableInputSchema = z.object({
  name: trimmed.min(1).max(80),
  description: trimmed.max(500).optional().nullable(),
  envVariable: trimmed
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use SCREAMING_SNAKE_CASE letters/digits/underscores"),
  defaultValue: trimmed.max(2000).optional().nullable(),
  userViewable: z.boolean().default(true),
  userEditable: z.boolean().default(true),
  rules: variableRulesSchema.default("required|string|max:255"),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const nestInputSchema = z.object({
  name: trimmed.min(1).max(120),
  description: trimmed.max(2000).optional().nullable(),
  author: trimmed.email("Author must be a valid email"),
});

export const eggInputSchema = z.object({
  nestId: idSchema,
  name: trimmed.min(1).max(120),
  description: trimmed.max(2000).optional().nullable(),
  category: trimmed.max(80).optional().nullable(),
  author: trimmed.email("Author must be a valid email"),
  version: trimmed
    .min(1)
    .max(40)
    .regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "Use semver, e.g. 1.0.0"),

  dockerImages: dockerImagesSchema,
  defaultDockerImage: trimmed.min(1),

  startup: trimmed.min(1, "Startup command is required").max(4000),
  stopCommand: trimmed.max(255).optional().nullable(),

  customFlags: z.array(trimmed.min(1).max(120)).max(64).default([]),

  configFiles: z.record(z.unknown()).default({}),
  configStartup: z.record(z.unknown()).default({}),
  configLogs: z.record(z.unknown()).default({}),

  scriptInstall: trimmed.max(64_000).optional().nullable(),
  scriptEntry: trimmed.min(1).max(80).default("ash"),
  scriptContainer: trimmed.min(1).max(255).default("alpine:3.19"),
  scriptIsPrivileged: z.boolean().default(false),

  features: z.array(trimmed.min(1).max(60)).max(32).default([]),
  fileDenylist: z.array(trimmed.min(1).max(255)).max(64).default([]),
  forceOutgoingIp: z.boolean().default(false),

  variables: z.array(variableInputSchema).max(128).default([]),
});

export const eggUpdateSchema = eggInputSchema.partial().extend({
  variables: z.array(variableInputSchema).max(128).optional(),
});

export const eggImportSchema = eggInputSchema.extend({
  // Allow inline nest creation when nestId is omitted but nestName is provided.
  nestId: idSchema.optional(),
  nestName: trimmed.max(120).optional(),
});

export const eggImportFormatSchema = z.enum(["json", "yaml"]);
export const eggExportFormatSchema = eggImportFormatSchema;

export type NestInput = z.infer<typeof nestInputSchema>;
export type EggInput = z.infer<typeof eggInputSchema>;
export type EggUpdateInput = z.infer<typeof eggUpdateSchema>;
export type EggImportInput = z.infer<typeof eggImportSchema>;
export type EggVariableInput = z.infer<typeof variableInputSchema>;
