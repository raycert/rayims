"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateNcResponse } from "@/lib/mutations/findings";

/** Edit the NC response of an open Nonconformity. Both fields optional (no placeholder "N/A"). */
export function NcResponseDrawer({
  projectId,
  findingId,
  correction,
  rootCause,
  onClose,
  onSaved,
}: {
  projectId: string;
  findingId: string;
  correction: string | null;
  rootCause: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [correctionText, setCorrectionText] = useState(correction ?? "");
  const [rootCauseText, setRootCauseText] = useState(rootCause ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateNcResponse(projectId, findingId, { correction: correctionText, rootCause: rootCauseText });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved("NC response saved");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Edit NC Response"
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
          <label htmlFor="nc-correction" className="block text-sm font-medium">
            Correction
          </label>
          <p className="mb-1.5 text-xs text-muted">Immediate action taken to address the detected problem.</p>
          <Textarea id="nc-correction" value={correctionText} onChange={(e) => setCorrectionText(e.target.value)} rows={4} />
        </div>
        <div>
          <label htmlFor="nc-root-cause" className="block text-sm font-medium">
            Root Cause Analysis
          </label>
          <p className="mb-1.5 text-xs text-muted">The identified cause or causes behind the nonconformity.</p>
          <Textarea id="nc-root-cause" value={rootCauseText} onChange={(e) => setRootCauseText(e.target.value)} rows={4} />
        </div>
        <p className="text-xs text-muted">Both are optional and can be completed later.</p>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
