"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/ui/format";
import { priorityLabel, priorityTone, verificationResultLabel, verificationResultTone } from "@/lib/ui/status-tones";
import { VerificationItemFormDrawer } from "./verification-item-form-drawer";
import { VerificationExecutionDrawer } from "./verification-execution-drawer";
import type { ActivityVerificationItemRow, VerificationFormCatalog } from "@/lib/queries/verification-items";

function ItemCard({
  item,
  activityId,
  onExecute,
}: {
  item: ActivityVerificationItemRow;
  activityId: string;
  onExecute: (item: ActivityVerificationItemRow) => void;
}) {
  const pending = item.result === null;
  // §22: an item already verified in a DIFFERENT activity is shown for traceability
  // only — no execute/edit action is offered here, so its execution context can never
  // be silently moved to this Activity.
  const completedElsewhere = item.verifiedActivityId !== null && item.verifiedActivityId !== activityId;
  const plannedElsewhere =
    item.targetActivityId !== null && item.targetActivityId !== activityId && item.verifiedActivityId === activityId;
  const canExecuteHere = item.verifiedActivityId === null || item.verifiedActivityId === activityId;

  return (
    <div className="rounded-lg border border-border bg-surface p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge label={priorityLabel(item.priority)} tone={priorityTone(item.priority)} />
        <StatusBadge label={verificationResultLabel(item.result)} tone={verificationResultTone(item.result)} />
      </div>
      <p className={cn("mt-1.5 text-sm font-semibold", !pending && "text-muted")}>{item.question}</p>
      {item.frameworkIdentity ? (
        <p className="mt-0.5 text-xs text-muted">
          {item.frameworkIdentity} · {item.frameworkItemLabel}
        </p>
      ) : null}

      {!pending ? (
        <>
          {item.notes ? (
            <p className="mt-1.5 line-clamp-2 text-xs text-muted">Observation: {item.notes}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted">
            Verified {formatDate(item.verifiedAt)} · {item.verifiedByName ?? "—"}
          </p>
        </>
      ) : null}

      {completedElsewhere ? <p className="mt-1.5 text-xs italic text-muted">Completed in another activity</p> : null}
      {plannedElsewhere ? <p className="mt-1.5 text-xs italic text-muted">Planned for another activity</p> : null}

      {canExecuteHere ? (
        <div className="mt-2.5">
          <Button type="button" variant="secondary" onClick={() => onExecute(item)}>
            {pending ? "Verify" : "Review / Edit"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Activity Detail's Verification section (Phase 4B) — operational, not a dashboard:
 * a count summary, the checklist, an "Add Check" shortcut reusing the 4A planning
 * form/mutation, and the hybrid execution drawer. Deliberately excludes Issues,
 * Actions, evidence and any compliance/progress visualization.
 */
export function ActivityVerificationSection({
  projectId,
  activityId,
  activitySiteId,
  items,
  catalog,
  onChanged,
}: {
  projectId: string;
  activityId: string;
  activitySiteId: string | null;
  items: ActivityVerificationItemRow[];
  catalog: VerificationFormCatalog;
  /** Bubbles a save up to Activity Detail, which owns the page's single Toast/refresh. */
  onChanged: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [executing, setExecuting] = useState<ActivityVerificationItemRow | null>(null);

  const pendingCount = items.filter((i) => i.result === null).length;

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Verification</h2>
          <p className="text-xs text-muted">
            {items.length} {items.length === 1 ? "check" : "checks"}
            {items.length > 0 ? ` · ${pendingCount} pending` : ""}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
          + Add Check
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No verification checks are assigned to this activity."
          action={
            <Button type="button" onClick={() => setAdding(true)}>
              + Add Check
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5 p-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} activityId={activityId} onExecute={setExecuting} />
          ))}
        </div>
      )}

      {adding ? (
        <VerificationItemFormDrawer
          mode="create"
          projectId={projectId}
          catalog={catalog}
          defaultTargetActivityId={activityId}
          defaultSiteId={activitySiteId}
          onClose={() => setAdding(false)}
          onSaved={(msg) => {
            setAdding(false);
            onChanged(msg);
          }}
        />
      ) : null}

      {executing ? (
        <VerificationExecutionDrawer
          projectId={projectId}
          activityId={activityId}
          item={executing}
          onClose={() => setExecuting(null)}
          onSaved={(msg) => {
            setExecuting(null);
            onChanged(msg);
          }}
        />
      ) : null}
    </section>
  );
}
