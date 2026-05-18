"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/lib/axios";

export type MutationState<TInput, TResult> = {
  isPending: boolean;
  error: ApiError | null;
  result: TResult | null;
  mutate: (input: TInput) => Promise<TResult | null>;
  reset: () => void;
};

export function useMutation<TInput, TResult>(
  fn: (input: TInput) => Promise<TResult>,
  opts?: {
    onSuccess?: (result: TResult, input: TInput) => void | Promise<void>;
    onError?: (err: ApiError, input: TInput) => void | Promise<void>;
    successMessage?: string | ((result: TResult, input: TInput) => string);
    errorMessage?: string;
    silent?: boolean;
  },
): MutationState<TInput, TResult> {
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<TResult | null>(null);

  const mutate = useCallback(
    async (input: TInput): Promise<TResult | null> => {
      setPending(true);
      setError(null);
      try {
        const r = await fn(input);
        setResult(r);
        if (!opts?.silent && opts?.successMessage) {
          const msg =
            typeof opts.successMessage === "function"
              ? opts.successMessage(r, input)
              : opts.successMessage;
          toast.success(msg);
        }
        await opts?.onSuccess?.(r, input);
        return r;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("Unexpected error", 0);
        setError(err);
        if (!opts?.silent) {
          toast.error(opts?.errorMessage ?? err.message);
        }
        await opts?.onError?.(err, input);
        return null;
      } finally {
        setPending(false);
      }
    },
    [fn, opts],
  );

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
    setPending(false);
  }, []);

  return { isPending, error, result, mutate, reset };
}

/** Simple useQuery-like helper: fetches once, exposes manual refetch. */
export function useQuery<TResult>(
  fn: () => Promise<TResult>,
): {
  data: TResult | null;
  error: ApiError | null;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<TResult | null>;
} {
  const [data, setData] = useState<TResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isFetching, setFetching] = useState(false);
  const [isLoading, setLoading] = useState(true);

  const refetch = useCallback(async (): Promise<TResult | null> => {
    setFetching(true);
    setError(null);
    try {
      const r = await fn();
      setData(r);
      return r;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("Unexpected error", 0);
      setError(err);
      return null;
    } finally {
      setFetching(false);
      setLoading(false);
    }
  }, [fn]);

  return { data, error, isLoading, isFetching, refetch };
}
