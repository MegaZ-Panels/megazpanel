import axios, {
  AxiosHeaders,
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export type ApiErrorBody = {
  code?: string;
  message?: string;
  errors?: Record<string, string[]>;
};

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;
  public readonly fields: Record<string, string[]> | undefined;

  constructor(message: string, status: number, code?: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean; _skipAuthRefresh?: boolean };

function buildClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    timeout: 20_000,
    headers: { Accept: "application/json" },
  });

  let refreshPromise: Promise<void> | null = null;

  const refresh = async (): Promise<void> => {
    await client.post(
      "/auth/refresh",
      {},
      { _skipAuthRefresh: true } as AxiosRequestConfig & { _skipAuthRefresh: boolean },
    );
  };

  client.interceptors.request.use((config) => {
    const headers = AxiosHeaders.from(config.headers);
    if (typeof window !== "undefined") {
      const csrf = readCookie("mzp_csrf");
      if (csrf && config.method && !["get", "head", "options"].includes(config.method)) {
        headers.set("X-CSRF-Token", csrf);
      }
    }
    config.headers = headers;
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiErrorBody>) => {
      const original = error.config as RetriableConfig | undefined;
      const status = error.response?.status ?? 0;

      if (
        status === 401 &&
        original &&
        !original._retry &&
        !original._skipAuthRefresh &&
        !isAuthEndpoint(original.url)
      ) {
        original._retry = true;
        try {
          refreshPromise ??= refresh().finally(() => {
            refreshPromise = null;
          });
          await refreshPromise;
          return client.request(original);
        } catch {
          // fallthrough to ApiError
        }
      }

      const body = error.response?.data;
      const message =
        body?.message ?? error.message ?? "Request failed. Please try again.";
      throw new ApiError(message, status, body?.code, body?.errors);
    },
  );

  return client;
}

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return /\/auth\/(login|register|refresh|logout|forgot-password|reset-password|verify-email|resend-verification)$/.test(
    url,
  );
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export const api = buildClient();
