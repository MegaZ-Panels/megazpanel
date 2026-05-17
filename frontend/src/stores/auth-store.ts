import { create } from "zustand";
import { authApi } from "@/features/auth/api";
import type { AuthUser } from "@/features/auth/types";
import { ApiError } from "@/shared/lib/axios";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  bootstrap: () => Promise<void>;
  setUser: (user: AuthUser) => void;
  reset: () => void;
};

let bootstrapPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,

  bootstrap: async () => {
    if (bootstrapPromise) return bootstrapPromise;
    if (get().status === "authenticated") return;

    bootstrapPromise = (async () => {
      try {
        const user = await authApi.me();
        set({ status: "authenticated", user });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          try {
            const user = await authApi.refresh();
            set({ status: "authenticated", user });
            return;
          } catch {
            // fallthrough
          }
        }
        set({ status: "unauthenticated", user: null });
      } finally {
        bootstrapPromise = null;
      }
    })();

    return bootstrapPromise;
  },

  setUser: (user) => set({ status: "authenticated", user }),
  reset: () => set({ status: "unauthenticated", user: null }),
}));
