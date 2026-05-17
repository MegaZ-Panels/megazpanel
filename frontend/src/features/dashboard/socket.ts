import { io, type Socket } from "socket.io-client";
import { useDashboardStore } from "./store";
import type {
  ActivityItem,
  DashboardSnapshot,
  NotificationItem,
  ServerStatus,
  ServerSummary,
  StatsSample,
} from "./types";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "https" : "http"}://${window.location.host}`
    : "");
const WS_PATH = process.env.NEXT_PUBLIC_WS_PATH ?? "/socket.io";

export type DashboardServerEvents = {
  "dashboard:snapshot": (payload: DashboardSnapshot) => void;
  "server:upserted": (payload: ServerSummary) => void;
  "server:removed": (payload: { id: string }) => void;
  "server:status": (payload: { id: string; status: ServerStatus }) => void;
  "server:stats": (payload: StatsSample & { serverId: string }) => void;
  "activity:event": (payload: ActivityItem) => void;
  "notifications:event": (payload: NotificationItem) => void;
  "error": (payload: { message: string }) => void;
};

export type DashboardClientEvents = {
  "dashboard:subscribe": () => void;
  "dashboard:unsubscribe": () => void;
  "server:action": (payload: { serverId: string; action: "start" | "stop" | "restart" }) => void;
};

export type DashboardSocket = Socket<DashboardServerEvents, DashboardClientEvents>;

let socketInstance: DashboardSocket | null = null;

export function getDashboardSocket(): DashboardSocket {
  if (socketInstance) return socketInstance;

  const socket: DashboardSocket = io(WS_URL, {
    path: WS_PATH,
    withCredentials: true,
    transports: ["websocket"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    timeout: 10_000,
  });

  const store = useDashboardStore.getState;

  socket.on("connect", () => {
    store().setConnection("connected");
    socket.emit("dashboard:subscribe");
  });
  socket.on("disconnect", (reason) => {
    store().setConnection(reason === "io client disconnect" ? "disconnected" : "reconnecting");
  });
  socket.io.on("reconnect_attempt", () => store().setConnection("reconnecting"));
  socket.io.on("error", (err) => store().setConnection("reconnecting", err.message));
  socket.on("connect_error", (err) => store().setConnection("reconnecting", err.message));

  socket.on("dashboard:snapshot", (payload) => store().hydrateSnapshot(payload));
  socket.on("server:upserted", (payload) => store().upsertServer(payload));
  socket.on("server:removed", ({ id }) => store().removeServer(id));
  socket.on("server:status", ({ id, status }) => store().setServerStatus(id, status));
  socket.on("server:stats", (payload) => store().pushStats(payload));
  socket.on("activity:event", (payload) => store().pushActivity(payload));
  socket.on("notifications:event", (payload) => store().pushNotification(payload));

  socketInstance = socket;
  return socket;
}

export function connectDashboardSocket(): DashboardSocket {
  const socket = getDashboardSocket();
  if (!socket.connected) {
    useDashboardStore.getState().setConnection("connecting");
    socket.connect();
  }
  return socket;
}

export function disconnectDashboardSocket(): void {
  if (!socketInstance) return;
  try {
    socketInstance.emit("dashboard:unsubscribe");
  } catch {
    /* socket may already be closed */
  }
  socketInstance.disconnect();
  useDashboardStore.getState().setConnection("disconnected");
}

export function emitServerAction(
  serverId: string,
  action: "start" | "stop" | "restart",
): void {
  const socket = getDashboardSocket();
  if (!socket.connected) return;
  socket.emit("server:action", { serverId, action });
}
