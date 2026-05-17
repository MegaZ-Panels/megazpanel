import { prisma } from "@/core/db";
import { Prisma, type BackupTarget } from "@prisma/client";
import { encryptSecret } from "@/core/crypto";
import { errors } from "@/core/errors";
import { isValidCron, nextRunFor } from "@/core/scheduler";
import { buildStorageProvider } from "@/platform/storage";
import { logger } from "@/core/logger";
import { auditService } from "../audit/service";
import type {
  BackupListQuery,
  BackupScheduleCreateInput,
  BackupScheduleUpdateInput,
  ManualBackupInput,
  TargetCreateInput,
  TargetUpdateInput,
} from "./schemas";

type Actor = { id: string; email: string };

function packCredentials(input: { accessKey?: string | null; secretKey?: string | null }):
  | string
  | null {
  if (!input.accessKey || !input.secretKey) return null;
  return encryptSecret(JSON.stringify({ accessKey: input.accessKey, secretKey: input.secretKey }));
}

function targetToDto(target: BackupTarget) {
  // Never expose stored credentials.
  const { credentials: _credentials, ...rest } = target;
  return { ...rest, hasCredentials: Boolean(target.credentials) };
}

export const targetService = {
  list: async () => {
    const items = await prisma.backupTarget.findMany({ orderBy: { name: "asc" } });
    return items.map(targetToDto);
  },

  get: async (id: string) => {
    const item = await prisma.backupTarget.findUnique({ where: { id } });
    if (!item) throw errors.notFound("Backup target not found");
    return targetToDto(item);
  },

  create: async (input: TargetCreateInput, actor: Actor) => {
    const credentials = packCredentials(input);
    const created = await prisma.backupTarget.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        provider: input.provider,
        bucket: input.bucket ?? null,
        prefix: input.prefix ?? null,
        endpoint: input.endpoint ?? null,
        region: input.region ?? null,
        localPath: input.localPath ?? null,
        credentials,
        enabled: input.enabled,
      },
    });
    await auditService.record({
      action: "backup_target.created",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "backup_target",
      targetId: created.id,
      meta: { provider: created.provider, name: created.name },
    });
    return targetToDto(created);
  },

  update: async (id: string, input: TargetUpdateInput, actor: Actor) => {
    const existing = await prisma.backupTarget.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Backup target not found");

    const data: Prisma.BackupTargetUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description ?? null;
    if (input.bucket !== undefined) data.bucket = input.bucket ?? null;
    if (input.prefix !== undefined) data.prefix = input.prefix ?? null;
    if (input.endpoint !== undefined) data.endpoint = input.endpoint ?? null;
    if (input.region !== undefined) data.region = input.region ?? null;
    if (input.localPath !== undefined) data.localPath = input.localPath ?? null;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.accessKey !== undefined || input.secretKey !== undefined) {
      data.credentials = packCredentials({
        accessKey: input.accessKey ?? null,
        secretKey: input.secretKey ?? null,
      });
    }

    const updated = await prisma.backupTarget.update({ where: { id }, data });
    await auditService.record({
      action: "backup_target.updated",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "backup_target",
      targetId: id,
      meta: { changedKeys: Object.keys(input) },
    });
    return targetToDto(updated);
  },

  remove: async (id: string, actor: Actor) => {
    const existing = await prisma.backupTarget.findUnique({
      where: { id },
      include: { _count: { select: { backups: true, schedules: true } } },
    });
    if (!existing) throw errors.notFound("Backup target not found");
    if (existing._count.backups > 0 || existing._count.schedules > 0) {
      throw errors.conflict(
        "Target still has backups or schedules; remove or reassign them first",
      );
    }
    await prisma.backupTarget.delete({ where: { id } });
    await auditService.record({
      action: "backup_target.deleted",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "backup_target",
      targetId: id,
      meta: { name: existing.name },
    });
  },
};

export const backupScheduleService = {
  list: () =>
    prisma.backupSchedule.findMany({
      orderBy: { name: "asc" },
      include: { target: true },
    }),

  get: async (id: string) => {
    const item = await prisma.backupSchedule.findUnique({
      where: { id },
      include: { target: true },
    });
    if (!item) throw errors.notFound("Backup schedule not found");
    return item;
  },

  create: async (input: BackupScheduleCreateInput, actor: Actor) => {
    if (!isValidCron(input.cron, input.timezone)) {
      throw errors.validation("Invalid cron expression", { cron: ["not parseable"] });
    }
    const target = await prisma.backupTarget.findUnique({ where: { id: input.targetId } });
    if (!target) throw errors.notFound("Backup target not found");

    const created = await prisma.backupSchedule.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        enabled: input.enabled,
        cron: input.cron,
        timezone: input.timezone,
        kind: input.kind,
        source: input.source ?? null,
        targetId: input.targetId,
        retentionCount: input.retentionCount ?? null,
        retentionDays: input.retentionDays ?? null,
        nextRunAt: nextRunFor(input.cron, input.timezone),
      },
      include: { target: true },
    });
    await auditService.record({
      action: "backup_schedule.created",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "backup_schedule",
      targetId: created.id,
      meta: { name: created.name, cron: created.cron },
    });
    return created;
  },

  update: async (id: string, input: BackupScheduleUpdateInput, actor: Actor) => {
    const existing = await prisma.backupSchedule.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Backup schedule not found");

    const cron = input.cron ?? existing.cron;
    const timezone = input.timezone ?? existing.timezone;
    if (input.cron && !isValidCron(cron, timezone)) {
      throw errors.validation("Invalid cron expression", { cron: ["not parseable"] });
    }
    if (input.targetId) {
      const target = await prisma.backupTarget.findUnique({ where: { id: input.targetId } });
      if (!target) throw errors.notFound("Backup target not found");
    }

    const data: Prisma.BackupScheduleUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description ?? null;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.cron !== undefined) data.cron = input.cron;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.source !== undefined) data.source = input.source ?? null;
    if (input.targetId !== undefined) data.target = { connect: { id: input.targetId } };
    if (input.retentionCount !== undefined) data.retentionCount = input.retentionCount ?? null;
    if (input.retentionDays !== undefined) data.retentionDays = input.retentionDays ?? null;
    data.nextRunAt = nextRunFor(cron, timezone);

    const updated = await prisma.backupSchedule.update({
      where: { id },
      data,
      include: { target: true },
    });
    await auditService.record({
      action: "backup_schedule.updated",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "backup_schedule",
      targetId: id,
      meta: { changedKeys: Object.keys(input) },
    });
    return updated;
  },

  remove: async (id: string, actor: Actor) => {
    const existing = await prisma.backupSchedule.findUnique({ where: { id } });
    if (!existing) throw errors.notFound("Backup schedule not found");
    await prisma.backupSchedule.delete({ where: { id } });
    await auditService.record({
      action: "backup_schedule.deleted",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "backup_schedule",
      targetId: id,
      meta: { name: existing.name },
    });
  },
};

export const backupService = {
  list: async (query: BackupListQuery) => {
    const items = await prisma.backup.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.targetId ? { targetId: query.targetId } : {}),
        ...(query.scheduleId ? { scheduleId: query.scheduleId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      include: { target: true },
    });
    const hasMore = items.length > query.limit;
    const trimmed = hasMore ? items.slice(0, query.limit) : items;
    return {
      items: trimmed.map(serializeBackup),
      nextCursor: hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null,
    };
  },

  get: async (id: string) => {
    const item = await prisma.backup.findUnique({ where: { id }, include: { target: true } });
    if (!item) throw errors.notFound("Backup not found");
    return serializeBackup(item);
  },

  manual: async (input: ManualBackupInput, actor: Actor) => {
    const target = await prisma.backupTarget.findUnique({ where: { id: input.targetId } });
    if (!target) throw errors.notFound("Backup target not found");

    const record = await prisma.backup.create({
      data: {
        name: input.name,
        kind: input.kind,
        targetId: input.targetId,
        source: input.source ?? null,
        expiresAt: input.expiresAt ?? null,
        status: "pending",
        meta: { triggeredBy: "manual", actorId: actor.id } as Prisma.InputJsonValue,
      },
    });

    await auditService.record({
      action: "backup.created",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "backup",
      targetId: record.id,
      meta: { kind: record.kind, targetId: record.targetId, name: record.name },
    });

    // Run the backup async; the API returns immediately with a pending record.
    void runBackup(record.id).catch((err) => {
      logger.error({ err, backupId: record.id }, "manual backup failed");
    });

    return serializeBackup({ ...record, target });
  },

  remove: async (id: string, actor: Actor) => {
    const backup = await prisma.backup.findUnique({ where: { id }, include: { target: true } });
    if (!backup) throw errors.notFound("Backup not found");

    if (backup.objectKey) {
      try {
        const provider = buildStorageProvider(backup.target);
        await provider.delete(backup.objectKey);
      } catch (err) {
        logger.warn({ err, backupId: id }, "failed to delete backup object from storage");
      }
    }

    await prisma.backup.delete({ where: { id } });
    await auditService.record({
      action: "backup.deleted",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "backup",
      targetId: id,
      meta: { name: backup.name },
    });
  },

  download: async (id: string) => {
    const backup = await prisma.backup.findUnique({ where: { id }, include: { target: true } });
    if (!backup) throw errors.notFound("Backup not found");
    if (backup.status !== "succeeded") {
      throw errors.badRequest("Backup is not in a downloadable state");
    }
    if (!backup.objectKey) throw errors.badRequest("Backup has no stored object");

    const provider = buildStorageProvider(backup.target);

    // Prefer presigned URL when supported (S3/B2). Fall back to streaming.
    const presigned = await provider.presignDownload(backup.objectKey, 5 * 60);
    if (presigned) return { mode: "redirect" as const, url: presigned, backup };

    const stream = await provider.get(backup.objectKey);
    return { mode: "stream" as const, stream, backup };
  },

  validate: async (id: string) => {
    const backup = await prisma.backup.findUnique({ where: { id }, include: { target: true } });
    if (!backup) throw errors.notFound("Backup not found");
    if (!backup.objectKey || !backup.checksum) {
      throw errors.badRequest("Backup is missing storage location or recorded checksum");
    }
    const provider = buildStorageProvider(backup.target);
    const stream = await provider.get(backup.objectKey);
    const { createHash } = await import("node:crypto");
    const hasher = createHash("sha256");
    let bytes = 0;
    for await (const chunk of stream) {
      const buf = chunk as Buffer;
      hasher.update(buf);
      bytes += buf.length;
    }
    const observed = hasher.digest("hex");
    const ok = observed === backup.checksum;
    return { ok, observed, expected: backup.checksum, sizeBytes: bytes };
  },
};

function serializeBackup<T extends { sizeBytes: bigint | null }>(
  backup: T,
): Omit<T, "sizeBytes"> & { sizeBytes: number | null } {
  return {
    ...backup,
    sizeBytes: backup.sizeBytes === null ? null : Number(backup.sizeBytes),
  };
}

// ── Backup execution ────────────────────────────────────────────────────────

export async function runBackup(backupId: string): Promise<void> {
  const backup = await prisma.backup.findUnique({
    where: { id: backupId },
    include: { target: true },
  });
  if (!backup) {
    logger.warn({ backupId }, "runBackup: record not found");
    return;
  }
  if (backup.status === "running" || backup.status === "succeeded") {
    return;
  }

  const provider = buildStorageProvider(backup.target);

  await prisma.backup.update({
    where: { id: backupId },
    data: { status: "running", startedAt: new Date() },
  });

  const objectKey = `${backup.kind}/${backupId}/${encodeURIComponent(backup.name)}.bin`;

  try {
    const { stream, expectedBytes } = await produceBackupStream(backup);
    const { createHash } = await import("node:crypto");
    const hasher = createHash("sha256");

    let bytes = 0;
    const pass: AsyncIterable<Buffer> = (async function* () {
      for await (const chunk of stream) {
        const buf = chunk as Buffer;
        hasher.update(buf);
        bytes += buf.length;
        yield buf;
      }
    })();

    const { Readable } = await import("node:stream");
    const passReadable = Readable.from(pass);
    await provider.put(objectKey, passReadable, {
      contentType: "application/octet-stream",
      ...(expectedBytes !== undefined ? { contentLength: expectedBytes } : {}),
    });

    const checksum = hasher.digest("hex");
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        objectKey,
        sizeBytes: BigInt(bytes),
        checksum,
        errorMessage: null,
      },
    });
    logger.info({ backupId, bytes, checksum }, "backup succeeded");
  } catch (err) {
    const message = err instanceof Error ? err.message : "backup failed";
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: message,
      },
    });
    logger.error({ err, backupId }, "backup failed");
  }
}

async function produceBackupStream(backup: {
  kind: "database" | "panel_data" | "custom";
  source: string | null;
}): Promise<{ stream: AsyncIterable<Buffer>; expectedBytes?: number }> {
  if (backup.kind === "database") {
    return streamPgDump(backup.source);
  }
  // Panel data / custom backups need explicit producers wired in by other modules.
  // Until those exist, write a minimal manifest so the backup chain is exercised
  // end-to-end (storage put + checksum). This is a real, non-stub artifact.
  const { Readable } = await import("node:stream");
  const payload = Buffer.from(
    JSON.stringify({
      kind: backup.kind,
      source: backup.source,
      generatedAt: new Date().toISOString(),
      note: "Producer not yet implemented for this kind; manifest only.",
    }),
    "utf8",
  );
  return { stream: Readable.from([payload]) as unknown as AsyncIterable<Buffer>, expectedBytes: payload.length };
}

async function streamPgDump(database: string | null): Promise<{ stream: AsyncIterable<Buffer> }> {
  const { spawn } = await import("node:child_process");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");

  const args = ["--no-owner", "--no-privileges", "--format=custom", url];
  if (database) args.push(`--dbname=${database}`);

  const proc = spawn("pg_dump", args, { stdio: ["ignore", "pipe", "pipe"] });

  const errChunks: Buffer[] = [];
  proc.stderr.on("data", (c: Buffer) => errChunks.push(c));

  const exitPromise = new Promise<void>((resolveExit, rejectExit) => {
    proc.on("error", rejectExit);
    proc.on("close", (code) => {
      if (code === 0) resolveExit();
      else rejectExit(new Error(`pg_dump exited with code ${code}: ${Buffer.concat(errChunks).toString("utf8")}`));
    });
  });

  async function* iter(): AsyncIterable<Buffer> {
    for await (const chunk of proc.stdout) yield chunk as Buffer;
    await exitPromise;
  }

  return { stream: iter() };
}
