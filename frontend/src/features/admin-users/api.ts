import { api } from "@/shared/lib/axios";
import type {
  AdminUserCreateInput,
  AdminUserDTO,
  AdminUserListResponse,
  AdminUserRolesInput,
  AdminUserUpdateInput,
  Role,
  UserStatus,
} from "./types";

export const adminUsersApi = {
  async list(params?: {
    search?: string;
    status?: UserStatus;
    role?: Role;
    cursor?: string;
    limit?: number;
  }): Promise<AdminUserListResponse> {
    const { data } = await api.get<AdminUserListResponse>("/admin/users", { params });
    return data;
  },

  async get(id: string): Promise<AdminUserDTO> {
    const { data } = await api.get<{ data: AdminUserDTO }>(`/admin/users/${id}`);
    return data.data;
  },

  async create(input: AdminUserCreateInput): Promise<AdminUserDTO> {
    const { data } = await api.post<{ data: AdminUserDTO }>("/admin/users", input);
    return data.data;
  },

  async update(id: string, input: AdminUserUpdateInput): Promise<AdminUserDTO> {
    const { data } = await api.patch<{ data: AdminUserDTO }>(`/admin/users/${id}`, input);
    return data.data;
  },

  async setRoles(id: string, input: AdminUserRolesInput): Promise<AdminUserDTO> {
    const { data } = await api.put<{ data: AdminUserDTO }>(`/admin/users/${id}/roles`, input);
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/admin/users/${id}`);
  },
};
