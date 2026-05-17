"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResendVerification, useVerifyEmail } from "../hooks";
import { AuthCard } from "./auth-card";
import { LoadingSpinner } from "@/shared/components/loading-spinner";

type Phase = "verifying" | "success" | "error" | "manual";

export function VerifyEmailCard() {
  const params = useSearchParams();
  const token = params?.get("token") ?? "";
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const [phase, setPhase] = useState<Phase>(token ? "verifying" : "manual");
  const [email, setEmail] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    void (async () => {
      const ok = await verify.mutate({ token });
      setPhase(ok ? "success" : "error");
    })();
  }, [token, verify]);

  if (phase === "verifying") {
    return (
      <AuthCard title="Verifying your email" description="Hold on while we confirm your address.">
        <div className="flex justify-center py-4">
          <LoadingSpinner label="Verifying" />
        </div>
      </AuthCard>
    );
  }

  if (phase === "success") {
    return (
      <AuthCard
        title="Email verified"
        description="Your address has been confirmed."
        footer={
          <Link href="/login" className="font-medium hover:underline">
            Continue to sign in
          </Link>
        }
      >
        <div className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="size-5 text-green-500" aria-hidden />
          <span>You can now sign in and use all features.</span>
        </div>
      </AuthCard>
    );
  }

  if (phase === "error") {
    return (
      <AuthCard
        title="Verification failed"
        description="The link is invalid or has expired."
        footer={
          <Link href="/login" className="font-medium hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3 text-sm">
          <XCircle className="mt-0.5 size-5 text-[color:var(--color-destructive)]" aria-hidden />
          <span>Request a new verification email below.</span>
        </div>
        <ResendBlock email={email} setEmail={setEmail} resend={resend} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Verify your email"
      description="Enter your email to receive a fresh verification link."
      footer={
        <Link href="/login" className="font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ResendBlock email={email} setEmail={setEmail} resend={resend} />
    </AuthCard>
  );
}

function ResendBlock({
  email,
  setEmail,
  resend,
}: {
  email: string;
  setEmail: (v: string) => void;
  resend: ReturnType<typeof useResendVerification>;
}) {
  const submit = async () => {
    if (!email) return;
    await resend.mutate({ email });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="resend-email">Email</Label>
        <Input
          id="resend-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={resend.isPending}
        />
      </div>
      <Button type="submit" disabled={resend.isPending || !email} className="w-full">
        {resend.isPending ? "Sending..." : "Resend verification email"}
      </Button>
    </form>
  );
}
