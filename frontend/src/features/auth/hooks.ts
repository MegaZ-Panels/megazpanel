"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { authApi } from "./api";
import { ApiError } from "@/shared/lib/axios";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "./types";

type MutationState<T> = {
  isPending: boolean;
  error: ApiError | null;
  mutate: (input: T) => Promise<boolean>;
};

function useMutation<T, R>(
  fn: (input: T) => Promise<R>,
  opts?: {
    onSuccess?: (result: R) => void | Promise<void>;
    successMessage?: string;
    errorMessage?: string;
  },
): MutationState<T> & { result: R | null } {
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<R | null>(null);

  const mutate = useCallback(
    async (input: T) => {
      setPending(true);
      setError(null);
      try {
        const r = await fn(input);
        setResult(r);
        if (opts?.successMessage) toast.success(opts.successMessage);
        await opts?.onSuccess?.(r);
        return true;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("Unexpected error", 0);
        setError(err);
        toast.error(opts?.errorMessage ?? err.message);
        return false;
      } finally {
        setPending(false);
      }
    },
    [fn, opts],
  );

  return { isPending, error, result, mutate };
}

export function useLogin() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation<LoginInput, Awaited<ReturnType<typeof authApi.login>>>(
    (input) => authApi.login(input),
    {
      successMessage: "Welcome back",
      onSuccess: (user) => {
        setUser(user);
        router.replace("/dashboard");
      },
    },
  );
}

export function useRegister() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation<RegisterInput, Awaited<ReturnType<typeof authApi.register>>>(
    (input) => authApi.register(input),
    {
      successMessage: "Account created. Check your inbox to verify your email.",
      onSuccess: (user) => {
        setUser(user);
        router.replace("/dashboard");
      },
    },
  );
}

export function useLogout() {
  const router = useRouter();
  const reset = useAuthStore((s) => s.reset);

  return useMutation<void, void>(
    async () => {
      await authApi.logout();
    },
    {
      successMessage: "Signed out",
      onSuccess: () => {
        reset();
        router.replace("/login");
      },
    },
  );
}

export function useForgotPassword() {
  return useMutation<ForgotPasswordInput, void>(
    async (input) => {
      await authApi.forgotPassword(input);
    },
    {
      successMessage: "If that email exists, a reset link has been sent.",
    },
  );
}

export function useResetPassword() {
  const router = useRouter();
  return useMutation<ResetPasswordInput, void>(
    async (input) => {
      await authApi.resetPassword(input);
    },
    {
      successMessage: "Password updated. You can sign in now.",
      onSuccess: () => {
        router.replace("/login");
      },
    },
  );
}

export function useVerifyEmail() {
  return useMutation<VerifyEmailInput, void>(
    async (input) => {
      await authApi.verifyEmail(input);
    },
    {
      successMessage: "Email verified.",
    },
  );
}

export function useResendVerification() {
  return useMutation<{ email: string }, void>(
    async ({ email }) => {
      await authApi.resendVerification(email);
    },
    {
      successMessage: "Verification email sent.",
    },
  );
}
