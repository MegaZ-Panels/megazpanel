import { z } from "zod";
import { isIP } from "node:net";

const trimmed = z.string().trim();

export const idSchema = trimmed.uuid("Invalid id");

const ipSchema = trimmed.refine((v) => isIP(v) !== 0, "Invalid IPv4 / IPv6 address");

const portSchema = z.coerce.number().int().min(1).max(65535);

export const allocationListQuerySchema = z.object({
  search: trimmed.min(1).max(120).optional(),
  assigned: z.enum(["true", "false"]).optional(),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const allocationCreateSchema = z.object({
  ip: ipSchema,
  alias: trimmed.max(120).optional().nullable(),
  port: portSchema,
  notes: trimmed.max(500).optional().nullable(),
});

// Bulk add via a port range. Inclusive on both sides.
// Caller picks a single IP; ports are expanded to (toPort - fromPort + 1) rows.
export const allocationBulkCreateSchema = z
  .object({
    ip: ipSchema,
    alias: trimmed.max(120).optional().nullable(),
    fromPort: portSchema,
    toPort: portSchema,
    notes: trimmed.max(500).optional().nullable(),
  })
  .refine((v) => v.toPort >= v.fromPort, {
    path: ["toPort"],
    message: "toPort must be >= fromPort",
  })
  .refine((v) => v.toPort - v.fromPort + 1 <= 1000, {
    path: ["toPort"],
    message: "Refusing to add more than 1000 allocations at once",
  });

export const allocationUpdateSchema = z.object({
  alias: trimmed.max(120).optional().nullable(),
  notes: trimmed.max(500).optional().nullable(),
});

export type AllocationListQuery = z.infer<typeof allocationListQuerySchema>;
export type AllocationCreateInput = z.infer<typeof allocationCreateSchema>;
export type AllocationBulkCreateInput = z.infer<typeof allocationBulkCreateSchema>;
export type AllocationUpdateInput = z.infer<typeof allocationUpdateSchema>;
