import { Prisma } from "@prisma/client";
import { customAlphabet } from "nanoid";
import { errors } from "@/core/errors";
import { auditService } from "../audit/service";
import { nodeRepo } from "../nodes/repo";
import { userRepo } from "../users/repo";
import { serverRepo, type ServerDetail, type ServerSummary } from "./repo";
import type {
  ServerCreateInput,
  ServerListQuery,
  ServerMineQuery,
  ServerUpdateInput,
} from "./schemas";

const generateIdentifier = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

export type ServerSummaryDTO = {
  id: string;
  uuid: string;
  identifier: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerEmail: string;
  ownerName: string | null;
  nodeId: string;
  nodeName: string;
  eggId: string;
  eggName: string;
  memoryMb: number;
  diskMb: number;
  cpuLimit: number;
  installStatus: string;
  suspended: boolean;
  lastKnownState: string | null;
  lastStateAt: string | null;
  primaryAllocation:
    | { id: string; ip: string; alias: string | null; port: number }
    | null;
  createdAt: string;
  updatedAt: string;
};

export type ServerDetailDTO = ServerSummaryDTO & {
  ownerObj: { id: string; email: string; name: string | null };
  nodeObj: { id: string; uuid: string; name: string; fqdn: string };
  eggObj: {
    id: string;
    uuid: string;
    name: string;
    defaultDockerImage: string;
    startup: string;
  };
  allocations: Array<{ id: string; ip: string; alias: string | null; port: number }>;
  image: string;
  startupOverride: string | null;
  environment: Record<string, string>;
  swapMb: number;
  ioWeight: number;
  threads: string | null;
  backupLimit: number;
  databaseLimit: number;
  allocationLimit: number;
  variables: Array<{
    id: string;
    eggVariableId: string;
    name: string;
    envVariable: string;
    value: string;
    rules: string;
    userEditable: boolean;
    userViewable: boolean;
    sortOrder: number;
  }>;
};

function summaryToDto(s: ServerSummary): ServerSummaryDTO {
  return {
    id: s.id,
    uuid: s.uuid,
    identifier: s.identifier,
    name: s.name,
    description: s.description,
    ownerId: s.ownerId,
    ownerEmail: s.owner.email,
    ownerName: s.owner.name,
    nodeId: s.nodeId,
    nodeName: s.node.name,
    eggId: s.eggId,
    eggName: s.egg.name,
    memoryMb: s.memoryMb,
    diskMb: s.diskMb,
    cpuLimit: s.cpuLimit,
    installStatus: s.installStatus,
    suspended: s.suspended,
    lastKnownState: s.lastKnownState,
    lastStateAt: s.lastStateAt?.toISOString() ?? null,
    primaryAllocation: s.defaultAllocation,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function detailToDto(s: ServerDetail): ServerDetailDTO {
  const env = (s.environment ?? {}) as Record<string, string>;
  return {
    ...summaryToDto({
      id: s.id,
      uuid: s.uuid,
      identifier: s.identifier,
      name: s.name,
      description: s.description,
      ownerId: s.ownerId,
      nodeId: s.nodeId,
      eggId: s.eggId,
      memoryMb: s.memoryMb,
      diskMb: s.diskMb,
      cpuLimit: s.cpuLimit,
      installStatus: s.installStatus,
      suspended: s.suspended,
      lastKnownState: s.lastKnownState,
      lastStateAt: s.lastStateAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      owner: s.owner,
      node: s.node,
      egg: { id: s.egg.id, name: s.egg.name },
      defaultAllocation: s.defaultAllocation,
    }),
    ownerObj: s.owner,
    nodeObj: s.node,
    eggObj: s.egg,
    allocations: s.allocations,
    image: s.image,
    startupOverride: s.startupOverride,
    environment: env,
    swapMb: s.swapMb,
    ioWeight: s.ioWeight,
    threads: s.threads,
    backupLimit: s.backupLimit,
    databaseLimit: s.databaseLimit,
    allocationLimit: s.allocationLimit,
    variables: s.variables
      .slice()
      .sort((a, b) => a.eggVariable.sortOrder - b.eggVariable.sortOrder)
      .map((v) => ({
        id: v.id,
        eggVariableId: v.eggVariableId,
        name: v.eggVariable.name,
        envVariable: v.eggVariable.envVariable,
        value: v.value,
        rules: v.eggVariable.rules,
        userEditable: v.eggVariable.userEditable,
        userViewable: v.eggVariable.userViewable,
        sortOrder: v.eggVariable.sortOrder,
      })),
  };
}

type Actor = { id: string; email: string };

async function generateUniqueIdentifier(): Promise<string> {
  for (let i = 0; i < 16; i++) {
    const candidate = generateIdentifier();
    const existing = await serverRepo.byIdentifier(candidate);
    if (!existing) return candidate;
  }
  throw errors.internal("Could not generate a unique server identifier");
}

export const serverService = {
  async list(query: ServerListQuery) {
    const { items, nextCursor } = await serverRepo.list(query);
    return { items: items.map(summaryToDto), nextCursor };
  },

  async listForOwner(ownerId: string, query: ServerMineQuery) {
    const { items, nextCursor } = await serverRepo.listForOwner(ownerId, query);
    return { items: items.map(summaryToDto), nextCursor };
  },

  async get(id: string) {
    const server = await serverRepo.byId(id);
    if (!server) throw errors.notFound("Server not found");
    return detailToDto(server);
  },

  async getByIdentifier(identifier: string) {
    const server = await serverRepo.byIdentifier(identifier);
    if (!server) throw errors.notFound("Server not found");
    return detailToDto(server);
  },

  async getByIdentifierForOwner(identifier: string, ownerId: string) {
    const server = await serverRepo.byIdentifier(identifier);
    if (!server || server.ownerId !== ownerId) {
      throw errors.notFound("Server not found");
    }
    return detailToDto(server);
  },

  async create(input: ServerCreateInput, actor: Actor): Promise<ServerDetailDTO> {
    // Validate referenced entities up-front (clearer error messages).
    const [owner, node, egg, allocation] = await Promise.all([
      userRepo.byId(input.ownerId),
      nodeRepo.byId(input.nodeId),
      serverRepo.loadEggWithVariables(input.eggId),
      serverRepo.loadAllocation(input.allocationId),
    ]);
    if (!owner) throw errors.notFound("Owner user not found");
    if (!node) throw errors.notFound("Node not found");
    if (node.maintenance) {
      throw errors.conflict("Node is under maintenance and cannot accept new servers");
    }
    if (!egg) throw errors.notFound("Egg not found");
    if (!allocation) throw errors.notFound("Allocation not found");
    if (allocation.nodeId !== input.nodeId) {
      throw errors.badRequest("Allocation does not belong to the chosen node");
    }
    if (allocation.serverId) {
      throw errors.conflict("Allocation already assigned to another server");
    }

    // Resolve final per-server variable values. For each egg variable,
    // prefer user-supplied value, else fall back to the egg default.
    const fieldErrors: Record<string, string[]> = {};
    const resolvedVars = egg.variables.map((ev) => {
      const provided = input.variables[ev.envVariable];
      const value =
        provided !== undefined ? provided : (ev.defaultValue ?? "");
      if (
        provided !== undefined &&
        !ev.userEditable &&
        provided !== (ev.defaultValue ?? "")
      ) {
        fieldErrors[`variables.${ev.envVariable}`] = [
          `Variable "${ev.name}" is locked by the egg`,
        ];
      }
      const required = /(^|\|)required(\||$)/.test(ev.rules);
      if (required && value.trim() === "") {
        fieldErrors[`variables.${ev.envVariable}`] = [
          `Variable "${ev.name}" is required`,
        ];
      }
      return { eggVariableId: ev.id, value };
    });
    if (Object.keys(fieldErrors).length > 0) {
      throw errors.validation("Invalid server variables", fieldErrors);
    }

    const identifier = await generateUniqueIdentifier();

    let created: ServerDetail;
    try {
      created = await serverRepo.createTx({
        identifier,
        name: input.name,
        description: input.description ?? null,
        ownerId: input.ownerId,
        nodeId: input.nodeId,
        eggId: input.eggId,
        allocationId: input.allocationId,
        image: input.image ?? egg.defaultDockerImage,
        startupOverride: input.startupOverride ?? null,
        environment: input.environment,
        memoryMb: input.memoryMb,
        swapMb: input.swapMb,
        diskMb: input.diskMb,
        ioWeight: input.ioWeight,
        cpuLimit: input.cpuLimit,
        threads: input.threads ?? null,
        backupLimit: input.backupLimit,
        databaseLimit: input.databaseLimit,
        allocationLimit: input.allocationLimit,
        variables: resolvedVars,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          throw errors.conflict(
            "Allocation already assigned (race) — pick another and retry",
          );
        }
        if (err.code === "P2025") {
          throw errors.badRequest(err.message);
        }
      }
      throw err;
    }

    await auditService.record({
      action: "server.created",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "server",
      targetId: created.id,
      meta: {
        identifier: created.identifier,
        ownerId: created.ownerId,
        nodeId: created.nodeId,
        eggId: created.eggId,
        allocationId: input.allocationId,
      },
    });

    return detailToDto(created);
  },

  async update(id: string, input: ServerUpdateInput, actor: Actor): Promise<ServerDetailDTO> {
    const existing = await serverRepo.byId(id);
    if (!existing) throw errors.notFound("Server not found");

    if (input.ownerId && input.ownerId !== existing.ownerId) {
      const owner = await userRepo.byId(input.ownerId);
      if (!owner) throw errors.badRequest("Target owner does not exist");
    }

    let resolvedVars: Array<{ eggVariableId: string; value: string }> = [];
    if (input.variables) {
      const egg = await serverRepo.loadEggWithVariables(existing.eggId);
      if (!egg) throw errors.internal("Egg referenced by server is missing");
      const fieldErrors: Record<string, string[]> = {};
      for (const ev of egg.variables) {
        const provided = input.variables[ev.envVariable];
        if (provided === undefined) continue;
        if (!ev.userEditable && provided !== (ev.defaultValue ?? "")) {
          fieldErrors[`variables.${ev.envVariable}`] = [
            `Variable "${ev.name}" is locked by the egg`,
          ];
          continue;
        }
        const required = /(^|\|)required(\||$)/.test(ev.rules);
        if (required && provided.trim() === "") {
          fieldErrors[`variables.${ev.envVariable}`] = [
            `Variable "${ev.name}" is required`,
          ];
          continue;
        }
        resolvedVars.push({ eggVariableId: ev.id, value: provided });
      }
      if (Object.keys(fieldErrors).length > 0) {
        throw errors.validation("Invalid server variables", fieldErrors);
      }
    }

    const updated = await serverRepo.update(id, input);
    if (resolvedVars.length > 0) {
      await serverRepo.upsertVariables(id, resolvedVars);
    }

    await auditService.record({
      action: "server.updated",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "server",
      targetId: id,
      meta: {
        changedKeys: Object.keys(input).filter((k) => k !== "variables"),
        variablesChanged: input.variables
          ? Object.keys(input.variables).length
          : 0,
      },
    });

    // Re-fetch in case variable upsert changed things.
    const fresh = await serverRepo.byId(id);
    return detailToDto(fresh ?? updated);
  },

  async setSuspended(id: string, suspended: boolean, actor: Actor): Promise<ServerDetailDTO> {
    const existing = await serverRepo.byId(id);
    if (!existing) throw errors.notFound("Server not found");
    if (existing.suspended === suspended) return detailToDto(existing);
    const updated = await serverRepo.setSuspended(id, suspended);
    await auditService.record({
      action: suspended ? "server.suspended" : "server.unsuspended",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "server",
      targetId: id,
      meta: { identifier: existing.identifier },
    });
    return detailToDto(updated);
  },

  async remove(id: string, actor: Actor): Promise<void> {
    const existing = await serverRepo.byId(id);
    if (!existing) throw errors.notFound("Server not found");
    await serverRepo.delete(id);
    await auditService.record({
      action: "server.deleted",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "server",
      targetId: id,
      meta: { identifier: existing.identifier, name: existing.name },
    });
  },
};
