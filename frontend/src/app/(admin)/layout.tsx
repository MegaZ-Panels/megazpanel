"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Server as ServerIcon,
  Users,
  HardDrive,
  Cog,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { LoadingSpinner } from "@/shared/components/loading-spinner";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { Button } from "@/components/ui/button";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: (path: string) => boolean;
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: Home, match: (p) => p === "/admin" },
  { href: "/admin/servers", label: "Servers", icon: ServerIcon },
  { href: "/admin/nodes", label: "Nodes", icon: HardDrive },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Cog },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  const isAdmin =
    !!user && (user.roles.includes("owner") || user.roles.includes("admin"));

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [status, isAdmin, router]);

  if (status !== "authenticated" || !isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingSpinner label="Loading admin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[color:var(--color-background)]">
      <div className="flex">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-[color:var(--color-border)] bg-[color:var(--color-card)] md:block">
          <div className="flex h-14 items-center gap-2 border-b border-[color:var(--color-border)] px-5">
            <ShieldCheck className="h-5 w-5 text-[color:var(--color-primary)]" />
            <span className="font-semibold tracking-tight">MegaZ Admin</span>
          </div>
          <nav className="flex flex-col gap-1 p-3">
            {NAV.map((item) => {
              const active = item.match
                ? item.match(pathname)
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]"
                      : "text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-foreground)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 border-t border-[color:var(--color-border)] p-3">
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to dashboard
              </Link>
            </Button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1">
          <div className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-[color:var(--color-border)] bg-[color:var(--color-background)]/85 px-4 backdrop-blur sm:px-8">
            <div className="flex items-center gap-3 md:hidden">
              <ShieldCheck className="h-5 w-5 text-[color:var(--color-primary)]" />
              <span className="font-semibold tracking-tight">MegaZ Admin</span>
            </div>
            <div className="hidden text-sm text-[color:var(--color-muted-foreground)] md:block">
              Signed in as{" "}
              <span className="text-[color:var(--color-foreground)]">{user.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </div>

          {/* Mobile horizontal nav */}
          <nav className="flex gap-1 overflow-x-auto border-b border-[color:var(--color-border)] bg-[color:var(--color-card)]/40 p-2 md:hidden">
            {NAV.map((item) => {
              const active = item.match
                ? item.match(pathname)
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition",
                    active
                      ? "bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]"
                      : "text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-foreground)]",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="px-4 py-6 sm:px-8 sm:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
