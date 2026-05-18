import { z } from "zod";
import { ServerInstallStatus } from "@prisma/client";

const trimmed = z.string().trim();

export const idSchema = trimmed.uuid("Invalid id");
export const identifierSchema = trimmed.regex(
  /^[a-z0-9]{8}$/,
  "Invalid server identifier",
);

const positiveInt = z.coerce.number().int().min(1);
const nonNegativeInt = z.coerce.number().int().min(0);

const variablesMap = z.record(trimmed, z.string().max(2048)).default({});
const envMap = z.record(trimmed, z.string().max(2048)).default({});

export const serverListQuerySchema = z.object({
  search: trimmed.min(1).max(120).optional(),
  nodeId: idSchema.optional(),
  ownerId: idSchema.optional(),
  installStatus: z.nativeEnum(ServerInstallStatus).optional(),
  suspended: z.enum(["true", "false"]).optional(),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const serverMineQuerySchema = z.object({
  search: trimmed.min(1).max(120).optional(),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export const serverCreateSchema = z.object({
  name: trimmed.min(1).max(100),
  description: trimmed.max(500).optional().nullable(),
  ownerId: idSchema,
  nodeId: idSchema,
  eggId: idSchema,
  allocationId: idSchema,
  image: trimmed.min(1).max(255).optional(),
  startupOverride: trimmed.max(2048).optional().nullable(),
  environment: envMap,
  memoryMb: positiveInt,
  swapMb: nonNegativeInt.default(0),
  diskMb: positiveInt,
  ioWeight: z.coerce.number().int().min(10).max(1000).default(500),
  cpuLimit: nonNegativeInt.max(10_000).default(0),
  threads: trimmed.max(64).optional().nullable(),
  backupLimit: nonNegativeInt.max(1000).default(2),
  databaseLimit: nonNegativeInt.max(1000).default(0),
  allocationLimit: nonNegativeInt.max(1000).default(1),
  variables: variablesMap,
  skipScripts: z.boolean().default(false),
});

export const serverUpdateSchema = z.object({
  name: trimmed.min(1).max(100).optional(),
  description: trimmed.max(500).optional().nullable(),
  ownerId: idSchema.optional(),
  image: trimmed.min(1).max(255).optional(),
  startupOverride: trimmed.max(2048).optional().nullable(),
  environment: envMap.optional(),
  memoryMb: positiveInt.optional(),
  swapMb: nonNegativeInt.optional(),
  diskMb: positiveInt.optional(),
  ioWeight: z.coerce.number().int().min(10).max(1000).optional(),
  cpuLimit: nonNegativeInt.max(10_000).optional(),
  threads: trimmed.max(64).optional().nullable(),
  backupLimit: nonNegativeInt.max(1000).optional(),
  databaseLimit: nonNegativeInt.max(1000).optional(),
  allocationLimit: nonNegativeInt.max(1000).optional(),
  variables: variablesMap.optional(),
});

export const serverSuspendSchema = z.object({
  suspended: z.boolean(),
});

export type ServerListQuery = z.infer<typeof serverListQuerySchema>;
export type ServerMineQuery = z.infer<typeof serverMineQuerySchema>;
export type ServerCreateInput = z.infer<typeof serverCreateSchema>;
export type ServerUpdateInput = z.infer<typeof serverUpdateSchema>;
export type ServerSuspendInput = z.infer<typeof serverSuspendSchema>;
