"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, useToast } from "@/components/ui/toast";
import { activityStatusLabel, activityStatusTone } from "@/lib/ui/status-tones";
import { activityModeLabel, formatActivityDateTime } from "@/lib/ui/format";
import { ActivityFormDrawer } from "./activity-form-drawer";
import type { ActivityDetail, ActivityFormCatalog } from "@/lib/queries/activities";

function TextField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <p className="mt-1 whitespace-pre-wrap text-sm">
        {value ? value : <span className="text-muted">Not set.</span>}
      </p>
    </div>
  );
}

export function ActivityDetailView({
  projectName,
  activity,
  catalog,
}: {
  projectName: string;
  activity: ActivityDetail;
  catalog: ActivityFormCatalog;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const { message, show } = useToast();

  function handleSaved(msg: string) {
    setEditing(false);
    router.refresh();
    show(msg);
  }

  return (
    <div>
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/projects" className="hover:underline">
          Projects
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/projects/${activity.projectId}`} className="hover:underline">
          {projectName}
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/projects/${activity.projectId}/plan`} className="hover:underline">
          Plan
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{activity.name}</span>
      </div>

      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{activity.name}</h1>
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          Edit Activity
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <StatusBadge label={activityStatusLabel(activity.status)} tone={activityStatusTone(activity.status)} />
        <span>·</span>
        <span>
          {activity.activityTypeLabel}
          {activity.activityTypeIsActive ? "" : " (Inactive)"}
        </span>
        <span>·</span>
        <span>{formatActivityDateTime(activity.startDate, activity.startTime, activity.endDate, activity.endTime)}</span>
        <span>·</span>
        <span>{activity.siteName ?? "Project-wide"}</span>
        <span>·</span>
        <span>{activityModeLabel(activity.mode)}</span>
        <span>·</span>
        <span>{activity.consultantName ?? "Unassigned"}</span>
      </div>

      <div className="grid grid-cols-1 gap-5 [@media(min-width:860px)]:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Plan</h2>
          </div>
          <div className="divide-y divide-border">
            <TextField label="Objectives" value={activity.objectives} />
            <TextField label="Planned Work" value={activity.plannedWork} />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Outcome / Visit Summary</h2>
          </div>
          <div className="divide-y divide-border">
            <TextField label="Work Performed" value={activity.workPerformed} />
            <TextField label="Next Steps" value={activity.nextSteps} />
          </div>
        </section>
      </div>

      {editing ? (
        <ActivityFormDrawer
          mode="edit"
          projectId={activity.projectId}
          catalog={catalog}
          activity={activity}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
        />
      ) : null}
      <Toast message={message} />
    </div>
  );
}
