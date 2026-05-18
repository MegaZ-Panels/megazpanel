import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { config } from "@/core/config";
import { logger } from "@/core/logger";
import { errorHandler } from "@/core/http/error-handler";
import { disconnectPrisma } from "@/core/db";
import { authModule } from "@/modules/auth";
import { usersModule } from "@/modules/users";
import { eggsModule } from "@/modules/eggs";
import { nodesModule } from "@/modules/nodes";
import { allocationsModule } from "@/modules/allocations";
import { serversModule } from "@/modules/servers";
import { auditModule } from "@/modules/audit";
import { settingsModule } from "@/modules/settings";
import { adminNotificationsModule } from "@/modules/admin-notifications";
import { schedulesModule } from "@/modules/schedules";
import { backupsModule } from "@/modules/backups";
import { monitoringModule } from "@/modules/monitoring";
import { startSchedulerWorker, stopSchedulerWorker } from "@/workers/scheduler-worker";

async function buildServer() {
  const app = Fastify({
    logger,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
    disableRequestLogging: false,
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: config.webOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);
  await app.register(sensible);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1", "::1"],
  });

  // Accept text/yaml bodies for import endpoints.
  app.addContentTypeParser(
    ["application/yaml", "text/yaml", "text/plain"],
    { parseAs: "string" },
    (_req, body, done) => done(null, body),
  );

  app.setErrorHandler(errorHandler);

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));
  app.get("/ready", async () => ({ ok: true }));

  await app.register(authModule);
  await app.register(usersModule);
  await app.register(eggsModule);
  await app.register(nodesModule);
  await app.register(allocationsModule);
  await app.register(serversModule);
  await app.register(auditModule);
  await app.register(settingsModule);
  await app.register(adminNotificationsModule);
  await app.register(schedulesModule);
  await app.register(backupsModule);
  await app.register(monitoringModule);

  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    try {
      stopSchedulerWorker();
      await app.close();
      await disconnectPrisma();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: config.port, host: config.host });
    await startSchedulerWorker();
  } catch (err) {
    app.log.error({ err }, "failed to start");
    process.exit(1);
  }
}

void main();
