"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useResetPassword } from "../hooks";
import { resetPasswordSchema, type ResetPasswordValues } from "../schemas";
import { AuthCard, FieldError } from "./auth-card";
import { PasswordInput } from "./password-input";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const tokenFromQuery = params?.get("token") ?? "";
  const reset = useResetPassword();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: tokenFromQuery, password: "", confirmPassword: "" },
    mode: "onBlur",
  });

  useEffect(() => {
    setValue("token", tokenFromQuery, { shouldValidate: true });
  }, [tokenFromQuery, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    await reset.mutate(values);
  });

  const pending = isSubmitting || reset.isPending;

  if (!tokenFromQuery) {
    return (
      <AuthCard
        title="Invalid reset link"
        description="This page must be opened from a password reset email."
        footer={
          <Link href="/forgot-password" className="font-medium hover:underline">
            Request a new reset link
          </Link>
        }
      >
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          The token is missing or malformed. Please request a fresh reset email.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="Pick something strong you don't use anywhere else."
      footer={
        <Link href="/login" className="font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <input type="hidden" {...register("token")} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            autoFocus
            aria-invalid={errors.password ? "true" : "false"}
            disabled={pending}
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
          <p className="text-xs text-[color:var(--color-muted-foreground)]">
            12+ chars with upper, lower, number and symbol.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            aria-invalid={errors.confirmPassword ? "true" : "false"}
            disabled={pending}
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <FieldError message={errors.token?.message} />

        <Button type="submit" disabled={pending} className="mt-2 w-full">
          {pending ? "Updating password..." : "Update password"}
        </Button>
      </form>
    </AuthCard>
  );
}
