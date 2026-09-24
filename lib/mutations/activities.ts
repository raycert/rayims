"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { activityCreateSchema, activityUpdateSchema } from "@/lib/validation/activities";
import { fieldErrorsFrom, type ActionResult } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseClient>>;

/** A site can only be chosen if it's actually in this project's scope (project_sites). */
async function siteInProjectScope(
  supabase: SupabaseServerClient,
  projectId: string,
  siteId: string | null,
): Promise<boolean> {
  if (!siteId) return true;
  const { data, error } = await supabase
    .from("project_sites")
    .select("site_id")
    .eq("project_id", projectId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

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
      work_performed: d.workPerformed ?? null,
      next_steps: d.nextSteps ?? null,
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
