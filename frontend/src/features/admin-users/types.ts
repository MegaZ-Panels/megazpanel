export type Role = "owner" | "admin" | "operator" | "viewer";
export type UserStatus = "active" | "suspended" | "pending";

export type AdminUserDTO = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  status: UserStatus;
  roles: Role[];
  createdAt: string;
  updatedAt: string;
};

export type AdminUserListResponse = {
  items: AdminUserDTO[];
  nextCursor: string | null;
};

export type AdminUserCreateInput = {
  email: string;
  name: string;
  password: string;
  status?: UserStatus;
  emailVerified?: boolean;
  roles: Role[];
};

export type AdminUserUpdateInput = {
  email?: string;
  name?: string | null;
  status?: UserStatus;
  emailVerified?: boolean;
  password?: string;
};

export type AdminUserRolesInput = {
  roles: Role[];
};
