import yaml from "js-yaml";
import { eggImportSchema, type EggImportInput } from "./schemas";
import { errors } from "@/core/errors";

export type ExportPayload = {
  format: "megazpanel-egg/v1";
  exportedAt: string;
  egg: EggImportInput;
};

export function eggToExport(egg: {
  name: string;
  description: string | null;
  category: string | null;
  author: string;
  version: string;
  dockerImages: unknown;
  defaultDockerImage: string;
  startup: string;
  stopCommand: string | null;
  customFlags: unknown;
  configFiles: unknown;
  configStartup: unknown;
  configLogs: unknown;
  scriptInstall: string | null;
  scriptEntry: string;
  scriptContainer: string;
  scriptIsPrivileged: boolean;
  features: string[];
  fileDenylist: string[];
  forceOutgoingIp: boolean;
  nest: { id: string; name: string };
  variables: Array<{
    name: string;
    description: string | null;
    envVariable: string;
    defaultValue: string | null;
    userViewable: boolean;
    userEditable: boolean;
    rules: string;
    sortOrder: number;
  }>;
}): ExportPayload {
  return {
    format: "megazpanel-egg/v1",
    exportedAt: new Date().toISOString(),
    egg: {
      nestId: egg.nest.id,
      nestName: egg.nest.name,
      name: egg.name,
      description: egg.description,
      category: egg.category,
      author: egg.author,
      version: egg.version,
      dockerImages: egg.dockerImages as Record<string, string>,
      defaultDockerImage: egg.defaultDockerImage,
      startup: egg.startup,
      stopCommand: egg.stopCommand,
      customFlags: (egg.customFlags as string[]) ?? [],
      configFiles: (egg.configFiles as Record<string, unknown>) ?? {},
      configStartup: (egg.configStartup as Record<string, unknown>) ?? {},
      configLogs: (egg.configLogs as Record<string, unknown>) ?? {},
      scriptInstall: egg.scriptInstall,
      scriptEntry: egg.scriptEntry,
      scriptContainer: egg.scriptContainer,
      scriptIsPrivileged: egg.scriptIsPrivileged,
      features: egg.features,
      fileDenylist: egg.fileDenylist,
      forceOutgoingIp: egg.forceOutgoingIp,
      variables: egg.variables.map((v) => ({
        name: v.name,
        description: v.description,
        envVariable: v.envVariable,
        defaultValue: v.defaultValue,
        userViewable: v.userViewable,
        userEditable: v.userEditable,
        rules: v.rules,
        sortOrder: v.sortOrder,
      })),
    },
  };
}

export function serializeExport(payload: ExportPayload, format: "json" | "yaml"): string {
  if (format === "yaml") return yaml.dump(payload, { noRefs: true, lineWidth: 120 });
  return JSON.stringify(payload, null, 2);
}

export function parseImport(raw: string, format: "json" | "yaml"): EggImportInput {
  let parsed: unknown;
  try {
    parsed = format === "yaml" ? yaml.load(raw) : JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "could not parse";
    throw errors.badRequest(`Failed to parse ${format.toUpperCase()}: ${msg}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw errors.badRequest("Import payload must be an object");
  }

  // Accept either { egg: {...} } envelope or the raw egg.
  const candidate =
    "egg" in (parsed as Record<string, unknown>)
      ? (parsed as { egg: unknown }).egg
      : parsed;

  const result = eggImportSchema.safeParse(candidate);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      (fields[key] ??= []).push(issue.message);
    }
    throw errors.validation("Imported egg failed validation", fields);
  }
  return result.data;
}
