"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { actionSchema, actionStatusSchema } from "@/lib/validation/actions";
import { evaluateActionDelete, type DeleteEvaluation } from "@/lib/domain/delete-rules";
import { validateSiteAndActivity, type SupabaseServerClient } from "./scope-validation";
import { fieldErrorsFrom, type ActionResult } from "./types";

const FROZEN = "This action belongs to a closed finding. Reopen the finding to change it.";

function revalidateActions(projectId: string, findingId: string | null) {
  revalidatePath(`/projects/${projectId}/actions`);
  revalidatePath(`/projects/${projectId}/findings`);
  if (findingId) revalidatePath(`/projects/${projectId}/findings/${findingId}`);
}

/** Loads an action of this project together with its Finding's status (null = standalone). */
type LoadedAction =
  | { ok: true; action: { id: string; project_id: string; issue_id: string | null; status: string; issues: { status: string } | null } }
  | { ok: false; error: string };

async function loadAction(supabase: SupabaseServerClient, projectId: string, actionId: string): Promise<LoadedAction> {
  const { data, error } = await supabase
    .from("actions")
    .select("id, project_id, issue_id, status, issues(status)")
    .eq("id", actionId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't load the action. Try again." };
  if (!data || data.project_id !== projectId) return { ok: false, error: "This action could not be found." };
  return { ok: true, action: data };
}

/**
 * Creates an action (Phase 4D-1). With `findingId` it is linked to that Finding (a Corrective
 * Action for a Nonconformity); with null it is a standalone project action. project_id,
 * issue_id, created_by and status (Open) are always server-derived; completion fields are never
 * written here. A closed Finding accepts no new actions (reopen it first).
 */
export async function createAction(
  projectId: string,
  findingId: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = actionSchema.safeParse(input);
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
  if (projectError) return { ok: false, error: "Couldn't create the action. Try again." };
  if (!project) return { ok: false, error: "This project could not be found." };

  if (findingId) {
    const { data: finding, error } = await supabase
      .from("issues")
      .select("id, project_id, status")
      .eq("id", findingId)
      .maybeSingle();
    if (error) return { ok: false, error: "Couldn't create the action. Try again." };
    if (!finding || finding.project_id !== projectId) return { ok: false, error: "This finding could not be found." };
    if (finding.status === "closed") {
      return { ok: false, error: "This finding is closed. Reopen it to add an action." };
    }
  }

  const scopeError = await validateSiteAndActivity(supabase, projectId, d.siteId, d.activityId, {
    name: "Activity",
    field: "activityId",
  });
  if (scopeError) return { ok: false, error: scopeError.error, fieldErrors: { [scopeError.field]: scopeError.error } };

  const { data, error } = await supabase
    .from("actions")
    .insert({
      project_id: projectId,
      issue_id: findingId,
      description: d.description,
      owner_name: d.ownerName,
      due_date: d.dueDate,
      priority: d.priority,
      site_id: d.siteId,
      activity_id: d.activityId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't create the action. Try again." };

  revalidateActions(projectId, findingId);
  return { ok: true, data: { id: data.id } };
}

/**
 * Edits the core fields of a NOT-closed action. issue_id (the Finding link) is immutable and
 * never referenced by the UPDATE; status and completion fields change only via setActionStatus.
 * A closed action is read-only (reopen it first); so is any action of a closed Finding.
 */
export async function updateAction(projectId: string, actionId: string, input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const supabase = await createSupabaseClient();
  const loaded = await loadAction(supabase, projectId, actionId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { action } = loaded;
  if (action.issues?.status === "closed") return { ok: false, error: FROZEN };
  if (action.status === "closed") return { ok: false, error: "This action is closed. Reopen it to edit." };

  const scopeError = await validateSiteAndActivity(supabase, projectId, d.siteId, d.activityId, {
    name: "Activity",
    field: "activityId",
  });
  if (scopeError) return { ok: false, error: scopeError.error, fieldErrors: { [scopeError.field]: scopeError.error } };

  const { data, error } = await supabase
    .from("actions")
    .update({
      description: d.description,
      owner_name: d.ownerName,
      due_date: d.dueDate,
      priority: d.priority,
      site_id: d.siteId,
      activity_id: d.activityId,
    })
    .eq("id", actionId)
    .eq("project_id", projectId)
    .neq("status", "closed")
    .select("id");
  if (error) return { ok: false, error: "Couldn't save the action. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This action could not be saved. It may have been closed." };

  revalidateActions(projectId, action.issue_id);
  return { ok: true, data: undefined };
}

/**
 * Moves an action between open / in_progress / pending_review / closed (no state machine).
 * Closing sets completed_at to the server time and, when provided, completion_notes. Leaving
 * Closed clears completed_at and keeps completion_notes. Actions of a closed Finding are frozen.
 */
export async function setActionStatus(projectId: string, actionId: string, input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = actionStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Select a status." };
  const { status, completionNotes } = parsed.data;

  const supabase = await createSupabaseClient();
  const loaded = await loadAction(supabase, projectId, actionId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { action } = loaded;
  if (action.issues?.status === "closed") return { ok: false, error: FROZEN };

  let patch: {
    status: string;
    completed_at?: string | null;
    completion_notes?: string | null;
  };
  if (status === "closed") {
    patch = { status, completed_at: new Date().toISOString() };
    if (completionNotes !== undefined) patch.completion_notes = completionNotes;
  } else {
    patch = { status, completed_at: null };
  }
  if (status === action.status && status !== "closed") {
    return { ok: true, data: undefined };
  }

  const { data, error } = await supabase
    .from("actions")
    .update(patch)
    .eq("id", actionId)
    .eq("project_id", projectId)
    .select("id");
  if (error) return { ok: false, error: "Couldn't update the action. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This action could not be found." };

  revalidateActions(projectId, action.issue_id);
  return { ok: true, data: undefined };
}

type LoadedActionDelete =
  | { ok: true; findingId: string | null; evaluation: DeleteEvaluation }
  | { ok: false; error: string };

async function loadActionDelete(supabase: SupabaseServerClient, projectId: string, actionId: string): Promise<LoadedActionDelete> {
  const { data, error } = await supabase
    .from("actions")
    .select("id, project_id, issue_id, status, issues(status), attachments(count)")
    .eq("id", actionId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't load the action. Try again." };
  if (!data || data.project_id !== projectId) return { ok: false, error: "This action could not be found." };
  return {
    ok: true,
    findingId: data.issue_id,
    evaluation: evaluateActionDelete({
      status: data.status,
      findingStatus: data.issues?.status ?? null,
      evidenceCount: data.attachments[0]?.count ?? 0,
    }),
  };
}

/** Whether an Action may be deleted, with every blocker (read-only; delete re-checks). */
export async function getActionDeleteState(projectId: string, actionId: string): Promise<ActionResult<DeleteEvaluation>> {
  await requireUser();
  const supabase = await createSupabaseClient();
  const loaded = await loadActionDelete(supabase, projectId, actionId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  return { ok: true, data: loaded.evaluation };
}

/**
 * Controlled delete (Phase 4F): only an Action that is not Closed, has no Evidence and whose
 * Finding (if any) is not Closed. Rules are re-evaluated on fresh data; the DELETE is conditioned
 * on the status still not being Closed. The Finding itself is never changed.
 */
export async function deleteAction(projectId: string, actionId: string): Promise<ActionResult<DeleteEvaluation>> {
  await requireUser();
  const supabase = await createSupabaseClient();

  const loaded = await loadActionDelete(supabase, projectId, actionId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!loaded.evaluation.canDelete) return { ok: false, error: loaded.evaluation.blockers.join(" ") };

  const { data, error } = await supabase
    .from("actions")
    .delete()
    .eq("id", actionId)
    .eq("project_id", projectId)
    .neq("status", "closed")
    .select("id");
  if (error) return { ok: false, error: "Couldn't delete the action. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This action could not be deleted. It may have been changed." };

  revalidateActions(projectId, loaded.findingId);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: loaded.evaluation };
}
