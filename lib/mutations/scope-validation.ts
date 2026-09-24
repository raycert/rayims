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
