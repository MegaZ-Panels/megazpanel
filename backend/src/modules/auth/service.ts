import { Prisma, type Role, type Session, type User, type VerificationPurpose } from "@prisma/client";
import { prisma } from "@/core/db";
import { errors } from "@/core/errors";
import {
  generateRandomToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from "@/core/crypto";
import { generateCsrfSecret } from "@/core/http/csrf";
import { config } from "@/core/config";
import {
  buildPasswordResetLink,
  buildVerificationLink,
  sendMail,
} from "@/core/mailer";
import { auditService } from "../audit/service";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "./schemas";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

type RequestContext = {
  ip: string | null;
  userAgent: string | null;
};

export type AuthUserDTO = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  roles: Role[];
  createdAt: string;
};

export type CreatedSession = {
  rawToken: string;
  session: Session;
  user: AuthUserDTO;
};

function toUserDto(user: User & { roles: { role: Role }[] }): AuthUserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    roles: user.roles.map((r) => r.role),
    createdAt: user.createdAt.toISOString(),
  };
}

async function loadUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { roles: true },
  });
}

async function loadUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: { roles: true },
  });
}

async function createSession(
  userId: string,
  rememberMe: boolean,
  ctx: RequestContext,
): Promise<CreatedSession> {
  const rawToken = generateRandomToken(32);
  const tokenHash = sha256Hex(rawToken);
  const lifetimeMs = rememberMe ? config.session.rememberMeMs : config.session.lifetimeMs;
  const expiresAt = new Date(Date.now() + lifetimeMs);
  const csrfSecret = generateCsrfSecret();

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      csrfSecret,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      expiresAt,
    },
  });

  const user = await loadUserById(userId);
  if (!user) throw errors.internal("Failed to load user after session create");
  return { rawToken, session, user: toUserDto(user) };
}

async function issueVerificationToken(
  userId: string,
  purpose: VerificationPurpose,
  ttlMs: number,
): Promise<string> {
  const raw = generateRandomToken(32);
  await prisma.verificationToken.create({
    data: {
      userId,
      purpose,
      tokenHash: sha256Hex(raw),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return raw;
}

async function consumeVerificationToken(rawToken: string, purpose: VerificationPurpose) {
  const tokenHash = sha256Hex(rawToken);
  const token = await prisma.verificationToken.findUnique({ where: { tokenHash } });
  if (!token) throw errors.badRequest("Invalid or expired token");
  if (token.purpose !== purpose) throw errors.badRequest("Invalid token type");
  if (token.usedAt) throw errors.badRequest("Token already used");
  if (token.expiresAt.getTime() <= Date.now()) {
    throw errors.badRequest("Token has expired");
  }
  await prisma.verificationToken.update({
    where: { id: token.id },
    data: { usedAt: new Date() },
  });
  return token;
}

export const authService = {
  async register(input: RegisterInput, ctx: RequestContext): Promise<CreatedSession> {
    const passwordHash = await hashPassword(input.password);

    let user: User;
    try {
      user = await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          status: "active",
          roles: { create: [{ role: "viewer" }] },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw errors.conflict("An account with this email already exists", {
          email: ["already in use"],
        });
      }
      throw err;
    }

    const verifyToken = await issueVerificationToken(
      user.id,
      "email_verification",
      VERIFICATION_TTL_MS,
    );

    void sendMail({
      to: user.email,
      subject: "Verify your MegaZPanel email",
      text: `Welcome to MegaZPanel.\n\nConfirm your email by visiting:\n${buildVerificationLink(verifyToken)}\n\nThis link expires in 24 hours.`,
    }).catch(() => {
      /* logged inside mailer */
    });

    await auditService.record({
      action: "auth.register",
      actorId: user.id,
      actorEmail: user.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return createSession(user.id, false, ctx);
  },

  async login(input: LoginInput, ctx: RequestContext): Promise<CreatedSession> {
    const user = await loadUserByEmail(input.email);
    if (!user) {
      // Constant-time-ish: compute a hash anyway to avoid user-enumeration timing.
      await hashPassword(input.password).catch(() => null);
      throw errors.unauthorized("Invalid email or password");
    }
    if (user.status !== "active") {
      throw errors.forbidden("Account is not active");
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw errors.unauthorized("Invalid email or password");

    await auditService.record({
      action: "auth.login",
      actorId: user.id,
      actorEmail: user.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return createSession(user.id, input.rememberMe, ctx);
  },

  async logout(sessionId: string, actor: { id: string; email: string }, ctx: RequestContext): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await auditService.record({
      action: "auth.logout",
      actorId: actor.id,
      actorEmail: actor.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  async refresh(
    currentSession: Session,
    ctx: RequestContext,
  ): Promise<CreatedSession> {
    if (currentSession.revokedAt) throw errors.unauthorized("Session revoked");
    if (currentSession.expiresAt.getTime() <= Date.now()) {
      throw errors.unauthorized("Session expired");
    }
    // Rotate: revoke current + issue new with same lifetime class.
    await prisma.session.update({
      where: { id: currentSession.id },
      data: { revokedAt: new Date() },
    });
    const remember =
      currentSession.expiresAt.getTime() - currentSession.createdAt.getTime() >
      config.session.lifetimeMs;
    return createSession(currentSession.userId, remember, ctx);
  },

  async me(userId: string): Promise<AuthUserDTO> {
    const user = await loadUserById(userId);
    if (!user) throw errors.notFound("User not found");
    return toUserDto(user);
  },

  async forgotPassword(input: ForgotPasswordInput, ctx: RequestContext): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.status !== "active") {
      // Do not leak existence; respond success either way.
      return;
    }
    const raw = await issueVerificationToken(user.id, "password_reset", PASSWORD_RESET_TTL_MS);
    void sendMail({
      to: user.email,
      subject: "Reset your MegaZPanel password",
      text: `A password reset was requested for your account.\n\nReset it here:\n${buildPasswordResetLink(raw)}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    }).catch(() => {
      /* logged inside mailer */
    });
    await auditService.record({
      action: "auth.password_reset_requested",
      actorId: user.id,
      actorEmail: user.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  async resetPassword(input: ResetPasswordInput, ctx: RequestContext): Promise<void> {
    const token = await consumeVerificationToken(input.token, "password_reset");
    const passwordHash = await hashPassword(input.password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      // Revoke all live sessions for this user — force re-login.
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    const user = await loadUserById(token.userId);
    await auditService.record({
      action: "auth.password_reset_completed",
      actorId: token.userId,
      actorEmail: user?.email ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  async verifyEmail(input: VerifyEmailInput): Promise<void> {
    const token = await consumeVerificationToken(input.token, "email_verification");
    await prisma.user.update({
      where: { id: token.userId },
      data: { emailVerified: true },
    });
    const user = await loadUserById(token.userId);
    await auditService.record({
      action: "auth.email_verified",
      actorId: token.userId,
      actorEmail: user?.email ?? null,
    });
  },

  async resendVerification(email: string): Promise<void> {
    const user = await loadUserByEmail(email);
    if (!user || user.emailVerified) return;
    const raw = await issueVerificationToken(user.id, "email_verification", VERIFICATION_TTL_MS);
    void sendMail({
      to: user.email,
      subject: "Verify your MegaZPanel email",
      text: `Confirm your email by visiting:\n${buildVerificationLink(raw)}\n\nThis link expires in 24 hours.`,
    }).catch(() => {
      /* logged inside mailer */
    });
  },
};
