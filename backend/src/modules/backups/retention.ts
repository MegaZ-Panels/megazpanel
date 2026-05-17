import { prisma } from "@/core/db";
import { logger } from "@/core/logger";
import { buildStorageProvider } from "@/platform/storage";

export type RetentionResult = {
  evaluated: number;
  expired: number;
  deleted: number;
};

/**
 * Evaluate retention rules across all enabled backup schedules and:
 *  1. mark old/excess Backups as `expired`
 *  2. delete the underlying objects from storage
 *  3. delete the Backup row
 */
export async function runRetentionSweep(): Promise<RetentionResult> {
  const schedules = await prisma.backupSchedule.findMany({
    where: { enabled: true, OR: [{ retentionCount: { not: null } }, { retentionDays: { not: null } }] },
  });

  let evaluated = 0;
  let expired = 0;
  let deleted = 0;

  for (const schedule of schedules) {
    const backups = await prisma.backup.findMany({
      where: { scheduleId: schedule.id, status: { in: ["succeeded", "expired"] } },
      orderBy: { createdAt: "desc" },
      include: { target: true },
    });
    evaluated += backups.length;

    const toExpire: typeof backups = [];

    if (schedule.retentionCount && backups.length > schedule.retentionCount) {
      toExpire.push(...backups.slice(schedule.retentionCount));
    }
    if (schedule.retentionDays) {
      const cutoff = Date.now() - schedule.retentionDays * 24 * 60 * 60 * 1000;
      for (const b of backups) {
        if (b.createdAt.getTime() < cutoff && !toExpire.includes(b)) toExpire.push(b);
      }
    }

    for (const b of toExpire) {
      if (b.status !== "expired") {
        await prisma.backup.update({ where: { id: b.id }, data: { status: "expired" } });
        expired++;
      }
      if (b.objectKey) {
        try {
          const provider = buildStorageProvider(b.target);
          await provider.delete(b.objectKey);
        } catch (err) {
          logger.warn({ err, backupId: b.id }, "retention: failed to delete object");
          continue;
        }
      }
      await prisma.backup.delete({ where: { id: b.id } });
      deleted++;
    }
  }

  logger.info({ evaluated, expired, deleted }, "retention sweep complete");
  return { evaluated, expired, deleted };
}

export async function runSessionCleanup(): Promise<{ removedSessions: number; removedTokens: number }> {
  const now = new Date();
  const sessions = await prisma.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }],
    },
  });
  const tokens = await prisma.verificationToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });
  logger.info(
    { removedSessions: sessions.count, removedTokens: tokens.count },
    "session/token cleanup complete",
  );
  return { removedSessions: sessions.count, removedTokens: tokens.count };
}
