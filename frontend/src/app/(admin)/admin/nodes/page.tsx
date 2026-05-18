"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HardDrive, Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { nodesApi } from "@/features/nodes/api";
import type { NodeDTO } from "@/features/nodes/types";
import { ApiError } from "@/shared/lib/axios";

export default function AdminNodesPage() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<NodeDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounced = useDebouncedValue(search, 250);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    nodesApi
      .list({ search: debounced || undefined, limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load nodes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <HardDrive className="h-6 w-6" />
            Nodes
          </h1>
          <p className="text-sm text-[color:var(--color-muted-foreground)]">
            Daemon hosts that run server containers. Each node holds allocations and servers.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/nodes/new">
            <Plus className="mr-2 h-4 w-4" />
            New node
          </Link>
        </Button>
      </header>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted-foreground)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, FQDN, location…"
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-card)] text-[color:var(--color-muted-foreground)]">
              <tr className="border-b border-[color:var(--color-border)] text-left">
                <Th>Name</Th>
                <Th>FQDN</Th>
                <Th>Memory</Th>
                <Th>Disk</Th>
                <Th>Allocations</Th>
                <Th>Servers</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : items.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-[color:var(--color-muted-foreground)]">
                        {error ?? "No nodes yet. Click \u201cNew node\u201d to get started."}
                      </td>
                    </tr>
                  )
                  : items.map((n) => <NodeRow key={n.id} node={n} />)}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">{children}</th>;
}

function SkeletonRow() {
  return (
    <tr className="border-b border-[color:var(--color-border)]">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-24" />
        </td>
      ))}
    </tr>
  );
}

function NodeRow({ node }: { node: NodeDTO }) {
  return (
    <tr className="border-b border-[color:var(--color-border)] last:border-b-0 hover:bg-[color:var(--color-accent)]/30">
      <td className="px-4 py-3">
        <Link
          href={`/admin/nodes/${node.id}`}
          className="font-medium text-[color:var(--color-foreground)] hover:text-[color:var(--color-primary)]"
        >
          {node.name}
        </Link>
        {node.location ? (
          <div className="text-xs text-[color:var(--color-muted-foreground)]">{node.location}</div>
        ) : null}
      </td>
      <td className="px-4 py-3 font-mono text-xs">
        {node.scheme}://{node.fqdn}:{node.port}
      </td>
      <td className="px-4 py-3 tabular-nums">{formatMb(node.maxMemoryMb)}</td>
      <td className="px-4 py-3 tabular-nums">{formatMb(node.maxDiskMb)}</td>
      <td className="px-4 py-3 tabular-nums">{node.allocationsCount}</td>
      <td className="px-4 py-3 tabular-nums">{node.serversCount}</td>
      <td className="px-4 py-3">
        <NodeStatusBadge node={node} />
      </td>
    </tr>
  );
}

function NodeStatusBadge({ node }: { node: NodeDTO }) {
  if (node.maintenance) {
    return <Badge variant="outline" className="border-amber-500/40 text-amber-500">Maintenance</Badge>;
  }
  if (!node.lastHeartbeatAt) {
    return <Badge variant="outline" className="text-[color:var(--color-muted-foreground)]">No heartbeat</Badge>;
  }
  const stale = Date.now() - new Date(node.lastHeartbeatAt).getTime() > 90_000;
  return stale ? (
    <Badge variant="outline" className="border-rose-500/40 text-rose-500">Offline</Badge>
  ) : (
    <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20">Online</Badge>
  );
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GiB`;
  return `${mb} MiB`;
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
