"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { findingSchema } from "@/lib/validation/findings";
import { frameworkItemInProjectScope, validateSiteAndActivity } from "./scope-validation";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateFinding(projectId: string, findingId?: string) {
  revalidatePath(`/projects/${projectId}/findings`);
  if (findingId) revalidatePath(`/projects/${projectId}/findings/${findingId}`);
}

/**
 * Creates a manual Finding (Phase 4C-1). projectId is a trusted route value; created_by is
 * the session user; status starts Open (its column default). Origin links
 * (verification_item_id, document_review_id), the NC response fields (correction,
 * root_cause, effectiveness_*) and closed_at/closed_by are never referenced by this
 * insert, even if a tampered client submits them — they stay at their database defaults.
 */
export async function createFinding(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = findingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const supabase = await createSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return { ok: false, error: "Couldn't create the finding. Try again." };
  if (!project) return { ok: false, error: "This project could not be found." };

  const scopeError = await validateSiteAndActivity(supabase, projectId, d.siteId, d.activityId, {
    name: "Activity",
    field: "activityId",
  });
  if (scopeError) return { ok: false, error: scopeError.error, fieldErrors: { [scopeError.field]: scopeError.error } };

  if (!(await frameworkItemInProjectScope(supabase, projectId, d.frameworkItemId))) {
    return {
      ok: false,
      error: "The selected Framework Requirement is not assigned to this project.",
      fieldErrors: { frameworkItemId: "Not assigned to this project." },
    };
  }

  const { data, error } = await supabase
    .from("issues")
    .insert({
      project_id: projectId,
      finding_type: d.findingType,
      title: d.title,
      description: d.description,
      priority: d.priority,
      site_id: d.siteId,
      activity_id: d.activityId,
      framework_item_id: d.frameworkItemId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't create the finding. Try again." };

  revalidateFinding(projectId);
  return { ok: true, data: { id: data.id } };
}

/**
 * Edits the core fields of an OPEN Finding. Closed Findings are read-only (Reopen first).
 * Origin links are immutable and the NC response / effectiveness / closure fields are never
 * referenced by the UPDATE, so they are preserved byte-for-byte.
 */
export async function updateFinding(projectId: string, findingId: string, input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = findingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const supabase = await createSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("issues")
    .select("id, project_id, status, framework_item_id")
    .eq("id", findingId)
    .maybeSingle();
  if (existingError) return { ok: false, error: "Couldn't save the finding. Try again." };
  if (!existing || existing.project_id !== projectId) return { ok: false, error: "This finding could not be found." };
  if (existing.status === "closed") return { ok: false, error: "This finding is closed. Reopen it to edit." };

  const scopeError = await validateSiteAndActivity(supabase, projectId, d.siteId, d.activityId, {
    name: "Activity",
    field: "activityId",
  });
  if (scopeError) return { ok: false, error: scopeError.error, fieldErrors: { [scopeError.field]: scopeError.error } };

  // Historical preservation (BR-74): an existing item whose Framework was since unassigned may
  // be KEPT, but only a changed value must be currently assigned.
  if (d.frameworkItemId !== existing.framework_item_id) {
    if (!(await frameworkItemInProjectScope(supabase, projectId, d.frameworkItemId))) {
      return {
        ok: false,
        error: "The selected Framework Requirement is not assigned to this project.",
        fieldErrors: { frameworkItemId: "Not assigned to this project." },
      };
    }
  }

  const { data, error } = await supabase
    .from("issues")
    .update({
      finding_type: d.findingType,
      title: d.title,
      description: d.description,
      priority: d.priority,
      site_id: d.siteId,
      activity_id: d.activityId,
      framework_item_id: d.frameworkItemId,
    })
    .eq("id", findingId)
    .eq("project_id", projectId)
    .eq("status", "open")
    .select("id");
  if (error) return { ok: false, error: "Couldn't save the finding. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This finding could not be saved. It may have been closed." };

  revalidateFinding(projectId, findingId);
  return { ok: true, data: undefined };
}

/**
 * Closes an Observation or Opportunity for Improvement (Phase 4C-1). Nonconformity closure
 * needs the 4D response/effectiveness workflow and is refused here. Refused while any linked
 * Action is not Closed. status/closed_at/closed_by are always server-derived.
 */
export async function closeFinding(projectId: string, findingId: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createSupabaseClient();

  const { data: finding, error } = await supabase
    .from("issues")
    .select("id, project_id, status, finding_type")
    .eq("id", findingId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't close the finding. Try again." };
  if (!finding || finding.project_id !== projectId) return { ok: false, error: "This finding could not be found." };
  if (finding.status === "closed") return { ok: false, error: "This finding is already closed." };
  if (finding.finding_type === "nonconformity") {
    return { ok: false, error: "A Nonconformity can't be closed yet." };
  }

  const { count, error: actionsError } = await supabase
    .from("actions")
    .select("id", { count: "exact", head: true })
    .eq("issue_id", findingId)
    .neq("status", "closed");
  if (actionsError) return { ok: false, error: "Couldn't close the finding. Try again." };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `This finding has ${count} linked ${count === 1 ? "action" : "actions"} that ${count === 1 ? "isn't" : "aren't"} closed. Close ${count === 1 ? "it" : "them"} first.`,
    };
  }

  const { data, error: updateError } = await supabase
    .from("issues")
    .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: user.id })
    .eq("id", findingId)
    .eq("project_id", projectId)
    .eq("status", "open")
    .select("id");
  if (updateError) return { ok: false, error: "Couldn't close the finding. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This finding could not be closed. It may already be closed." };

  revalidateFinding(projectId, findingId);
  return { ok: true, data: undefined };
}

/**
 * Reopens a closed Finding: Open again, closure cleared, and the CURRENT effectiveness result
 * invalidated (a reopened Finding must not keep an old "Effective" as its workflow state).
 * Correction, root cause, effectiveness notes and linked actions are preserved.
 */
export async function reopenFinding(projectId: string, findingId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createSupabaseClient();

  const { data: finding, error } = await supabase
    .from("issues")
    .select("id, project_id, status")
    .eq("id", findingId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't reopen the finding. Try again." };
  if (!finding || finding.project_id !== projectId) return { ok: false, error: "This finding could not be found." };
  if (finding.status !== "closed") return { ok: false, error: "This finding is not closed." };

  const { data, error: updateError } = await supabase
    .from("issues")
    .update({
      status: "open",
      closed_at: null,
      closed_by: null,
      effectiveness_result: null,
      effectiveness_reviewed_by: null,
      effectiveness_reviewed_at: null,
    })
    .eq("id", findingId)
    .eq("project_id", projectId)
    .eq("status", "closed")
    .select("id");
  if (updateError) return { ok: false, error: "Couldn't reopen the finding. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This finding could not be reopened. It may already be open." };

  revalidateFinding(projectId, findingId);
  return { ok: true, data: undefined };
}
