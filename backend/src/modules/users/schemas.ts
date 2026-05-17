import { z } from "zod";
import { Role, UserStatus } from "@prisma/client";

const trimmed = z.string().trim();

const emailSchema = trimmed.toLowerCase().min(1).email().max(254);

const passwordSchema = trimmed
  .min(12, "Use at least 12 characters")
  .max(256)
  .refine((v) => /[a-z]/.test(v), "Add a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Add an uppercase letter")
  .refine((v) => /[0-9]/.test(v), "Add a number")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "Add a symbol");

export const idSchema = trimmed.uuid("Invalid id");

export const roleSchema = z.nativeEnum(Role);
export const statusSchema = z.nativeEnum(UserStatus);

export const userListQuerySchema = z.object({
  search: trimmed.min(1).max(120).optional(),
  status: statusSchema.optional(),
  role: roleSchema.optional(),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const userCreateSchema = z.object({
  email: emailSchema,
  name: trimmed.min(2).max(80),
  password: passwordSchema,
  status: statusSchema.default("active"),
  emailVerified: z.boolean().default(true),
  roles: z.array(roleSchema).min(1, "At least one role is required").max(4),
});

export const userUpdateSchema = z.object({
  email: emailSchema.optional(),
  name: trimmed.min(2).max(80).optional().nullable(),
  status: statusSchema.optional(),
  emailVerified: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export const userRolesUpdateSchema = z.object({
  roles: z.array(roleSchema).min(1).max(4),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type UserRolesUpdateInput = z.infer<typeof userRolesUpdateSchema>;
