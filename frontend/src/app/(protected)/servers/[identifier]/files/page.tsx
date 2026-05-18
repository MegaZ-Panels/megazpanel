"use client";

import { FolderOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useServer } from "../layout";

export default function ServerFilesPage() {
  useServer(); // ensure layout context is mounted
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
        <FolderOpen className="h-12 w-12 text-[color:var(--color-muted-foreground)]" />
        <div className="space-y-1">
          <div className="text-base font-medium">File manager</div>
          <p className="max-w-md text-sm text-[color:var(--color-muted-foreground)]">
            Drag-and-drop uploads, ZIP create/extract, and Monaco-powered editing
            are wired in the daemon phase.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
