import { prisma } from "@/core/db";
import { errors } from "@/core/errors";
import { eggRepo, nestRepo } from "./repo";
import {
  eggImportSchema,
  eggInputSchema,
  eggUpdateSchema,
  nestInputSchema,
  type EggImportInput,
  type EggInput,
  type EggUpdateInput,
  type NestInput,
} from "./schemas";
import { eggToExport, parseImport, serializeExport, type ExportPayload } from "./import-export";

function ensureDefaultDockerImageIsValid(images: Record<string, string>, key: string): void {
  if (!Object.prototype.hasOwnProperty.call(images, key)) {
    throw errors.validation("defaultDockerImage must be one of dockerImages keys", {
      defaultDockerImage: ["must reference an entry in dockerImages"],
    });
  }
}

function ensureUniqueEnvVariables(variables: { envVariable: string }[]): void {
  const seen = new Set<string>();
  for (const v of variables) {
    if (seen.has(v.envVariable)) {
      throw errors.validation("Variable names must be unique", {
        variables: [`Duplicate envVariable: ${v.envVariable}`],
      });
    }
    seen.add(v.envVariable);
  }
}

export const nestService = {
  list: () => nestRepo.list(),
  get: async (id: string) => {
    const nest = await nestRepo.byId(id);
    if (!nest) throw errors.notFound("Nest not found");
    return nest;
  },
  create: async (input: NestInput) => {
    const parsed = nestInputSchema.parse(input);
    return nestRepo.create(parsed);
  },
  update: async (id: string, input: Partial<NestInput>) => {
    const partial = nestInputSchema.partial().parse(input);
    const existing = await nestRepo.byId(id);
    if (!existing) throw errors.notFound("Nest not found");
    return nestRepo.update(id, partial);
  },
  remove: async (id: string) => {
    const existing = await nestRepo.byId(id);
    if (!existing) throw errors.notFound("Nest not found");
    if (existing._count.eggs > 0) {
      throw errors.conflict("Cannot delete a nest that still contains eggs");
    }
    await nestRepo.remove(id);
  },
};

export const eggService = {
  list: (filter: { nestId?: string; search?: string }) => eggRepo.list(filter),

  get: async (id: string) => {
    const egg = await eggRepo.byId(id);
    if (!egg) throw errors.notFound("Egg not found");
    return egg;
  },

  create: async (input: EggInput) => {
    const parsed = eggInputSchema.parse(input);
    ensureDefaultDockerImageIsValid(parsed.dockerImages, parsed.defaultDockerImage);
    ensureUniqueEnvVariables(parsed.variables);

    const nest = await nestRepo.byId(parsed.nestId);
    if (!nest) throw errors.notFound("Nest not found");

    return eggRepo.create(parsed);
  },

  update: async (id: string, input: EggUpdateInput) => {
    const parsed = eggUpdateSchema.parse(input);
    const existing = await eggRepo.byId(id);
    if (!existing) throw errors.notFound("Egg not found");

    if (parsed.dockerImages || parsed.defaultDockerImage) {
      const images =
        (parsed.dockerImages as Record<string, string>) ??
        (existing.dockerImages as Record<string, string>);
      const key = parsed.defaultDockerImage ?? existing.defaultDockerImage;
      ensureDefaultDockerImageIsValid(images, key);
    }
    if (parsed.variables) ensureUniqueEnvVariables(parsed.variables);

    return eggRepo.update(id, parsed);
  },

  remove: async (id: string) => {
    const existing = await eggRepo.byId(id);
    if (!existing) throw errors.notFound("Egg not found");
    await eggRepo.remove(id);
  },

  export: async (id: string, format: "json" | "yaml") => {
    const egg = await eggRepo.byId(id);
    if (!egg) throw errors.notFound("Egg not found");
    const payload = eggToExport(egg);
    return { body: serializeExport(payload, format), filename: `egg-${egg.uuid}.${format}` };
  },

  importFromText: async (raw: string, format: "json" | "yaml") => {
    const data = parseImport(raw, format);
    return importEgg(data);
  },

  importFromPayload: async (payload: ExportPayload | EggImportInput) => {
    const candidate =
      typeof payload === "object" && payload !== null && "egg" in payload
        ? (payload as ExportPayload).egg
        : (payload as EggImportInput);
    return importEgg(candidate);
  },
};

async function importEgg(input: EggImportInput) {
  const parsed = eggImportSchema.parse(input);
  ensureDefaultDockerImageIsValid(parsed.dockerImages, parsed.defaultDockerImage);
  ensureUniqueEnvVariables(parsed.variables);

  let nestId = parsed.nestId;
  if (!nestId) {
    if (!parsed.nestName) {
      throw errors.validation("Provide either nestId or nestName when importing", {
        nestId: ["nestId or nestName is required"],
      });
    }
    const existing = await nestRepo.byName(parsed.nestName);
    nestId = existing
      ? existing.id
      : (
          await nestRepo.create({
            name: parsed.nestName,
            description: null,
            author: parsed.author,
          })
        ).id;
  }

  // Avoid duplicate name within nest by appending a suffix.
  let candidateName = parsed.name;
  let attempt = 1;
  while (
    (await prisma.egg.findUnique({
      where: { nestId_name: { nestId, name: candidateName } },
    })) !== null
  ) {
    candidateName = `${parsed.name} (${attempt++})`;
    if (attempt > 50) {
      throw errors.conflict("Could not generate a unique egg name in the target nest");
    }
  }

  const created: EggInput = { ...parsed, nestId, name: candidateName };
  return eggRepo.create(created);
}

// (eggImportSchema is consumed via routes via schemas; nothing else to re-export here)
