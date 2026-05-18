"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  HardDrive,
  Plus,
  RefreshCw,
  Trash2,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useMutation } from "@/shared/hooks/use-mutation";
import { nodesApi } from "@/features/nodes/api";
import type { AllocationDTO, NodeDTO, NodeWithToken } from "@/features/nodes/types";

export default function AdminNodeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [node, setNode] = useState<NodeDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const fresh = await nodesApi.get(id);
      setNode(fresh);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load node");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rotate = useMutation(() => nodesApi.rotateToken(id), {
    successMessage: "Token rotated. Save the new value now.",
  });

  const remove = useMutation(() => nodesApi.remove(id), {
    successMessage: "Node deleted",
    onSuccess: () => router.replace("/admin/nodes"),
  });

  if (loading && !node) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !node) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <CardContent className="p-6 text-center text-[color:var(--color-muted-foreground)]">
            {error ?? "Node not found"}
            <div className="mt-4">
              <Button asChild variant="outline">
                <Link href="/admin/nodes">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to nodes
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start text-[color:var(--color-muted-foreground)]">
        <Link href="/admin/nodes">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to nodes
        </Link>
      </Button>

      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <HardDrive className="h-6 w-6" />
            {node.name}
          </h1>
          <p className="font-mono text-xs text-[color:var(--color-muted-foreground)]">
            {node.scheme}://{node.fqdn}:{node.port}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("Rotate the daemon token? The current daemon will lose access.")) {
                void rotate.mutate(undefined);
              }
            }}
            disabled={rotate.isPending}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {rotate.isPending ? "Rotating…" : "Rotate token"}
          </Button>
          <Button
            variant="outline"
            className="text-rose-500 hover:text-rose-500"
            onClick={() => {
              if (confirm("Delete this node? Allocations will be removed; this cannot be undone.")) {
                void remove.mutate(undefined);
              }
            }}
            disabled={remove.isPending || node.serversCount > 0}
            title={node.serversCount > 0 ? "Detach servers first" : undefined}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </header>

      {rotate.result ? <RotatedTokenCard token={rotate.result} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Memory" value={`${node.maxMemoryMb} MiB`} sub={`${node.memoryOverallocate}% overcommit`} />
        <StatCard label="Disk" value={`${node.maxDiskMb} MiB`} sub={`${node.diskOverallocate}% overcommit`} />
        <StatCard
          label="State"
          value={
            <span className="flex items-center gap-2">
              {node.maintenance ? (
                <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-500">Maintenance</Badge>
              ) : node.lastHeartbeatAt ? (
                <Badge className="bg-emerald-500/15 text-emerald-500">Reporting</Badge>
              ) : (
                <Badge variant="outline" className="text-[color:var(--color-muted-foreground)]">
                  Awaiting daemon
                </Badge>
              )}
            </span>
          }
          sub={node.daemonVersion ? `daemon ${node.daemonVersion}` : "no version"}
        />
      </div>

      <AllocationsPanel nodeId={id} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-5">
        <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted-foreground)]">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
        {sub ? <div className="text-xs text-[color:var(--color-muted-foreground)]">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function RotatedTokenCard({ token }: { token: NodeWithToken }) {
  const [shown, setShown] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token.daemonToken);
      toast.success("Token copied");
    } catch {
      toast.error("Failed to copy");
    }
  };
  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-amber-500" />
          New daemon token (one-time)
        </CardTitle>
        <CardDescription className="flex items-center gap-2 text-amber-500">
          <AlertTriangle className="h-4 w-4" />
          Update the daemon configuration before navigating away.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-3">
          <code className="break-all font-mono text-sm">
            {shown ? token.daemonToken : "•••••••••••••••••••••••••••••••••••••••"}
          </code>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setShown((v) => !v)}>
              {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={copy}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AllocationsPanel({ nodeId }: { nodeId: string }) {
  const [items, setItems] = useState<AllocationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const res = await nodesApi.listAllocations(nodeId, { limit: 200 });
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Allocations</CardTitle>
          <CardDescription>host:port pairs that servers can claim on this node</CardDescription>
        </div>
        <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          {showAdd ? "Hide form" : "Add range"}
        </Button>
      </CardHeader>
      {showAdd ? (
        <CardContent>
          <BulkAllocationForm nodeId={nodeId} onCreated={() => { setShowAdd(false); void reload(); }} />
          <Separator className="my-4" />
        </CardContent>
      ) : null}
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-card)] text-[color:var(--color-muted-foreground)]">
            <tr className="border-y border-[color:var(--color-border)] text-left">
              <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider">IP</th>
              <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider">Port</th>
              <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider">Alias</th>
              <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider">Server</th>
              <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-[color:var(--color-border)]">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[color:var(--color-muted-foreground)]">
                  No allocations yet. Click &ldquo;Add range&rdquo; to create some.
                </td>
              </tr>
            ) : (
              items.map((a) => <AllocationRow key={a.id} alloc={a} onDeleted={() => void reload()} />)
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AllocationRow({ alloc, onDeleted }: { alloc: AllocationDTO; onDeleted: () => void }) {
  const remove = useMutation(() => nodesApi.deleteAllocation(alloc.id), {
    successMessage: "Allocation deleted",
    onSuccess: onDeleted,
  });
  return (
    <tr className="border-b border-[color:var(--color-border)] last:border-b-0">
      <td className="px-4 py-3 font-mono text-xs">{alloc.ip}</td>
      <td className="px-4 py-3 tabular-nums">{alloc.port}</td>
      <td className="px-4 py-3">{alloc.alias ?? <span className="text-[color:var(--color-muted-foreground)]">—</span>}</td>
      <td className="px-4 py-3">
        {alloc.serverIdentifier ? (
          <Link href={`/admin/servers?search=${alloc.serverIdentifier}`} className="font-mono text-xs hover:underline">
            {alloc.serverName ?? alloc.serverIdentifier}
          </Link>
        ) : (
          <Badge variant="outline" className="text-emerald-500">Free</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          size="sm"
          variant="ghost"
          disabled={!!alloc.serverId || remove.isPending}
          onClick={() => {
            if (confirm(`Delete ${alloc.ip}:${alloc.port}?`)) void remove.mutate(undefined);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

function BulkAllocationForm({ nodeId, onCreated }: { nodeId: string; onCreated: () => void }) {
  const [ip, setIp] = useState("");
  const [alias, setAlias] = useState("");
  const [fromPort, setFromPort] = useState(25565);
  const [toPort, setToPort] = useState(25565);

  const create = useMutation(
    () =>
      nodesApi.bulkCreateAllocations(nodeId, {
        ip,
        alias: alias || null,
        fromPort,
        toPort,
      }),
    {
      successMessage: (r) => `Created ${r.created} of ${r.requested} allocation(s)`,
      onSuccess: () => onCreated(),
    },
  );

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ip) return toast.error("IP is required");
        if (toPort < fromPort) return toast.error("toPort must be >= fromPort");
        void create.mutate(undefined);
      }}
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>IP address</Label>
        <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="0.0.0.0 or 1.2.3.4" required />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Alias (optional)</Label>
        <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="public-edge-1" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>From port</Label>
        <Input type="number" min={1} max={65535} value={fromPort} onChange={(e) => setFromPort(Number(e.target.value))} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>To port</Label>
        <Input type="number" min={1} max={65535} value={toPort} onChange={(e) => setToPort(Number(e.target.value))} />
      </div>
      <div className="sm:col-span-2 flex items-end justify-end gap-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create allocations"}
        </Button>
      </div>
    </form>
  );
}
