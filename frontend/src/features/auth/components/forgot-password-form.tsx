"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForgotPassword } from "../hooks";
import { forgotPasswordSchema, type ForgotPasswordValues } from "../schemas";
import { AuthCard, FieldError } from "./auth-card";

export function ForgotPasswordForm() {
  const forgot = useForgotPassword();
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  const onSubmit = handleSubmit(async (values) => {
    const ok = await forgot.mutate(values);
    if (ok) setSubmitted(true);
  });

  const pending = isSubmitting || forgot.isPending;

  return (
    <AuthCard
      title="Reset your password"
      description={
        submitted
          ? "If an account exists for that email, a reset link is on its way."
          : "Enter your email and we'll send a link to reset your password."
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Remembered it?</span>
          <Link href="/login" className="font-medium text-[color:var(--color-foreground)] hover:underline">
            Back to sign in
          </Link>
        </div>
      }
    >
      {submitted ? (
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          Check your inbox and spam folder. The link expires in 1 hour.
        </p>
      ) : (
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

          <Button type="submit" disabled={pending} className="mt-2 w-full">
            {pending ? "Sending link..." : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
