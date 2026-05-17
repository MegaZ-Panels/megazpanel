import { Prisma, type Role, type User, type UserRole } from "@prisma/client";
import { errors } from "@/core/errors";
import { hashPassword } from "@/core/crypto";
import { auditService } from "../audit/service";
import { userRepo } from "./repo";
import type {
  UserCreateInput,
  UserListQuery,
  UserRolesUpdateInput,
  UserUpdateInput,
} from "./schemas";

export type UserDTO = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  status: User["status"];
  roles: Role[];
  createdAt: string;
  updatedAt: string;
};

function toDto(user: User & { roles: UserRole[] }): UserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    status: user.status,
    roles: user.roles.map((r) => r.role),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

type Actor = { id: string; email: string };

export const userService = {
  async list(query: UserListQuery) {
    const { items, nextCursor } = await userRepo.list(query);
    return { items: items.map(toDto), nextCursor };
  },

  async get(id: string) {
    const user = await userRepo.byId(id);
    if (!user) throw errors.notFound("User not found");
    return toDto(user);
  },

  async create(input: UserCreateInput, actor: Actor): Promise<UserDTO> {
    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      user = await userRepo.create({ ...input, passwordHash });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw errors.conflict("An account with this email already exists", {
          email: ["already in use"],
        });
      }
      throw err;
    }
    await auditService.record({
      action: "user.created",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "user",
      targetId: user.id,
      meta: { email: user.email, roles: input.roles },
    });
    return toDto(user);
  },

  async update(id: string, input: UserUpdateInput, actor: Actor): Promise<UserDTO> {
    const existing = await userRepo.byId(id);
    if (!existing) throw errors.notFound("User not found");

    const data: UserUpdateInput & { passwordHash?: string } = { ...input };
    if (input.password) {
      data.passwordHash = await hashPassword(input.password);
      delete (data as Partial<typeof data>).password;
    }

    let updated;
    try {
      updated = await userRepo.update(id, data);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw errors.conflict("That email is already in use", { email: ["already in use"] });
      }
      throw err;
    }

    if (input.password || input.status === "suspended") {
      await userRepo.revokeAllSessions(id);
    }

    await auditService.record({
      action: "user.updated",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "user",
      targetId: id,
      meta: {
        changedKeys: Object.keys(input).filter((k) => k !== "password"),
        passwordChanged: Boolean(input.password),
      },
    });
    return toDto(updated);
  },

  async setRoles(
    id: string,
    input: UserRolesUpdateInput,
    actor: Actor,
  ): Promise<UserDTO> {
    const existing = await userRepo.byId(id);
    if (!existing) throw errors.notFound("User not found");

    if (existing.id === actor.id && !input.roles.includes("owner") && !input.roles.includes("admin")) {
      throw errors.forbidden("You cannot remove your own admin/owner role");
    }

    const updated = await userRepo.setRoles(id, input.roles);
    await auditService.record({
      action: "user.roles_updated",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "user",
      targetId: id,
      meta: { roles: input.roles },
    });
    return toDto(updated);
  },

  async remove(id: string, actor: Actor): Promise<void> {
    if (id === actor.id) throw errors.forbidden("You cannot delete your own account");
    const existing = await userRepo.byId(id);
    if (!existing) throw errors.notFound("User not found");
    await userRepo.remove(id);
    await auditService.record({
      action: "user.deleted",
      actorId: actor.id,
      actorEmail: actor.email,
      targetKind: "user",
      targetId: id,
      meta: { email: existing.email },
    });
  },
};
