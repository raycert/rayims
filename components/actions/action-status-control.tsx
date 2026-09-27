"use client";

import { useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { ACTION_STATUSES } from "@/lib/validation/actions";
import { actionStatusLabel } from "@/lib/ui/status-tones";
import { setActionStatus } from "@/lib/mutations/actions";
import type { ActionRow } from "@/lib/queries/actions";

/**
 * Compact status control (Phase 4D-1): any status can be chosen directly (no state machine).
 * Choosing Closed first asks for optional Completion Notes; other changes apply at once.
 */
export function ActionStatusControl({
  projectId,
  action,
  onChanged,
  onError,
  hideLabel,
}: {
  projectId: string;
  action: ActionRow;
  /** Table cells already have a "Status" column header. */
  hideLabel?: boolean;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState(action.completionNotes ?? "");
  const [pending, startTransition] = useTransition();

  function apply(status: string, completionNotes?: string) {
    startTransition(async () => {
      const result = await setActionStatus(projectId, action.id, { status, completionNotes });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setClosing(false);
      onChanged(status === "closed" ? "Action closed" : action.status === "closed" ? "Action reopened" : "Status updated");
    });
  }

  return (
    <div className="w-full">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {hideLabel ? null : "Status"}
        <select
          aria-label="Action status"
          value={closing ? "closed" : action.status}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "closed") {
              setNotes(action.completionNotes ?? "");
              setClosing(true);
            } else {
              setClosing(false);
              apply(next);
            }
          }}
          className="min-h-9 rounded-md border border-border bg-surface px-2 text-sm font-medium normal-case tracking-normal text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
        >
          {ACTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {actionStatusLabel(s)}
            </option>
          ))}
        </select>
      </label>

      {closing && action.status !== "closed" ? (
        <div className="mt-2 rounded-md border border-border bg-neutral-soft p-2.5">
          <label htmlFor={`cn-${action.id}`} className="mb-1 block text-xs font-medium">
            Completion Notes (optional)
          </label>
          <Textarea
            id={`cn-${action.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Checklist updated and warehouse team trained."
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setClosing(false)}
              disabled={pending}
              className="text-sm font-semibold text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => apply("closed", notes)}
              disabled={pending}
              aria-busy={pending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {pending ? "Closing…" : "Close Action"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
