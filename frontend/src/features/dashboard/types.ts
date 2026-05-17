export type ServerStatus = "online" | "offline" | "starting" | "stopping" | "degraded" | "unknown";

export type ServerAction = "start" | "stop" | "restart";

export type NetworkSample = {
  rxBps: number;
  txBps: number;
};

export type StatsSample = {
  ts: number;
  cpu: number; // 0..100
  mem: number; // 0..100
  disk: number; // 0..100
  net: NetworkSample;
};

export type ServerSummary = {
  id: string;
  name: string;
  hostname: string;
  ipv4: string | null;
  region: string | null;
  status: ServerStatus;
  os: string | null;
  cpuCores: number;
  memTotalBytes: number;
  diskTotalBytes: number;
  uptimeSeconds: number;
  latencyMs: number | null;
  lastSeenAt: string | null;
  tags: string[];
  latest: StatsSample | null;
};

export type ActivityKind =
  | "server.started"
  | "server.stopped"
  | "server.restarted"
  | "server.added"
  | "server.removed"
  | "server.alert"
  | "auth.login"
  | "auth.logout"
  | "user.invited"
  | "system.update";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  message: string;
  serverId: string | null;
  actorName: string | null;
  level: "info" | "warning" | "error" | "success";
  occurredAt: string;
};

export type NotificationLevel = "info" | "warning" | "error" | "success";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  level: NotificationLevel;
  read: boolean;
  href: string | null;
  createdAt: string;
};

export type DashboardSnapshot = {
  servers: ServerSummary[];
  activity: ActivityItem[];
  notifications: NotificationItem[];
};

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";
