import {
  Prisma,
  type Allocation,
  type Egg,
  type EggVariable,
  type Server,
  type ServerVariable,
} from "@prisma/client";
import { prisma } from "@/core/db";
import type {
  ServerListQuery,
  ServerMineQuery,
  ServerUpdateInput,
} from "./schemas";

const detailInclude = {
  owner: { select: { id: true, email: true, name: true } },
  node: { select: { id: true, uuid: true, name: true, fqdn: true } },
  egg: {
    select: {
      id: true,
      uuid: true,
      name: true,
      defaultDockerImage: true,
      startup: true,
    },
  },
  defaultAllocation: {
    select: { id: true, ip: true, alias: true, port: true },
  },
  allocations: {
    select: { id: true, ip: true, alias: true, port: true },
    orderBy: { port: "asc" } as const,
  },
  variables: {
    include: {
      eggVariable: {
        select: {
          id: true,
          name: true,
          envVariable: true,
          rules: true,
          userEditable: true,
          userViewable: true,
          sortOrder: true,
        },
      },
    },
  },
} as const;

export type ServerDetail = Server & {
  owner: { id: string; email: string; name: string | null };
  node: { id: string; uuid: string; name: string; fqdn: string };
  egg: {
    id: string;
    uuid: string;
    name: string;
    defaultDockerImage: string;
    startup: string;
  };
  defaultAllocation:
    | { id: string; ip: string; alias: string | null; port: number }
    | null;
  allocations: Array<{ id: string; ip: string; alias: string | null; port: number }>;
  variables: Array<
    ServerVariable & {
      eggVariable: {
        id: string;
        name: string;
        envVariable: string;
        rules: string;
        userEditable: boolean;
        userViewable: boolean;
        sortOrder: number;
      };
    }
  >;
};

export type ServerSummary = Pick<
  Server,
  | "id"
  | "uuid"
  | "identifier"
  | "name"
  | "description"
  | "ownerId"
  | "nodeId"
  | "eggId"
  | "memoryMb"
  | "diskMb"
  | "cpuLimit"
  | "installStatus"
  | "suspended"
  | "lastKnownState"
  | "lastStateAt"
  | "createdAt"
  | "updatedAt"
> & {
  owner: { id: string; email: string; name: string | null };
  node: { id: string; name: string };
  egg: { id: string; name: string };
  defaultAllocation:
    | { id: string; ip: string; alias: string | null; port: number }
    | null;
};

const summarySelect = {
  id: true,
  uuid: true,
  identifier: true,
  name: true,
  description: true,
  ownerId: true,
  nodeId: true,
  eggId: true,
  memoryMb: true,
  diskMb: true,
  cpuLimit: true,
  installStatus: true,
  suspended: true,
  lastKnownState: true,
  lastStateAt: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, email: true, name: true } },
  node: { select: { id: true, name: true } },
  egg: { select: { id: true, name: true } },
  defaultAllocation: {
    select: { id: true, ip: true, alias: true, port: true },
  },
} as const;

export const serverRepo = {
  async list(
    query: ServerListQuery,
  ): Promise<{ items: ServerSummary[]; nextCursor: string | null }> {
    const where: Prisma.ServerWhereInput = {};
    if (query.nodeId) where.nodeId = query.nodeId;
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.installStatus) where.installStatus = query.installStatus;
    if (query.suspended !== undefined) where.suspended = query.suspended === "true";
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { identifier: { contains: query.search, mode: "insensitive" } },
        { uuid: { equals: query.search } },
      ];
    }

    const items = await prisma.server.findMany({
      where,
      select: summarySelect,
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    });
    const hasMore = items.length > query.limit;
    const trimmed = hasMore ? items.slice(0, query.limit) : items;
    const nextCursor = hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null;
    return { items: trimmed as ServerSummary[], nextCursor };
  },

  async listForOwner(
    ownerId: string,
    query: ServerMineQuery,
  ): Promise<{ items: ServerSummary[]; nextCursor: string | null }> {
    const where: Prisma.ServerWhereInput = { ownerId };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { identifier: { contains: query.search, mode: "insensitive" } },
      ];
    }
    const items = await prisma.server.findMany({
      where,
      select: summarySelect,
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    });
    const hasMore = items.length > query.limit;
    const trimmed = hasMore ? items.slice(0, query.limit) : items;
    const nextCursor = hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null;
    return { items: trimmed as ServerSummary[], nextCursor };
  },

  byId(id: string): Promise<ServerDetail | null> {
    return prisma.server.findUnique({
      where: { id },
      include: detailInclude,
    }) as Promise<ServerDetail | null>;
  },

  byIdentifier(identifier: string): Promise<ServerDetail | null> {
    return prisma.server.findUnique({
      where: { identifier },
      include: detailInclude,
    }) as Promise<ServerDetail | null>;
  },

  byUuid(uuid: string): Promise<ServerDetail | null> {
    return prisma.server.findUnique({
      where: { uuid },
      include: detailInclude,
    }) as Promise<ServerDetail | null>;
  },

  /**
   * Atomically create a server, claim the allocation, and seed
   * per-server variable overrides.
   */
  async createTx(args: {
    identifier: string;
    name: string;
    description: string | null;
    ownerId: string;
    nodeId: string;
    eggId: string;
    allocationId: string;
    image: string;
    startupOverride: string | null;
    environment: Record<string, string>;
    memoryMb: number;
    swapMb: number;
    diskMb: number;
    ioWeight: number;
    cpuLimit: number;
    threads: string | null;
    backupLimit: number;
    databaseLimit: number;
    allocationLimit: number;
    variables: Array<{ eggVariableId: string; value: string }>;
  }): Promise<ServerDetail> {
    return prisma.$transaction(async (tx) => {
      // Re-check the allocation under the same transaction to avoid races.
      const alloc = await tx.allocation.findUnique({
        where: { id: args.allocationId },
      });
      if (!alloc || alloc.nodeId !== args.nodeId) {
        throw new Prisma.PrismaClientKnownRequestError(
          "Allocation does not belong to the chosen node",
          { code: "P2025", clientVersion: "tx", meta: {} },
        );
      }
      if (alloc.serverId) {
        throw new Prisma.PrismaClientKnownRequestError(
          "Allocation already assigned",
          { code: "P2002", clientVersion: "tx", meta: { target: ["allocationId"] } },
        );
      }

      const created = await tx.server.create({
        data: {
          identifier: args.identifier,
          name: args.name,
          description: args.description,
          ownerId: args.ownerId,
          nodeId: args.nodeId,
          eggId: args.eggId,
          image: args.image,
          startupOverride: args.startupOverride,
          environment: args.environment as Prisma.InputJsonValue,
          memoryMb: args.memoryMb,
          swapMb: args.swapMb,
          diskMb: args.diskMb,
          ioWeight: args.ioWeight,
          cpuLimit: args.cpuLimit,
          threads: args.threads,
          backupLimit: args.backupLimit,
          databaseLimit: args.databaseLimit,
          allocationLimit: args.allocationLimit,
          installStatus: "pending",
        },
      });

      await tx.allocation.update({
        where: { id: args.allocationId },
        data: { serverId: created.id },
      });

      await tx.server.update({
        where: { id: created.id },
        data: { defaultAllocationId: args.allocationId },
      });

      if (args.variables.length > 0) {
        await tx.serverVariable.createMany({
          data: args.variables.map((v) => ({
            serverId: created.id,
            eggVariableId: v.eggVariableId,
            value: v.value,
          })),
        });
      }

      const full = await tx.server.findUnique({
        where: { id: created.id },
        include: detailInclude,
      });
      if (!full) throw new Error("server vanished mid-create");
      return full as unknown as ServerDetail;
    });
  },

  update(id: string, input: ServerUpdateInput): Promise<ServerDetail> {
    return prisma.server.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
        ...(input.image !== undefined ? { image: input.image } : {}),
        ...(input.startupOverride !== undefined
          ? { startupOverride: input.startupOverride }
          : {}),
        ...(input.environment !== undefined
          ? { environment: input.environment as Prisma.InputJsonValue }
          : {}),
        ...(input.memoryMb !== undefined ? { memoryMb: input.memoryMb } : {}),
        ...(input.swapMb !== undefined ? { swapMb: input.swapMb } : {}),
        ...(input.diskMb !== undefined ? { diskMb: input.diskMb } : {}),
        ...(input.ioWeight !== undefined ? { ioWeight: input.ioWeight } : {}),
        ...(input.cpuLimit !== undefined ? { cpuLimit: input.cpuLimit } : {}),
        ...(input.threads !== undefined ? { threads: input.threads } : {}),
        ...(input.backupLimit !== undefined ? { backupLimit: input.backupLimit } : {}),
        ...(input.databaseLimit !== undefined ? { databaseLimit: input.databaseLimit } : {}),
        ...(input.allocationLimit !== undefined
          ? { allocationLimit: input.allocationLimit }
          : {}),
      },
      include: detailInclude,
    }) as Promise<ServerDetail>;
  },

  async upsertVariables(
    serverId: string,
    pairs: Array<{ eggVariableId: string; value: string }>,
  ): Promise<void> {
    if (pairs.length === 0) return;
    await prisma.$transaction(
      pairs.map((p) =>
        prisma.serverVariable.upsert({
          where: {
            serverId_eggVariableId: {
              serverId,
              eggVariableId: p.eggVariableId,
            },
          },
          create: { serverId, eggVariableId: p.eggVariableId, value: p.value },
          update: { value: p.value },
        }),
      ),
    );
  },

  setSuspended(id: string, suspended: boolean): Promise<ServerDetail> {
    return prisma.server.update({
      where: { id },
      data: { suspended },
      include: detailInclude,
    }) as Promise<ServerDetail>;
  },

  async delete(id: string): Promise<void> {
    await prisma.server.delete({ where: { id } });
  },

  /** Helper: load egg + its variables for create/update validation. */
  async loadEggWithVariables(
    eggId: string,
  ): Promise<(Egg & { variables: EggVariable[] }) | null> {
    return prisma.egg.findUnique({
      where: { id: eggId },
      include: { variables: { orderBy: { sortOrder: "asc" } } },
    });
  },

  /** Helper: load allocation by id (lightweight, no relations). */
  loadAllocation(id: string): Promise<Allocation | null> {
    return prisma.allocation.findUnique({ where: { id } });
  },
};
