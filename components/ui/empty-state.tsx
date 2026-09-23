import type { ReactNode } from "react";

/** Compact empty state for a section or list; explains the next step (05_UI_UX_GUIDELINES). */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
