"use client";

import { Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServer } from "../layout";

export default function ServerSettingsPage() {
  const { server } = useServer();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SettingsIcon className="h-4 w-4" />
            Server settings
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <KV label="Name">{server.name}</KV>
          <KV label="Description">
            {server.description ?? <span className="text-[color:var(--color-muted-foreground)]">—</span>}
          </KV>
          <KV label="Owner">{server.ownerObj.email}</KV>
          <KV label="Egg">{server.eggObj.name}</KV>
        </CardContent>
      </Card>
      <p className="px-2 text-xs text-[color:var(--color-muted-foreground)]">
        Renaming, reinstall, transfer, and rebuild controls land in a later phase.
      </p>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
