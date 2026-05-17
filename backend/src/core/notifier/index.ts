import { logger } from "@/core/logger";
import type { NotifyMessage, Notifier, NotifierKind, WebhookConfig, EmailConfig } from "./types";
import { telegramNotifier } from "./telegram";
import { sendMail } from "../mailer";
import { hmacHex } from "../crypto";

export const webhookNotifier: Notifier<"webhook"> = {
  kind: "webhook",
  async send(config: WebhookConfig, message: NotifyMessage): Promise<void> {
    if (!config.url) throw new Error("webhook channel is missing url");
    const body = JSON.stringify({
      title: message.title,
      body: message.body,
      severity: message.severity,
      ts: new Date().toISOString(),
    });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.secret) {
      headers["X-MegaZPanel-Signature"] = hmacHex(body, config.secret);
    }
    const res = await fetch(config.url, { method: "POST", headers, body });
    if (!res.ok) {
      throw new Error(`webhook ${res.status}`);
    }
  },
};

export const emailNotifier: Notifier<"email"> = {
  kind: "email",
  async send(config: EmailConfig, message: NotifyMessage): Promise<void> {
    if (!config.to) throw new Error("email channel is missing 'to'");
    await sendMail({
      to: config.to,
      subject: `[${message.severity.toUpperCase()}] ${message.title}`,
      text: message.body,
    });
  },
};

const NOTIFIERS: Record<NotifierKind, Notifier> = {
  telegram: telegramNotifier as Notifier,
  webhook: webhookNotifier as Notifier,
  email: emailNotifier as Notifier,
};

export async function dispatchNotification(
  kind: NotifierKind,
  config: unknown,
  message: NotifyMessage,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const notifier = NOTIFIERS[kind];
  if (!notifier) return { ok: false, error: `Unknown notifier: ${kind}` };
  try {
    await notifier.send(config as never, message);
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ kind, error }, "notifier failed");
    return { ok: false, error };
  }
}

export type { NotifyMessage, NotifierKind } from "./types";
