"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import {
  documentStatusLabel,
  documentStatusTone,
  findingStatusLabel,
  findingStatusTone,
  findingTypeLabel,
  findingTypeTone,
  verificationResultLabel,
  verificationResultTone,
} from "@/lib/ui/status-tones";
import { formatEvidenceDate } from "@/components/evidence/evidence-format";
import { findingLabel } from "@/lib/ui/format";
import { completeDocumentReview, startDocumentReview, updateDocumentReview } from "@/lib/mutations/document-reviews";
import { FindingFormDrawer } from "@/components/findings/finding-form-drawer";
import { VerificationItemFormDrawer } from "@/components/verification/verification-item-form-drawer";
import type { DocumentFrameworkItem, DocumentReviewEntry, DocumentVersionSummary } from "@/lib/queries/documents";
import type { VerificationFormCatalog } from "@/lib/queries/verification-items";

/** Document context needed to create follow-up from an assessment (Phase 5D). */
export type FollowUpContext = {
  projectId: string;
  documentTitle: string;
  /** A site-specific Document fixes the follow-up's site. */
  documentSiteId: string | null;
  /** Project sites / activities / assigned framework items (the Phase 4 form catalog). */
  catalog: VerificationFormCatalog;
};

/**
 * The form catalog with the Document's mapped requirements listed FIRST ("Mapped to this document",
 * including historical ones), then the other items of the project's assigned Frameworks. Nothing is
 * preselected unless the Document maps exactly one requirement.
 */
function followUpCatalog(catalog: VerificationFormCatalog, mapped: DocumentFrameworkItem[]): VerificationFormCatalog {
  const mappedIds = new Set(mapped.map((m) => m.id));
  return {
    ...catalog,
    frameworkItems: [
      ...mapped.map((m) => ({
        id: m.id,
        label: `${m.frameworkIdentity} · ${m.label}`,
        frameworkIdentity: m.frameworkIdentity,
        inAssignedScope: m.inAssignedScope,
        groupLabel: "Mapped to this document",
      })),
      ...catalog.frameworkItems.filter((fi) => fi.inAssignedScope && !mappedIds.has(fi.id)),
    ],
  };
}

/**
 * Compact follow-up summary of one assessment: "2 Findings · 1 Verification Item" → list with links.
 * Existing links are always visible (also on historical assessments).
 */
export function FollowUpSummary({ projectId, review }: { projectId: string; review: DocumentReviewEntry }) {
  const [open, setOpen] = useState(false);
  const f = review.findings.length;
  const v = review.verificationItems.length;
  if (f + v === 0) return null;
  const parts = [f ? `${f} ${f === 1 ? "Finding" : "Findings"}` : null, v ? `${v} ${v === 1 ? "Verification Item" : "Verification Items"}` : null];
  return (
    <div data-testid="follow-up-summary">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline"
      >
        Follow-up: {parts.filter(Boolean).join(" · ")}
      </button>
      {open ? (
        <ul data-testid="follow-up-list" className="divide-y divide-border rounded-md border border-border bg-surface">
          {review.findings.map((fi) => (
            <li key={fi.id} className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 text-sm">
              <StatusBadge label={findingTypeLabel(fi.findingType)} tone={findingTypeTone(fi.findingType)} />
              <Link href={`/projects/${projectId}/findings/${fi.id}`} className="min-w-0 font-semibold text-primary hover:underline">
                {findingLabel(fi)}
              </Link>
              <StatusBadge label={findingStatusLabel(fi.status)} tone={findingStatusTone(fi.status)} />
            </li>
          ))}
          {review.verificationItems.map((vi) => (
            <li key={vi.id} className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Verification</span>
              <Link href={`/projects/${projectId}/verification`} className="min-w-0 text-primary hover:underline">
                {vi.question}
              </Link>
              <StatusBadge label={verificationResultLabel(vi.result)} tone={verificationResultTone(vi.result)} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

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
  followUp,
  onChanged,
}: {
  projectId: string;
  version: DocumentVersionSummary;
  isApplicable: boolean;
  frameworkItems: DocumentFrameworkItem[];
  followUp: FollowUpContext;
  onChanged: (message: string) => void;
}) {
  const [drawer, setDrawer] = useState<{ mode: "edit" | "complete"; review: DocumentReviewEntry } | null>(null);
  const [followUpForm, setFollowUpForm] = useState<"finding" | "verification" | null>(null);
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

      {/* Follow-up (Phase 5D): only from the latest, concluded assessment of the Current version of an
          Applicable Document. A Not Applicable Document keeps its existing links, read-only. */}
      {current && !open && !isApplicable ? <FollowUpSummary projectId={projectId} review={current} /> : null}
      {current && !open && isApplicable ? (
        <div data-testid="review-follow-up" className="space-y-1.5 border-t border-border pt-2">
          <p className="text-xs text-muted">
            Follow-up: Create Finding for a gap the document already shows · Add to Verification to confirm it onsite.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={current.status === "accepted" ? "ghost" : "secondary"}
              className={cn("min-h-9 px-3!", current.status === "accepted" && "border-border!")}
              onClick={() => setFollowUpForm("finding")}
            >
              {current.findings.length > 0 ? "Add another Finding" : "Create Finding"}
            </Button>
            <Button
              type="button"
              variant={current.status === "accepted" ? "ghost" : "secondary"}
              className={cn("min-h-9 px-3!", current.status === "accepted" && "border-border!")}
              onClick={() => setFollowUpForm("verification")}
            >
              Add to Verification
            </Button>
          </div>
          <FollowUpSummary projectId={projectId} review={current} />
        </div>
      ) : null}

      {followUpForm && current ? (
        followUpForm === "finding" ? (
          <FindingFormDrawer
            mode="create"
            projectId={projectId}
            catalog={followUpCatalog(followUp.catalog, frameworkItems)}
            reviewOrigin={{
              reviewId: current.id,
              documentTitle: followUp.documentTitle,
              versionLabel: version.revision ? `V${version.versionNo} · ${version.revision}` : `V${version.versionNo}`,
              resultLabel: documentStatusLabel(current.status),
              documentSiteId: followUp.documentSiteId,
              notes: current.notes,
              prefillFrameworkItemId: frameworkItems.length === 1 ? frameworkItems[0].id : null,
            }}
            onClose={() => setFollowUpForm(null)}
            onSaved={(msg) => {
              setFollowUpForm(null);
              onChanged(msg);
            }}
          />
        ) : (
          <VerificationItemFormDrawer
            mode="create"
            projectId={projectId}
            catalog={followUpCatalog(followUp.catalog, frameworkItems)}
            reviewOrigin={{
              reviewId: current.id,
              documentTitle: followUp.documentTitle,
              versionLabel: version.revision ? `V${version.versionNo} · ${version.revision}` : `V${version.versionNo}`,
              resultLabel: documentStatusLabel(current.status),
              documentSiteId: followUp.documentSiteId,
              prefillFrameworkItemId: frameworkItems.length === 1 ? frameworkItems[0].id : null,
            }}
            onClose={() => setFollowUpForm(null)}
            onSaved={(msg) => {
              setFollowUpForm(null);
              onChanged(msg);
            }}
          />
        )
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
export function AssessmentHistory({ projectId, reviews, label }: { projectId: string; reviews: DocumentReviewEntry[]; label: string }) {
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
              <FollowUpSummary projectId={projectId} review={r} />
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
