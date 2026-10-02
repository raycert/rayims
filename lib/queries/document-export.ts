import { createClient } from "@/lib/supabase/server";
import { listDocuments, type DocumentRow } from "./documents";
import { fetchAllPages } from "./paging";

/**
 * One Document of the Gap Assessment export (Phase 5F): the register row (derived status, latest
 * version, Last Review, mappings — exactly as the Document Register) plus the current file, the
 * latest assessment's comments / reviewer, and the Document's direct follow-up counts.
 */
export type GapAssessmentDocument = DocumentRow & {
  /** Original file name of the latest version; null = no version. */
  currentFileName: string | null;
  /** received_on of the latest version (yyyy-mm-dd). */
  receivedOn: string | null;
  /** Notes of the review that decided the status (latest review of the LATEST version); null = none. */
  reviewComments: string | null;
  /** That review's reviewer: display name → email → "Unknown user"; null = no review of the latest version. */
  reviewedBy: string | null;
  /** Findings created DIRECTLY from any assessment of this Document (issues.document_review_id), all versions. */
  findings: { total: number; open: number };
  /** Verification items added DIRECTLY from any assessment of this Document, all versions. */
  verificationItems: { total: number; pending: number };
};

/**
 * Read-only, batched (no per-document query): listDocuments (register view, mappings, concluded
 * reviews, sites) + two project-joined, paged queries:
 *   1. the project's document versions (file name, received_on) — only the latest one per document is used
 *   2. the project's document reviews with reviewer, direct Findings and direct Verification items
 * A Finding raised later from a review-origin Verification item links to that item, not to the
 * review (BR-129), so it is NOT counted as a direct review Finding.
 */
export async function getGapAssessmentExport(projectId: string): Promise<GapAssessmentDocument[]> {
  const documents = await listDocuments(projectId);
  if (documents.length === 0) return [];

  const supabase = await createClient();
  const [versionsRes, reviewsRes] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("document_versions")
        .select("id, received_on, files(original_name), documents!inner(project_id)", { count: "exact" })
        .eq("documents.project_id", projectId)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("document_reviews")
        .select(
          "id, notes, reviewer:profiles!document_reviews_reviewer_id_fkey(display_name, email), document_versions!inner(document_id, documents!inner(project_id)), issues(status), verification_items(result)",
          { count: "exact" },
        )
        .eq("document_versions.documents.project_id", projectId)
        .order("id")
        .range(from, to),
    ),
  ]);
  if (versionsRes.error) throw new Error("Could not load document versions.");
  if (reviewsRes.error) throw new Error("Could not load document reviews.");

  const versionById = new Map(versionsRes.data.map((v) => [v.id, v]));
  const reviewById = new Map(reviewsRes.data.map((r) => [r.id, r]));
  const followUp = new Map<string, { findings: { total: number; open: number }; verificationItems: { total: number; pending: number } }>();
  for (const r of reviewsRes.data) {
    const documentId = r.document_versions.document_id;
    const f = followUp.get(documentId) ?? { findings: { total: 0, open: 0 }, verificationItems: { total: 0, pending: 0 } };
    for (const i of r.issues ?? []) {
      f.findings.total += 1;
      if (i.status !== "closed") f.findings.open += 1;
    }
    for (const v of r.verification_items ?? []) {
      f.verificationItems.total += 1;
      if (!v.result) f.verificationItems.pending += 1;
    }
    followUp.set(documentId, f);
  }

  return documents.map((d) => {
    const version = d.latestVersionId ? versionById.get(d.latestVersionId) : undefined;
    // The review the view used for the status, so Status and Review Comments can never disagree.
    // A new version without an assessment has latestReviewId = null: old comments are not carried over.
    const review = d.latestReviewId ? reviewById.get(d.latestReviewId) : undefined;
    return {
      ...d,
      currentFileName: version?.files?.original_name ?? null,
      receivedOn: version?.received_on ?? null,
      reviewComments: review?.notes ?? null,
      reviewedBy: review ? review.reviewer?.display_name || review.reviewer?.email || "Unknown user" : null,
      findings: followUp.get(d.id)?.findings ?? { total: 0, open: 0 },
      verificationItems: followUp.get(d.id)?.verificationItems ?? { total: 0, pending: 0 },
    };
  });
}
