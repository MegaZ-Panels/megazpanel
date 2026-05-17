import { create } from "zustand";
import type {
  ActivityItem,
  ConnectionStatus,
  DashboardSnapshot,
  NotificationItem,
  ServerStatus,
  ServerSummary,
  StatsSample,
} from "./types";

const STATS_HISTORY = 60;
const ACTIVITY_LIMIT = 200;
const NOTIFICATIONS_LIMIT = 100;
const FAVORITES_KEY = "mzp.dashboard.favorites";

type ServersById = Record<string, ServerSummary>;
type StatsByServer = Record<string, StatsSample[]>;

type DashboardState = {
  connection: ConnectionStatus;
  lastError: string | null;
  initialized: boolean;
  serversOrder: string[];
  serversById: ServersById;
  statsByServer: StatsByServer;
  activity: ActivityItem[];
  notifications: NotificationItem[];
  favorites: Set<string>;
  search: string;

  setConnection: (status: ConnectionStatus, error?: string | null) => void;
  hydrateSnapshot: (snapshot: DashboardSnapshot) => void;
  upsertServer: (server: ServerSummary) => void;
  removeServer: (serverId: string) => void;
  setServerStatus: (serverId: string, status: ServerStatus) => void;
  pushStats: (sample: StatsSample & { serverId: string }) => void;
  pushActivity: (item: ActivityItem) => void;
  pushNotification: (item: NotificationItem) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  toggleFavorite: (serverId: string) => void;
  setSearch: (query: string) => void;
  reset: () => void;
};

function loadFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function persistFavorites(favorites: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
  } catch {
    /* storage may be full or disabled; ignore */
  }
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  connection: "idle",
  lastError: null,
  initialized: false,
  serversOrder: [],
  serversById: {},
  statsByServer: {},
  activity: [],
  notifications: [],
  favorites: loadFavorites(),
  search: "",

  setConnection: (status, error = null) =>
    set({ connection: status, lastError: error ?? null }),

  hydrateSnapshot: (snapshot) => {
    const order: string[] = [];
    const byId: ServersById = {};
    const stats: StatsByServer = {};
    for (const s of snapshot.servers) {
      order.push(s.id);
      byId[s.id] = s;
      if (s.latest) stats[s.id] = [s.latest];
    }
    set({
      serversOrder: order,
      serversById: byId,
      statsByServer: stats,
      activity: snapshot.activity.slice(0, ACTIVITY_LIMIT),
      notifications: snapshot.notifications.slice(0, NOTIFICATIONS_LIMIT),
      initialized: true,
    });
  },

  upsertServer: (server) => {
    const { serversOrder, serversById } = get();
    const exists = serversById[server.id] !== undefined;
    set({
      serversById: { ...serversById, [server.id]: server },
      serversOrder: exists ? serversOrder : [...serversOrder, server.id],
    });
  },

  removeServer: (serverId) => {
    const { serversOrder, serversById, statsByServer } = get();
    if (!serversById[serverId]) return;
    const nextById = { ...serversById };
    delete nextById[serverId];
    const nextStats = { ...statsByServer };
    delete nextStats[serverId];
    set({
      serversOrder: serversOrder.filter((id) => id !== serverId),
      serversById: nextById,
      statsByServer: nextStats,
    });
  },

  setServerStatus: (serverId, status) => {
    const current = get().serversById[serverId];
    if (!current) return;
    set({
      serversById: { ...get().serversById, [serverId]: { ...current, status } },
    });
  },

  pushStats: ({ serverId, ...sample }) => {
    const state = get();
    const server = state.serversById[serverId];
    if (!server) return;
    const prev = state.statsByServer[serverId] ?? [];
    const next = prev.length >= STATS_HISTORY ? prev.slice(prev.length - STATS_HISTORY + 1) : prev;
    set({
      statsByServer: { ...state.statsByServer, [serverId]: [...next, sample] },
      serversById: {
        ...state.serversById,
        [serverId]: { ...server, latest: sample, lastSeenAt: new Date(sample.ts).toISOString() },
      },
    });
  },

  pushActivity: (item) => {
    const next = [item, ...get().activity];
    set({ activity: next.length > ACTIVITY_LIMIT ? next.slice(0, ACTIVITY_LIMIT) : next });
  },

  pushNotification: (item) => {
    const next = [item, ...get().notifications];
    set({ notifications: next.length > NOTIFICATIONS_LIMIT ? next.slice(0, NOTIFICATIONS_LIMIT) : next });
  },

  markNotificationRead: (id) =>
    set({
      notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }),

  markAllNotificationsRead: () =>
    set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),

  toggleFavorite: (serverId) => {
    const next = new Set(get().favorites);
    if (next.has(serverId)) next.delete(serverId);
    else next.add(serverId);
    persistFavorites(next);
    set({ favorites: next });
  },

  setSearch: (query) => set({ search: query }),

  reset: () =>
    set({
      connection: "idle",
      lastError: null,
      initialized: false,
      serversOrder: [],
      serversById: {},
      statsByServer: {},
      activity: [],
      notifications: [],
      search: "",
    }),
}));

export const dashboardSelectors = {
  servers: (state: DashboardState): ServerSummary[] =>
    state.serversOrder
      .map((id) => state.serversById[id])
      .filter((s): s is ServerSummary => Boolean(s)),

  filteredServers: (state: DashboardState): ServerSummary[] => {
    const all = dashboardSelectors.servers(state);
    const q = state.search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((s) => {
      const haystack = [s.name, s.hostname, s.ipv4 ?? "", s.region ?? "", ...s.tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  },

  unreadCount: (state: DashboardState): number =>
    state.notifications.reduce((n, item) => n + (item.read ? 0 : 1), 0),

  totals: (state: DashboardState) => {
    const servers = dashboardSelectors.servers(state);
    const total = servers.length;
    const online = servers.filter((s) => s.status === "online").length;
    const degraded = servers.filter((s) => s.status === "degraded").length;
    const offline = servers.filter(
      (s) => s.status === "offline" || s.status === "unknown",
    ).length;
    const cpuAvg =
      total === 0
        ? 0
        : servers.reduce((acc, s) => acc + (s.latest?.cpu ?? 0), 0) / total;
    const memAvg =
      total === 0
        ? 0
        : servers.reduce((acc, s) => acc + (s.latest?.mem ?? 0), 0) / total;
    return { total, online, degraded, offline, cpuAvg, memAvg };
  },

  favoriteServers: (state: DashboardState): ServerSummary[] =>
    dashboardSelectors.servers(state).filter((s) => state.favorites.has(s.id)),
};
