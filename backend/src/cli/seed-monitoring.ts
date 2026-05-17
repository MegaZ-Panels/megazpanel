/**
 * Bootstrap or update the primary Telegram alerting channel.
 *
 * Required env:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *
 * Optional env:
 *   CHANNEL_NAME (default: "primary-telegram")
 */
import { encryptSecret } from "@/core/crypto";
import { prisma } from "@/core/db";
import { logger } from "@/core/logger";

async function main(): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const name = process.env.CHANNEL_NAME ?? "primary-telegram";

  if (!botToken || !chatId) {
    logger.error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
    process.exit(1);
  }

  const config = encryptSecret(JSON.stringify({ botToken, chatId }));

  const channel = await prisma.notificationChannel.upsert({
    where: { name },
    update: { kind: "telegram", enabled: true, config },
    create: { name, kind: "telegram", enabled: true, config },
  });

  logger.info({ id: channel.id, name: channel.name }, "telegram channel ready");
  await prisma.$disconnect();
}

void main().catch(async (err) => {
  logger.error({ err }, "seed-monitoring failed");
  await prisma.$disconnect();
  process.exit(1);
});
