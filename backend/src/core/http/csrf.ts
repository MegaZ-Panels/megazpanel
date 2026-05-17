import type { FastifyReply } from "fastify";
import { config } from "../config";
import { hmacHex, sha256Hex } from "../crypto";

export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  path?: string;
  domain?: string;
  maxAge?: number; // seconds
  expires?: Date;
};

const baseCookieOptions = (): CookieOptions => ({
  path: "/",
  secure: config.session.cookieSecure,
  sameSite: "lax",
  domain: config.session.cookieDomain,
});

export function setSessionCookie(
  reply: FastifyReply,
  rawToken: string,
  expiresAt: Date,
): void {
  reply.setCookie(config.session.cookieName, rawToken, {
    ...baseCookieOptions(),
    httpOnly: true,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.session.cookieName, baseCookieOptions());
}

export function setCsrfCookie(
  reply: FastifyReply,
  csrfSecret: string,
  sessionId: string,
  expiresAt: Date,
): string {
  const value = computeCsrfToken(csrfSecret, sessionId);
  reply.setCookie(config.session.csrfCookieName, value, {
    ...baseCookieOptions(),
    httpOnly: false,
    expires: expiresAt,
  });
  return value;
}

export function clearCsrfCookie(reply: FastifyReply): void {
  reply.clearCookie(config.session.csrfCookieName, baseCookieOptions());
}

export function computeCsrfToken(csrfSecret: string, sessionId: string): string {
  // Derived deterministically from session secret + session id. Stored client-side as cookie
  // and echoed via X-CSRF-Token header on state-changing requests.
  return sha256Hex(`${csrfSecret}:${sessionId}`);
}

export function generateCsrfSecret(): string {
  return hmacHex(`csrf:${Date.now()}:${Math.random()}`);
}
