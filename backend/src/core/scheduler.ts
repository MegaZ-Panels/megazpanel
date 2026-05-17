import { Cron } from "croner";
import { logger } from "./logger";

type Job = {
  name: string;
  cron: string;
  timezone: string | undefined;
  fn: () => Promise<void> | void;
  instance: Cron;
};

const jobs = new Map<string, Job>();

export type ScheduleHandle = {
  name: string;
  cron: string;
  next(): Date | null;
  stop(): void;
};

export function scheduleJob(opts: {
  name: string;
  cron: string;
  timezone?: string;
  fn: () => Promise<void> | void;
}): ScheduleHandle {
  cancelJob(opts.name);

  const instance = new Cron(
    opts.cron,
    { name: opts.name, timezone: opts.timezone, protect: true },
    () => {
      void runOnce(opts.name, opts.fn);
    },
  );

  jobs.set(opts.name, {
    name: opts.name,
    cron: opts.cron,
    timezone: opts.timezone,
    fn: opts.fn,
    instance,
  });

  logger.info({ name: opts.name, cron: opts.cron, next: instance.nextRun()?.toISOString() }, "scheduled job");

  return {
    name: opts.name,
    cron: opts.cron,
    next: () => instance.nextRun(),
    stop: () => cancelJob(opts.name),
  };
}

export function cancelJob(name: string): boolean {
  const existing = jobs.get(name);
  if (!existing) return false;
  existing.instance.stop();
  jobs.delete(name);
  return true;
}

export function listJobs(): Array<{ name: string; cron: string; next: Date | null }> {
  return Array.from(jobs.values()).map((j) => ({
    name: j.name,
    cron: j.cron,
    next: j.instance.nextRun(),
  }));
}

export function isValidCron(expression: string, timezone?: string): boolean {
  try {
    const c = new Cron(expression, { timezone, paused: true });
    c.stop();
    return true;
  } catch {
    return false;
  }
}

export function nextRunFor(expression: string, timezone?: string): Date | null {
  try {
    const c = new Cron(expression, { timezone, paused: true });
    const next = c.nextRun();
    c.stop();
    return next;
  } catch {
    return null;
  }
}

export function stopAllJobs(): void {
  for (const job of jobs.values()) job.instance.stop();
  jobs.clear();
}

async function runOnce(name: string, fn: () => Promise<void> | void): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    logger.debug({ name, durationMs: Date.now() - start }, "scheduled job ran");
  } catch (err) {
    logger.error({ err, name }, "scheduled job failed");
  }
}
