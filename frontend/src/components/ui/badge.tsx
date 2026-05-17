import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--color-ring)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]",
        secondary:
          "border-transparent bg-[color:var(--color-secondary)] text-[color:var(--color-secondary-foreground)]",
        destructive:
          "border-transparent bg-[color:var(--color-destructive)] text-[color:var(--color-destructive-foreground)]",
        outline: "text-[color:var(--color-foreground)]",
        success:
          "border-transparent bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]",
        warning:
          "border-transparent bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning)]",
        info: "border-transparent bg-[color:var(--color-info)]/15 text-[color:var(--color-info)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
