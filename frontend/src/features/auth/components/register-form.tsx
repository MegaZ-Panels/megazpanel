"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister } from "../hooks";
import { registerSchema, type RegisterValues } from "../schemas";
import { AuthCard, FieldError } from "./auth-card";
import { PasswordInput } from "./password-input";

export function RegisterForm() {
  const registerMutation = useRegister();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false as unknown as true,
    },
    mode: "onBlur",
  });

  const onSubmit = handleSubmit(async (values) => {
    await registerMutation.mutate({
      name: values.name,
      email: values.email,
      password: values.password,
    });
  });

  const accepted = watch("acceptTerms");
  const pending = isSubmitting || registerMutation.isPending;

  return (
    <AuthCard
      title="Create your account"
      description="It only takes a minute. Use a strong, unique password."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Already have an account?</span>
          <Link href="/login" className="font-medium text-[color:var(--color-foreground)] hover:underline">
            Sign in
          </Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            aria-invalid={errors.name ? "true" : "false"}
            disabled={pending}
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-invalid={errors.email ? "true" : "false"}
            disabled={pending}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
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
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            aria-invalid={errors.confirmPassword ? "true" : "false"}
            disabled={pending}
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm text-[color:var(--color-muted-foreground)]">
          <Checkbox
            id="acceptTerms"
            checked={accepted === true}
            onCheckedChange={(v) =>
              setValue("acceptTerms", (v === true) as true, { shouldValidate: true, shouldDirty: true })
            }
            disabled={pending}
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="underline hover:text-[color:var(--color-foreground)]">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-[color:var(--color-foreground)]">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <FieldError message={errors.acceptTerms?.message} />

        <Button type="submit" disabled={pending} className="mt-2 w-full">
          {pending ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}
