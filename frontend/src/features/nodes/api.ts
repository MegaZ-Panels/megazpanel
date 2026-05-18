import { api } from "@/shared/lib/axios";
import type {
  AllocationBulkCreateInput,
  AllocationCreateInput,
  AllocationDTO,
  AllocationListResponse,
  NodeCreateInput,
  NodeDTO,
  NodeListResponse,
  NodeUpdateInput,
  NodeWithToken,
} from "./types";

export const nodesApi = {
  async list(params?: { search?: string; cursor?: string; limit?: number }): Promise<NodeListResponse> {
    const { data } = await api.get<NodeListResponse>("/admin/nodes", { params });
    return data;
  },

  async get(id: string): Promise<NodeDTO> {
    const { data } = await api.get<{ data: NodeDTO }>(`/admin/nodes/${id}`);
    return data.data;
  },

  async create(input: NodeCreateInput): Promise<NodeWithToken> {
    const { data } = await api.post<{ data: NodeWithToken }>("/admin/nodes", input);
    return data.data;
  },

  async update(id: string, input: NodeUpdateInput): Promise<NodeDTO> {
    const { data } = await api.patch<{ data: NodeDTO }>(`/admin/nodes/${id}`, input);
    return data.data;
  },

  async rotateToken(id: string): Promise<NodeWithToken> {
    const { data } = await api.post<{ data: NodeWithToken }>(`/admin/nodes/${id}/rotate-token`);
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/admin/nodes/${id}`);
  },

  // ── Allocations (per-node nested) ─────────────────────────────────────────
  async listAllocations(
    nodeId: string,
    params?: {
      search?: string;
      assigned?: "true" | "false";
      cursor?: string;
      limit?: number;
    },
  ): Promise<AllocationListResponse> {
    const { data } = await api.get<AllocationListResponse>(
      `/admin/nodes/${nodeId}/allocations`,
      { params },
    );
    return data;
  },

  async createAllocation(
    nodeId: string,
    input: AllocationCreateInput,
  ): Promise<AllocationDTO> {
    const { data } = await api.post<{ data: AllocationDTO }>(
      `/admin/nodes/${nodeId}/allocations`,
      input,
    );
    return data.data;
  },

  async bulkCreateAllocations(
    nodeId: string,
    input: AllocationBulkCreateInput,
  ): Promise<{ created: number; requested: number }> {
    const { data } = await api.post<{ data: { created: number; requested: number } }>(
      `/admin/nodes/${nodeId}/allocations/bulk`,
      input,
    );
    return data.data;
  },

  async deleteAllocation(id: string): Promise<void> {
    await api.delete(`/admin/allocations/${id}`);
  },
};
