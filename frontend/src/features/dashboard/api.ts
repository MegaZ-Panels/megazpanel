import { api } from "@/shared/lib/axios";
import type { DashboardSnapshot, ServerAction } from "./types";

export const dashboardApi = {
  async getSnapshot(): Promise<DashboardSnapshot> {
    const { data } = await api.get<DashboardSnapshot>("/dashboard/snapshot");
    return data;
  },

  async runServerAction(serverId: string, action: ServerAction): Promise<void> {
    await api.post(`/servers/${encodeURIComponent(serverId)}/actions`, { action });
  },

  async markNotificationRead(id: string): Promise<void> {
    await api.post(`/notifications/${encodeURIComponent(id)}/read`, {});
  },

  async markAllNotificationsRead(): Promise<void> {
    await api.post("/notifications/read-all", {});
  },
};
