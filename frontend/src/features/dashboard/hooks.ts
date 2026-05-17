"use client";

import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useDashboardStore, dashboardSelectors } from "./store";
import {
  connectDashboardSocket,
  disconnectDashboardSocket,
  emitServerAction,
} from "./socket";
import { dashboardApi } from "./api";
import type { ServerAction } from "./types";

export function useDashboardRealtime(): void {
  useEffect(() => {
    const socket = connectDashboardSocket();
    let cancelled = false;

    void (async () => {
      try {
        const snapshot = await dashboardApi.getSnapshot();
        if (!cancelled) useDashboardStore.getState().hydrateSnapshot(snapshot);
      } catch {
        // realtime stream will hydrate via dashboard:snapshot
      }
    })();

    return () => {
      cancelled = true;
      socket.off();
      disconnectDashboardSocket();
    };
  }, []);
}

export function useServers() {
  return useDashboardStore(dashboardSelectors.servers);
}

export function useFilteredServers() {
  return useDashboardStore(dashboardSelectors.filteredServers);
}

export function useDashboardTotals() {
  return useDashboardStore(dashboardSelectors.totals);
}

export function useFavoriteServers() {
  return useDashboardStore(dashboardSelectors.favoriteServers);
}

export function useFavoriteToggler() {
  return useDashboardStore((s) => s.toggleFavorite);
}

export function useFavorites() {
  return useDashboardStore((s) => s.favorites);
}

export function useNotifications() {
  const items = useDashboardStore((s) => s.notifications);
  const unread = useDashboardStore(dashboardSelectors.unreadCount);
  const markRead = useDashboardStore((s) => s.markNotificationRead);
  const markAll = useDashboardStore((s) => s.markAllNotificationsRead);

  const markOneRead = useCallback(
    async (id: string) => {
      markRead(id);
      try {
        await dashboardApi.markNotificationRead(id);
      } catch {
        // optimistic UI; backend will reconcile
      }
    },
    [markRead],
  );

  const markAllRead = useCallback(async () => {
    markAll();
    try {
      await dashboardApi.markAllNotificationsRead();
    } catch {
      // optimistic UI
    }
  }, [markAll]);

  return useMemo(
    () => ({ items, unread, markOneRead, markAllRead }),
    [items, unread, markOneRead, markAllRead],
  );
}

export function useActivity() {
  return useDashboardStore((s) => s.activity);
}

export function useConnectionStatus() {
  const status = useDashboardStore((s) => s.connection);
  const error = useDashboardStore((s) => s.lastError);
  return { status, error };
}

export function useStatsHistory(serverId: string) {
  return useDashboardStore((s) => s.statsByServer[serverId] ?? []);
}

export function useSearch() {
  const search = useDashboardStore((s) => s.search);
  const setSearch = useDashboardStore((s) => s.setSearch);
  return { search, setSearch };
}

export function useServerAction() {
  return useCallback(async (serverId: string, action: ServerAction) => {
    emitServerAction(serverId, action);
    try {
      await dashboardApi.runServerAction(serverId, action);
      toast.success(actionLabel(action, "success"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : actionLabel(action, "error");
      toast.error(msg);
    }
  }, []);
}

function actionLabel(action: ServerAction, kind: "success" | "error"): string {
  const verb = action === "start" ? "Start" : action === "stop" ? "Stop" : "Restart";
  return kind === "success" ? `${verb} command sent` : `${verb} command failed`;
}
