import { Prisma } from "@prisma/client";
import { prisma } from "@/core/db";
import { errors } from "@/core/errors";
import { isValidCron, nextRunFor } from "@/core/scheduler";
import type {
  ScheduledTaskCreate,
  ScheduledTaskListQuery,
  ScheduledTaskUpdate,
} from "./schemas";

export const scheduleService = {
  list: (query: ScheduledTaskListQuery) =>
    prisma.scheduledTask.findMany({
      where: {
        ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
      },
      orderBy: { name: "asc" },
    }),

  get: async (id: string) => {
    const task = await prisma.scheduledTask.findUnique({ where: { id } });
    if (!task) throw errors.notFound("Scheduled task not found");
    return task;
  },

  create: async (input: ScheduledTaskCreate) => {
    if (!isValidCron(input.cron, input.timezone)) {
      throw errors.validation("Invalid cron expression", { cron: ["not parseable"] });
    }
    return prisma.scheduledTask.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        kind: input.kind,
        enabled: input.enabled,
        cron: input.cron,
        timezone: input.timezone,
        payload: input.payload as Prisma.InputJsonValue,
        nextRunAt: nextRunFor(input.cron, input.timezone),
      },
    });
  },

  update: async (id: string, input: ScheduledTaskUpdate) => {
    const existing = await prisma.scheduledTask.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Scheduled task not found");

    const cron = input.cron ?? existing.cron;
    const timezone = input.timezone ?? existing.timezone;
    if (input.cron && !isValidCron(cron, timezone)) {
      throw errors.validation("Invalid cron expression", { cron: ["not parseable"] });
    }

    return prisma.scheduledTask.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.cron !== undefined ? { cron: input.cron } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.payload !== undefined
          ? { payload: input.payload as Prisma.InputJsonValue }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        nextRunAt: nextRunFor(cron, timezone),
      },
    });
  },

  remove: async (id: string) => {
    const existing = await prisma.scheduledTask.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Scheduled task not found");
    await prisma.scheduledTask.delete({ where: { id } });
  },

  recordRun: async (id: string, result: { ok: boolean; error?: string }) => {
    const task = await prisma.scheduledTask.findUnique({ where: { id } });
    if (!task) return;
    await prisma.scheduledTask.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        nextRunAt: nextRunFor(task.cron, task.timezone),
        lastError: result.ok ? null : result.error ?? null,
        failureCount: result.ok ? 0 : task.failureCount + 1,
        status: result.ok ? "active" : "failed",
      },
    });
  },
};
