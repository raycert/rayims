"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToday } from "@/components/ui/use-today";
import { OverdueActionsSection, UpcomingActivitiesSection } from "@/components/work/work-sections";
import { pickOverdueActions, pickUpcomingActivities } from "@/lib/domain/work-lists";
import type { WorkLists } from "@/lib/queries/work";
import { documentStatusLabel, documentStatusTone, projectStatusLabel } from "@/lib/ui/status-tones";

const LIMIT = 5;
const ROW =
  "flex min-h-10 items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm first:border-t-0 hover:bg-neutral-soft/60";

/**
 * The consultant Home (Phase 7A): what needs attention across Projects — Upcoming Activities,
 * Overdue Actions, Documents under review (an open Gap Assessment on the current Version) and
 * Recent Projects, five rows each, no charts or KPIs. Upcoming / Overdue depend on the viewer's
 * local day, so the "nothing pending" decision is made here, in the browser.
 */
export function HomeView({ lists }: { lists: WorkLists }) {
  const today = useToday();
  const upcoming = pickUpcomingActivities(lists.upcoming, today, LIMIT);
  const overdue = pickOverdueActions(lists.overdue, today, LIMIT);
  const underReview = lists.documentsUnderReview;
  const nothingPending = upcoming.length === 0 && overdue.total === 0 && underReview.total === 0;

  return (
    <div className="flex flex-col gap-5">
      {nothingPending ? (
        <section data-testid="home-empty" className="rounded-lg border border-border bg-surface px-6 py-10 text-center">
          <h2 className="text-base font-semibold">No pending work needs your attention.</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Upcoming Activities, overdue Actions and Documents under review will appear here.
          </p>
          <div className="mt-4 flex justify-center">
            <Link href="/projects" className={buttonClasses("primary")}>
              View Projects
            </Link>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <UpcomingActivitiesSection data={lists.upcoming} limit={LIMIT} />
          <OverdueActionsSection data={lists.overdue} limit={LIMIT} />
          <section data-testid="documents-under-review" className="rounded-lg border border-border bg-surface md:col-span-2">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">
                Documents Under Review
                {underReview.total > 0 ? <span className="ml-1.5 font-normal text-muted">({underReview.total})</span> : null}
              </h2>
            </div>
            {underReview.items.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">No Gap Assessments are open.</p>
            ) : (
              underReview.items.map((d) => (
                <Link key={d.reviewId} href={`/projects/${d.projectId}/documents/${d.documentId}`} className={ROW}>
                  <div className="min-w-0">
                    <div className="break-words font-semibold">
                      {d.title}
                      {d.docCode ? <span className="ml-1.5 font-normal text-muted">{d.docCode}</span> : null}
                    </div>
                    <div className="break-words text-xs text-muted">
                      {d.projectName} · {d.siteName ?? "Project-wide"} · V{d.versionNo}
                    </div>
                  </div>
                  <StatusBadge label={documentStatusLabel("under_review")} tone={documentStatusTone("under_review")} />
                </Link>
              ))
            )}
          </section>
        </div>
      )}

      <section data-testid="recent-projects" className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Recent Projects</h2>
          <Link href="/projects" className="text-xs font-semibold text-primary hover:underline">
            All Projects
          </Link>
        </div>
        {lists.recentProjects.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No projects yet.</p>
        ) : (
          lists.recentProjects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className={ROW}>
              <div className="min-w-0">
                <div className="break-words font-semibold">{p.name}</div>
                <div className="break-words text-xs text-muted">{p.clientName}</div>
              </div>
              <span className="shrink-0 text-xs text-muted">{projectStatusLabel(p.status)}</span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
