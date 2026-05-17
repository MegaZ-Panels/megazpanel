export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  roles: string[];
  createdAt: string;
};

export type LoginInput = {
  email: string;
  password: string;
  rememberMe: boolean;
};

export type RegisterInput = {
  email: string;
  name: string;
  password: string;
};

export type ForgotPasswordInput = {
  email: string;
};

export type ResetPasswordInput = {
  token: string;
  password: string;
};

export type VerifyEmailInput = {
  token: string;
};

export type AuthResponse = {
  user: AuthUser;
};
