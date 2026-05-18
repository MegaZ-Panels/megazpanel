import { Prisma } from "@prisma/client";
import { errors } from "@/core/errors";
import { hashPassword, generateRandomToken } from "@/core/crypto";
import { auditService } from "../audit/service";
import { nodeRepo, type NodeWithCounts } from "./repo";
import type { NodeCreateInput, NodeListQuery, NodeUpdateInput } from "./schemas";

export type NodeDTO = {
  id: string;
  uuid: string;
  name: string;
  description: string | null;
  fqdn: string;
  scheme: string;
  port: number;
  publicAddress: string | null;
  location: string | null;
  maxMemoryMb: number;
  maxDiskMb: number;
  memoryOverallocate: number;
  diskOverallocate: number;
  daemonTokenIdentifier: string;
  daemonVersion: string | null;
  lastHeartbeatAt: string | null;
  maintenance: boolean;
  public: boolean;
  allocationsCount: number;
  serversCount: number;
  createdAt: string;
  updatedAt: string;
};

export type NodeWithToken = NodeDTO & { daemonToken: string };

function toDto(n: NodeWithCounts): NodeDTO {
  return {
    id: n.id,
    uuid: n.uuid,
    name: n.name,
    description: n.description,
    fqdn: n.fqdn,
    scheme: n.scheme,
    port: n.port,
    publicAddress: n.publicAddress,
    location: n.location,
    maxMemoryMb: n.maxMemoryMb,
    maxDiskMb: n.maxDiskMb,
    memoryOverallocate: n.memoryOverallocate,
    diskOverallocate: n.diskOverallocate,
    daemonTokenIdentifier: n.daemonTokenIdentifier,
    daemonVersion: n.daemonVersion,
    lastHeartbeatAt: n.lastHeartbeatAt?.toISOString() ?? null,
    maintenance: n.maintenance,
    public: n.public,
    allocationsCount: n._count.allocations,
    serversCount: n._count.servers,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

type Actor = { id: string; email: string };

// Plaintext daemon token format: "mzpd_<48 url-safe base64 chars>".
// Sent to daemon via secure channel ONCE; only the argon2 hash is stored.
function generateDaemonToken(): string {
  return `mzpd_${generateRandomToken(36)}`;
}

export const nodeService = {
  async list(query: NodeListQuery) {
    const { items, nextCursor } = await nodeRepo.list(query);
    return { items: items.map(toDto), nextCursor };
  },

  async get(id: string) {
    const node = await nodeRepo.byId(id);
    if (!node) throw errors.notFound("Node not found");
    return toDto(node);
  },

  async create(input: NodeCreateInput, actor: Actor): Promise<NodeWithToken> {
    const plaintext = generateDaemonToken();
    const hash = await hashPassword(plaintext);

    let node: NodeWithCounts;
    try {
      node = await nodeRepo.create(input, hash);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const target = (err.meta?.target as string[] | undefined)?.join(",") ?? "field";
        throw errors.conflict(`Node ${target} already exists`, {
          [target]: ["already in use"],
        });
      }
      throw err;
    }

    await auditService.record({
      action: "node.created",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "node",
      targetId: node.id,
      meta: { name: node.name, fqdn: node.fqdn },
    });

    return { ...toDto(node), daemonToken: plaintext };
  },

  async update(id: string, input: NodeUpdateInput, actor: Actor): Promise<NodeDTO> {
    const existing = await nodeRepo.byId(id);
    if (!existing) throw errors.notFound("Node not found");

    let updated: NodeWithCounts;
    try {
      updated = await nodeRepo.update(id, input);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const target = (err.meta?.target as string[] | undefined)?.join(",") ?? "field";
        throw errors.conflict(`Node ${target} already exists`, {
          [target]: ["already in use"],
        });
      }
      throw err;
    }

    await auditService.record({
      action: "node.updated",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "node",
      targetId: id,
      meta: { changedKeys: Object.keys(input) },
    });
    return toDto(updated);
  },

  async rotateToken(id: string, actor: Actor): Promise<NodeWithToken> {
    const existing = await nodeRepo.byId(id);
    if (!existing) throw errors.notFound("Node not found");

    const plaintext = generateDaemonToken();
    const hash = await hashPassword(plaintext);
    const updated = await nodeRepo.rotateToken(id, hash);

    await auditService.record({
      action: "node.token_rotated",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "node",
      targetId: id,
      meta: {},
    });
    return { ...toDto(updated), daemonToken: plaintext };
  },

  async remove(id: string, actor: Actor): Promise<void> {
    const existing = await nodeRepo.byId(id);
    if (!existing) throw errors.notFound("Node not found");
    if (existing._count.servers > 0) {
      throw errors.conflict(
        `Cannot delete node: ${existing._count.servers} server(s) still attached`,
      );
    }
    await nodeRepo.delete(id);

    await auditService.record({
      action: "node.deleted",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "node",
      targetId: id,
      meta: { name: existing.name, fqdn: existing.fqdn },
    });
  },
};
