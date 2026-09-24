"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { verificationItemSchema } from "@/lib/validation/verification-items";
import { siteInProjectScope, type SupabaseServerClient } from "./scope-validation";
import { fieldErrorsFrom, type ActionResult } from "./types";

/**
 * Resolves the target Activity (must belong to projectId) and applies the approved
 * site-inheritance rule (Phase 4 review §18-19): if the Activity is site-specific,
 * the submitted siteId MUST equal it; if the Activity is project-wide (site_id NULL),
 * the submitted siteId is validated normally against the project's scope instead.
 * Returns a field error on any violation, or null when everything is consistent.
 */
async function validateSiteAndTargetActivity(
  supabase: SupabaseServerClient,
  projectId: string,
  siteId: string | null,
  targetActivityId: string | null,
): Promise<{ error: string; field: "siteId" | "targetActivityId" } | null> {
  if (!targetActivityId) {
    const ok = await siteInProjectScope(supabase, projectId, siteId);
    return ok ? null : { error: "The selected site is not in this project's scope.", field: "siteId" };
  }

  const { data: activity, error } = await supabase
    .from("activities")
    .select("id, project_id, site_id")
    .eq("id", targetActivityId)
    .maybeSingle();
  if (error) return { error: "Couldn't verify the Target Activity. Try again.", field: "targetActivityId" };
  if (!activity || activity.project_id !== projectId) {
    return { error: "The selected Target Activity could not be found.", field: "targetActivityId" };
  }

  if (activity.site_id) {
    if (siteId !== activity.site_id) {
      return {
        error: "Site must match the Target Activity's site.",
        field: "siteId",
      };
    }
    return null;
  }

  // Target Activity is project-wide: site is freely chosen (may be NULL or any project site).
  const ok = await siteInProjectScope(supabase, projectId, siteId);
  return ok ? null : { error: "The selected site is not in this project's scope.", field: "siteId" };
}

/** framework_item_id, if supplied, must belong to a Framework currently assigned to the project. */
async function frameworkItemInProjectScope(
  supabase: SupabaseServerClient,
  projectId: string,
  frameworkItemId: string | null,
): Promise<boolean> {
  if (!frameworkItemId) return true;
  const { data: item, error: itemError } = await supabase
    .from("framework_items")
    .select("framework_id")
    .eq("id", frameworkItemId)
    .maybeSingle();
  if (itemError || !item) return false;

  const { data: assigned, error: assignedError } = await supabase
    .from("project_frameworks")
    .select("framework_id")
    .eq("project_id", projectId)
    .eq("framework_id", item.framework_id)
    .maybeSingle();
  if (assignedError) return false;
  return !!assigned;
}

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

  const siteCheck = await validateSiteAndTargetActivity(supabase, projectId, d.siteId, d.targetActivityId);
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

  const siteCheck = await validateSiteAndTargetActivity(supabase, projectId, d.siteId, d.targetActivityId);
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
