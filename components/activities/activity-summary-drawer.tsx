"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateActivitySummary } from "@/lib/mutations/activities";
import type { ActivityDetail } from "@/lib/queries/activities";

/** The four Outcome / Activity Summary fields, in display order (Phase 6B). */
export const SUMMARY_FIELDS = [
  { key: "workPerformed", id: "sum-work-performed", label: "Work Performed", help: "What was actually carried out.", rows: 4 },
  { key: "summary", id: "sum-summary", label: "Consultant Summary", help: "Overall consultant conclusion for this Activity.", rows: 5 },
  { key: "nextSteps", id: "sum-next-steps", label: "Next Steps", help: "Recommended or agreed next steps.", rows: 4 },
  {
    key: "clientParticipants",
    id: "sum-client-participants",
    label: "Client Participants",
    help: "Names and roles of client participants or coordinators.",
    rows: 3,
  },
] as const;

type SummaryKey = (typeof SUMMARY_FIELDS)[number]["key"];

/**
 * Edit Activity Summary (Phase 6B): only the consultant-authored Outcome narrative — Activity identity,
 * schedule and Plan stay in Edit Activity. Every field optional; saving never changes the status.
 */
export function ActivitySummaryDrawer({
  activity,
  onClose,
  onSaved,
}: {
  activity: Pick<ActivityDetail, "id" | "projectId" | SummaryKey>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [values, setValues] = useState<Record<SummaryKey, string>>({
    workPerformed: activity.workPerformed ?? "",
    summary: activity.summary ?? "",
    nextSteps: activity.nextSteps ?? "",
    clientParticipants: activity.clientParticipants ?? "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setFormError(null);
    startTransition(async () => {
      const result = await updateActivitySummary(activity.projectId, activity.id, values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      onSaved("Activity Summary saved");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Edit Activity Summary"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {SUMMARY_FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.id} className="block text-sm font-medium">
              {f.label}
            </label>
            <p id={`${f.id}-help`} className="mb-1.5 text-xs text-muted">
              {f.help}
            </p>
            <Textarea
              id={f.id}
              aria-describedby={`${f.id}-help`}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              rows={f.rows}
            />
          </div>
        ))}

        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
