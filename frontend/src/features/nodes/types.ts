export type NodeDTO = {
  id: string;
  uuid: string;
  name: string;
  description: string | null;
  fqdn: string;
  scheme: string;
  port: number;
  publicAddress: string | null;
  location: string | null;
  maxMemoryMb: number;
  maxDiskMb: number;
  memoryOverallocate: number;
  diskOverallocate: number;
  daemonTokenIdentifier: string;
  daemonVersion: string | null;
  lastHeartbeatAt: string | null;
  maintenance: boolean;
  public: boolean;
  allocationsCount: number;
  serversCount: number;
  createdAt: string;
  updatedAt: string;
};

export type NodeWithToken = NodeDTO & { daemonToken: string };

export type NodeListResponse = {
  items: NodeDTO[];
  nextCursor: string | null;
};

export type NodeCreateInput = {
  name: string;
  description?: string | null;
  fqdn: string;
  scheme?: "http" | "https";
  port?: number;
  publicAddress?: string | null;
  location?: string | null;
  maxMemoryMb: number;
  maxDiskMb: number;
  memoryOverallocate?: number;
  diskOverallocate?: number;
  maintenance?: boolean;
  public?: boolean;
};

export type NodeUpdateInput = Partial<NodeCreateInput>;

export type AllocationDTO = {
  id: string;
  nodeId: string;
  ip: string;
  alias: string | null;
  port: number;
  notes: string | null;
  serverId: string | null;
  serverIdentifier: string | null;
  serverName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AllocationListResponse = {
  items: AllocationDTO[];
  nextCursor: string | null;
};

export type AllocationCreateInput = {
  ip: string;
  alias?: string | null;
  port: number;
  notes?: string | null;
};

export type AllocationBulkCreateInput = {
  ip: string;
  alias?: string | null;
  fromPort: number;
  toPort: number;
  notes?: string | null;
};
