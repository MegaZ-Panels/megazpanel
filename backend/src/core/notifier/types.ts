export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export type WebhookConfig = {
  url: string;
  secret?: string;
};

export type EmailConfig = {
  to: string;
};

export type NotifierKind = "telegram" | "webhook" | "email";

export type NotifierConfigByKind = {
  telegram: TelegramConfig;
  webhook: WebhookConfig;
  email: EmailConfig;
};

export type NotifyMessage = {
  title: string;
  body: string;
  severity: "info" | "warning" | "error" | "critical";
};

export interface Notifier<K extends NotifierKind = NotifierKind> {
  readonly kind: K;
  send(config: NotifierConfigByKind[K], message: NotifyMessage): Promise<void>;
}
