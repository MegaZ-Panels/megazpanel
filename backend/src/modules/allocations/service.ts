import { Prisma } from "@prisma/client";
import { errors } from "@/core/errors";
import { auditService } from "../audit/service";
import { nodeRepo } from "../nodes/repo";
import { allocationRepo, type AllocationWithServer } from "./repo";
import type {
  AllocationBulkCreateInput,
  AllocationCreateInput,
  AllocationListQuery,
  AllocationUpdateInput,
} from "./schemas";

export type AllocationDTO = {
  id: string;
  nodeId: string;
  ip: string;
  alias: string | null;
  port: number;
  notes: string | null;
  serverId: string | null;
  serverIdentifier: string | null;
  serverName: string | null;
  createdAt: string;
  updatedAt: string;
};

function toDto(a: AllocationWithServer): AllocationDTO {
  return {
    id: a.id,
    nodeId: a.nodeId,
    ip: a.ip,
    alias: a.alias,
    port: a.port,
    notes: a.notes,
    serverId: a.serverId,
    serverIdentifier: a.server?.identifier ?? null,
    serverName: a.server?.name ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

type Actor = { id: string; email: string };

async function ensureNodeExists(nodeId: string): Promise<void> {
  const node = await nodeRepo.byId(nodeId);
  if (!node) throw errors.notFound("Node not found");
}

export const allocationService = {
  async list(nodeId: string, query: AllocationListQuery) {
    await ensureNodeExists(nodeId);
    const { items, nextCursor } = await allocationRepo.list(nodeId, query);
    return { items: items.map(toDto), nextCursor };
  },

  async create(
    nodeId: string,
    input: AllocationCreateInput,
    actor: Actor,
  ): Promise<AllocationDTO> {
    await ensureNodeExists(nodeId);
    let created;
    try {
      created = await allocationRepo.create(nodeId, input);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw errors.conflict(
          `Allocation ${input.ip}:${input.port} already exists on this node`,
        );
      }
      throw err;
    }
    await auditService.record({
      action: "allocation.created",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "allocation",
      targetId: created.id,
      meta: { nodeId, ip: input.ip, port: input.port },
    });
    return toDto(created);
  },

  async createMany(
    nodeId: string,
    input: AllocationBulkCreateInput,
    actor: Actor,
  ): Promise<{ created: number; requested: number }> {
    await ensureNodeExists(nodeId);
    const requested = input.toPort - input.fromPort + 1;
    const created = await allocationRepo.createMany(
      nodeId,
      input.ip,
      input.fromPort,
      input.toPort,
      input.alias ?? null,
      input.notes ?? null,
    );
    await auditService.record({
      action: "allocation.bulk_created",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "node",
      targetId: nodeId,
      meta: {
        ip: input.ip,
        fromPort: input.fromPort,
        toPort: input.toPort,
        requested,
        created,
      },
    });
    return { created, requested };
  },

  async update(
    id: string,
    input: AllocationUpdateInput,
    actor: Actor,
  ): Promise<AllocationDTO> {
    const existing = await allocationRepo.byId(id);
    if (!existing) throw errors.notFound("Allocation not found");
    const updated = await allocationRepo.update(id, input);
    await auditService.record({
      action: "allocation.updated",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "allocation",
      targetId: id,
      meta: { changedKeys: Object.keys(input) },
    });
    return toDto(updated);
  },

  async remove(id: string, actor: Actor): Promise<void> {
    const existing = await allocationRepo.byId(id);
    if (!existing) throw errors.notFound("Allocation not found");
    if (existing.serverId) {
      throw errors.conflict(
        "Cannot delete allocation: still assigned to a server. Detach it first.",
      );
    }
    await allocationRepo.delete(id);
    await auditService.record({
      action: "allocation.deleted",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "allocation",
      targetId: id,
      meta: { nodeId: existing.nodeId, ip: existing.ip, port: existing.port },
    });
  },
};
