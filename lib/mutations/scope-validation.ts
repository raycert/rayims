import type { createClient as createSupabaseClient } from "@/lib/supabase/server";

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseClient>>;

/**
 * Shared, non-Server-Action helpers reused by activities and verification_items
 * mutations. Deliberately NOT in a "use server" file: exporting a plain internal
 * helper from one would also expose it as its own callable Server Action, which
 * isn't the intent here — these are only ever called from other server-side code.
 */

/** A site can only be chosen if it's actually in this project's scope (project_sites). */
export async function siteInProjectScope(
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

/**
 * Resolves the referenced Activity (must belong to projectId) and applies the approved
 * site-inheritance rule (BR-73): if the Activity is site-specific, the submitted siteId
 * MUST equal it; if it is project-wide (site_id NULL), or there is no Activity, the
 * siteId is validated normally against the project's scope. Shared by Verification
 * (Target Activity) and Findings (Activity); `labels` only changes the wording/field.
 * Returns a field error on any violation, or null when everything is consistent.
 */
export async function validateSiteAndActivity(
  supabase: SupabaseServerClient,
  projectId: string,
  siteId: string | null,
  activityId: string | null,
  labels: { name: string; field: string } = { name: "Target Activity", field: "targetActivityId" },
): Promise<{ error: string; field: string } | null> {
  if (!activityId) {
    const ok = await siteInProjectScope(supabase, projectId, siteId);
    return ok ? null : { error: "The selected site is not in this project's scope.", field: "siteId" };
  }

  const { data: activity, error } = await supabase
    .from("activities")
    .select("id, project_id, site_id")
    .eq("id", activityId)
    .maybeSingle();
  if (error) return { error: `Couldn't verify the ${labels.name}. Try again.`, field: labels.field };
  if (!activity || activity.project_id !== projectId) {
    return { error: `The selected ${labels.name} could not be found.`, field: labels.field };
  }

  if (activity.site_id) {
    if (siteId !== activity.site_id) {
      return { error: `Site must match the ${labels.name}'s site.`, field: "siteId" };
    }
    return null;
  }

  // Project-wide Activity: site is freely chosen (may be NULL or any project site).
  const ok = await siteInProjectScope(supabase, projectId, siteId);
  return ok ? null : { error: "The selected site is not in this project's scope.", field: "siteId" };
}

/** framework_item_id, if supplied, must belong to a Framework currently assigned to the project (BR-74). */
export async function frameworkItemInProjectScope(
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
