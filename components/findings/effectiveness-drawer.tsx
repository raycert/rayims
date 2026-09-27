"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { recordEffectivenessReview } from "@/lib/mutations/findings";

const RESULTS = [
  { value: "effective", label: "Effective" },
  { value: "not_effective", label: "Not Effective" },
] as const;

/**
 * Record / edit the ONE current Effectiveness Review of an open Nonconformity. Reviewer and time
 * are set by the server; saving replaces the previous review (no history in V1).
 */
export function EffectivenessDrawer({
  projectId,
  findingId,
  result,
  notes,
  onClose,
  onSaved,
}: {
  projectId: string;
  findingId: string;
  result: string | null;
  notes: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [selected, setSelected] = useState(result ?? "");
  const [notesText, setNotesText] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (!selected) {
      setError("Select a result.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await recordEffectivenessReview(projectId, findingId, { result: selected, notes: notesText });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved("Effectiveness review saved");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={result ? "Edit Effectiveness Review" : "Record Effectiveness Review"}
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
      <div className="space-y-5">
        <div>
          <span id="eff-result-label" className="mb-1.5 block text-sm font-medium">
            Result *
          </span>
          <div role="group" aria-labelledby="eff-result-label" className="flex gap-1.5">
            {RESULTS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => {
                  setSelected(r.value);
                  setError(null);
                }}
                aria-pressed={selected === r.value}
                className={cn(
                  "min-h-11 flex-1 rounded-md border text-sm font-medium",
                  selected === r.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted hover:bg-neutral-soft",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="eff-notes" className="mb-1.5 block text-sm font-medium">
            Notes
          </label>
          <Textarea
            id="eff-notes"
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            rows={4}
            placeholder="e.g. Follow-up inspection confirmed no recurrence."
          />
        </div>
        <p className="text-xs text-muted">Saving replaces the current review. Reviewer and time are recorded automatically.</p>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
