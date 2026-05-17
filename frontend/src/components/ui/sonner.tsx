"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[color:var(--color-card)] group-[.toaster]:text-[color:var(--color-card-foreground)] group-[.toaster]:border-[color:var(--color-border)] group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-[color:var(--color-muted-foreground)]",
          actionButton:
            "group-[.toast]:bg-[color:var(--color-primary)] group-[.toast]:text-[color:var(--color-primary-foreground)]",
          cancelButton:
            "group-[.toast]:bg-[color:var(--color-muted)] group-[.toast]:text-[color:var(--color-muted-foreground)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
