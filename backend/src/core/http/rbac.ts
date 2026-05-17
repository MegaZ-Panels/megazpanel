import type { FastifyRequest } from "fastify";
import type { Role } from "@prisma/client";
import { errors } from "../errors";

export function hasAnyRole(roles: Role[], required: Role[]): boolean {
  return required.some((r) => roles.includes(r));
}

export function requireRoles(...required: Role[]): (request: FastifyRequest) => void {
  return (request) => {
    const ctx = request.auth;
    if (!ctx) throw errors.unauthorized();
    if (!hasAnyRole(ctx.user.roles, required)) throw errors.forbidden();
  };
}

export const requireAdmin = requireRoles("owner", "admin");
