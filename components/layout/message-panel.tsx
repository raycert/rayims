import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Centered message card used by the not-found and error screens. */
export function MessagePanel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center rounded-lg border border-border bg-surface px-6 py-12 text-center shadow-sm">
      <Icon className="size-8 text-muted" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
      {children ? <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div> : null}
    </div>
  );
}
