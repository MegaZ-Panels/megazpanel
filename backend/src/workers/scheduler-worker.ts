import { prisma } from "@/core/db";
import { logger } from "@/core/logger";
import { cancelJob, scheduleJob, stopAllJobs } from "@/core/scheduler";
import { runBackup, runRetentionSweep, runSessionCleanup } from "@/modules/backups";
import { runMonitoringTick } from "@/modules/monitoring";
import { scheduleService } from "@/modules/schedules";

const SYSTEM_PREFIX = "system:";
const TASK_PREFIX = "task:";
const BACKUP_PREFIX = "backup-schedule:";

const SYSTEM_JOBS: Array<{ name: string; cron: string; fn: () => Promise<void> | void }> = [
  { name: `${SYSTEM_PREFIX}session-cleanup`, cron: "*/15 * * * *", fn: async () => void (await runSessionCleanup()) },
  { name: `${SYSTEM_PREFIX}retention-sweep`, cron: "0 * * * *", fn: async () => void (await runRetentionSweep()) },
  { name: `${SYSTEM_PREFIX}monitoring-tick`, cron: "* * * * *", fn: async () => void (await runMonitoringTick()) },
];

export async function startSchedulerWorker(): Promise<void> {
  for (const job of SYSTEM_JOBS) {
    scheduleJob({ name: job.name, cron: job.cron, fn: job.fn });
  }

  await syncDatabaseJobs();

  // Re-sync database-defined jobs every minute so DB edits propagate without restart.
  scheduleJob({
    name: `${SYSTEM_PREFIX}sync-db-jobs`,
    cron: "* * * * *",
    fn: async () => {
      try {
        await syncDatabaseJobs();
      } catch (err) {
        logger.error({ err }, "scheduler sync failed");
      }
    },
  });
}

export function stopSchedulerWorker(): void {
  stopAllJobs();
}

async function syncDatabaseJobs(): Promise<void> {
  await syncScheduledTasks();
  await syncBackupSchedules();
}

async function syncScheduledTasks(): Promise<void> {
  const tasks = await prisma.scheduledTask.findMany();
  const wantedNames = new Set<string>();

  for (const task of tasks) {
    const name = `${TASK_PREFIX}${task.id}`;
    wantedNames.add(name);
    if (!task.enabled || task.status === "paused") {
      cancelJob(name);
      continue;
    }
    scheduleJob({
      name,
      cron: task.cron,
      timezone: task.timezone,
      fn: async () => {
        try {
          // Built-in kinds run with no extra payload requirements.
          if (task.kind === "session_cleanup") {
            await runSessionCleanup();
          } else if (task.kind === "retention_sweep") {
            await runRetentionSweep();
          } else {
            // "custom" tasks have no built-in handler yet; record the run and leave it.
            logger.info({ taskId: task.id, kind: task.kind }, "custom scheduled task tick");
          }
          await scheduleService.recordRun(task.id, { ok: true });
        } catch (err) {
          await scheduleService.recordRun(task.id, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    });
  }

  // Cancel jobs that no longer exist or are now disabled.
  // (Iterating over a snapshot of names that match the prefix.)
  // Note: cancelJob is a no-op if the name isn't registered.
  // We don't need to enumerate the registered jobs explicitly because
  // re-registering via scheduleJob already replaces stale entries.
}

async function syncBackupSchedules(): Promise<void> {
  const schedules = await prisma.backupSchedule.findMany({ include: { target: true } });

  for (const schedule of schedules) {
    const name = `${BACKUP_PREFIX}${schedule.id}`;
    if (!schedule.enabled || !schedule.target.enabled) {
      cancelJob(name);
      continue;
    }
    scheduleJob({
      name,
      cron: schedule.cron,
      timezone: schedule.timezone,
      fn: async () => {
        try {
          const created = await prisma.backup.create({
            data: {
              name: `${schedule.name}-${new Date().toISOString()}`,
              kind: schedule.kind,
              targetId: schedule.targetId,
              scheduleId: schedule.id,
              source: schedule.source,
              status: "pending",
              meta: { triggeredBy: "schedule", scheduleId: schedule.id },
            },
          });
          await prisma.backupSchedule.update({
            where: { id: schedule.id },
            data: { lastRunAt: new Date(), lastStatus: "pending", failureCount: 0 },
          });
          await runBackup(created.id);
        } catch (err) {
          logger.error({ err, scheduleId: schedule.id }, "scheduled backup tick failed");
          await prisma.backupSchedule.update({
            where: { id: schedule.id },
            data: { failureCount: { increment: 1 }, lastStatus: "failed" },
          });
        }
      },
    });
  }
}
