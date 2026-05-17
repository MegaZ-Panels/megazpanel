import { Prisma } from "@prisma/client";
import { prisma } from "@/core/db";
import { errors } from "@/core/errors";
import type { BulkSettings, SettingUpsert } from "./schemas";

export const settingsService = {
  list: () =>
    prisma.setting.findMany({
      orderBy: { key: "asc" },
    }),

  get: async (key: string) => {
    const setting = await prisma.setting.findUnique({ where: { key } });
    if (!setting) throw errors.notFound("Setting not found");
    return setting;
  },

  upsert: async (key: string, input: SettingUpsert, actorId: string) =>
    prisma.setting.upsert({
      where: { key },
      create: {
        key,
        value: input.value as Prisma.InputJsonValue,
        description: input.description ?? null,
        updatedById: actorId,
      },
      update: {
        value: input.value as Prisma.InputJsonValue,
        description: input.description ?? null,
        updatedById: actorId,
      },
    }),

  remove: async (key: string) => {
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (!existing) throw errors.notFound("Setting not found");
    await prisma.setting.delete({ where: { key } });
  },

  upsertMany: async (items: BulkSettings, actorId: string) =>
    prisma.$transaction(
      items.map((item) =>
        prisma.setting.upsert({
          where: { key: item.key },
          create: {
            key: item.key,
            value: item.value as Prisma.InputJsonValue,
            description: item.description ?? null,
            updatedById: actorId,
          },
          update: {
            value: item.value as Prisma.InputJsonValue,
            description: item.description ?? null,
            updatedById: actorId,
          },
        }),
      ),
    ),
};
