import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        // 16px on small screens: iOS Safari zooms into inputs with a smaller font on focus
        "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary aria-invalid:border-danger md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
