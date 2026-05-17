import { api } from "@/shared/lib/axios";
import type {
  AuthResponse,
  AuthUser,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "./types";

export const authApi = {
  async login(input: LoginInput): Promise<AuthUser> {
    const { data } = await api.post<AuthResponse>("/auth/login", input);
    return data.user;
  },

  async register(input: RegisterInput): Promise<AuthUser> {
    const { data } = await api.post<AuthResponse>("/auth/register", input);
    return data.user;
  },

  async logout(): Promise<void> {
    await api.post("/auth/logout", {});
  },

  async refresh(): Promise<AuthUser> {
    const { data } = await api.post<AuthResponse>("/auth/refresh", {});
    return data.user;
  },

  async me(): Promise<AuthUser> {
    const { data } = await api.get<AuthResponse>("/auth/me");
    return data.user;
  },

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    await api.post("/auth/forgot-password", input);
  },

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await api.post("/auth/reset-password", input);
  },

  async verifyEmail(input: VerifyEmailInput): Promise<void> {
    await api.post("/auth/verify-email", input);
  },

  async resendVerification(email: string): Promise<void> {
    await api.post("/auth/resend-verification", { email });
  },
};
