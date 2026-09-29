"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { documentStatusLabel, documentStatusTone } from "@/lib/ui/status-tones";
import { formatEvidenceDate } from "@/components/evidence/evidence-format";
import { completeDocumentReview, startDocumentReview, updateDocumentReview } from "@/lib/mutations/document-reviews";
import type { DocumentFrameworkItem, DocumentReviewEntry, DocumentVersionSummary } from "@/lib/queries/documents";

/** "ISO 9001 7.5, ISO 14001 8.2" — the requirements the Version is assessed against (Document mappings). */
function AssessedAgainst({ items }: { items: DocumentFrameworkItem[] }) {
  return (
    <p data-testid="assessed-against" className="text-xs text-muted">
      {items.length === 0 ? (
        "No framework requirements mapped to this document."
      ) : (
        <>
          Assessed against{" "}
          <span title={items.map((i) => `${i.frameworkIdentity} · ${i.label}`).join("\n")}>
            {items.map((i) => `${i.frameworkCode} ${i.code ?? i.label}`).join(", ")}
          </span>
        </>
      )}
    </p>
  );
}

function ReviewComments({ notes, open }: { notes: string | null; open: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Review Comments</div>
      {notes ? (
        <p className="mt-0.5 whitespace-pre-wrap text-sm">{notes}</p>
      ) : (
        <p className="mt-0.5 text-sm text-muted">{open ? "No comments yet." : "No comments."}</p>
      )}
    </div>
  );
}

function reviewMeta(r: DocumentReviewEntry): string {
  const who = r.reviewerName ?? "Unknown user";
  return r.reviewedAt
    ? `Reviewed by ${who} · ${formatEvidenceDate(r.reviewedAt)} · started ${formatEvidenceDate(r.createdAt)}`
    : `Started by ${who} · ${formatEvidenceDate(r.createdAt)} · not completed`;
}

/**
 * Gap Assessment of the CURRENT version (Phase 5C): its latest review decides the state shown here
 * (created_at DESC, id DESC). Under Review → Edit / Complete; concluded → read-only + Start New
 * Assessment; none → Start Gap Assessment. Nothing is offered while the Document is Not Applicable.
 */
export function GapAssessmentPanel({
  projectId,
  version,
  isApplicable,
  frameworkItems,
  onChanged,
}: {
  projectId: string;
  version: DocumentVersionSummary;
  isApplicable: boolean;
  frameworkItems: DocumentFrameworkItem[];
  onChanged: (message: string) => void;
}) {
  const [drawer, setDrawer] = useState<{ mode: "edit" | "complete"; review: DocumentReviewEntry } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = version.reviews[0] ?? null;
  const open = current?.status === "under_review";

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startDocumentReview(projectId, version.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged("Gap Assessment started.");
    });
  }

  return (
    <div data-testid="gap-assessment" className="mt-2.5 space-y-2 rounded-md border border-border bg-neutral-soft/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Gap Assessment</span>
        {current ? (
          <StatusBadge label={documentStatusLabel(current.status)} tone={documentStatusTone(current.status)} />
        ) : (
          <span className="text-xs text-muted">Not started</span>
        )}
      </div>
      <AssessedAgainst items={frameworkItems} />

      {current ? (
        <>
          <ReviewComments notes={current.notes} open={open} />
          <p className="text-xs text-muted">{reviewMeta(current)}</p>
          {current.status === "revision_required" ? (
            <p className="text-xs text-muted">Upload a new Version if the document content is revised.</p>
          ) : null}
          {current.status === "accepted" ? <p className="text-xs text-muted">Accepted for this assessment.</p> : null}
        </>
      ) : isApplicable ? (
        <p className="text-xs text-muted">Evaluate this version against the document&apos;s requirements.</p>
      ) : null}

      {!isApplicable ? (
        <p className="text-xs text-muted">Gap Assessments cannot start while this document is Not Applicable.</p>
      ) : (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {open ? (
            <>
              <Button type="button" variant="secondary" className="min-h-9" onClick={() => setDrawer({ mode: "edit", review: current })}>
                Edit Assessment
              </Button>
              <Button type="button" className="min-h-9" onClick={() => setDrawer({ mode: "complete", review: current })}>
                Complete Assessment
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" className="min-h-9" onClick={start} disabled={pending} aria-busy={pending}>
              {pending ? "Starting…" : current ? "Start New Assessment" : "Start Gap Assessment"}
            </Button>
          )}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {drawer ? (
        <GapAssessmentDrawer
          mode={drawer.mode}
          projectId={projectId}
          review={drawer.review}
          frameworkItems={frameworkItems}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null);
            onChanged(msg);
          }}
        />
      ) : null}
    </div>
  );
}

/** Read-only Assessment History of one version (newest first). Concluded entries are never editable. */
export function AssessmentHistory({ reviews, label }: { reviews: DocumentReviewEntry[]; label: string }) {
  const [open, setOpen] = useState(false);
  if (reviews.length === 0) return null;
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline"
      >
        {open ? `Hide ${label.toLowerCase()}` : `${label} (${reviews.length})`}
      </button>
      {open ? (
        <ul data-testid="assessment-history" className="mt-1 divide-y divide-border rounded-md border border-border">
          {reviews.map((r) => (
            <li key={r.id} data-testid="assessment-entry" className="space-y-1 px-3 py-2">
              <StatusBadge label={documentStatusLabel(r.status)} tone={documentStatusTone(r.status)} />
              {r.notes ? <p className="whitespace-pre-wrap text-sm">{r.notes}</p> : <p className="text-sm text-muted">No comments.</p>}
              <p className="text-xs text-muted">{reviewMeta(r)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const RESULTS = [
  { value: "revision_required", label: "Revision Required" },
  { value: "accepted", label: "Accepted" },
] as const;

/** Edit the Review Comments of an open assessment, or complete it with a result (no default). */
function GapAssessmentDrawer({
  mode,
  projectId,
  review,
  frameworkItems,
  onClose,
  onSaved,
}: {
  mode: "edit" | "complete";
  projectId: string;
  review: DocumentReviewEntry;
  frameworkItems: DocumentFrameworkItem[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [notes, setNotes] = useState(review.notes ?? "");
  const [result, setResult] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (mode === "complete" && !result) {
      setFieldErrors({ result: "Choose Revision Required or Accepted." });
      return;
    }
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const r =
        mode === "edit"
          ? await updateDocumentReview(projectId, review.id, { notes })
          : await completeDocumentReview(projectId, review.id, { result, notes });
      if (!r.ok) {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
        return;
      }
      onSaved(mode === "edit" ? "Assessment updated." : "Assessment completed.");
    });
  }

  return (
    <Drawer
      open
      onClose={pending ? () => {} : onClose}
      title={mode === "edit" ? "Edit Assessment" : "Complete Assessment"}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : mode === "edit" ? "Save" : "Complete"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <AssessedAgainst items={frameworkItems} />
        {mode === "complete" ? (
          <div>
            <span id="ga-result-label" className="mb-1.5 block text-sm font-medium">
              Result *
            </span>
            <div role="group" aria-labelledby="ga-result-label" className="flex gap-1.5">
              {RESULTS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => {
                    setResult(r.value);
                    setFieldErrors({});
                  }}
                  aria-pressed={result === r.value}
                  className={cn(
                    "min-h-10 flex-1 rounded-md border text-sm font-medium",
                    result === r.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-neutral-soft",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {fieldErrors.result ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {fieldErrors.result}
              </p>
            ) : null}
            <p className="mt-1.5 text-xs text-muted">
              Completing makes this assessment final. A different conclusion later needs a new assessment.
            </p>
          </div>
        ) : null}
        <div>
          <label htmlFor="ga-comments" className="mb-1.5 block text-sm font-medium">
            Review Comments
          </label>
          <Textarea
            id="ga-comments"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="e.g. Responsibilities and the document retention period need to be updated."
          />
          {fieldErrors.notes ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {fieldErrors.notes}
            </p>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
