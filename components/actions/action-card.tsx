"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { actionStatusLabel, actionStatusTone, priorityLabel, priorityTone } from "@/lib/ui/status-tones";
import { formatDate, isActionOverdue, relatedFindingLabel } from "@/lib/ui/format";
import { useToday } from "@/components/ui/use-today";
import { ActionStatusControl } from "./action-status-control";
import { EvidenceButton } from "@/components/evidence/evidence-panel";
import type { ActionRow } from "@/lib/queries/actions";

/** Compact action card: Finding Detail and the mobile Actions workspace. */
export function ActionCard({
  projectId,
  action,
  showFinding,
  onEdit,
  onChanged,
  onError,
}: {
  projectId: string;
  action: ActionRow;
  /** Show the Finding link / "Standalone" (Actions workspace); hidden on Finding Detail. */
  showFinding?: boolean;
  onEdit: (action: ActionRow) => void;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const today = useToday();
  const overdue = isActionOverdue(action, today);
  const frozen = action.findingStatus === "closed";
  const closed = action.status === "closed";

  return (
    <div data-testid="action-card" className="rounded-lg border border-border bg-surface p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {frozen ? <StatusBadge label={actionStatusLabel(action.status)} tone={actionStatusTone(action.status)} /> : null}
        {overdue ? <StatusBadge label="Overdue" tone="danger" /> : null}
        <StatusBadge label={priorityLabel(action.priority)} tone={priorityTone(action.priority)} />
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold">{action.description}</p>
      <p className="mt-1 text-xs text-muted">
        {action.ownerName ?? "No owner"} · {action.dueDate ? `Due ${formatDate(action.dueDate)}` : "No due date"}
        {action.siteName ? ` · ${action.siteName}` : ""}
      </p>
      {showFinding ? (
        <p className="mt-1 text-xs text-muted">
          {action.findingId ? (
            <>
              Finding:{" "}
              <Link href={`/projects/${projectId}/findings/${action.findingId}`} className="font-semibold text-primary hover:underline">
                {relatedFindingLabel(action.findingNo, action.findingTitle)}
              </Link>
            </>
          ) : (
            "Standalone"
          )}
        </p>
      ) : null}
      <div className="mt-1">
        <EvidenceButton
          title="Action Evidence"
          projectId={projectId}
          parent={{ kind: "action", id: action.id }}
          items={action.evidence}
          editable={!frozen && !closed}
          lockedReason={
            frozen
              ? "The finding is closed. Reopen it to change this action's evidence."
              : closed
                ? "This action is closed. Reopen it to change its evidence."
                : null
          }
          onChanged={onChanged}
        />
      </div>
      {closed && action.completionNotes ? (
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted">Completion: {action.completionNotes}</p>
      ) : null}

      {frozen ? (
        <p className="mt-2 text-xs italic text-muted">The finding is closed. Reopen it to change this action.</p>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <ActionStatusControl projectId={projectId} action={action} onChanged={onChanged} onError={onError} />
          </div>
          {!closed ? (
            <Button type="button" variant="secondary" className="min-h-9" onClick={() => onEdit(action)}>
              Edit
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
