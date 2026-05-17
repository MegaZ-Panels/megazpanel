import { z } from "zod";

export const auditListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().trim().min(1).max(120).optional(),
  actorId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export type AuditEvent = {
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  targetKind?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};
