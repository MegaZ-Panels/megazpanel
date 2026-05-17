import type { FastifyInstance } from "fastify";
import { requireAuth } from "@/core/http/session";
import { requireAdmin } from "@/core/http/rbac";
import { auditService } from "./service";
import { auditListQuerySchema } from "./schemas";

export async function auditModule(app: FastifyInstance): Promise<void> {
  app.route({
    method: "GET",
    url: "/api/admin/audit",
    preHandler: [requireAuth, requireAdmin],
    handler: async (req) => {
      const query = auditListQuerySchema.parse(req.query);
      return auditService.list(query);
    },
  });
}
