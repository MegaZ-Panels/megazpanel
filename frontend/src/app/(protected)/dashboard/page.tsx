"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { useLogout } from "@/features/auth";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  return (
    <div className="min-h-dvh bg-[color:var(--color-background)] px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">MegaZPanel</h1>
            <p className="text-sm text-[color:var(--color-muted-foreground)]">
              Signed in as {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="outline"
              onClick={() => {
                void logout.mutate();
              }}
              disabled={logout.isPending}
            >
              {logout.isPending ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome back{user?.name ? `, ${user.name}` : ""}.</CardTitle>
            <CardDescription>
              Authentication is wired up. Container, node, and stack modules will appear here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-[color:var(--color-muted-foreground)] sm:grid-cols-2">
            <div>
              <span className="text-[color:var(--color-foreground)]">User ID:</span>{" "}
              <span className="font-mono">{user?.id}</span>
            </div>
            <div>
              <span className="text-[color:var(--color-foreground)]">Email verified:</span>{" "}
              {user?.emailVerified ? "yes" : "no"}
            </div>
            <div>
              <span className="text-[color:var(--color-foreground)]">Roles:</span>{" "}
              {(user?.roles ?? []).join(", ") || "—"}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
