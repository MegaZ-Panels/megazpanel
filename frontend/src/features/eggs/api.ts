import { api } from "@/shared/lib/axios";

export type EggSummaryDTO = {
  id: string;
  uuid: string;
  nestId: string;
  name: string;
  description: string | null;
  category: string | null;
  defaultDockerImage: string;
  startup: string;
};

export type EggVariableDTO = {
  id: string;
  name: string;
  description: string | null;
  envVariable: string;
  defaultValue: string | null;
  userViewable: boolean;
  userEditable: boolean;
  rules: string;
  sortOrder: number;
};

export type EggDetailDTO = EggSummaryDTO & {
  dockerImages: Record<string, string>;
  variables: EggVariableDTO[];
};

export const eggsApi = {
  async list(params?: { search?: string; nestId?: string; cursor?: string; limit?: number }): Promise<{
    items: EggSummaryDTO[];
    nextCursor: string | null;
  }> {
    const { data } = await api.get<{ items: EggSummaryDTO[]; nextCursor: string | null }>(
      "/admin/eggs",
      { params },
    );
    return data;
  },

  async get(id: string): Promise<EggDetailDTO> {
    const { data } = await api.get<{ data: EggDetailDTO }>(`/admin/eggs/${id}`);
    return data.data;
  },
};
