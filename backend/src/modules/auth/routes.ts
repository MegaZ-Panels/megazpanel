import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authService } from "./service";
import {
  forgotPasswordInputSchema,
  loginInputSchema,
  registerInputSchema,
  resendVerificationInputSchema,
  resetPasswordInputSchema,
  verifyEmailInputSchema,
} from "./schemas";
import {
  clearCsrfCookie,
  clearSessionCookie,
  setCsrfCookie,
  setSessionCookie,
} from "@/core/http/csrf";
import { loadSessionFromCookie, requireAuth } from "@/core/http/session";
import { errors } from "@/core/errors";

function ctxFrom(req: FastifyRequest) {
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers["user-agent"] ?? null) as string | null,
  };
}

function applySessionCookies(reply: FastifyReply, created: Awaited<ReturnType<typeof authService.login>>) {
  setSessionCookie(reply, created.rawToken, created.session.expiresAt);
  setCsrfCookie(reply, created.session.csrfSecret, created.session.id, created.session.expiresAt);
}

export async function authModule(app: FastifyInstance): Promise<void> {
  // Tighter rate limit on auth-sensitive routes.
  const tightLimit = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };
  const passwordLimit = { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } };

  app.route({
    method: "POST",
    url: "/api/auth/register",
    ...tightLimit,
    handler: async (req, reply) => {
      const input = registerInputSchema.parse(req.body);
      const created = await authService.register(input, ctxFrom(req));
      applySessionCookies(reply, created);
      reply.status(201);
      return { user: created.user };
    },
  });

  app.route({
    method: "POST",
    url: "/api/auth/login",
    ...tightLimit,
    handler: async (req, reply) => {
      const input = loginInputSchema.parse(req.body);
      const created = await authService.login(input, ctxFrom(req));
      applySessionCookies(reply, created);
      return { user: created.user };
    },
  });

  app.route({
    method: "POST",
    url: "/api/auth/logout",
    preHandler: [requireAuth],
    handler: async (req, reply) => {
      const ctx = req.auth!;
      await authService.logout(ctx.session.id, { id: ctx.user.id, email: ctx.user.email }, ctxFrom(req));
      clearSessionCookie(reply);
      clearCsrfCookie(reply);
      reply.status(204);
      return null;
    },
  });

  app.route({
    method: "POST",
    url: "/api/auth/refresh",
    ...tightLimit,
    handler: async (req, reply) => {
      const ctx = await loadSessionFromCookie(req);
      if (!ctx) {
        clearSessionCookie(reply);
        clearCsrfCookie(reply);
        throw errors.unauthorized("No active session");
      }
      const rotated = await authService.refresh(ctx.session, ctxFrom(req));
      applySessionCookies(reply, rotated);
      return { user: rotated.user };
    },
  });

  app.route({
    method: "GET",
    url: "/api/auth/me",
    preHandler: [requireAuth],
    handler: async (req) => {
      const ctx = req.auth!;
      const user = await authService.me(ctx.user.id);
      return { user };
    },
  });

  app.route({
    method: "POST",
    url: "/api/auth/forgot-password",
    ...passwordLimit,
    handler: async (req, reply) => {
      const input = forgotPasswordInputSchema.parse(req.body);
      await authService.forgotPassword(input, ctxFrom(req));
      reply.status(204);
      return null;
    },
  });

  app.route({
    method: "POST",
    url: "/api/auth/reset-password",
    ...passwordLimit,
    handler: async (req, reply) => {
      const input = resetPasswordInputSchema.parse(req.body);
      await authService.resetPassword(input, ctxFrom(req));
      clearSessionCookie(reply);
      clearCsrfCookie(reply);
      reply.status(204);
      return null;
    },
  });

  app.route({
    method: "POST",
    url: "/api/auth/verify-email",
    ...tightLimit,
    handler: async (req, reply) => {
      const input = verifyEmailInputSchema.parse(req.body);
      await authService.verifyEmail(input);
      reply.status(204);
      return null;
    },
  });

  app.route({
    method: "POST",
    url: "/api/auth/resend-verification",
    ...passwordLimit,
    handler: async (req, reply) => {
      const input = resendVerificationInputSchema.parse(req.body);
      await authService.resendVerification(input.email);
      reply.status(204);
      return null;
    },
  });
}
