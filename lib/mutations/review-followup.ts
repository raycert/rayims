import { frameworkItemInProjectScope, type SupabaseServerClient } from "./scope-validation";

/**
 * Shared, non-Server-Action helpers for Gap Assessment follow-up (Phase 5D): Review → Finding and
 * Review → Verification Item. Deliberately NOT a "use server" module.
 *
 * New follow-up may come only from the LATEST, CONCLUDED assessment of the CURRENT version of a
 * Document of this project. Historical assessments keep their existing links, read-only.
 */

export type ReviewFollowUpContext =
  | {
      ok: true;
      reviewId: string;
      documentId: string;
      /** A site-specific Document locks the follow-up's site to this value. */
      documentSiteId: string | null;
      /** The Document's mapped Framework Requirements (may include now-unassigned, historical ones). */
      mappedItemIds: string[];
    }
  | { ok: false; error: string; field?: string };

export const NOT_CONCLUDED = "Follow-up can be created only from a completed assessment.";
export const NOT_CURRENT_VERSION =
  "This assessment belongs to an older version. Create follow-up from the current version's latest assessment.";
export const NOT_LATEST_REVIEW = "Only the latest assessment of the current version can create new follow-up.";
export const NOT_APPLICABLE = "Follow-up cannot be created while this document is Not Applicable.";

export async function loadReviewForFollowUp(
  supabase: SupabaseServerClient,
  projectId: string,
  reviewId: string,
): Promise<ReviewFollowUpContext> {
  const notFound = { ok: false as const, error: "This assessment could not be found." };
  const { data, error } = await supabase
    .from("document_reviews")
    .select(
      "id, status, document_version_id, document_versions(id, version_no, document_id, documents(id, project_id, site_id, is_applicable, document_framework_items(framework_item_id)), document_reviews(id, created_at))",
    )
    .eq("id", reviewId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't load the assessment. Try again." };
  const version = data?.document_versions;
  const doc = version?.documents;
  if (!data || !version || !doc || doc.project_id !== projectId) return notFound;
  // Not Applicable freezes new work on the Document (BR-115 / BR-123); existing links stay visible.
  if (!doc.is_applicable) return { ok: false, error: NOT_APPLICABLE };
  if (data.status !== "revision_required" && data.status !== "accepted") return { ok: false, error: NOT_CONCLUDED };

  const { data: latest, error: latestError } = await supabase
    .from("document_versions")
    .select("version_no")
    .eq("document_id", doc.id)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError || !latest) return { ok: false, error: "Couldn't load the assessment. Try again." };
  if (latest.version_no !== version.version_no) return { ok: false, error: NOT_CURRENT_VERSION };

  // Latest review of the version: created_at DESC, id DESC (the one ordering rule, BR-125).
  const newest = [...(version.document_reviews ?? [])].sort((a, b) =>
    a.created_at !== b.created_at ? (a.created_at < b.created_at ? 1 : -1) : a.id < b.id ? 1 : -1,
  )[0];
  if (!newest || newest.id !== reviewId) return { ok: false, error: NOT_LATEST_REVIEW };

  return {
    ok: true,
    reviewId,
    documentId: doc.id,
    documentSiteId: doc.site_id,
    mappedItemIds: (doc.document_framework_items ?? []).map((m) => m.framework_item_id),
  };
}

/** A site-specific Document fixes the follow-up's site (Project-wide Documents allow any project site). */
export function documentSiteError(documentSiteId: string | null, siteId: string | null): string | null {
  if (documentSiteId && siteId !== documentSiteId) return "Site must match the document's site.";
  return null;
}

/**
 * Framework Requirement of a follow-up: optional; if given it must be in the project's assigned
 * Frameworks OR one of the Document's own mapped requirements (historical mappings stay valid).
 */
export async function frameworkItemAllowedForReview(
  supabase: SupabaseServerClient,
  projectId: string,
  frameworkItemId: string | null,
  mappedItemIds: string[],
): Promise<boolean> {
  if (!frameworkItemId || mappedItemIds.includes(frameworkItemId)) return true;
  return frameworkItemInProjectScope(supabase, projectId, frameworkItemId);
}

/**
 * For EDITING an existing review-origin record: the Document's site and mapped requirements
 * (the site lock and the mapped-requirement allowance still apply). null = not review-origin.
 */
export async function reviewOriginConstraints(
  supabase: SupabaseServerClient,
  documentReviewId: string | null,
): Promise<{ documentSiteId: string | null; mappedItemIds: string[] } | null> {
  if (!documentReviewId) return null;
  const { data } = await supabase
    .from("document_reviews")
    .select("document_versions(documents(site_id, document_framework_items(framework_item_id)))")
    .eq("id", documentReviewId)
    .maybeSingle();
  const doc = data?.document_versions?.documents;
  if (!doc) return null;
  return { documentSiteId: doc.site_id, mappedItemIds: (doc.document_framework_items ?? []).map((m) => m.framework_item_id) };
}
