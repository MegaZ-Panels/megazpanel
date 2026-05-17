import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth";
import { LoadingSpinner } from "@/shared/components/loading-spinner";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[200px] items-center justify-center">
          <LoadingSpinner label="Loading" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
