"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { Toast, useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { activityStatusLabel } from "@/lib/ui/status-tones";
import { activityModeLabel, formatActivityDateTime, isActivityOverdue } from "@/lib/ui/format";
import { ACTIVITY_STATUSES } from "@/lib/validation/activities";
import { deleteActivity, setActivityStatus } from "@/lib/mutations/activities";
import { ActivityFormDrawer } from "./activity-form-drawer";
import { ActivityVerificationSection } from "@/components/verification/activity-verification-section";
import { EvidenceSection } from "@/components/evidence/evidence-panel";
import type { ActivityDetail, ActivityFormCatalog } from "@/lib/queries/activities";
import type { ActivityVerificationItemRow, VerificationFormCatalog } from "@/lib/queries/verification-items";

/** Values offered by the status control — Cancel stays its own confirmed action (overflow menu),
 *  so cancelling is never available two ways at once. An Activity has ONE current status; this is
 *  a single field, not tab navigation. */
const QUICK_STATUSES = ACTIVITY_STATUSES.filter((s) => s !== "cancelled");

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

type ConfirmAction = "cancel" | "delete" | null;

export function ActivityDetailView({
  projectName,
  activity,
  catalog,
  verificationItems,
  verificationCatalog,
}: {
  projectName: string;
  activity: ActivityDetail;
  catalog: ActivityFormCatalog;
  verificationItems: ActivityVerificationItemRow[];
  verificationCatalog: VerificationFormCatalog;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { message, show } = useToast();

  const overdue = isActivityOverdue(activity);

  function handleSaved(msg: string) {
    setEditing(false);
    router.refresh();
    show(msg);
  }

  function changeStatus(status: string) {
    startTransition(async () => {
      const result = await setActivityStatus(activity.projectId, activity.id, status);
      if (!result.ok) {
        show(result.error);
        return;
      }
      router.refresh();
      show("Status updated");
    });
  }

  function confirmCancel() {
    startTransition(async () => {
      const result = await setActivityStatus(activity.projectId, activity.id, "cancelled");
      setConfirmAction(null);
      if (!result.ok) {
        show(result.error);
        return;
      }
      router.refresh();
      show("Activity cancelled");
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteActivity(activity.projectId, activity.id);
      if (!result.ok) {
        setBlockedMessage(result.error);
        return;
      }
      router.push(`/projects/${activity.projectId}/plan`);
    });
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
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            Edit Activity
          </Button>
          <OverflowMenu
            items={[
              ...(activity.status !== "cancelled"
                ? [{ label: "Cancel Activity", onSelect: () => setConfirmAction("cancel") }]
                : []),
              { label: "Delete Activity", onSelect: () => setConfirmAction("delete"), danger: true },
            ]}
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
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

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label htmlFor="activity-status" className="text-sm font-medium text-muted">
          Status:
        </label>
        <select
          id="activity-status"
          value={activity.status}
          disabled={pending}
          onChange={(e) => changeStatus(e.target.value)}
          className={cn(
            "min-h-10 rounded-md border px-3 pr-8 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
            activity.status === "cancelled" ? "border-border bg-neutral-soft text-muted" : "border-border bg-surface text-foreground",
          )}
        >
          {QUICK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {activityStatusLabel(value)}
            </option>
          ))}
          {activity.status === "cancelled" ? (
            <option value="cancelled" disabled>
              {activityStatusLabel("cancelled")}
            </option>
          ) : null}
        </select>
        {overdue ? <StatusBadge label="Overdue" tone="danger" /> : null}
      </div>

      {confirmAction === "cancel" ? (
        <div className="mb-5 rounded-lg border border-warning bg-warning-soft px-4 py-3">
          <p className="text-sm text-warning">
            Cancel this activity? It stays in the Master Plan with its full history — plan, outcome and any linked
            records are kept, nothing is deleted.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              disabled={pending}
              className="text-sm font-semibold text-muted"
            >
              Keep as is
            </button>
            <button
              type="button"
              onClick={confirmCancel}
              disabled={pending}
              aria-busy={pending}
              className="rounded-md bg-warning px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Cancelling…" : "Cancel Activity"}
            </button>
          </div>
        </div>
      ) : null}

      {confirmAction === "delete" ? (
        <div className="mb-5 rounded-lg border border-danger bg-danger-soft px-4 py-3">
          {blockedMessage ? (
            <>
              <p className="text-sm text-danger">{blockedMessage}</p>
              <button
                type="button"
                onClick={() => {
                  setConfirmAction(null);
                  setBlockedMessage(null);
                }}
                className="mt-2 text-sm font-semibold text-muted"
              >
                OK
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-danger">
                Delete this activity permanently? This can&apos;t be undone. Referenced activities can&apos;t be
                deleted — cancel them instead.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={pending}
                  className="text-sm font-semibold text-muted"
                >
                  Keep Activity
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={pending}
                  aria-busy={pending}
                  className="rounded-md bg-danger px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending ? "Deleting…" : "Delete Activity"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Plan</h2>
          </div>
          <div className="divide-y divide-border">
            <TextField label="Objectives" value={activity.objectives} />
            <TextField label="Planned Work" value={activity.plannedWork} />
          </div>
        </section>

        <ActivityVerificationSection
          projectId={activity.projectId}
          activityId={activity.id}
          activitySiteId={activity.siteId}
          items={verificationItems}
          catalog={verificationCatalog}
          onChanged={(msg) => {
            router.refresh();
            show(msg);
          }}
        />

        <EvidenceSection
          title="Activity Evidence"
          projectId={activity.projectId}
          parent={{ kind: "activity", id: activity.id }}
          items={activity.evidence}
          editable
          onChanged={(msg) => {
            router.refresh();
            show(msg);
          }}
        />

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
