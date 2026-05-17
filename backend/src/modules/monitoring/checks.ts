import { Socket } from "node:net";
import { TLSSocket, connect as tlsConnect } from "node:tls";
import { spawn } from "node:child_process";
import { statfs } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { prisma } from "@/core/db";
import type { MonitoringCheckKind } from "@prisma/client";

export type CheckResult = { ok: true; message: string } | { ok: false; message: string };

export const checkRunners: Record<
  MonitoringCheckKind,
  (config: Record<string, unknown>) => Promise<CheckResult>
> = {
  http_health: runHttpHealth,
  tcp_port: runTcpPort,
  systemd_unit: runSystemdUnit,
  postgres_ping: runPostgresPing,
  backup_age: runBackupAge,
  disk_usage: runDiskUsage,
  memory_usage: runMemoryUsage,
  cert_expiry: runCertExpiry,
  scheduled_task: runScheduledTask,
};

async function runHttpHealth(config: Record<string, unknown>): Promise<CheckResult> {
  const url = String(config.url ?? "");
  const timeoutMs = Number(config.timeoutMs ?? 5_000);
  const expectStatusBelow = Number(config.expectStatusBelow ?? 400);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (res.status >= expectStatusBelow) {
      return { ok: false, message: `HTTP ${res.status} from ${url}` };
    }
    return { ok: true, message: `HTTP ${res.status} from ${url}` };
  } catch (err) {
    return { ok: false, message: `HTTP request failed: ${describeError(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

function runTcpPort(config: Record<string, unknown>): Promise<CheckResult> {
  const host = String(config.host ?? "127.0.0.1");
  const port = Number(config.port);
  const timeoutMs = Number(config.timeoutMs ?? 3_000);
  return new Promise((resolve) => {
    const socket = new Socket();
    let resolved = false;
    const finish = (result: CheckResult) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true, message: `connected to ${host}:${port}` }));
    socket.once("timeout", () => finish({ ok: false, message: `timeout connecting to ${host}:${port}` }));
    socket.once("error", (err) =>
      finish({ ok: false, message: `tcp error: ${describeError(err)}` }),
    );
    socket.connect(port, host);
  });
}

function runSystemdUnit(config: Record<string, unknown>): Promise<CheckResult> {
  const unit = String(config.unit ?? "");
  return new Promise((resolve) => {
    const child = spawn("systemctl", ["is-active", "--quiet", unit], { stdio: "ignore" });
    child.on("error", (err) =>
      resolve({ ok: false, message: `systemctl error: ${describeError(err)}` }),
    );
    child.on("exit", (code) => {
      if (code === 0) resolve({ ok: true, message: `${unit} is active` });
      else resolve({ ok: false, message: `${unit} is not active (exit ${code})` });
    });
  });
}

async function runPostgresPing(): Promise<CheckResult> {
  try {
    await prisma.$queryRawUnsafe<{ ok: number }[]>("SELECT 1 AS ok");
    return { ok: true, message: "postgres reachable" };
  } catch (err) {
    return { ok: false, message: `postgres ping failed: ${describeError(err)}` };
  }
}

async function runBackupAge(config: Record<string, unknown>): Promise<CheckResult> {
  const maxAgeHours = Number(config.maxAgeHours ?? 24);
  const scheduleId = typeof config.scheduleId === "string" ? config.scheduleId : undefined;
  const targetId = typeof config.targetId === "string" ? config.targetId : undefined;
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const last = await prisma.backup.findFirst({
    where: {
      status: "succeeded",
      ...(scheduleId ? { scheduleId } : {}),
      ...(targetId ? { targetId } : {}),
    },
    orderBy: { finishedAt: "desc" },
  });

  if (!last) return { ok: false, message: "no successful backup found" };
  const finishedAt = last.finishedAt ?? last.createdAt;
  if (finishedAt.getTime() < cutoff.getTime()) {
    const ageH = ((Date.now() - finishedAt.getTime()) / 36e5).toFixed(1);
    return { ok: false, message: `latest successful backup is ${ageH}h old (>${maxAgeHours}h)` };
  }
  return { ok: true, message: `latest backup at ${finishedAt.toISOString()}` };
}

async function runDiskUsage(config: Record<string, unknown>): Promise<CheckResult> {
  const path = String(config.path ?? "/");
  const warnPercent = Number(config.warnPercent ?? 85);
  try {
    const s = await statfs(path);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    if (total <= 0) return { ok: false, message: `${path}: cannot compute total size` };
    const used = total - free;
    const usedPercent = (used / total) * 100;
    if (usedPercent >= warnPercent) {
      return {
        ok: false,
        message: `${path}: ${usedPercent.toFixed(1)}% used (>= ${warnPercent}%)`,
      };
    }
    return { ok: true, message: `${path}: ${usedPercent.toFixed(1)}% used` };
  } catch (err) {
    return { ok: false, message: `disk_usage failed for ${path}: ${describeError(err)}` };
  }
}

async function runMemoryUsage(config: Record<string, unknown>): Promise<CheckResult> {
  const warnPercent = Number(config.warnPercent ?? 85);
  try {
    const text = await readFile("/proc/meminfo", "utf8");
    const total = matchKb(text, "MemTotal");
    const available = matchKb(text, "MemAvailable");
    if (total === null || available === null) {
      return { ok: false, message: "could not parse /proc/meminfo" };
    }
    const usedPercent = ((total - available) / total) * 100;
    if (usedPercent >= warnPercent) {
      return {
        ok: false,
        message: `memory ${usedPercent.toFixed(1)}% used (>= ${warnPercent}%)`,
      };
    }
    return { ok: true, message: `memory ${usedPercent.toFixed(1)}% used` };
  } catch (err) {
    return { ok: false, message: `memory_usage failed: ${describeError(err)}` };
  }
}

function matchKb(text: string, key: string): number | null {
  const m = text.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, "m"));
  return m && m[1] ? Number(m[1]) : null;
}

function runCertExpiry(config: Record<string, unknown>): Promise<CheckResult> {
  const host = String(config.host ?? "");
  const port = Number(config.port ?? 443);
  const warnDays = Number(config.warnDays ?? 14);
  const servername = typeof config.servername === "string" && config.servername.length > 0
    ? config.servername
    : host;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: CheckResult) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };
    const socket: TLSSocket = tlsConnect(
      { host, port, servername, rejectUnauthorized: false, timeout: 8000 },
      () => {
        const cert = socket.getPeerCertificate(false);
        if (!cert || !cert.valid_to) {
          finish({ ok: false, message: `${host}: no peer certificate returned` });
          return;
        }
        const expiry = new Date(cert.valid_to);
        const days = (expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        if (days < 0) finish({ ok: false, message: `${host}: cert expired ${expiry.toISOString()}` });
        else if (days < warnDays)
          finish({ ok: false, message: `${host}: cert expires in ${days.toFixed(1)} days` });
        else finish({ ok: true, message: `${host}: cert valid for ${days.toFixed(0)} days` });
      },
    );
    socket.on("timeout", () => finish({ ok: false, message: `${host}: tls timeout` }));
    socket.on("error", (err) => finish({ ok: false, message: `${host}: ${describeError(err)}` }));
  });
}

async function runScheduledTask(config: Record<string, unknown>): Promise<CheckResult> {
  const taskName = String(config.taskName ?? "");
  const maxAgeMinutes = Number(config.maxAgeMinutes ?? 15);
  const task = await prisma.scheduledTask.findUnique({ where: { name: taskName } });
  if (!task) return { ok: false, message: `scheduled task '${taskName}' not found` };
  if (!task.enabled) return { ok: false, message: `scheduled task '${taskName}' is disabled` };
  if (task.status === "failed") {
    return {
      ok: false,
      message: `scheduled task '${taskName}' last failed: ${task.lastError ?? "unknown error"}`,
    };
  }
  if (!task.lastRunAt) return { ok: false, message: `scheduled task '${taskName}' has not run yet` };
  const ageMs = Date.now() - task.lastRunAt.getTime();
  if (ageMs > maxAgeMinutes * 60_000) {
    return {
      ok: false,
      message: `scheduled task '${taskName}' last ran ${(ageMs / 60_000).toFixed(1)} minutes ago`,
    };
  }
  return {
    ok: true,
    message: `scheduled task '${taskName}' last ran ${(ageMs / 60_000).toFixed(1)} minutes ago`,
  };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
