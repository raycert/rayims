"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { documentStatusLabel, documentStatusTone } from "@/lib/ui/status-tones";
import { formatDate } from "@/lib/ui/format";
import { deleteDocumentVersion, getDocumentVersionDeleteState, getDocumentVersionUrl } from "@/lib/mutations/document-versions";
import { LocalTime } from "@/components/ui/local-time";
import { formatFileSize } from "@/components/evidence/evidence-format";
import { VersionUploadDrawer } from "./version-upload-drawer";
import { AssessmentHistory, GapAssessmentPanel, type FollowUpContext } from "./gap-assessment";
import type { DocumentFrameworkItem, DocumentVersionSummary } from "@/lib/queries/documents";

const COLLAPSED_COUNT = 2;

export function versionLabel(v: { versionNo: number; revision: string | null }): string {
  return v.revision ? `V${v.versionNo} · ${v.revision}` : `V${v.versionNo}`;
}

/**
 * Versions of a Document (Phase 5B), newest first. Each Version is immutable history: View (PDF) /
 * Download through a 60-second signed URL generated on click; only the latest, unreviewed Version
 * of an Applicable Document offers Delete (in the "…" menu). Phase 5C: the Current version carries
 * its Gap Assessment panel; every version keeps its Assessment History (read-only).
 */
export function DocumentVersionsSection({
  projectId,
  documentId,
  isApplicable,
  versions,
  frameworkItems,
  followUp,
  onChanged,
}: {
  projectId: string;
  documentId: string;
  isApplicable: boolean;
  versions: DocumentVersionSummary[];
  /** The Document's mapped requirements — the context a Version is assessed against. */
  frameworkItems: DocumentFrameworkItem[];
  /** Context for Gap Assessment follow-up (Create Finding / Add to Verification, Phase 5D). */
  followUp: FollowUpContext;
  onChanged: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<DocumentVersionSummary | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const latestNo = versions[0]?.versionNo ?? 0;
  // Phase 5G: an open assessment on the current Version must be completed before a new Version.
  const assessmentOpen = (versions[0]?.reviews ?? []).some((r) => r.status === "under_review");
  const shown = showAll ? versions : versions.slice(0, COLLAPSED_COUNT);

  function open(v: DocumentVersionSummary, mode: "view" | "download") {
    // Open the tab synchronously (popup blockers), then point it at the short-lived URL.
    const win = mode === "view" ? window.open("", "_blank") : null;
    startTransition(async () => {
      const result = await getDocumentVersionUrl(projectId, v.id, mode);
      if (!result.ok) {
        win?.close();
        setErrors((e) => ({ ...e, [v.id]: result.error }));
        return;
      }
      setErrors((e) => ({ ...e, [v.id]: "" }));
      if (win) win.location.href = result.data.url;
      else window.location.assign(result.data.url);
    });
  }

  return (
    <section data-testid="document-versions" className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Versions</h2>
          <p className="text-xs text-muted">
            {versions.length} {versions.length === 1 ? "version" : "versions"} · files received for this document, each
            assessed separately
          </p>
        </div>
        {isApplicable ? (
          <Button type="button" variant="secondary" className="min-h-9" onClick={() => setUploading(true)} disabled={assessmentOpen}>
            Upload New Version
          </Button>
        ) : null}
      </div>

      {!isApplicable ? (
        <p data-testid="versions-locked" className="border-b border-border px-4 py-2.5 text-xs text-muted">
          Versions cannot be uploaded while this document is Not Applicable.
        </p>
      ) : assessmentOpen ? (
        <p data-testid="versions-locked" className="border-b border-border px-4 py-2.5 text-xs text-muted">
          Complete the current Gap Assessment before uploading a new Version.
        </p>
      ) : null}

      {versions.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">No versions received yet.</p>
      ) : (
        <ul>
          {shown.map((v) => {
            const current = v.versionNo === latestNo;
            return (
              <li key={v.id} data-testid="version-row" className="border-t border-border px-4 py-3 first:border-t-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{versionLabel(v)}</span>
                      {current ? <StatusBadge label="Current" tone="info" /> : null}
                      {/* The Current version's result is shown in its Gap Assessment panel; older ones keep their final result here. */}
                      {!current && v.latestReviewStatus ? (
                        <StatusBadge label={documentStatusLabel(v.latestReviewStatus)} tone={documentStatusTone(v.latestReviewStatus)} />
                      ) : null}
                    </div>
                    <p className="mt-0.5 break-all text-sm">
                      {v.fileName ?? "—"}
                      <span className="ml-2 text-xs text-muted">{formatFileSize(v.sizeBytes)}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {v.receivedOn ? `Received ${formatDate(v.receivedOn)} · ` : ""}
                      {`Uploaded by ${v.uploadedByName ?? "Unknown user"} · `}
                      <LocalTime iso={v.createdAt} />
                    </p>
                    {v.notes ? <p className="mt-1 whitespace-pre-wrap text-sm">{v.notes}</p> : null}
                    <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
                      {v.mimeType === "application/pdf" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => open(v, "view")}
                          aria-label={`View V${v.versionNo} file`}
                          className="inline-flex min-h-9 items-center font-semibold text-primary hover:underline"
                        >
                          View
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => open(v, "download")}
                        aria-label={`Download V${v.versionNo} file`}
                        className="inline-flex min-h-9 items-center font-semibold text-primary hover:underline"
                      >
                        Download
                      </button>
                    </div>
                    {errors[v.id] ? (
                      <p role="alert" className="text-xs text-danger">
                        {errors[v.id]}
                      </p>
                    ) : null}
                    {current ? (
                      <>
                        <GapAssessmentPanel
                          projectId={projectId}
                          version={v}
                          isApplicable={isApplicable}
                          frameworkItems={frameworkItems}
                          followUp={followUp}
                          onChanged={onChanged}
                        />
                        <AssessmentHistory projectId={projectId} reviews={v.reviews.slice(1)} label="Earlier assessments" />
                      </>
                    ) : (
                      <AssessmentHistory projectId={projectId} reviews={v.reviews} label="Assessment history" />
                    )}
                  </div>
                  {current ? <OverflowMenu items={[{ label: "Delete Version", onSelect: () => setDeleting(v), danger: true }]} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {versions.length > COLLAPSED_COUNT ? (
        <div className="border-t border-border px-4 py-2">
          <button type="button" onClick={() => setShowAll((s) => !s)} className="min-h-9 text-sm font-semibold text-primary hover:underline">
            {showAll ? "Show fewer versions" : `Show earlier versions (${versions.length - COLLAPSED_COUNT})`}
          </button>
        </div>
      ) : null}

      {uploading ? (
        <VersionUploadDrawer
          projectId={projectId}
          documentId={documentId}
          nextVersionNo={latestNo + 1}
          onClose={() => setUploading(false)}
          onUploaded={(msg) => {
            setUploading(false);
            onChanged(msg);
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDeleteDialog
          title="Delete version?"
          message={`This permanently removes V${deleting.versionNo} and its uploaded file.`}
          blockedTitle="This version can't be deleted"
          loadState={() => getDocumentVersionDeleteState(projectId, deleting.id)}
          onDelete={() => deleteDocumentVersion(projectId, deleting.id)}
          onClose={() => setDeleting(null)}
          onDeleted={(result) => {
            setDeleting(null);
            onChanged(
              result.storedFileRemoved
                ? "Version deleted."
                : "Version deleted. The stored file could not be removed and will need manual cleanup.",
            );
          }}
        />
      ) : null}
    </section>
  );
}
