import { Prisma } from "@prisma/client";
import { prisma } from "@/core/db";
import { decryptSecret, encryptSecret } from "@/core/crypto";
import { errors } from "@/core/errors";
import { dispatchNotification, type NotifyMessage } from "@/core/notifier";
import { logger } from "@/core/logger";
import { checkRunners, type CheckResult } from "./checks";
import {
  channelCreateSchema,
  channelUpdateSchema,
  checkConfigByKindMap,
  checkCreateSchema,
  checkUpdateSchema,
  type AlertListQuery,
  type ChannelCreateInput,
  type ChannelUpdateInput,
  type CheckCreateInput,
  type CheckUpdateInput,
} from "./schemas";

type Actor = { id: string; email: string };

function safeChannelDto(channel: { id: string; name: string; kind: string; enabled: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
    enabled: channel.enabled,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
  };
}

export const channelService = {
  list: async () => {
    const items = await prisma.notificationChannel.findMany({ orderBy: { name: "asc" } });
    return items.map(safeChannelDto);
  },

  create: async (input: ChannelCreateInput, _actor: Actor) => {
    const parsed = channelCreateSchema.parse(input);
    const created = await prisma.notificationChannel.create({
      data: {
        name: parsed.name,
        kind: parsed.kind,
        enabled: parsed.enabled,
        config: encryptSecret(JSON.stringify(parsed.config)),
      },
    });
    return safeChannelDto(created);
  },

  update: async (id: string, input: ChannelUpdateInput) => {
    const existing = await prisma.notificationChannel.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Notification channel not found");
    const parsed = channelUpdateSchema.parse(input);
    const data: Prisma.NotificationChannelUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.enabled !== undefined) data.enabled = parsed.enabled;
    if (parsed.config !== undefined) data.config = encryptSecret(JSON.stringify(parsed.config));
    const updated = await prisma.notificationChannel.update({ where: { id }, data });
    return safeChannelDto(updated);
  },

  remove: async (id: string) => {
    const existing = await prisma.notificationChannel.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Notification channel not found");
    await prisma.notificationChannel.delete({ where: { id } });
  },

  test: async (id: string) => {
    const channel = await prisma.notificationChannel.findUnique({ where: { id } });
    if (!channel) throw errors.notFound("Notification channel not found");
    const config = JSON.parse(decryptSecret(channel.config));
    const result = await dispatchNotification(channel.kind, config, {
      title: "MegaZPanel test message",
      body: `Channel "${channel.name}" responded successfully at ${new Date().toISOString()}.`,
      severity: "info",
    });
    return result;
  },
};

export const checkService = {
  list: () =>
    prisma.monitoringCheck.findMany({
      orderBy: { name: "asc" },
    }),

  get: async (id: string) => {
    const check = await prisma.monitoringCheck.findUnique({ where: { id } });
    if (!check) throw errors.notFound("Monitoring check not found");
    return check;
  },

  create: async (input: CheckCreateInput) => {
    const parsed = checkCreateSchema.parse(input);
    return prisma.monitoringCheck.create({
      data: {
        name: parsed.name,
        description: parsed.description ?? null,
        enabled: parsed.enabled,
        kind: parsed.kind,
        config: parsed.config as Prisma.InputJsonValue,
        intervalSeconds: parsed.intervalSeconds,
        failureThreshold: parsed.failureThreshold,
        severity: parsed.severity,
        channelIds: parsed.channelIds,
      },
    });
  },

  update: async (id: string, input: CheckUpdateInput) => {
    const existing = await prisma.monitoringCheck.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Monitoring check not found");
    const parsed = checkUpdateSchema.parse(input);

    if (parsed.config !== undefined) {
      const schema = checkConfigByKindMap[existing.kind];
      const validated = schema.safeParse(parsed.config);
      if (!validated.success) {
        const fields: Record<string, string[]> = {};
        for (const issue of validated.error.issues) {
          const key = ["config", ...issue.path].join(".");
          (fields[key] ??= []).push(issue.message);
        }
        throw errors.validation("Invalid check config", fields);
      }
    }

    return prisma.monitoringCheck.update({
      where: { id },
      data: {
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description ?? null } : {}),
        ...(parsed.enabled !== undefined ? { enabled: parsed.enabled } : {}),
        ...(parsed.intervalSeconds !== undefined ? { intervalSeconds: parsed.intervalSeconds } : {}),
        ...(parsed.failureThreshold !== undefined ? { failureThreshold: parsed.failureThreshold } : {}),
        ...(parsed.severity !== undefined ? { severity: parsed.severity } : {}),
        ...(parsed.channelIds !== undefined ? { channelIds: parsed.channelIds } : {}),
        ...(parsed.config !== undefined
          ? { config: parsed.config as Prisma.InputJsonValue }
          : {}),
      },
    });
  },

  remove: async (id: string) => {
    const existing = await prisma.monitoringCheck.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Monitoring check not found");
    await prisma.monitoringCheck.delete({ where: { id } });
  },

  runOnce: async (id: string): Promise<CheckResult> => {
    const check = await prisma.monitoringCheck.findUnique({ where: { id } });
    if (!check) throw errors.notFound("Monitoring check not found");
    const runner = checkRunners[check.kind];
    if (!runner) throw errors.internal(`Unknown check kind: ${check.kind}`);
    const result = await runner(check.config as Record<string, unknown>);
    return result;
  },
};

export const alertService = {
  list: async (query: AlertListQuery) => {
    const items = await prisma.monitoringAlert.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.checkId ? { checkId: query.checkId } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      include: { check: { select: { name: true, kind: true } } },
    });
    const hasMore = items.length > query.limit;
    const trimmed = hasMore ? items.slice(0, query.limit) : items;
    return {
      items: trimmed,
      nextCursor: hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null,
    };
  },
};

// ── Tick: run all due enabled checks once and process state transitions ─────

export async function runMonitoringTick(): Promise<{ ran: number; fired: number; resolved: number }> {
  const now = new Date();
  const checks = await prisma.monitoringCheck.findMany({ where: { enabled: true } });

  let ran = 0;
  let fired = 0;
  let resolved = 0;

  for (const check of checks) {
    const due =
      !check.lastRunAt ||
      now.getTime() - check.lastRunAt.getTime() >= check.intervalSeconds * 1_000;
    if (!due) continue;
    ran++;

    const runner = checkRunners[check.kind];
    if (!runner) {
      logger.warn({ kind: check.kind }, "no runner for check kind");
      continue;
    }

    let result: CheckResult;
    try {
      result = await runner(check.config as Record<string, unknown>);
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : String(err) };
    }

    const isOk = result.ok;
    const next = await prisma.monitoringCheck.update({
      where: { id: check.id },
      data: {
        lastRunAt: now,
        lastStatus: isOk ? "ok" : "fail",
        lastMessage: result.message,
        consecutiveFails: isOk ? 0 : check.consecutiveFails + 1,
        consecutiveOks: isOk ? check.consecutiveOks + 1 : 0,
      },
    });

    if (!isOk && next.consecutiveFails === check.failureThreshold) {
      // Crossed the threshold: open a firing alert.
      const alert = await prisma.monitoringAlert.create({
        data: {
          checkId: check.id,
          status: "firing",
          severity: check.severity,
          message: result.message,
          meta: { kind: check.kind, configName: check.name } as Prisma.InputJsonValue,
        },
      });
      fired++;
      await dispatchAlert(check, alert.id, "firing", result.message);
    } else if (isOk && check.consecutiveFails >= check.failureThreshold) {
      // Was firing, just recovered.
      const open = await prisma.monitoringAlert.findFirst({
        where: { checkId: check.id, status: "firing" },
        orderBy: { startedAt: "desc" },
      });
      if (open) {
        await prisma.monitoringAlert.update({
          where: { id: open.id },
          data: { status: "resolved", resolvedAt: now },
        });
        resolved++;
        await dispatchAlert(check, open.id, "resolved", result.message);
      }
    }
  }

  return { ran, fired, resolved };
}

async function dispatchAlert(
  check: { id: string; name: string; kind: string; severity: NotifyMessage["severity"]; channelIds: string[] },
  alertId: string,
  phase: "firing" | "resolved",
  message: string,
): Promise<void> {
  if (check.channelIds.length === 0) return;

  const channels = await prisma.notificationChannel.findMany({
    where: { id: { in: check.channelIds }, enabled: true },
  });

  const title = phase === "firing"
    ? `[FIRING] ${check.name}`
    : `[RESOLVED] ${check.name}`;
  const body = `${message}\n\nCheck: ${check.name} (${check.kind})\nAlert: ${alertId}`;

  await Promise.all(
    channels.map(async (ch) => {
      try {
        const config = JSON.parse(decryptSecret(ch.config));
        const res = await dispatchNotification(ch.kind, config, {
          title,
          body,
          severity: phase === "resolved" ? "info" : check.severity,
        });
        if (!res.ok) {
          logger.warn({ channelId: ch.id, error: res.error }, "alert delivery failed");
        }
      } catch (err) {
        logger.error({ err, channelId: ch.id }, "alert dispatch errored");
      }
    }),
  );
}
