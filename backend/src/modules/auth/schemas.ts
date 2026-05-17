import { z } from "zod";

const trimmed = z.string().trim();

export const emailSchema = trimmed
  .toLowerCase()
  .min(1, "Email is required")
  .email("Enter a valid email")
  .max(254);

export const passwordSchema = trimmed
  .min(12, "Use at least 12 characters")
  .max(256)
  .refine((v) => /[a-z]/.test(v), "Add a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Add an uppercase letter")
  .refine((v) => /[0-9]/.test(v), "Add a number")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "Add a symbol");

export const nameSchema = trimmed.min(2, "Name is too short").max(80);

export const loginInputSchema = z.object({
  email: emailSchema,
  password: trimmed.min(1, "Password is required").max(256),
  rememberMe: z.boolean().default(false),
});

export const registerInputSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
});

export const forgotPasswordInputSchema = z.object({
  email: emailSchema,
});

export const resetPasswordInputSchema = z.object({
  token: trimmed.min(1).max(512),
  password: passwordSchema,
});

export const verifyEmailInputSchema = z.object({
  token: trimmed.min(1).max(512),
});

export const resendVerificationInputSchema = z.object({
  email: emailSchema,
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationInputSchema>;
