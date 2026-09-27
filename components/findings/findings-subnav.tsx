import Link from "next/link";

/** Sub-navigation under the "Findings & Actions" project tab (Phase 4D-1). */
export function FindingsSubnav({ projectId, active }: { projectId: string; active: "findings" | "actions" }) {
  const items = [
    { key: "findings", label: "Findings", href: `/projects/${projectId}/findings` },
    { key: "actions", label: "Actions", href: `/projects/${projectId}/actions` },
  ] as const;
  return (
    <nav aria-label="Findings and Actions" className="mb-5 inline-flex rounded-md border border-border bg-surface p-0.5">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === active ? "page" : undefined}
          className={
            item.key === active
              ? "rounded px-3.5 py-1.5 text-sm font-semibold text-primary bg-primary/10"
              : "rounded px-3.5 py-1.5 text-sm font-medium text-muted hover:text-foreground"
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
