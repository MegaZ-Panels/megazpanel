export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const unit = units[i] ?? "B";
  return `${(bytes / Math.pow(1024, i)).toFixed(decimals)} ${unit}`;
}

export function formatBitrate(bytesPerSecond: number): string {
  const bps = bytesPerSecond * 8;
  if (!Number.isFinite(bps) || bps <= 0) return "0 bps";
  const units = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
  const i = Math.min(Math.floor(Math.log(bps) / Math.log(1000)), units.length - 1);
  const unit = units[i] ?? "bps";
  return `${(bps / Math.pow(1000, i)).toFixed(1)} ${unit}`;
}

export function formatPercent(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatRelativeTime(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const now = Date.now();
  const diff = (now - date.getTime()) / 1000;
  if (!Number.isFinite(diff)) return "—";
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

export function initialsOf(name: string | null | undefined, fallback = "MZ"): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return fallback;
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}
