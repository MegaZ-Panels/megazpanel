import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/core/db";
import type { UserCreateInput, UserListQuery, UserUpdateInput } from "./schemas";

const include = { roles: true } as const;

export const userRepo = {
  list: async (query: UserListQuery) => {
    const where: Prisma.UserWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.role) where.roles = { some: { role: query.role } };
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
      ];
    }
    const items = await prisma.user.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    });
    const hasMore = items.length > query.limit;
    const trimmed = hasMore ? items.slice(0, query.limit) : items;
    const nextCursor = hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null;
    return { items: trimmed, nextCursor };
  },

  byId: (id: string) => prisma.user.findUnique({ where: { id }, include }),
  byEmail: (email: string) => prisma.user.findUnique({ where: { email }, include }),

  create: (input: UserCreateInput & { passwordHash: string }) =>
    prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        emailVerified: input.emailVerified,
        status: input.status,
        roles: { create: input.roles.map((role) => ({ role })) },
      },
      include,
    }),

  update: (id: string, input: UserUpdateInput & { passwordHash?: string }) =>
    prisma.user.update({
      where: { id },
      data: {
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.emailVerified !== undefined ? { emailVerified: input.emailVerified } : {}),
        ...(input.passwordHash !== undefined ? { passwordHash: input.passwordHash } : {}),
      },
      include,
    }),

  setRoles: (id: string, roles: Role[]) =>
    prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (roles.length > 0) {
        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId: id, role })),
          skipDuplicates: true,
        });
      }
      return tx.user.findUniqueOrThrow({ where: { id }, include });
    }),

  remove: (id: string) => prisma.user.delete({ where: { id } }),

  revokeAllSessions: (id: string) =>
    prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
};
