"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { priorityLabel, verificationResultLabel } from "@/lib/ui/status-tones";
import { VERIFICATION_RESULTS } from "@/lib/validation/verification-items";
import { recordVerificationResult } from "@/lib/mutations/verification-items";
import type { ActivityVerificationItemRow } from "@/lib/queries/verification-items";

/**
 * Focused onsite execution UI (Phase 4B): Result + Notes only. No planning
 * fields (Question/Priority/Site/Target Activity/Framework) — those stay in the 4A
 * planning Edit form, a deliberately separate surface.
 */
export function VerificationExecutionDrawer({
  projectId,
  activityId,
  item,
  onClose,
  onSaved,
}: {
  projectId: string;
  activityId: string;
  item: ActivityVerificationItemRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [result, setResult] = useState(item.result ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [resultError, setResultError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (!result) {
      setResultError("Select a Result.");
      return;
    }
    setResultError(null);
    setFormError(null);

    startTransition(async () => {
      const saveResult = await recordVerificationResult(projectId, activityId, item.id, { result, notes });
      if (!saveResult.ok) {
        setFormError(saveResult.error);
        return;
      }
      onSaved(item.result ? "Verification result updated" : "Verification recorded");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={item.result ? "Review Verification" : "Verify"}
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
          <p className="text-sm font-semibold">{item.question}</p>
          <p className="mt-1 text-xs text-muted">
            {priorityLabel(item.priority)}
            {item.frameworkIdentity ? ` · ${item.frameworkIdentity} · ${item.frameworkItemLabel}` : ""}
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <span className="mb-1.5 block text-sm font-medium">Result *</span>
          <div className="flex flex-col gap-1.5">
            {VERIFICATION_RESULTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setResult(value);
                  setResultError(null);
                }}
                aria-pressed={result === value}
                className={cn(
                  "min-h-11 rounded-md border px-3 text-sm font-medium",
                  result === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted hover:bg-neutral-soft",
                )}
              >
                {verificationResultLabel(value)}
              </button>
            ))}
          </div>
          {resultError ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {resultError}
            </p>
          ) : null}
        </div>

        <div className="border-t border-border pt-4">
          <label htmlFor="ve-notes" className="mb-1.5 block text-sm font-medium">
            Notes
          </label>
          <Textarea
            id="ve-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was observed (optional)"
            rows={4}
          />
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
