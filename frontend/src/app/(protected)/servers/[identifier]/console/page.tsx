"use client";

import { Terminal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useServer } from "../layout";

export default function ServerConsolePage() {
  const { server } = useServer();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
        <Terminal className="h-12 w-12 text-[color:var(--color-muted-foreground)]" />
        <div className="space-y-1">
          <div className="text-base font-medium">Console</div>
          <p className="max-w-md text-sm text-[color:var(--color-muted-foreground)]">
            The realtime WebSocket console will live here once the daemon ({server.nodeObj.name}) connects.
            Coming in the next phase.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
