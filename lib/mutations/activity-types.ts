"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { activityTypeCreateSchema, activityTypeUpdateSchema } from "@/lib/validation/activity-types";
import { fieldErrorsFrom, type ActionResult } from "./types";

function isUniqueViolation(code: string | undefined) {
  return code === "23505";
}
function isForeignKeyViolation(code: string | undefined) {
  return code === "23503";
}

export async function createActivityType(input: unknown): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = activityTypeCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("activity_types")
    .insert({
      key: parsed.data.key,
      label: parsed.data.label,
      description: parsed.data.description ?? null,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .select("id")
    .single();
  if (error) {
    if (isUniqueViolation(error.code)) {
      return {
        ok: false,
        error: "This key is already used by another Activity Type.",
        fieldErrors: { key: "Already in use." },
      };
    }
    return { ok: false, error: "Couldn't save the Activity Type. Try again." };
  }

  revalidatePath("/activity-types");
  return { ok: true, data: { id: data.id } };
}

/**
 * key is never part of this update — not read from `input`, not written to the
 * database — regardless of what a client sends. ADR-017: keys are stable after
 * creation; the normal Edit form does not expose the field at all.
 */
export async function updateActivityType(id: string, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = activityTypeUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("activity_types")
    .update({
      label: parsed.data.label,
      description: parsed.data.description ?? null,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: "Couldn't save the Activity Type. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This Activity Type could not be found." };

  revalidatePath("/activity-types");
  return { ok: true, data: undefined };
}

/** Quick row-level toggle — same effect as editing just the Active field. */
export async function setActivityTypeActive(id: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("activity_types")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: "Couldn't update the Activity Type. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This Activity Type could not be found." };

  revalidatePath("/activity-types");
  return { ok: true, data: undefined };
}

/**
 * Controlled delete: relies on existing FK integrity (activities.activity_type_id,
 * NO ACTION). A referenced Activity Type cannot be deleted — being one of the
 * seeded starting values carries no special protection (ADR-017: no is_seeded /
 * is_system concept; deletability depends only on real references).
 */
export async function deleteActivityType(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.from("activity_types").delete().eq("id", id).select("id");
  if (error) {
    if (isForeignKeyViolation(error.code)) {
      return { ok: false, error: "This Activity Type is in use and cannot be deleted." };
    }
    return { ok: false, error: "Couldn't delete the Activity Type. Try again." };
  }
  if (!data || data.length === 0) return { ok: false, error: "This Activity Type could not be found." };

  revalidatePath("/activity-types");
  return { ok: true, data: undefined };
}
