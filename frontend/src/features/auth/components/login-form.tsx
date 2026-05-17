"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "../hooks";
import { loginSchema, type LoginValues } from "../schemas";
import { AuthCard, FieldError } from "./auth-card";
import { PasswordInput } from "./password-input";

export function LoginForm() {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
    mode: "onBlur",
  });

  const onSubmit = handleSubmit(async (values) => {
    await login.mutate(values);
  });

  const remember = watch("rememberMe");
  const pending = isSubmitting || login.isPending;

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Enter your credentials to continue."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Don&apos;t have an account?</span>
          <Link href="/register" className="font-medium text-[color:var(--color-foreground)] hover:underline">
            Create one
          </Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            aria-invalid={errors.email ? "true" : "false"}
            disabled={pending}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] hover:underline"
            >
              Forgot?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? "true" : "false"}
            disabled={pending}
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-[color:var(--color-muted-foreground)]">
          <Checkbox
            checked={remember}
            onCheckedChange={(v) => setValue("rememberMe", v === true, { shouldDirty: true })}
            disabled={pending}
            id="rememberMe"
          />
          <span>Remember me on this device</span>
        </label>

        <Button type="submit" disabled={pending} className="mt-2 w-full">
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
