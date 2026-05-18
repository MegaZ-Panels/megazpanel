"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Server as ServerIcon,
  HardDrive,
  Users,
  Activity,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminUsersApi } from "@/features/admin-users/api";
import { adminServersApi } from "@/features/servers/api";
import { nodesApi } from "@/features/nodes/api";

type Stats = {
  servers: number | null;
  nodes: number | null;
  users: number | null;
};

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats>({ servers: null, nodes: null, users: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [servers, nodes, users] = await Promise.all([
          adminServersApi.list({ limit: 1 }).catch(() => null),
          nodesApi.list({ limit: 200 }).catch(() => null),
          adminUsersApi.list({ limit: 200 }).catch(() => null),
        ]);
        if (cancelled) return;
        setStats({
          servers: servers?.items.length ?? 0,
          nodes: nodes?.items.length ?? 0,
          users: users?.items.length ?? 0,
        });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Admin overview</h1>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          High-level view of your panel. Use the nav to drill into nodes, servers and users.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<ServerIcon className="h-5 w-5" />}
          title="Servers"
          value={stats.servers}
          loaded={loaded}
          href="/admin/servers"
          accent="from-emerald-500/20 to-emerald-500/0"
        />
        <StatCard
          icon={<HardDrive className="h-5 w-5" />}
          title="Nodes"
          value={stats.nodes}
          loaded={loaded}
          href="/admin/nodes"
          accent="from-sky-500/20 to-sky-500/0"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          title="Users"
          value={stats.users}
          loaded={loaded}
          href="/admin/users"
          accent="from-violet-500/20 to-violet-500/0"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Quick start
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <QuickAction
            href="/admin/nodes/new"
            title="Register a node"
            description="Add a new daemon host. You'll get a one-time token to install on it."
          />
          <QuickAction
            href="/admin/servers/new"
            title="Create a server"
            description="Allocate a host:port and provision a container from an egg."
          />
          <QuickAction
            href="/admin/users"
            title="Invite a user"
            description="Create accounts and assign roles for staff or customers."
          />
          <QuickAction
            href="/admin/settings"
            title="Panel settings"
            description="Mail server, branding, monitoring and global defaults."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  loaded,
  href,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  value: number | null;
  loaded: boolean;
  href: string;
  accent: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="relative overflow-hidden transition group-hover:border-[color:var(--color-primary)]/60">
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${accent}`}
          aria-hidden
        />
        <CardContent className="relative flex flex-col gap-2 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-muted-foreground)]">
              {icon}
              {title}
            </div>
            <ArrowRight className="h-4 w-4 text-[color:var(--color-muted-foreground)] transition group-hover:translate-x-0.5 group-hover:text-[color:var(--color-foreground)]" />
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">
            {loaded ? (value ?? "—") : <Skeleton className="h-9 w-16" />}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickAction({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Button
      asChild
      variant="outline"
      className="h-auto justify-start gap-3 px-4 py-3 text-left"
    >
      <Link href={href}>
        <div className="flex w-full items-start justify-between gap-3">
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-xs font-normal text-[color:var(--color-muted-foreground)]">
              {description}
            </div>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0" />
        </div>
      </Link>
    </Button>
  );
}
