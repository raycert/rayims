"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { verificationExecutionSchema, verificationItemSchema } from "@/lib/validation/verification-items";
import { frameworkItemInProjectScope, validateSiteAndActivity } from "./scope-validation";
import { fieldErrorsFrom, type ActionResult } from "./types";

/**
 * Creates a planning-only Verification Item. projectId is always a trusted route/prop
 * value. Execution fields (result, notes, verified_activity_id, verified_by,
 * verified_at) are never accepted here, even if a tampered client submits them — the
 * insert payload below simply never references them, so they stay at their database
 * defaults (NULL = Pending). Execution is Phase 4B.
 */
export async function createVerificationItem(
  projectId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = verificationItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const supabase = await createSupabaseClient();

  const siteCheck = await validateSiteAndActivity(supabase, projectId, d.siteId, d.targetActivityId);
  if (siteCheck) return { ok: false, error: siteCheck.error, fieldErrors: { [siteCheck.field]: siteCheck.error } };

  const frameworkOk = await frameworkItemInProjectScope(supabase, projectId, d.frameworkItemId);
  if (!frameworkOk) {
    return {
      ok: false,
      error: "The selected Framework Requirement is not assigned to this project.",
      fieldErrors: { frameworkItemId: "Not assigned to this project." },
    };
  }

  const { data, error } = await supabase
    .from("verification_items")
    .insert({
      project_id: projectId,
      question: d.question,
      priority: d.priority,
      site_id: d.siteId,
      target_activity_id: d.targetActivityId,
      framework_item_id: d.frameworkItemId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23503") return { ok: false, error: "This project could not be found." };
    return { ok: false, error: "Couldn't create the verification item. Try again." };
  }

  revalidatePath(`/projects/${projectId}/verification`);
  return { ok: true, data: { id: data.id } };
}

/**
 * Updates ONLY the planning fields (question, priority, site_id, target_activity_id,
 * framework_item_id). The UPDATE statement below never references result, notes,
 * verified_activity_id, verified_by or verified_at, so an already-executed item's
 * execution data is preserved byte-for-byte regardless of what a client submits —
 * that separation is structural, not merely validated away.
 */
export async function updateVerificationItem(
  projectId: string,
  itemId: string,
  input: unknown,
): Promise<ActionResult> {
  await requireUser();

  const parsed = verificationItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const supabase = await createSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("verification_items")
    .select("id, project_id, framework_item_id")
    .eq("id", itemId)
    .maybeSingle();
  if (existingError) return { ok: false, error: "Couldn't save the verification item. Try again." };
  if (!existing || existing.project_id !== projectId) {
    return { ok: false, error: "This verification item could not be found." };
  }

  const siteCheck = await validateSiteAndActivity(supabase, projectId, d.siteId, d.targetActivityId);
  if (siteCheck) return { ok: false, error: siteCheck.error, fieldErrors: { [siteCheck.field]: siteCheck.error } };

  // Historical preservation (mirrors Activity Type's inactive-type rule): a framework
  // item that's no longer assigned to the project may be KEPT, but never newly
  // selected — only check assignment when the value is actually changing.
  if (d.frameworkItemId !== existing.framework_item_id) {
    const frameworkOk = await frameworkItemInProjectScope(supabase, projectId, d.frameworkItemId);
    if (!frameworkOk) {
      return {
        ok: false,
        error: "The selected Framework Requirement is not assigned to this project.",
        fieldErrors: { frameworkItemId: "Not assigned to this project." },
      };
    }
  }

  const { data, error } = await supabase
    .from("verification_items")
    .update({
      question: d.question,
      priority: d.priority,
      site_id: d.siteId,
      target_activity_id: d.targetActivityId,
      framework_item_id: d.frameworkItemId,
    })
    .eq("id", itemId)
    .eq("project_id", projectId)
    .select("id");
  if (error) return { ok: false, error: "Couldn't save the verification item. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This verification item could not be found." };

  revalidatePath(`/projects/${projectId}/verification`);
  return { ok: true, data: undefined };
}

/**
 * Onsite execution (Phase 4B). Updates ONLY result, notes, verified_activity_id,
 * verified_by and verified_at — never question/priority/site_id/target_activity_id/
 * framework_item_id/project_id, the same structural separation as the planning
 * mutation above, just the other half. verified_activity_id/verified_by/verified_at
 * are always server-derived (the route's activityId, the session user, now()) — never
 * accepted from client input, so a tampered request can't backdate a result or attribute
 * it to someone else.
 *
 * Cross-activity safety (Phase 4B review §22-23): an item may be executed from Activity
 * X only when it is genuinely related to X (target_activity_id = X or
 * verified_activity_id = X) AND not already verified in a DIFFERENT activity — an item
 * completed in Activity B can never be silently re-attributed to Activity A through this
 * mutation, matching the Activity Detail UI's own refusal to offer that action.
 */
export async function recordVerificationResult(
  projectId: string,
  activityId: string,
  itemId: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = verificationExecutionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Select a Result.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const supabase = await createSupabaseClient();

  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .select("id, project_id")
    .eq("id", activityId)
    .maybeSingle();
  if (activityError) return { ok: false, error: "Couldn't save the result. Try again." };
  if (!activity || activity.project_id !== projectId) {
    return { ok: false, error: "This activity could not be found." };
  }

  const { data: item, error: itemError } = await supabase
    .from("verification_items")
    .select("id, project_id, target_activity_id, verified_activity_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) return { ok: false, error: "Couldn't save the result. Try again." };
  if (!item || item.project_id !== projectId) {
    return { ok: false, error: "This verification item could not be found." };
  }
  const relatedHere = item.target_activity_id === activityId || item.verified_activity_id === activityId;
  if (!relatedHere) {
    return { ok: false, error: "This verification item is not related to this activity." };
  }
  if (item.verified_activity_id && item.verified_activity_id !== activityId) {
    return {
      ok: false,
      error: "This verification item was already completed during a different activity and can't be edited from here.",
    };
  }

  const { data, error } = await supabase
    .from("verification_items")
    .update({
      result: d.result,
      notes: d.notes ?? null,
      verified_activity_id: activityId,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("project_id", projectId)
    .select("id");
  if (error) return { ok: false, error: "Couldn't save the result. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This verification item could not be found." };

  revalidatePath(`/projects/${projectId}/verification`);
  revalidatePath(`/projects/${projectId}/activities/${activityId}`);
  return { ok: true, data: undefined };
}
