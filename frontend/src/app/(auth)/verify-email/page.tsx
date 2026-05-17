import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailCard } from "@/features/auth";
import { LoadingSpinner } from "@/shared/components/loading-spinner";

export const metadata: Metadata = { title: "Verify email" };

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[200px] items-center justify-center">
          <LoadingSpinner label="Loading" />
        </div>
      }
    >
      <VerifyEmailCard />
    </Suspense>
  );
}
