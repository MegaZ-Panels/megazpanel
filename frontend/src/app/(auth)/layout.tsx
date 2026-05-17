"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth-store";
import { LoadingSpinner } from "@/shared/components/loading-spinner";
import { ThemeToggle } from "@/shared/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="auth-bg flex min-h-dvh items-center justify-center">
        <LoadingSpinner label="Loading" />
      </div>
    );
  }

  return (
    <div className="auth-bg relative flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:px-6">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        {children}
      </motion.div>

      <p className="mt-8 text-xs text-[color:var(--color-muted-foreground)]">
        MegaZPanel · secure container management
      </p>
    </div>
  );
}
