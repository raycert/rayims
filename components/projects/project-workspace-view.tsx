import { projectStatusLabel } from "@/lib/ui/status-tones";
import { formatDate, formatFrameworkIdentity } from "@/lib/ui/format";
import { OverdueActionsSection, UpcomingActivitiesSection } from "@/components/work/work-sections";
import type { ProjectWorkspace } from "@/lib/queries/projects";
import type { OverdueActionsData, UpcomingActivitiesData } from "@/lib/domain/work-lists";

/** The Overview tab's body only — the shared identity/tabs header lives in ProjectWorkspaceHeader. */
export function ProjectWorkspaceView({
  project,
  upcomingActivities,
  overdueActions,
}: {
  project: ProjectWorkspace;
  upcomingActivities: UpcomingActivitiesData;
  overdueActions: OverdueActionsData;
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

          <UpcomingActivitiesSection data={upcomingActivities} limit={3} viewAllHref={`/projects/${project.id}/plan`} />

          <OverdueActionsSection data={overdueActions} limit={5} viewAllHref={`/projects/${project.id}/actions?filter=overdue`} />
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
