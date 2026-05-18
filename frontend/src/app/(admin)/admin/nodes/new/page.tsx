"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Copy, Eye, EyeOff, KeyRound, Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useMutation } from "@/shared/hooks/use-mutation";
import { nodesApi } from "@/features/nodes/api";
import type { NodeCreateInput, NodeWithToken } from "@/features/nodes/types";

export default function NewNodePage() {
  const router = useRouter();
  const [created, setCreated] = useState<NodeWithToken | null>(null);

  const [form, setForm] = useState<NodeCreateInput>({
    name: "",
    description: "",
    fqdn: "",
    scheme: "https",
    port: 8443,
    publicAddress: "",
    location: "",
    maxMemoryMb: 4096,
    maxDiskMb: 50_000,
    memoryOverallocate: 0,
    diskOverallocate: 0,
    maintenance: false,
    public: true,
  });

  const create = useMutation(
    (input: NodeCreateInput) => nodesApi.create(input),
    {
      successMessage: "Node created. Save the token now — it won't be shown again.",
      onSuccess: (node) => setCreated(node),
    },
  );

  if (created) {
    return <NodeTokenReveal node={created} onContinue={() => router.push(`/admin/nodes/${created.id}`)} />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-[color:var(--color-muted-foreground)]">
          <Link href="/admin/nodes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to nodes
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Server className="h-6 w-6" />
          Register a new node
        </h1>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          Define how the panel will reach the daemon. After creating, you&apos;ll get a one-time token to install.
        </p>
      </header>

      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name || !form.fqdn) {
            toast.error("Name and FQDN are required");
            return;
          }
          void create.mutate(form);
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Human-friendly name and an optional location label.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="node-sg-01"
                required
              />
            </Field>
            <Field label="Location">
              <Input
                value={form.location ?? ""}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Singapore, AWS ap-southeast-1, …"
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Input
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional notes"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daemon connection</CardTitle>
            <CardDescription>FQDN must resolve to the daemon host. Default port 8443.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Scheme">
              <select
                value={form.scheme}
                onChange={(e) => setForm({ ...form, scheme: e.target.value as "http" | "https" })}
                className="flex h-10 w-full rounded-md border border-[color:var(--color-input)] bg-[color:var(--color-background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
              >
                <option value="https">https</option>
                <option value="http">http (lab only)</option>
              </select>
            </Field>
            <Field label="Port">
              <Input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
              />
            </Field>
            <Field label="FQDN" required className="sm:col-span-2">
              <Input
                value={form.fqdn}
                onChange={(e) => setForm({ ...form, fqdn: e.target.value })}
                placeholder="node1.example.com"
                required
              />
            </Field>
            <Field label="Public address (optional)" className="sm:col-span-2">
              <Input
                value={form.publicAddress ?? ""}
                onChange={(e) => setForm({ ...form, publicAddress: e.target.value })}
                placeholder="IP exposed to end users (defaults to FQDN)"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capacity</CardTitle>
            <CardDescription>Resource ceilings used for capacity checks when creating servers.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Max memory (MiB)" required>
              <Input
                type="number"
                min={1}
                value={form.maxMemoryMb}
                onChange={(e) => setForm({ ...form, maxMemoryMb: Number(e.target.value) })}
                required
              />
            </Field>
            <Field label="Max disk (MiB)" required>
              <Input
                type="number"
                min={1}
                value={form.maxDiskMb}
                onChange={(e) => setForm({ ...form, maxDiskMb: Number(e.target.value) })}
                required
              />
            </Field>
            <Field label="Memory overallocation (%)">
              <Input
                type="number"
                min={0}
                max={1000}
                value={form.memoryOverallocate}
                onChange={(e) => setForm({ ...form, memoryOverallocate: Number(e.target.value) })}
              />
            </Field>
            <Field label="Disk overallocation (%)">
              <Input
                type="number"
                min={0}
                max={1000}
                value={form.diskOverallocate}
                onChange={(e) => setForm({ ...form, diskOverallocate: Number(e.target.value) })}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!!form.public}
                  onCheckedChange={(v) => setForm({ ...form, public: !!v })}
                />
                Public — visible when admins create servers
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!!form.maintenance}
                  onCheckedChange={(v) => setForm({ ...form, maintenance: !!v })}
                />
                Maintenance — block new servers from being created here
              </label>
            </div>
            <Button type="submit" disabled={create.isPending} className="self-end">
              {create.isPending ? "Creating…" : "Create node"}
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

function NodeTokenReveal({
  node,
  onContinue,
}: {
  node: NodeWithToken;
  onContinue: () => void;
}) {
  const [shown, setShown] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.daemonToken);
      toast.success("Token copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[color:var(--color-primary)]" />
            Save your daemon token
          </CardTitle>
          <CardDescription>
            This is the only time the plaintext token will be shown. Store it securely
            and configure your daemon with it before leaving this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4">
            <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
              Token identifier
            </div>
            <div className="mt-1 font-mono text-sm">{node.daemonTokenIdentifier}</div>
          </div>

          <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
                Token (one-time)
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setShown((v) => !v)}>
                  {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={copy}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mt-2 break-all font-mono text-sm">
              {shown ? node.daemonToken : "••••••••••••••••••••••••••••••••••••••••••"}
            </div>
          </div>

          <Button onClick={onContinue}>
            I&apos;ve saved it — continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
