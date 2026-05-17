import { prisma } from "@/core/db";
import { Prisma } from "@prisma/client";
import type { EggInput, EggUpdateInput, EggVariableInput, NestInput } from "./schemas";

export const nestRepo = {
  list: () =>
    prisma.nest.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { eggs: true } } },
    }),

  byId: (id: string) =>
    prisma.nest.findUnique({
      where: { id },
      include: { _count: { select: { eggs: true } } },
    }),

  byName: (name: string) => prisma.nest.findUnique({ where: { name } }),

  create: (input: NestInput) =>
    prisma.nest.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        author: input.author,
      },
    }),

  update: (id: string, input: Partial<NestInput>) =>
    prisma.nest.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.author !== undefined ? { author: input.author } : {}),
      },
    }),

  remove: (id: string) => prisma.nest.delete({ where: { id } }),
};

const eggSelect = {
  variables: { orderBy: { sortOrder: "asc" } },
  nest: { select: { id: true, name: true } },
} as const;

function buildVariableCreateMany(variables: EggVariableInput[]) {
  return variables.map((v, i) => ({
    name: v.name,
    description: v.description ?? null,
    envVariable: v.envVariable,
    defaultValue: v.defaultValue ?? null,
    userViewable: v.userViewable,
    userEditable: v.userEditable,
    rules: v.rules,
    sortOrder: v.sortOrder || i,
  }));
}

export const eggRepo = {
  list: (filter: { nestId?: string; search?: string } = {}) =>
    prisma.egg.findMany({
      where: {
        ...(filter.nestId ? { nestId: filter.nestId } : {}),
        ...(filter.search
          ? {
              OR: [
                { name: { contains: filter.search, mode: "insensitive" } },
                { description: { contains: filter.search, mode: "insensitive" } },
                { category: { contains: filter.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ nestId: "asc" }, { name: "asc" }],
      include: { nest: { select: { id: true, name: true } }, _count: { select: { variables: true } } },
    }),

  byId: (id: string) => prisma.egg.findUnique({ where: { id }, include: eggSelect }),

  byUuid: (uuid: string) => prisma.egg.findUnique({ where: { uuid }, include: eggSelect }),

  create: (input: EggInput) =>
    prisma.egg.create({
      data: {
        nestId: input.nestId,
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? null,
        author: input.author,
        version: input.version,
        dockerImages: input.dockerImages as Prisma.InputJsonValue,
        defaultDockerImage: input.defaultDockerImage,
        startup: input.startup,
        stopCommand: input.stopCommand ?? null,
        customFlags: input.customFlags as unknown as Prisma.InputJsonValue,
        configFiles: input.configFiles as Prisma.InputJsonValue,
        configStartup: input.configStartup as Prisma.InputJsonValue,
        configLogs: input.configLogs as Prisma.InputJsonValue,
        scriptInstall: input.scriptInstall ?? null,
        scriptEntry: input.scriptEntry,
        scriptContainer: input.scriptContainer,
        scriptIsPrivileged: input.scriptIsPrivileged,
        features: input.features,
        fileDenylist: input.fileDenylist,
        forceOutgoingIp: input.forceOutgoingIp,
        variables: { create: buildVariableCreateMany(input.variables) },
      },
      include: eggSelect,
    }),

  update: async (id: string, input: EggUpdateInput) => {
    return prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      const map: Array<[keyof EggUpdateInput, string]> = [
        ["nestId", "nestId"],
        ["name", "name"],
        ["category", "category"],
        ["author", "author"],
        ["version", "version"],
        ["dockerImages", "dockerImages"],
        ["defaultDockerImage", "defaultDockerImage"],
        ["startup", "startup"],
        ["customFlags", "customFlags"],
        ["configFiles", "configFiles"],
        ["configStartup", "configStartup"],
        ["configLogs", "configLogs"],
        ["scriptEntry", "scriptEntry"],
        ["scriptContainer", "scriptContainer"],
        ["scriptIsPrivileged", "scriptIsPrivileged"],
        ["features", "features"],
        ["fileDenylist", "fileDenylist"],
        ["forceOutgoingIp", "forceOutgoingIp"],
      ];
      for (const [src, dst] of map) {
        if (input[src] !== undefined) data[dst] = input[src];
      }
      if (input.description !== undefined) data.description = input.description ?? null;
      if (input.stopCommand !== undefined) data.stopCommand = input.stopCommand ?? null;
      if (input.scriptInstall !== undefined) data.scriptInstall = input.scriptInstall ?? null;

      const updated = await tx.egg.update({ where: { id }, data });

      if (input.variables) {
        await tx.eggVariable.deleteMany({ where: { eggId: id } });
        if (input.variables.length > 0) {
          await tx.eggVariable.createMany({
            data: buildVariableCreateMany(input.variables).map((v) => ({ ...v, eggId: id })),
          });
        }
      }

      return tx.egg.findUniqueOrThrow({ where: { id: updated.id }, include: eggSelect });
    });
  },

  remove: (id: string) => prisma.egg.delete({ where: { id } }),
};
