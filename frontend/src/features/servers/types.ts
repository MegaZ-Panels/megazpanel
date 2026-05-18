export type ServerSummaryDTO = {
  id: string;
  uuid: string;
  identifier: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerEmail: string;
  ownerName: string | null;
  nodeId: string;
  nodeName: string;
  eggId: string;
  eggName: string;
  memoryMb: number;
  diskMb: number;
  cpuLimit: number;
  installStatus: "pending" | "installing" | "install_failed" | "installed";
  suspended: boolean;
  lastKnownState: string | null;
  lastStateAt: string | null;
  primaryAllocation: {
    id: string;
    ip: string;
    alias: string | null;
    port: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ServerVariableDTO = {
  id: string;
  eggVariableId: string;
  name: string;
  envVariable: string;
  value: string;
  rules: string;
  userEditable: boolean;
  userViewable: boolean;
  sortOrder: number;
};

export type ServerDetailDTO = ServerSummaryDTO & {
  ownerObj: { id: string; email: string; name: string | null };
  nodeObj: { id: string; uuid: string; name: string; fqdn: string };
  eggObj: {
    id: string;
    uuid: string;
    name: string;
    defaultDockerImage: string;
    startup: string;
  };
  allocations: Array<{
    id: string;
    ip: string;
    alias: string | null;
    port: number;
  }>;
  image: string;
  startupOverride: string | null;
  environment: Record<string, string>;
  swapMb: number;
  ioWeight: number;
  threads: string | null;
  backupLimit: number;
  databaseLimit: number;
  allocationLimit: number;
  variables: ServerVariableDTO[];
};

export type ServerListResponse = {
  items: ServerSummaryDTO[];
  nextCursor: string | null;
};

export type ServerCreateInput = {
  name: string;
  description?: string | null;
  ownerId: string;
  nodeId: string;
  eggId: string;
  allocationId: string;
  image?: string;
  startupOverride?: string | null;
  environment?: Record<string, string>;
  memoryMb: number;
  swapMb?: number;
  diskMb: number;
  ioWeight?: number;
  cpuLimit?: number;
  threads?: string | null;
  backupLimit?: number;
  databaseLimit?: number;
  allocationLimit?: number;
  variables?: Record<string, string>;
};

export type ServerUpdateInput = Partial<Omit<ServerCreateInput, "nodeId" | "eggId" | "allocationId">>;
