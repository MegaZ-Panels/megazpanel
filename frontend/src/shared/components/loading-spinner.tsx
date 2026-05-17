import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export function LoadingSpinner({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-2 text-sm text-[color:var(--color-muted-foreground)]", className)}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </div>
  );
}
