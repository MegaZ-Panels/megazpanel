"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Server as ServerIcon,
  Cpu,
  HardDrive,
  Search,
  PauseCircle,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useLogout } from "@/features/auth";
import { clientServersApi } from "@/features/servers/api";
import type { ServerSummaryDTO } from "@/features/servers/types";

export default function MyServersPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ServerSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      clientServersApi
        .listMine({ search: search || undefined, limit: 100 })
        .then((res) => {
          if (cancelled) return;
          setItems(res.items);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  const isAdmin = !!user && (user.roles.includes("owner") || user.roles.includes("admin"));

  return (
    <div className="min-h-dvh bg-[color:var(--color-background)]">
      <header className="sticky top-0 z-20 border-b border-[color:var(--color-border)] bg-[color:var(--color-background)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-8">
          <Link href="/servers" className="flex items-center gap-2">
            <ServerIcon className="h-5 w-5 text-[color:var(--color-primary)]" />
            <span className="font-semibold tracking-tight">MegaZPanel</span>
          </Link>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin">Admin</Link>
              </Button>
            ) : null}
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void logout.mutate()}
              disabled={logout.isPending}
            >
              {logout.isPending ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Your servers</h1>
          <p className="text-sm text-[color:var(--color-muted-foreground)]">
            {user?.email ? <>Signed in as <span className="text-[color:var(--color-foreground)]">{user.email}</span>.</> : null}{" "}
            Click any card to open its console, files, and settings.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted-foreground)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your servers…"
            className="pl-9"
          />
        </div>

        {loading && items.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <ServerIcon className="h-10 w-10 text-[color:var(--color-muted-foreground)]" />
              <p className="text-sm text-[color:var(--color-muted-foreground)]">
                You don&apos;t have any servers yet. Ask an admin to provision one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((s) => (
              <ServerCard key={s.id} server={s} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ServerCard({ server }: { server: ServerSummaryDTO }) {
  return (
    <Link href={`/servers/${server.identifier}`} className="group">
      <Card className="relative h-full overflow-hidden transition group-hover:-translate-y-0.5 group-hover:border-[color:var(--color-primary)]/60 group-hover:shadow-lg">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[color:var(--color-primary)]/15 to-transparent"
          aria-hidden
        />
        <CardContent className="relative flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold tracking-tight">{server.name}</div>
              <div className="truncate font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
                {server.identifier} · {server.eggName}
              </div>
            </div>
            <ServerStatusPill server={server} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-2">
              <div className="flex items-center gap-1 text-[color:var(--color-muted-foreground)]">
                <Cpu className="h-3 w-3" /> Memory
              </div>
              <div className="mt-0.5 font-medium tabular-nums">{server.memoryMb} MiB</div>
            </div>
            <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-2">
              <div className="flex items-center gap-1 text-[color:var(--color-muted-foreground)]">
                <HardDrive className="h-3 w-3" /> Disk
              </div>
              <div className="mt-0.5 font-medium tabular-nums">{server.diskMb} MiB</div>
            </div>
          </div>

          {server.primaryAllocation ? (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[color:var(--color-muted-foreground)]">Address</span>
              <span className="font-mono">
                {server.primaryAllocation.alias ?? server.primaryAllocation.ip}:
                {server.primaryAllocation.port}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function ServerStatusPill({ server }: { server: ServerSummaryDTO }) {
  if (server.suspended) {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-500">
        <PauseCircle className="mr-1 h-3 w-3" />
        Suspended
      </Badge>
    );
  }
  if (server.installStatus === "install_failed") {
    return (
      <Badge variant="outline" className="border-rose-500/40 text-rose-500">
        <AlertTriangle className="mr-1 h-3 w-3" />
        Install failed
      </Badge>
    );
  }
  if (server.installStatus !== "installed") {
    return (
      <Badge variant="outline" className="border-sky-500/40 text-sky-500">
        Installing
      </Badge>
    );
  }
  switch (server.lastKnownState) {
    case "running":
      return <Badge className="bg-emerald-500/15 text-emerald-500">Running</Badge>;
    case "starting":
      return <Badge variant="outline" className="border-sky-500/40 text-sky-500">Starting</Badge>;
    case "stopping":
      return <Badge variant="outline" className="border-amber-500/40 text-amber-500">Stopping</Badge>;
    case "stopped":
      return <Badge variant="outline" className="text-[color:var(--color-muted-foreground)]">Stopped</Badge>;
    case "offline":
    default:
      return (
        <Badge variant="outline" className="text-[color:var(--color-muted-foreground)]">
          Offline
        </Badge>
      );
  }
}
