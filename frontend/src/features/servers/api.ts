import { api } from "@/shared/lib/axios";
import type {
  ServerCreateInput,
  ServerDetailDTO,
  ServerListResponse,
  ServerUpdateInput,
} from "./types";

export const adminServersApi = {
  async list(params?: {
    search?: string;
    nodeId?: string;
    ownerId?: string;
    installStatus?: string;
    suspended?: "true" | "false";
    cursor?: string;
    limit?: number;
  }): Promise<ServerListResponse> {
    const { data } = await api.get<ServerListResponse>("/admin/servers", { params });
    return data;
  },

  async get(id: string): Promise<ServerDetailDTO> {
    const { data } = await api.get<{ data: ServerDetailDTO }>(`/admin/servers/${id}`);
    return data.data;
  },

  async create(input: ServerCreateInput): Promise<ServerDetailDTO> {
    const { data } = await api.post<{ data: ServerDetailDTO }>("/admin/servers", input);
    return data.data;
  },

  async update(id: string, input: ServerUpdateInput): Promise<ServerDetailDTO> {
    const { data } = await api.patch<{ data: ServerDetailDTO }>(`/admin/servers/${id}`, input);
    return data.data;
  },

  async setSuspended(id: string, suspended: boolean): Promise<ServerDetailDTO> {
    const { data } = await api.post<{ data: ServerDetailDTO }>(
      `/admin/servers/${id}/suspend`,
      { suspended },
    );
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/admin/servers/${id}`);
  },
};

export const clientServersApi = {
  async listMine(params?: { search?: string; cursor?: string; limit?: number }): Promise<ServerListResponse> {
    const { data } = await api.get<ServerListResponse>("/client/servers", { params });
    return data;
  },

  async getMine(identifier: string): Promise<ServerDetailDTO> {
    const { data } = await api.get<{ data: ServerDetailDTO }>(
      `/client/servers/${identifier}`,
    );
    return data.data;
  },
};
