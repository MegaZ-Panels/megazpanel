import type { Prisma, Allocation } from "@prisma/client";
import { prisma } from "@/core/db";
import type {
  AllocationCreateInput,
  AllocationListQuery,
  AllocationUpdateInput,
} from "./schemas";

const include = {
  server: { select: { id: true, identifier: true, name: true } },
} as const;

export type AllocationWithServer = Allocation & {
  server: { id: string; identifier: string; name: string } | null;
};

export const allocationRepo = {
  async list(
    nodeId: string,
    query: AllocationListQuery,
  ): Promise<{ items: AllocationWithServer[]; nextCursor: string | null }> {
    const where: Prisma.AllocationWhereInput = { nodeId };
    if (query.assigned === "true") where.serverId = { not: null };
    if (query.assigned === "false") where.serverId = null;
    if (query.search) {
      where.OR = [
        { ip: { contains: query.search, mode: "insensitive" } },
        { alias: { contains: query.search, mode: "insensitive" } },
        { notes: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.allocation.findMany({
      where,
      include,
      orderBy: [{ ip: "asc" }, { port: "asc" }],
      take: query.limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    });
    const hasMore = items.length > query.limit;
    const trimmed = hasMore ? items.slice(0, query.limit) : items;
    const nextCursor = hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null;
    return { items: trimmed, nextCursor };
  },

  byId(id: string) {
    return prisma.allocation.findUnique({ where: { id }, include });
  },

  create(nodeId: string, input: AllocationCreateInput) {
    return prisma.allocation.create({
      data: {
        nodeId,
        ip: input.ip,
        alias: input.alias ?? null,
        port: input.port,
        notes: input.notes ?? null,
      },
      include,
    });
  },

  /**
   * Bulk-insert (nodeId, ip, port) rows for a port range. Returns the count
   * actually created — duplicates are silently skipped at the DB level.
   */
  async createMany(
    nodeId: string,
    ip: string,
    fromPort: number,
    toPort: number,
    alias: string | null,
    notes: string | null,
  ): Promise<number> {
    const rows: Prisma.AllocationCreateManyInput[] = [];
    for (let p = fromPort; p <= toPort; p++) {
      rows.push({ nodeId, ip, port: p, alias, notes });
    }
    const result = await prisma.allocation.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return result.count;
  },

  update(id: string, input: AllocationUpdateInput) {
    return prisma.allocation.update({
      where: { id },
      data: {
        ...(input.alias !== undefined ? { alias: input.alias } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include,
    });
  },

  async delete(id: string) {
    await prisma.allocation.delete({ where: { id } });
  },
};
