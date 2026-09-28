import Link from "next/link";
import {
  actionStatusLabel,
  actionStatusTone,
  activityStatusLabel,
  activityStatusTone,
  projectStatusLabel,
} from "@/lib/ui/status-tones";
import { formatActivityDateTime, formatDate, formatFrameworkIdentity } from "@/lib/ui/format";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProjectWorkspace } from "@/lib/queries/projects";
import type { ActivityPlanRow } from "@/lib/queries/activities";
import type { ActionRow } from "@/lib/queries/actions";

/** The Overview tab's body only — the shared identity/tabs header lives in ProjectWorkspaceHeader. */
export function ProjectWorkspaceView({
  project,
  upcomingActivities,
  overdueActions,
}: {
  project: ProjectWorkspace;
  upcomingActivities: ActivityPlanRow[];
  overdueActions: { items: ActionRow[]; total: number };
}) {
  return (
    <div>
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

          <section className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Upcoming Activities</h2>
              <Link href={`/projects/${project.id}/plan`} className="text-xs font-semibold text-primary hover:underline">
                View Plan
              </Link>
            </div>
            {upcomingActivities.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">No upcoming activities planned.</p>
            ) : (
              upcomingActivities.map((a) => (
                <Link
                  key={a.id}
                  href={`/projects/${project.id}/activities/${a.id}`}
                  className="flex min-h-10 items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm first:border-t-0 hover:bg-neutral-soft/60"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{a.name}</div>
                    <div className="text-xs text-muted">
                      {formatActivityDateTime(a.startDate, a.startTime, a.endDate, a.endTime)} ·{" "}
                      {a.siteName ?? "Project-wide"}
                    </div>
                  </div>
                  <StatusBadge label={activityStatusLabel(a.status)} tone={activityStatusTone(a.status)} />
                </Link>
              ))
            )}
          </section>

          <section data-testid="overdue-actions" className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">
                Overdue Actions
                {overdueActions.total > 0 ? <span className="ml-1.5 font-normal text-muted">({overdueActions.total})</span> : null}
              </h2>
              <Link
                href={`/projects/${project.id}/actions?filter=overdue`}
                className="text-xs font-semibold text-primary hover:underline"
              >
                View all Actions
              </Link>
            </div>
            {overdueActions.items.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">No overdue actions.</p>
            ) : (
              overdueActions.items.map((a) => (
                <Link
                  key={a.id}
                  href={a.findingId ? `/projects/${project.id}/findings/${a.findingId}` : `/projects/${project.id}/actions?filter=overdue`}
                  className="flex min-h-10 items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm first:border-t-0 hover:bg-neutral-soft/60"
                >
                  <div className="min-w-0">
                    <div className="line-clamp-2 font-semibold">{a.description}</div>
                    <div className="text-xs text-muted">
                      <span className="font-semibold text-danger">Due {formatDate(a.dueDate)}</span>
                      {" · "}
                      {a.ownerName ?? "No owner"}
                      {" · "}
                      {a.findingTitle ?? "Standalone"}
                    </div>
                  </div>
                  <StatusBadge label={actionStatusLabel(a.status)} tone={actionStatusTone(a.status)} />
                </Link>
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
