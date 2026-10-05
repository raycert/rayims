"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToday } from "@/components/ui/use-today";
import {
  pickOverdueActions,
  pickUpcomingActivities,
  type OverdueActionsData,
  type UpcomingActivitiesData,
} from "@/lib/domain/work-lists";
import { formatActivityDateTime, formatDate } from "@/lib/ui/format";
import { actionStatusLabel, actionStatusTone, activityStatusLabel, activityStatusTone } from "@/lib/ui/status-tones";

/**
 * The Upcoming Activities and Overdue Actions lists of the consultant Home and the Project Overview
 * (Phase 7A). Both decide "today" from the viewer's local calendar day (useToday), so a date never
 * flips a few hours late or early for a viewer outside UTC.
 */

const ROW =
  "flex min-h-10 items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm first:border-t-0 hover:bg-neutral-soft/60";

export function UpcomingActivitiesSection({
  data,
  limit,
  viewAllHref,
}: {
  data: UpcomingActivitiesData;
  limit: number;
  /** Set on a Project's Overview ("View Plan"); Home spans Projects and has no single plan to link. */
  viewAllHref?: string;
}) {
  const today = useToday();
  const items = pickUpcomingActivities(data, today, limit);
  return (
    <section data-testid="upcoming-activities" className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Upcoming Activities</h2>
        {viewAllHref ? (
          <Link href={viewAllHref} className="text-xs font-semibold text-primary hover:underline">
            View Plan
          </Link>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">No upcoming activities planned.</p>
      ) : (
        items.map((a) => (
          <Link key={a.id} href={`/projects/${a.projectId}/activities/${a.id}`} className={ROW}>
            <div className="min-w-0">
              <div className="break-words font-semibold">{a.name}</div>
              <div className="break-words text-xs text-muted">
                {a.projectName ? `${a.projectName} · ` : ""}
                {formatActivityDateTime(a.startDate, a.startTime, a.endDate, a.endTime)} · {a.siteName ?? "Project-wide"}
                {a.projectName && a.typeLabel ? ` · ${a.typeLabel}` : ""}
              </div>
            </div>
            <StatusBadge label={activityStatusLabel(a.status)} tone={activityStatusTone(a.status)} />
          </Link>
        ))
      )}
    </section>
  );
}

export function OverdueActionsSection({
  data,
  limit,
  viewAllHref,
}: {
  data: OverdueActionsData;
  limit: number;
  /** Set on a Project's Overview ("View all Actions"). */
  viewAllHref?: string;
}) {
  const today = useToday();
  const { items, total } = pickOverdueActions(data, today, limit);
  return (
    <section data-testid="overdue-actions" className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">
          Overdue Actions
          {total > 0 ? <span className="ml-1.5 font-normal text-muted">({total})</span> : null}
        </h2>
        {viewAllHref ? (
          <Link href={viewAllHref} className="text-xs font-semibold text-primary hover:underline">
            View all Actions
          </Link>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">No overdue actions.</p>
      ) : (
        items.map((a) => (
          <Link
            key={a.id}
            href={a.findingId ? `/projects/${a.projectId}/findings/${a.findingId}` : `/projects/${a.projectId}/actions?filter=overdue`}
            className={ROW}
          >
            <div className="min-w-0">
              <div className="line-clamp-2 break-words font-semibold">{a.description}</div>
              <div className="break-words text-xs text-muted">
                <span className="font-semibold text-danger">Due {formatDate(a.dueDate)}</span>
                {" · "}
                {a.ownerName ?? "No owner"}
                {" · "}
                {a.findingLabel ?? "Standalone"}
                {a.projectName ? ` · ${a.projectName}` : ""}
              </div>
            </div>
            <StatusBadge label={actionStatusLabel(a.status)} tone={actionStatusTone(a.status)} />
          </Link>
        ))
      )}
    </section>
  );
}
