"use client";

import { useEffect, useState } from "react";
import { Plus, Search, Trash2, Users as UsersIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation } from "@/shared/hooks/use-mutation";
import { adminUsersApi } from "@/features/admin-users/api";
import type {
  AdminUserCreateInput,
  AdminUserDTO,
  Role,
} from "@/features/admin-users/types";
import { ApiError } from "@/shared/lib/axios";
import { useAuthStore } from "@/stores/auth-store";

const ALL_ROLES: Role[] = ["owner", "admin", "operator", "viewer"];

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<AdminUserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = async () => {
    try {
      setLoading(true);
      const res = await adminUsersApi.list({ search: search || undefined, limit: 200 });
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load users");
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
            <UsersIcon className="h-6 w-6" />
            Users
          </h1>
          <p className="text-sm text-[color:var(--color-muted-foreground)]">
            Panel accounts and their roles. Owners and admins can manage everyone.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showCreate ? "Cancel" : "New user"}
        </Button>
      </header>

      {showCreate ? (
        <CreateUserCard
          onCreated={() => {
            setShowCreate(false);
            void reload();
          }}
        />
      ) : null}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted-foreground)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-card)] text-[color:var(--color-muted-foreground)]">
              <tr className="border-b border-[color:var(--color-border)] text-left">
                <Th>User</Th>
                <Th>Status</Th>
                <Th>Roles</Th>
                <Th>Verified</Th>
                <Th>Created</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[color:var(--color-muted-foreground)]">
                    {error ?? "No users."}
                  </td>
                </tr>
              ) : (
                items.map((u) => <UserRow key={u.id} user={u} onChanged={() => void reload()} />)
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
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-24" />
        </td>
      ))}
    </tr>
  );
}

function UserRow({ user, onChanged }: { user: AdminUserDTO; onChanged: () => void }) {
  const me = useAuthStore((s) => s.user);
  const isSelf = me?.id === user.id;

  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<Role[]>(user.roles);

  const setRolesMut = useMutation(
    () => adminUsersApi.setRoles(user.id, { roles }),
    {
      successMessage: "Roles updated",
      onSuccess: () => {
        setEditing(false);
        onChanged();
      },
    },
  );

  const remove = useMutation(() => adminUsersApi.remove(user.id), {
    successMessage: "User deleted",
    onSuccess: onChanged,
  });

  const toggleRole = (r: Role) => {
    setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));
  };

  return (
    <tr className="border-b border-[color:var(--color-border)] last:border-b-0 hover:bg-[color:var(--color-accent)]/30">
      <td className="px-4 py-3">
        <div className="font-medium">{user.name ?? "—"}</div>
        <div className="text-xs text-[color:var(--color-muted-foreground)]">{user.email}</div>
      </td>
      <td className="px-4 py-3">
        <Badge
          variant="outline"
          className={
            user.status === "active"
              ? "border-emerald-500/40 text-emerald-500"
              : user.status === "suspended"
                ? "border-rose-500/40 text-rose-500"
                : "border-amber-500/40 text-amber-500"
          }
        >
          {user.status}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                {r}
              </label>
            ))}
            <Button size="sm" disabled={setRolesMut.isPending} onClick={() => void setRolesMut.mutate(undefined)}>
              {setRolesMut.isPending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setRoles(user.roles); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="flex flex-wrap gap-1 hover:opacity-80"
            onClick={() => setEditing(true)}
            title="Click to edit"
          >
            {user.roles.length === 0 ? (
              <span className="text-[color:var(--color-muted-foreground)]">—</span>
            ) : (
              user.roles.map((r) => (
                <Badge key={r} variant="outline" className="font-mono text-[10px] uppercase">
                  {r}
                </Badge>
              ))
            )}
          </button>
        )}
      </td>
      <td className="px-4 py-3">
        {user.emailVerified ? (
          <span className="text-emerald-500">yes</span>
        ) : (
          <span className="text-[color:var(--color-muted-foreground)]">no</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-[color:var(--color-muted-foreground)]">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          size="sm"
          variant="ghost"
          disabled={isSelf || remove.isPending}
          onClick={() => {
            if (confirm(`Delete ${user.email}?`)) void remove.mutate(undefined);
          }}
          title={isSelf ? "Cannot delete yourself" : "Delete user"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

function CreateUserCard({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<AdminUserCreateInput>({
    email: "",
    name: "",
    password: "",
    roles: ["viewer"],
    status: "active",
    emailVerified: true,
  });

  const create = useMutation((input: AdminUserCreateInput) => adminUsersApi.create(input), {
    successMessage: "User created",
    onSuccess: () => onCreated(),
  });

  const toggleRole = (r: Role) => {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r],
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create user</CardTitle>
        <CardDescription>Account becomes active immediately. Password must be ≥ 12 chars with mixed classes.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.email || !form.name || !form.password) return toast.error("All fields required");
            void create.mutate(form);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Password</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="min 12 chars, upper+lower+digit+symbol"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-3">
              {ALL_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.roles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                  <span className="capitalize">{r}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
