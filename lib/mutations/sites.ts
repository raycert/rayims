"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { siteSchema } from "@/lib/validation/sites";
import { fieldErrorsFrom, type ActionResult } from "./types";

/**
 * clientId is a trusted route/prop value, never taken from the form: a site created
 * or edited here can never be reassigned to a different client (BR-57 spirit).
 */
export async function createSiteRecord(
  clientId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();

  const parsed = siteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("sites")
    .insert({ ...parsed.data, client_id: clientId })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't save the site. Try again." };

  revalidatePath(`/clients/${clientId}`);
  return { ok: true, data: { id: data.id } };
}

export async function updateSiteRecord(
  siteId: string,
  clientId: string,
  input: unknown,
): Promise<ActionResult> {
  await requireUser();

  const parsed = siteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createSupabaseClient();
  // .eq("client_id", clientId) as well: never lets an edit move the site to another client.
  // .select("id") lets us tell "0 rows matched" (id/client mismatch) apart from a real error,
  // instead of silently reporting success for a write that touched nothing.
  const { data, error } = await supabase
    .from("sites")
    .update(parsed.data)
    .eq("id", siteId)
    .eq("client_id", clientId)
    .select("id");
  if (error) return { ok: false, error: "Couldn't save the site. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This site could not be found." };

  revalidatePath(`/clients/${clientId}`);
  return { ok: true, data: undefined };
}

/**
 * Controlled delete: relies on existing FK integrity (project_sites.site_id, NO
 * ACTION). A referenced site cannot be deleted; nothing is cascaded or implied.
 * Postgres 23503 (foreign_key_violation) is mapped to a friendly message; no raw
 * database detail reaches the UI.
 */
export async function deleteSiteRecord(siteId: string, clientId: string): Promise<ActionResult> {
  await requireUser();

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("sites")
    .delete()
    .eq("id", siteId)
    .eq("client_id", clientId)
    .select("id");
  if (error) {
    if (error.code === "23503") {
      return { ok: false, error: "This site is in use by a project and cannot be removed." };
    }
    return { ok: false, error: "Couldn't delete the site. Try again." };
  }
  if (!data || data.length === 0) return { ok: false, error: "This site could not be found." };

  revalidatePath(`/clients/${clientId}`);
  return { ok: true, data: undefined };
}
