"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Server as ServerIcon, Pause, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminServersApi } from "@/features/servers/api";
import type { ServerSummaryDTO } from "@/features/servers/types";
import { ApiError } from "@/shared/lib/axios";
import { useMutation } from "@/shared/hooks/use-mutation";

export default function AdminServersPage() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ServerSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setLoading(true);
      const res = await adminServersApi.list({ search: search || undefined, limit: 100 });
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load servers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void reload(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ServerIcon className="h-6 w-6" />
            Servers
          </h1>
          <p className="text-sm text-[color:var(--color-muted-foreground)]">
            All servers across every node. Use the wizard to provision a new one.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/servers/new">
            <Plus className="mr-2 h-4 w-4" />
            New server
          </Link>
        </Button>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted-foreground)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, identifier or UUID…"
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-card)] text-[color:var(--color-muted-foreground)]">
              <tr className="border-b border-[color:var(--color-border)] text-left">
                <Th>Identifier</Th>
                <Th>Name</Th>
                <Th>Owner</Th>
                <Th>Node</Th>
                <Th>Egg</Th>
                <Th>Resources</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[color:var(--color-muted-foreground)]">
                    {error ?? "No servers yet. Create one with the wizard."}
                  </td>
                </tr>
              ) : (
                items.map((s) => <ServerRow key={s.id} server={s} onChanged={() => void reload()} />)
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">{children}</th>;
}

function SkeletonRow() {
  return (
    <tr className="border-b border-[color:var(--color-border)]">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-24" />
        </td>
      ))}
    </tr>
  );
}

function ServerRow({ server, onChanged }: { server: ServerSummaryDTO; onChanged: () => void }) {
  const suspend = useMutation(
    () => adminServersApi.setSuspended(server.id, !server.suspended),
    {
      successMessage: server.suspended ? "Server unsuspended" : "Server suspended",
      onSuccess: onChanged,
    },
  );
  return (
    <tr className="border-b border-[color:var(--color-border)] last:border-b-0 hover:bg-[color:var(--color-accent)]/30">
      <td className="px-4 py-3 font-mono text-xs">
        <Link href={`/servers/${server.identifier}`} className="hover:text-[color:var(--color-primary)]">
          {server.identifier}
        </Link>
      </td>
      <td className="px-4 py-3 font-medium">{server.name}</td>
      <td className="px-4 py-3">
        <div>{server.ownerName ?? "—"}</div>
        <div className="text-xs text-[color:var(--color-muted-foreground)]">{server.ownerEmail}</div>
      </td>
      <td className="px-4 py-3">{server.nodeName}</td>
      <td className="px-4 py-3">{server.eggName}</td>
      <td className="px-4 py-3 tabular-nums text-xs">
        {server.memoryMb}/{server.diskMb} MiB
      </td>
      <td className="px-4 py-3">
        <ServerStatusBadge server={server} />
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          size="sm"
          variant="ghost"
          disabled={suspend.isPending}
          onClick={() => void suspend.mutate(undefined)}
          title={server.suspended ? "Unsuspend" : "Suspend"}
        >
          {server.suspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </Button>
      </td>
    </tr>
  );
}

function ServerStatusBadge({ server }: { server: ServerSummaryDTO }) {
  if (server.suspended) {
    return <Badge variant="outline" className="border-amber-500/40 text-amber-500">Suspended</Badge>;
  }
  if (server.installStatus === "installing") {
    return <Badge variant="outline" className="border-sky-500/40 text-sky-500">Installing</Badge>;
  }
  if (server.installStatus === "install_failed") {
    return <Badge variant="outline" className="border-rose-500/40 text-rose-500">Install failed</Badge>;
  }
  if (server.installStatus === "pending") {
    return <Badge variant="outline" className="text-[color:var(--color-muted-foreground)]">Awaiting daemon</Badge>;
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
      return <Badge variant="outline" className="text-[color:var(--color-muted-foreground)]">Offline</Badge>;
  }
}
