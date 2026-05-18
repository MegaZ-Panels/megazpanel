"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  ArrowLeft,
  Server as ServerIcon,
  Terminal,
  FolderOpen,
  Save,
  Settings as SettingsIcon,
  LayoutDashboard,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { cn } from "@/shared/lib/utils";
import { clientServersApi } from "@/features/servers/api";
import type { ServerDetailDTO } from "@/features/servers/types";
import { ApiError } from "@/shared/lib/axios";

type ServerCtx = {
  server: ServerDetailDTO;
  refresh: () => Promise<void>;
};

const Ctx = createContext<ServerCtx | null>(null);

export function useServer(): ServerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useServer must be inside ServerLayout");
  return ctx;
}

export default function ServerDetailLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ identifier: string }>();
  const pathname = usePathname();
  const identifier = params.identifier;

  const [server, setServer] = useState<ServerDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const fresh = await clientServersApi.getMine(identifier);
      setServer(fresh);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load server");
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && !server) {
    return (
      <div className="min-h-dvh bg-[color:var(--color-background)] px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="min-h-dvh bg-[color:var(--color-background)] px-4 py-12 sm:px-8">
        <Card className="mx-auto max-w-xl">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-rose-500" />
            <div className="font-medium">Couldn&apos;t load this server</div>
            <p className="text-sm text-[color:var(--color-muted-foreground)]">
              {error ?? "Server not found"}
            </p>
            <Button asChild variant="outline">
              <Link href="/servers">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to servers
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tabs = [
    { href: `/servers/${identifier}`, label: "Overview", icon: LayoutDashboard },
    { href: `/servers/${identifier}/console`, label: "Console", icon: Terminal },
    { href: `/servers/${identifier}/files`, label: "Files", icon: FolderOpen },
    { href: `/servers/${identifier}/backups`, label: "Backups", icon: Save },
    { href: `/servers/${identifier}/settings`, label: "Settings", icon: SettingsIcon },
  ];

  return (
    <Ctx.Provider value={{ server, refresh }}>
      <div className="min-h-dvh bg-[color:var(--color-background)]">
        <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-background)]/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
            <div className="flex items-center gap-3 min-w-0">
              <Button asChild variant="ghost" size="sm" className="-ml-2 shrink-0 text-[color:var(--color-muted-foreground)]">
                <Link href="/servers">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Servers</span>
                </Link>
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ServerIcon className="h-4 w-4 shrink-0 text-[color:var(--color-primary)]" />
                  <span className="truncate font-semibold tracking-tight">{server.name}</span>
                  <ServerStatusPill state={server.suspended ? "suspended" : server.lastKnownState ?? server.installStatus} />
                </div>
                <div className="truncate font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
                  {server.identifier} · {server.eggObj.name}
                </div>
              </div>
            </div>
            <ThemeToggle />
          </div>
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-1 sm:px-6">
            {tabs.map((t) => {
              const isOverview = t.href === `/servers/${identifier}`;
              const active = isOverview ? pathname === t.href : pathname.startsWith(t.href);
              const Icon = t.icon;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition",
                    active
                      ? "border-[color:var(--color-primary)] font-semibold text-[color:var(--color-foreground)]"
                      : "border-transparent text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </Ctx.Provider>
  );
}

function ServerStatusPill({ state }: { state: string | null }) {
  const map: Record<string, { label: string; className: string }> = {
    running: { label: "Running", className: "bg-emerald-500/15 text-emerald-500" },
    starting: { label: "Starting", className: "border-sky-500/40 text-sky-500" },
    stopping: { label: "Stopping", className: "border-amber-500/40 text-amber-500" },
    stopped: { label: "Stopped", className: "text-[color:var(--color-muted-foreground)]" },
    offline: { label: "Offline", className: "text-[color:var(--color-muted-foreground)]" },
    suspended: { label: "Suspended", className: "border-amber-500/40 text-amber-500" },
    installing: { label: "Installing", className: "border-sky-500/40 text-sky-500" },
    install_failed: { label: "Install failed", className: "border-rose-500/40 text-rose-500" },
    pending: { label: "Awaiting daemon", className: "text-[color:var(--color-muted-foreground)]" },
  };
  const v = state ? map[state] : null;
  if (!v) return null;
  return (
    <Badge variant="outline" className={cn("ml-1", v.className)}>
      {v.label}
    </Badge>
  );
}
