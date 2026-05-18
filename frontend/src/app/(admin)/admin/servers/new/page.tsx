"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Server as ServerIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation } from "@/shared/hooks/use-mutation";
import { adminServersApi } from "@/features/servers/api";
import type { ServerCreateInput } from "@/features/servers/types";
import { adminUsersApi } from "@/features/admin-users/api";
import type { AdminUserDTO } from "@/features/admin-users/types";
import { nodesApi } from "@/features/nodes/api";
import type { AllocationDTO, NodeDTO } from "@/features/nodes/types";
import { eggsApi, type EggDetailDTO, type EggSummaryDTO } from "@/features/eggs/api";

type FormState = {
  name: string;
  description: string;
  ownerId: string;
  nodeId: string;
  eggId: string;
  allocationId: string;
  image: string;
  startupOverride: string;
  memoryMb: number;
  swapMb: number;
  diskMb: number;
  cpuLimit: number;
  ioWeight: number;
  backupLimit: number;
  databaseLimit: number;
  allocationLimit: number;
  variables: Record<string, string>;
};

export default function NewServerWizardPage() {
  const router = useRouter();

  const [users, setUsers] = useState<AdminUserDTO[]>([]);
  const [nodes, setNodes] = useState<NodeDTO[]>([]);
  const [eggs, setEggs] = useState<EggSummaryDTO[]>([]);
  const [allocations, setAllocations] = useState<AllocationDTO[]>([]);
  const [eggDetail, setEggDetail] = useState<EggDetailDTO | null>(null);
  const [loadingPrereqs, setLoadingPrereqs] = useState(true);

  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    ownerId: "",
    nodeId: "",
    eggId: "",
    allocationId: "",
    image: "",
    startupOverride: "",
    memoryMb: 1024,
    swapMb: 0,
    diskMb: 5120,
    cpuLimit: 0,
    ioWeight: 500,
    backupLimit: 2,
    databaseLimit: 0,
    allocationLimit: 1,
    variables: {},
  });

  // Load users + nodes + eggs upfront.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [u, n, e] = await Promise.all([
          adminUsersApi.list({ limit: 200 }),
          nodesApi.list({ limit: 200 }),
          eggsApi.list({ limit: 200 }),
        ]);
        if (cancelled) return;
        setUsers(u.items);
        setNodes(n.items);
        setEggs(e.items);
      } catch {
        toast.error("Failed to load form data");
      } finally {
        if (!cancelled) setLoadingPrereqs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load allocations whenever nodeId changes (only unassigned).
  useEffect(() => {
    if (!form.nodeId) {
      setAllocations([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await nodesApi.listAllocations(form.nodeId, {
          assigned: "false",
          limit: 500,
        });
        if (!cancelled) setAllocations(res.items);
      } catch {
        if (!cancelled) setAllocations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.nodeId]);

  // Load egg detail (variables) when eggId changes.
  useEffect(() => {
    if (!form.eggId) {
      setEggDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const detail = await eggsApi.get(form.eggId);
        if (cancelled) return;
        setEggDetail(detail);
        // Pre-fill image, startup, and variable defaults.
        setForm((f) => ({
          ...f,
          image: f.image || detail.defaultDockerImage,
          startupOverride: f.startupOverride || detail.startup,
          variables: detail.variables.reduce<Record<string, string>>((acc, v) => {
            acc[v.envVariable] = f.variables[v.envVariable] ?? v.defaultValue ?? "";
            return acc;
          }, {}),
        }));
      } catch {
        if (!cancelled) setEggDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.eggId]);

  const create = useMutation(
    (input: ServerCreateInput) => adminServersApi.create(input),
    {
      successMessage: "Server created",
      onSuccess: (s) => router.replace(`/admin/servers?search=${s.identifier}`),
    },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast.error("Name is required");
    if (!form.ownerId) return toast.error("Owner is required");
    if (!form.nodeId) return toast.error("Node is required");
    if (!form.eggId) return toast.error("Egg is required");
    if (!form.allocationId) return toast.error("Allocation is required");

    const payload: ServerCreateInput = {
      name: form.name,
      description: form.description || null,
      ownerId: form.ownerId,
      nodeId: form.nodeId,
      eggId: form.eggId,
      allocationId: form.allocationId,
      image: form.image || undefined,
      startupOverride: form.startupOverride || null,
      memoryMb: form.memoryMb,
      swapMb: form.swapMb,
      diskMb: form.diskMb,
      cpuLimit: form.cpuLimit,
      ioWeight: form.ioWeight,
      backupLimit: form.backupLimit,
      databaseLimit: form.databaseLimit,
      allocationLimit: form.allocationLimit,
      variables: form.variables,
    };
    void create.mutate(payload);
  };

  const noNodes = !loadingPrereqs && nodes.length === 0;
  const noEggs = !loadingPrereqs && eggs.length === 0;
  const noUsers = !loadingPrereqs && users.length === 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start text-[color:var(--color-muted-foreground)]">
        <Link href="/admin/servers">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to servers
        </Link>
      </Button>

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ServerIcon className="h-6 w-6" />
          Create a server
        </h1>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          Provision a new container. The daemon installs it asynchronously after you submit.
        </p>
      </header>

      {(noNodes || noEggs || noUsers) && !loadingPrereqs ? (
        <Card className="border-amber-500/40">
          <CardContent className="flex items-start gap-3 p-5 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
            <div>
              <div className="font-semibold">Missing prerequisites:</div>
              <ul className="mt-1 list-disc pl-5 text-[color:var(--color-muted-foreground)]">
                {noNodes && <li>No nodes registered. <Link className="underline" href="/admin/nodes/new">Add one →</Link></li>}
                {noEggs && <li>No eggs imported.</li>}
                {noUsers && <li>No users.</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <form className="flex flex-col gap-6" onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Pick an owner and give the server a name.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="my-game-server" required />
            </Field>
            <Field label="Owner" required>
              {loadingPrereqs ? <Skeleton className="h-10" /> : (
                <Select value={form.ownerId} onChange={(v) => setForm({ ...form, ownerId: v })}>
                  <option value="">Select owner…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email} ({u.email})</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Placement</CardTitle>
            <CardDescription>Pick a node, then claim an unassigned allocation.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Node" required>
              {loadingPrereqs ? <Skeleton className="h-10" /> : (
                <Select
                  value={form.nodeId}
                  onChange={(v) => setForm({ ...form, nodeId: v, allocationId: "" })}
                >
                  <option value="">Select node…</option>
                  {nodes.filter((n) => n.public && !n.maintenance).map((n) => (
                    <option key={n.id} value={n.id}>{n.name} — {n.fqdn}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Allocation" required>
              <Select
                value={form.allocationId}
                onChange={(v) => setForm({ ...form, allocationId: v })}
                disabled={!form.nodeId}
              >
                <option value="">{form.nodeId ? "Select allocation…" : "Pick a node first"}</option>
                {allocations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.ip}:{a.port}{a.alias ? ` (${a.alias})` : ""}
                  </option>
                ))}
              </Select>
              {form.nodeId && allocations.length === 0 ? (
                <span className="text-xs text-amber-500">
                  No free allocations on this node. Add some in /admin/nodes/{form.nodeId}.
                </span>
              ) : null}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Egg & runtime</CardTitle>
            <CardDescription>Choose what the container will run.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Egg" required>
              {loadingPrereqs ? <Skeleton className="h-10" /> : (
                <Select value={form.eggId} onChange={(v) => setForm({ ...form, eggId: v, image: "", startupOverride: "" })}>
                  <option value="">Select egg…</option>
                  {eggs.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Docker image">
              <Input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="defaults to egg's primary image" />
            </Field>
            <Field label="Startup command (override)" className="sm:col-span-2">
              <Input value={form.startupOverride} onChange={(e) => setForm({ ...form, startupOverride: e.target.value })} placeholder="defaults to the egg's startup line" />
            </Field>
          </CardContent>
        </Card>

        {eggDetail && eggDetail.variables.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Egg variables</CardTitle>
              <CardDescription>Variables exposed by the egg. Locked variables are pre-filled.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {eggDetail.variables.map((v) => (
                <Field
                  key={v.id}
                  label={v.name}
                  required={/(^|\|)required(\||$)/.test(v.rules)}
                >
                  <Input
                    value={form.variables[v.envVariable] ?? ""}
                    onChange={(e) => setForm({ ...form, variables: { ...form.variables, [v.envVariable]: e.target.value } })}
                    placeholder={v.defaultValue ?? ""}
                    disabled={!v.userEditable}
                  />
                  {v.description ? (
                    <span className="text-xs text-[color:var(--color-muted-foreground)]">{v.description}</span>
                  ) : null}
                </Field>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Resources</CardTitle>
            <CardDescription>Limits enforced by the daemon. CPU 0 = unlimited.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Memory (MiB)" required>
              <Input type="number" min={1} value={form.memoryMb} onChange={(e) => setForm({ ...form, memoryMb: Number(e.target.value) })} required />
            </Field>
            <Field label="Swap (MiB)">
              <Input type="number" min={0} value={form.swapMb} onChange={(e) => setForm({ ...form, swapMb: Number(e.target.value) })} />
            </Field>
            <Field label="Disk (MiB)" required>
              <Input type="number" min={1} value={form.diskMb} onChange={(e) => setForm({ ...form, diskMb: Number(e.target.value) })} required />
            </Field>
            <Field label="CPU (%)">
              <Input type="number" min={0} max={10000} value={form.cpuLimit} onChange={(e) => setForm({ ...form, cpuLimit: Number(e.target.value) })} />
            </Field>
            <Field label="IO weight">
              <Input type="number" min={10} max={1000} value={form.ioWeight} onChange={(e) => setForm({ ...form, ioWeight: Number(e.target.value) })} />
            </Field>
            <div />
            <Field label="Backups limit">
              <Input type="number" min={0} value={form.backupLimit} onChange={(e) => setForm({ ...form, backupLimit: Number(e.target.value) })} />
            </Field>
            <Field label="Databases limit">
              <Input type="number" min={0} value={form.databaseLimit} onChange={(e) => setForm({ ...form, databaseLimit: Number(e.target.value) })} />
            </Field>
            <Field label="Allocations limit">
              <Input type="number" min={1} value={form.allocationLimit} onChange={(e) => setForm({ ...form, allocationLimit: Number(e.target.value) })} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex justify-end p-6">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create server"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label>
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="flex h-10 w-full rounded-md border border-[color:var(--color-input)] bg-[color:var(--color-background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </select>
  );
}
