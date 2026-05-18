"use client";

import { Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useServer } from "../layout";

export default function ServerBackupsPage() {
  const { server } = useServer();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
        <Save className="h-12 w-12 text-[color:var(--color-muted-foreground)]" />
        <div className="space-y-1">
          <div className="text-base font-medium">Backups</div>
          <p className="max-w-md text-sm text-[color:var(--color-muted-foreground)]">
            This server allows up to {server.backupLimit} backup(s).
            Manual + scheduled snapshots arrive once the daemon is online.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
