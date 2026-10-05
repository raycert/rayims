"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { isUniqueViolation } from "@/lib/domain/db-errors";
import { completeReviewSchema, reviewCommentsSchema } from "@/lib/validation/document-reviews";
import type { SupabaseServerClient } from "./scope-validation";
import { fieldErrorsFrom, type ActionResult } from "./types";

/**
 * Document Gap Assessment (Phase 5C) on the existing `document_reviews` table. A review is started
 * as Under Review (open), its Review Comments may be edited while open, and it is completed once as
 * Revision Required or Accepted — then it is immutable. A changed conclusion is a NEW review on the
 * same current Version. Rules enforced here on freshly loaded data (never trusting the browser):
 * latest Version only, Document Applicable, at most one open review per Version, project isolation
 * through Version → Document → project. A review result never creates a Finding or a Verification
 * item (explicit actions arrive in Phase 5D).
 */

const NOT_CURRENT = "This version is no longer current. Review the current version instead.";
const NOT_APPLICABLE = "Gap Assessments cannot start while this document is Not Applicable.";
const ALREADY_OPEN = "A Gap Assessment is already open for this version.";
const CONCLUDED = "This assessment is completed and can no longer be changed. Start a new assessment instead.";

type VersionContext =
  | { ok: true; versionId: string; documentId: string; applicable: boolean; isLatest: boolean; openReviewId: string | null }
  | { ok: false; error: string };

/** Version → Document → project, plus "is it the latest version" and its open review (if any). */
async function loadVersionContext(supabase: SupabaseServerClient, projectId: string, versionId: string): Promise<VersionContext> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("id, document_id, version_no, documents(project_id, is_applicable), document_reviews(id, status)")
    .eq("id", versionId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't load the version. Try again." };
  if (!data || !data.documents || data.documents.project_id !== projectId) return { ok: false, error: "This version could not be found." };

  const { data: latest, error: latestError } = await supabase
    .from("document_versions")
    .select("version_no")
    .eq("document_id", data.document_id)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError || !latest) return { ok: false, error: "Couldn't load the version. Try again." };

  return {
    ok: true,
    versionId: data.id,
    documentId: data.document_id,
    applicable: data.documents.is_applicable,
    isLatest: data.version_no === latest.version_no,
    openReviewId: (data.document_reviews ?? []).find((r) => r.status === "under_review")?.id ?? null,
  };
}

/** A review of this project with its Version context; only an OPEN review on the current Version of an Applicable Document may change. */
async function loadOpenReview(supabase: SupabaseServerClient, projectId: string, reviewId: string) {
  const { data, error } = await supabase.from("document_reviews").select("id, status, document_version_id").eq("id", reviewId).maybeSingle();
  if (error) return { ok: false as const, error: "Couldn't load the assessment. Try again." };
  if (!data) return { ok: false as const, error: "This assessment could not be found." };
  const ctx = await loadVersionContext(supabase, projectId, data.document_version_id);
  if (!ctx.ok) return { ok: false as const, error: "This assessment could not be found." };
  if (data.status !== "under_review") return { ok: false as const, error: CONCLUDED };
  if (!ctx.isLatest) return { ok: false as const, error: NOT_CURRENT };
  if (!ctx.applicable) return { ok: false as const, error: NOT_APPLICABLE };
  return { ok: true as const, documentId: ctx.documentId };
}

function revalidateDocument(projectId: string, documentId: string) {
  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
}

/**
 * Start Gap Assessment / Start New Assessment: creates an Under Review record on the CURRENT
 * version. reviewer_id = the user who starts it; reviewed_at stays NULL until it is completed.
 */
export async function startDocumentReview(projectId: string, versionId: string): Promise<ActionResult<{ reviewId: string }>> {
  const user = await requireUser();
  const supabase = await createSupabaseClient();
  const ctx = await loadVersionContext(supabase, projectId, versionId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!ctx.applicable) return { ok: false, error: NOT_APPLICABLE };
  if (!ctx.isLatest) return { ok: false, error: NOT_CURRENT };
  if (ctx.openReviewId) return { ok: false, error: ALREADY_OPEN };

  const { data, error } = await supabase
    .from("document_reviews")
    .insert({ document_version_id: versionId, status: "under_review", reviewer_id: user.id, reviewed_at: null, notes: null })
    .select("id")
    .single();
  if (isUniqueViolation(error)) {
    // Phase 7B: the database allows one open assessment per Version; a simultaneous start lost the race.
    revalidateDocument(projectId, ctx.documentId);
    return { ok: false, error: ALREADY_OPEN };
  }
  if (error || !data) return { ok: false, error: "Couldn't start the assessment. Try again." };

  // Phase 5G: two simultaneous starts can both pass the check above. Since Phase 7B the database refuses the
  // second open assessment (unique index, handled above), so this reconciliation is now only a second line of
  // defence and normally finds exactly one. It stays as written: if more than one
  // assessment is open on this Version, the earliest (created_at, id) is kept and the others — just
  // started, so without comments, follow-up or evidence — are removed. Every interleaving converges on
  // one open assessment; the request whose record was removed reports ALREADY_OPEN.
  const { data: open } = await supabase
    .from("document_reviews")
    .select("id")
    .eq("document_version_id", versionId)
    .eq("status", "under_review")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (open && open.length > 1) {
    const keep = open[0].id;
    await supabase
      .from("document_reviews")
      .delete()
      .eq("document_version_id", versionId)
      .eq("status", "under_review")
      .neq("id", keep);
    revalidateDocument(projectId, ctx.documentId);
    if (keep !== data.id) return { ok: false, error: ALREADY_OPEN };
  }

  revalidateDocument(projectId, ctx.documentId);
  return { ok: true, data: { reviewId: data.id } };
}

/** Edit the Review Comments of an OPEN assessment. Status, version, reviewer and created_at never change here. */
export async function updateDocumentReview(projectId: string, reviewId: string, input: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = reviewCommentsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const supabase = await createSupabaseClient();
  const loaded = await loadOpenReview(supabase, projectId, reviewId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const { data, error } = await supabase
    .from("document_reviews")
    .update({ notes: parsed.data.notes })
    .eq("id", reviewId)
    .eq("status", "under_review")
    .select("id");
  if (error) return { ok: false, error: "Couldn't save the assessment. Try again." };
  if (!data || data.length === 0) return { ok: false, error: CONCLUDED };

  revalidateDocument(projectId, loaded.documentId);
  return { ok: true, data: undefined };
}

/**
 * Complete an OPEN assessment as Revision Required or Accepted (no default). Sets the final Review
 * Comments, reviewer_id = the concluding user and reviewed_at = server time. The update is
 * conditioned on the review still being Under Review, so it can be completed only once.
 */
export async function completeDocumentReview(projectId: string, reviewId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = completeReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const supabase = await createSupabaseClient();
  const loaded = await loadOpenReview(supabase, projectId, reviewId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const { data, error } = await supabase
    .from("document_reviews")
    .update({ status: parsed.data.result, notes: parsed.data.notes, reviewer_id: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", reviewId)
    .eq("status", "under_review")
    .select("id");
  if (error) return { ok: false, error: "Couldn't complete the assessment. Try again." };
  if (!data || data.length === 0) return { ok: false, error: CONCLUDED };

  revalidateDocument(projectId, loaded.documentId);
  return { ok: true, data: undefined };
}
