"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { ACTIVITY_STATUSES, activityCreateSchema, activitySummarySchema, activityUpdateSchema } from "@/lib/validation/activities";
import { siteInProjectScope, type SupabaseServerClient } from "./scope-validation";
import { fieldErrorsFrom, type ActionResult } from "./types";

async function consultantExists(supabase: SupabaseServerClient, consultantId: string | null): Promise<boolean> {
  if (!consultantId) return true;
  const { data, error } = await supabase.from("profiles").select("id").eq("id", consultantId).maybeSingle();
  if (error) return false;
  return !!data;
}

/**
 * Creates an Activity for the given project. projectId is always a trusted
 * route/prop value, never taken from the form — an Activity always belongs to the
 * Project it was created from; there is no Project selector in the form and no
 * global creation workflow.
 */
export async function createActivity(
  projectId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = activityCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const supabase = await createSupabaseClient();

  const { data: type, error: typeError } = await supabase
    .from("activity_types")
    .select("id, is_active")
    .eq("id", d.activityTypeId)
    .maybeSingle();
  if (typeError) return { ok: false, error: "Couldn't create the Activity. Try again." };
  if (!type) {
    return { ok: false, error: "This Activity Type could not be found.", fieldErrors: { activityTypeId: "Not found." } };
  }
  if (!type.is_active) {
    return {
      ok: false,
      error: "This Activity Type is inactive and can't be used for a new Activity.",
      fieldErrors: { activityTypeId: "Inactive." },
    };
  }

  const [siteOk, consultantOk] = await Promise.all([
    siteInProjectScope(supabase, projectId, d.siteId),
    consultantExists(supabase, d.consultantId),
  ]);
  if (!siteOk) {
    return { ok: false, error: "The selected site is not in this project's scope.", fieldErrors: { siteId: "Not in scope." } };
  }
  if (!consultantOk) {
    return { ok: false, error: "The selected consultant could not be found.", fieldErrors: { consultantId: "Not found." } };
  }

  const { data, error } = await supabase
    .from("activities")
    .insert({
      project_id: projectId,
      activity_type_id: d.activityTypeId,
      name: d.name,
      site_id: d.siteId,
      mode: d.mode,
      consultant_id: d.consultantId,
      objectives: d.objectives ?? null,
      planned_work: d.plannedWork ?? null,
      start_date: d.startDate ?? null,
      start_time: d.startTime ?? null,
      end_date: d.endDate ?? null,
      end_time: d.endTime ?? null,
      planned_days: d.plannedDays ?? null,
      status: "planned",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23503") return { ok: false, error: "This project could not be found." };
    return { ok: false, error: "Couldn't create the Activity. Try again." };
  }

  revalidatePath(`/projects/${projectId}/plan`);
  return { ok: true, data: { id: data.id } };
}

/**
 * Updates an Activity. Re-reads the existing row to confirm it belongs to
 * projectId (a route/prop value) before doing anything else, and repeats
 * project_id in the UPDATE's WHERE clause as defense in depth — an update
 * request naming Project A can never reach an Activity that actually belongs to
 * Project B, whatever projectId a caller claims.
 */
export async function updateActivity(
  projectId: string,
  activityId: string,
  input: unknown,
): Promise<ActionResult> {
  await requireUser();

  const parsed = activityUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const supabase = await createSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("activities")
    .select("id, project_id, activity_type_id")
    .eq("id", activityId)
    .maybeSingle();
  if (existingError) return { ok: false, error: "Couldn't save the Activity. Try again." };
  if (!existing || existing.project_id !== projectId) {
    return { ok: false, error: "This Activity could not be found." };
  }

  const { data: type, error: typeError } = await supabase
    .from("activity_types")
    .select("id, is_active")
    .eq("id", d.activityTypeId)
    .maybeSingle();
  if (typeError) return { ok: false, error: "Couldn't save the Activity. Try again." };
  if (!type) {
    return { ok: false, error: "This Activity Type could not be found.", fieldErrors: { activityTypeId: "Not found." } };
  }
  // An inactive type may be KEPT (the activity already referenced it) but never newly
  // selected — same defense-in-depth spirit as key immutability: don't just trust the
  // picker to have hidden the other inactive options.
  if (!type.is_active && d.activityTypeId !== existing.activity_type_id) {
    return {
      ok: false,
      error: "This Activity Type is inactive and can't be newly selected.",
      fieldErrors: { activityTypeId: "Inactive." },
    };
  }

  const [siteOk, consultantOk] = await Promise.all([
    siteInProjectScope(supabase, projectId, d.siteId),
    consultantExists(supabase, d.consultantId),
  ]);
  if (!siteOk) {
    return { ok: false, error: "The selected site is not in this project's scope.", fieldErrors: { siteId: "Not in scope." } };
  }
  if (!consultantOk) {
    return { ok: false, error: "The selected consultant could not be found.", fieldErrors: { consultantId: "Not found." } };
  }

  const { data, error } = await supabase
    .from("activities")
    .update({
      activity_type_id: d.activityTypeId,
      name: d.name,
      site_id: d.siteId,
      mode: d.mode,
      consultant_id: d.consultantId,
      status: d.status,
      objectives: d.objectives ?? null,
      planned_work: d.plannedWork ?? null,
      // Outcome / Activity Summary fields are written only by updateActivitySummary (Phase 6B).
      start_date: d.startDate ?? null,
      start_time: d.startTime ?? null,
      end_date: d.endDate ?? null,
      end_time: d.endTime ?? null,
      planned_days: d.plannedDays ?? null,
    })
    .eq("id", activityId)
    .eq("project_id", projectId)
    .select("id");
  if (error) return { ok: false, error: "Couldn't save the Activity. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This Activity could not be found." };

  revalidatePath(`/projects/${projectId}/plan`);
  revalidatePath(`/projects/${projectId}/activities/${activityId}`);
  return { ok: true, data: undefined };
}

/**
 * Saves the Outcome / Activity Summary (Phase 6B): work_performed, summary, next_steps and
 * client_participants — and nothing else. The Activity is matched by id AND project (a tampered
 * project / activity pair finds nothing); status, schedule, Plan and every other column stay as they
 * are. Allowed in every status (no report lock, no approval step).
 */
export async function updateActivitySummary(projectId: string, activityId: string, input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = activitySummarySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("activities")
    .update({
      work_performed: d.workPerformed ?? null,
      summary: d.summary ?? null,
      next_steps: d.nextSteps ?? null,
      client_participants: d.clientParticipants ?? null,
    })
    .eq("id", activityId)
    .eq("project_id", projectId)
    .select("id");
  if (error) return { ok: false, error: "Couldn't save the Activity Summary. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This Activity could not be found." };

  revalidatePath(`/projects/${projectId}/activities/${activityId}`);
  return { ok: true, data: undefined };
}

const statusSchema = z.enum(ACTIVITY_STATUSES);

/**
 * The single status-changing path — used both for the Activity Detail header's quick
 * status control and for Cancel (Cancel is simply this call with status="cancelled",
 * after the UI's own confirmation step; there is no separate cancel-specific mutation,
 * no cancelled_at, no transition matrix — any status may follow any other, BR-12).
 */
export async function setActivityStatus(
  projectId: string,
  activityId: string,
  status: string,
): Promise<ActionResult> {
  await requireUser();

  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status." };

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("activities")
    .update({ status: parsed.data })
    .eq("id", activityId)
    .eq("project_id", projectId)
    .select("id");
  if (error) return { ok: false, error: "Couldn't update the status. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This Activity could not be found." };

  revalidatePath(`/projects/${projectId}/plan`);
  revalidatePath(`/projects/${projectId}/activities/${activityId}`);
  return { ok: true, data: undefined };
}

/**
 * Every current reference path to activities.id (verified against the real schema,
 * not assumed): verification_items.target_activity_id, verification_items
 * .verified_activity_id, issues.activity_id, actions.activity_id,
 * attachments.activity_id. attachments is CASCADE at the DB level — deleting the
 * Activity would silently remove its evidence rows — so this application-level check
 * treats an Activity with attachments as referenced and blocks delete, the same as
 * the SET NULL paths; the database's own delete behavior is never relied on here.
 */
async function activityIsReferenced(supabase: SupabaseServerClient, activityId: string): Promise<boolean> {
  const checks = await Promise.all([
    supabase.from("verification_items").select("id", { count: "exact", head: true }).eq("target_activity_id", activityId),
    supabase.from("verification_items").select("id", { count: "exact", head: true }).eq("verified_activity_id", activityId),
    supabase.from("issues").select("id", { count: "exact", head: true }).eq("activity_id", activityId),
    supabase.from("actions").select("id", { count: "exact", head: true }).eq("activity_id", activityId),
    supabase.from("attachments").select("id", { count: "exact", head: true }).eq("activity_id", activityId),
  ]);
  for (const result of checks) {
    if (result.error) throw new Error("Could not check whether this Activity is referenced.");
    if ((result.count ?? 0) > 0) return true;
  }
  return false;
}

const REFERENCED_MESSAGE =
  "This activity is already referenced by project records and cannot be deleted. Cancel the activity instead to preserve project history.";

/**
 * Controlled delete: allowed only when the Activity is genuinely unreferenced.
 * Checked in the application BEFORE the delete runs (activityIsReferenced), not
 * inferred from whatever the database's FK behavior happens to do — attachments would
 * otherwise CASCADE silently. The 23503 catch below is defense in depth for a
 * same-instant race between the check and the delete, not the primary mechanism.
 */
export async function deleteActivity(projectId: string, activityId: string): Promise<ActionResult> {
  await requireUser();

  const supabase = await createSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("activities")
    .select("id, project_id")
    .eq("id", activityId)
    .maybeSingle();
  if (existingError) return { ok: false, error: "Couldn't delete the Activity. Try again." };
  if (!existing || existing.project_id !== projectId) {
    return { ok: false, error: "This Activity could not be found." };
  }

  if (await activityIsReferenced(supabase, activityId)) {
    return { ok: false, error: REFERENCED_MESSAGE };
  }

  const { data, error } = await supabase
    .from("activities")
    .delete()
    .eq("id", activityId)
    .eq("project_id", projectId)
    .select("id");
  if (error) {
    if (error.code === "23503") return { ok: false, error: REFERENCED_MESSAGE };
    return { ok: false, error: "Couldn't delete the Activity. Try again." };
  }
  if (!data || data.length === 0) return { ok: false, error: "This Activity could not be found." };

  revalidatePath(`/projects/${projectId}/plan`);
  return { ok: true, data: undefined };
}
