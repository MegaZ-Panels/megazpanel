import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config";
import { logger } from "./logger";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: Transporter | null = null;

function buildTransporter(): Transporter {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secureEnv = process.env.SMTP_SECURE;

  if (!host || !port) {
    // Dev fallback: log emails to stdout via pino instead of sending.
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: secureEnv === "true" || port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
}

export async function sendMail(message: MailMessage): Promise<void> {
  transporter ??= buildTransporter();

  const from = process.env.MAIL_FROM ?? "MegaZPanel <no-reply@localhost>";

  const result = await transporter.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if ((transporter.options as { jsonTransport?: boolean }).jsonTransport) {
    logger.info(
      { to: message.to, subject: message.subject, body: message.text },
      "[dev] outgoing email (no SMTP configured)",
    );
    return;
  }

  logger.debug({ messageId: result.messageId, to: message.to }, "email sent");
}

export function buildVerificationLink(token: string): string {
  return `${config.webOrigin.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetLink(token: string): string {
  return `${config.webOrigin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}
