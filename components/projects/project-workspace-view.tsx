import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { projectStatusLabel, projectStatusTone } from "@/lib/ui/status-tones";
import { formatDate, formatFrameworkIdentity } from "@/lib/ui/format";
import type { ProjectWorkspace } from "@/lib/queries/projects";

/**
 * Overview is the only real tab in Phase 2 Slice 2. The rest are visible-but-inert —
 * no route, no navigation, no "CONCEPT" chip (that's a design-file annotation, not
 * production copy) — so the tab row communicates what's coming without shipping it.
 */
const FUTURE_TABS = ["Plan", "Documents", "Verification", "Issues & Actions", "Reports"];

export function ProjectWorkspaceView({ project }: { project: ProjectWorkspace }) {
  return (
    <div>
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/projects" className="hover:underline">
          Projects
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{project.name}</span>
      </div>

      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{project.name}</h1>
        <Link href={`/projects/${project.id}/edit`} className={buttonClasses("secondary", "min-h-9")}>
          Edit Project
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <StatusBadge label={projectStatusLabel(project.status)} tone={projectStatusTone(project.status)} />
        <span>·</span>
        <span>
          {project.sites.length} {project.sites.length === 1 ? "Site" : "Sites"}
        </span>
        {project.frameworks.map((fw) => (
          <span key={fw.id} className="contents">
            <span>·</span>
            <span>{formatFrameworkIdentity(fw.code, fw.edition)}</span>
          </span>
        ))}
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        <span className="min-h-10 border-b-2 border-primary px-1 text-sm font-medium text-primary">Overview</span>
        {FUTURE_TABS.map((label) => (
          <span
            key={label}
            aria-disabled="true"
            title="Coming in a later phase"
            className="flex min-h-10 cursor-not-allowed items-center whitespace-nowrap border-b-2 border-transparent px-1 text-sm font-medium text-muted opacity-60"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 [@media(min-width:860px)]:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Sites</h2>
              <span className="text-xs text-muted">
                {project.sites.length} {project.sites.length === 1 ? "site" : "sites"}
              </span>
            </div>
            {project.sites.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">No sites in scope yet.</p>
            ) : (
              project.sites.map((site) => (
                <div
                  key={site.id}
                  className="flex min-h-10 items-center justify-between border-t border-border px-4 text-sm first:border-t-0"
                >
                  <span>{site.name}</span>
                </div>
              ))
            )}
          </section>

          <section className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Frameworks</h2>
              <span className="text-xs text-muted">{project.frameworks.length} assigned</span>
            </div>
            {project.frameworks.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">No frameworks assigned yet.</p>
            ) : (
              project.frameworks.map((fw) => (
                <div
                  key={fw.id}
                  className="min-h-10 border-t border-border px-4 py-2 text-sm first:border-t-0"
                >
                  <div className="font-semibold">{formatFrameworkIdentity(fw.code, fw.edition)}</div>
                  <div className="text-xs text-muted">{fw.name}</div>
                </div>
              ))
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Project</h2>
            </div>
            <div className="flex min-h-10 items-center justify-between border-t border-border px-4 text-sm first:border-t-0">
              <span className="text-muted">Client</span>
              <span>{project.clientName}</span>
            </div>
            <div className="flex min-h-10 items-center justify-between border-t border-border px-4 text-sm">
              <span className="text-muted">Status</span>
              <span>{projectStatusLabel(project.status)}</span>
            </div>
            <div className="flex min-h-10 items-center justify-between border-t border-border px-4 text-sm">
              <span className="text-muted">Start date</span>
              <span>{formatDate(project.startDate)}</span>
            </div>
            {project.endDate ? (
              <div className="flex min-h-10 items-center justify-between border-t border-border px-4 text-sm">
                <span className="text-muted">End date</span>
                <span>{formatDate(project.endDate)}</span>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
