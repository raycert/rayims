import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Standard page width and padding. */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8", className)}>
      {children}
    </div>
  );
}
