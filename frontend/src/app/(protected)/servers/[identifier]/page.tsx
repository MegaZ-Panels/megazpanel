"use client";

import {
  Cpu,
  HardDrive,
  Network,
  Box,
  Globe,
  Calendar,
  ShieldOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useServer } from "./layout";

export default function ServerOverviewPage() {
  const { server } = useServer();

  return (
    <div className="flex flex-col gap-6">
      {/* Resource summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ResourceCard
          icon={<Cpu className="h-4 w-4" />}
          label="Memory"
          value={`${server.memoryMb} MiB`}
          sub={server.swapMb ? `+ ${server.swapMb} MiB swap` : "no swap"}
        />
        <ResourceCard
          icon={<HardDrive className="h-4 w-4" />}
          label="Disk"
          value={`${server.diskMb} MiB`}
        />
        <ResourceCard
          icon={<Cpu className="h-4 w-4" />}
          label="CPU"
          value={server.cpuLimit ? `${server.cpuLimit}%` : "unlimited"}
          sub={server.threads ? `pinned: ${server.threads}` : undefined}
        />
        <ResourceCard
          icon={<Network className="h-4 w-4" />}
          label="Allocations"
          value={`${server.allocations.length} / ${server.allocationLimit}`}
        />
      </div>

      {server.suspended ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <ShieldOff className="h-5 w-5 text-amber-500" />
            <div>
              <div className="font-semibold text-amber-500">This server is suspended</div>
              <div className="text-[color:var(--color-muted-foreground)]">
                Contact an administrator to restore access.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <KV label="Primary address">
            {server.primaryAllocation ? (
              <span className="font-mono">
                {server.primaryAllocation.alias ?? server.primaryAllocation.ip}:
                {server.primaryAllocation.port}
              </span>
            ) : (
              <span className="text-[color:var(--color-muted-foreground)]">—</span>
            )}
          </KV>
          <KV label="Node">
            <span>{server.nodeObj.name}</span>
            <span className="block font-mono text-xs text-[color:var(--color-muted-foreground)]">
              {server.nodeObj.fqdn}
            </span>
          </KV>
          <KV label="Image" wide>
            <span className="font-mono text-xs">{server.image}</span>
          </KV>
          <KV label="Startup" wide>
            <code className="block whitespace-pre-wrap rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-2 text-xs">
              {server.startupOverride ?? server.eggObj.startup}
            </code>
          </KV>
        </CardContent>
      </Card>

      {/* All allocations */}
      {server.allocations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" />
              All allocations
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-[color:var(--color-muted-foreground)]">
                <tr className="border-y border-[color:var(--color-border)] text-left">
                  <th className="px-4 py-2 font-medium">IP</th>
                  <th className="px-4 py-2 font-medium">Port</th>
                  <th className="px-4 py-2 font-medium">Alias</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {server.allocations.map((a) => (
                  <tr key={a.id} className="border-b border-[color:var(--color-border)] last:border-b-0">
                    <td className="px-4 py-2 font-mono text-xs">{a.ip}</td>
                    <td className="px-4 py-2 tabular-nums">{a.port}</td>
                    <td className="px-4 py-2">{a.alias ?? "—"}</td>
                    <td className="px-4 py-2">
                      {server.primaryAllocation?.id === a.id ? (
                        <Badge variant="outline" className="text-emerald-500">Primary</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[color:var(--color-muted-foreground)]">
                          Secondary
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {/* Variables */}
      {server.variables.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Box className="h-4 w-4" />
              Egg variables
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {server.variables
              .filter((v) => v.userViewable)
              .map((v) => (
                <KV key={v.id} label={v.name}>
                  <span className="font-mono text-xs">{v.value || "—"}</span>
                  <span className="block text-[10px] text-[color:var(--color-muted-foreground)]">
                    {v.envVariable}
                  </span>
                </KV>
              ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Metadata
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <KV label="UUID">
            <span className="font-mono text-xs">{server.uuid}</span>
          </KV>
          <KV label="Identifier">
            <span className="font-mono text-xs">{server.identifier}</span>
          </KV>
          <KV label="Created">
            {new Date(server.createdAt).toLocaleString()}
          </KV>
          <KV label="Last updated">
            {new Date(server.updatedAt).toLocaleString()}
          </KV>
        </CardContent>
      </Card>
    </div>
  );
}

function ResourceCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
          {icon}
          {label}
        </div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
        {sub ? <div className="text-xs text-[color:var(--color-muted-foreground)]">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function KV({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
