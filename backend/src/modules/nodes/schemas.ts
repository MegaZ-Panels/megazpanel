import { z } from "zod";

const trimmed = z.string().trim();

export const idSchema = trimmed.uuid("Invalid id");

const fqdnSchema = trimmed
  .min(1)
  .max(253)
  .regex(
    /^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/,
    "Invalid FQDN",
  );

const portSchema = z.coerce.number().int().min(1).max(65535);

const positiveInt = z.coerce.number().int().min(1);
const nonNegativeInt = z.coerce.number().int().min(0);

export const nodeListQuerySchema = z.object({
  search: trimmed.min(1).max(120).optional(),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const nodeCreateSchema = z.object({
  name: trimmed.min(1).max(80),
  description: trimmed.max(500).optional().nullable(),
  fqdn: fqdnSchema,
  scheme: z.enum(["http", "https"]).default("https"),
  port: portSchema.default(8443),
  publicAddress: trimmed.max(255).optional().nullable(),
  location: trimmed.max(80).optional().nullable(),
  maxMemoryMb: positiveInt,
  maxDiskMb: positiveInt,
  memoryOverallocate: nonNegativeInt.max(1000).default(0),
  diskOverallocate: nonNegativeInt.max(1000).default(0),
  maintenance: z.boolean().default(false),
  public: z.boolean().default(true),
});

export const nodeUpdateSchema = nodeCreateSchema.partial();

export type NodeListQuery = z.infer<typeof nodeListQuerySchema>;
export type NodeCreateInput = z.infer<typeof nodeCreateSchema>;
export type NodeUpdateInput = z.infer<typeof nodeUpdateSchema>;
