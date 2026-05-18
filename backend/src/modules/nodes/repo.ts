import type { Prisma, Node } from "@prisma/client";
import { prisma } from "@/core/db";
import type { NodeCreateInput, NodeListQuery, NodeUpdateInput } from "./schemas";

const summaryInclude = {
  _count: {
    select: { allocations: true, servers: true },
  },
} as const;

export type NodeWithCounts = Node & {
  _count: { allocations: number; servers: number };
};

export const nodeRepo = {
  async list(query: NodeListQuery): Promise<{
    items: NodeWithCounts[];
    nextCursor: string | null;
  }> {
    const where: Prisma.NodeWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { fqdn: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { location: { contains: query.search, mode: "insensitive" } },
      ];
    }
    const items = await prisma.node.findMany({
      where,
      include: summaryInclude,
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    });
    const hasMore = items.length > query.limit;
    const trimmed = hasMore ? items.slice(0, query.limit) : items;
    const nextCursor = hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null;
    return { items: trimmed, nextCursor };
  },

  byId(id: string) {
    return prisma.node.findUnique({
      where: { id },
      include: summaryInclude,
    });
  },

  byIdentifier(identifier: string) {
    return prisma.node.findUnique({
      where: { daemonTokenIdentifier: identifier },
    });
  },

  create(input: NodeCreateInput, daemonTokenHash: string): Promise<NodeWithCounts> {
    return prisma.node.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        fqdn: input.fqdn,
        scheme: input.scheme,
        port: input.port,
        publicAddress: input.publicAddress ?? null,
        location: input.location ?? null,
        maxMemoryMb: input.maxMemoryMb,
        maxDiskMb: input.maxDiskMb,
        memoryOverallocate: input.memoryOverallocate,
        diskOverallocate: input.diskOverallocate,
        maintenance: input.maintenance,
        public: input.public,
        daemonTokenHash,
      },
      include: summaryInclude,
    });
  },

  update(id: string, input: NodeUpdateInput): Promise<NodeWithCounts> {
    return prisma.node.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.fqdn !== undefined ? { fqdn: input.fqdn } : {}),
        ...(input.scheme !== undefined ? { scheme: input.scheme } : {}),
        ...(input.port !== undefined ? { port: input.port } : {}),
        ...(input.publicAddress !== undefined ? { publicAddress: input.publicAddress } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.maxMemoryMb !== undefined ? { maxMemoryMb: input.maxMemoryMb } : {}),
        ...(input.maxDiskMb !== undefined ? { maxDiskMb: input.maxDiskMb } : {}),
        ...(input.memoryOverallocate !== undefined ? { memoryOverallocate: input.memoryOverallocate } : {}),
        ...(input.diskOverallocate !== undefined ? { diskOverallocate: input.diskOverallocate } : {}),
        ...(input.maintenance !== undefined ? { maintenance: input.maintenance } : {}),
        ...(input.public !== undefined ? { public: input.public } : {}),
      },
      include: summaryInclude,
    });
  },

  rotateToken(id: string, daemonTokenHash: string) {
    return prisma.node.update({
      where: { id },
      data: { daemonTokenHash },
      include: summaryInclude,
    });
  },

  async delete(id: string) {
    await prisma.node.delete({ where: { id } });
  },
};
