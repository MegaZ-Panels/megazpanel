import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "../db";
import { config } from "../config";
import { errors } from "../errors";
import type { Role, Session, User } from "@prisma/client";

export type AuthenticatedUser = User & { roles: Role[] };

export type SessionContext = {
  session: Session;
  user: AuthenticatedUser;
};

declare module "fastify" {
  interface FastifyRequest {
    auth?: SessionContext;
  }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function loadSessionFromCookie(
  request: FastifyRequest,
): Promise<SessionContext | null> {
  const raw = request.cookies?.[config.session.cookieName];
  if (!raw) return null;

  const tokenHash = hashSessionToken(raw);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: { roles: true } } },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const user: AuthenticatedUser = {
    ...session.user,
    roles: session.user.roles.map((r) => r.role),
  };
  return { session, user };
}

export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const ctx = request.auth ?? (await loadSessionFromCookie(request));
  if (!ctx) throw errors.unauthorized();
  request.auth = ctx;
}

export function requireCsrf(request: FastifyRequest): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const ctx = request.auth;
  if (!ctx) throw errors.unauthorized();

  const cookieToken = request.cookies?.[config.session.csrfCookieName];
  const headerToken = request.headers["x-csrf-token"];
  const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken;

  if (!cookieToken || !headerValue) throw errors.forbidden("Missing CSRF token");
  if (cookieToken !== headerValue) throw errors.forbidden("CSRF token mismatch");

  // Additionally bind CSRF token to session secret using constant-time compare.
  const expected = createHash("sha256")
    .update(`${ctx.session.csrfSecret}:${ctx.session.id}`)
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(cookieToken, "hex");
  } catch {
    throw errors.forbidden("Invalid CSRF token");
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw errors.forbidden("Invalid CSRF token");
  }
}
