import { logger } from "@/core/logger";
import type { NotifyMessage, Notifier, TelegramConfig } from "./types";

const SEVERITY_PREFIX: Record<NotifyMessage["severity"], string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "❌",
  critical: "🚨",
};

function escapeHtml(input: string): string {
  return input.replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );
}

function buildText(msg: NotifyMessage): string {
  const prefix = SEVERITY_PREFIX[msg.severity];
  const safeTitle = escapeHtml(msg.title);
  const safeBody = escapeHtml(msg.body);
  return `${prefix} <b>${safeTitle}</b>\n${safeBody}`;
}

export const telegramNotifier: Notifier<"telegram"> = {
  kind: "telegram",
  async send(config: TelegramConfig, message: NotifyMessage): Promise<void> {
    if (!config.botToken || !config.chatId) {
      throw new Error("telegram channel is missing botToken or chatId");
    }
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: buildText(message),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`telegram api ${res.status}: ${body.slice(0, 500)}`);
    }
    logger.debug({ chatId: config.chatId, severity: message.severity }, "telegram message sent");
  },
};
