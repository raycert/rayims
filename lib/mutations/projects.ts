"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { projectSchema } from "@/lib/validation/projects";
import { fieldErrorsFrom, type ActionResult } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseClient>>;

/** Rejects any siteId that doesn't actually belong to clientId (never trust client-submitted ids). */
async function validSiteIds(
  supabase: SupabaseServerClient,
  clientId: string,
  siteIds: string[],
): Promise<boolean> {
  if (siteIds.length === 0) return true;
  const { data, error } = await supabase.from("sites").select("id").eq("client_id", clientId).in("id", siteIds);
  if (error) return false;
  return (data ?? []).length === siteIds.length;
}

/** Rejects any frameworkId that isn't real reference data. */
async function validFrameworkIds(supabase: SupabaseServerClient, frameworkIds: string[]): Promise<boolean> {
  if (frameworkIds.length === 0) return true;
  const { data, error } = await supabase.from("frameworks").select("id").in("id", frameworkIds);
  if (error) return false;
  return (data ?? []).length === frameworkIds.length;
}

/**
 * Creates a project plus its initial site scope and framework assignments.
 * clientId is a trusted route/prop value, never taken from the form (BR-57 —
 * the client is immutable). If the assignment inserts fail after the project
 * row itself was created, the project is deleted so a failed Create never
 * leaves a stray, misleadingly "successful" project behind.
 */
export async function createProject(
  clientId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();

  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { name, status, startDate, endDate, siteIds, frameworkIds } = parsed.data;

  const supabase = await createSupabaseClient();

  const [sitesOk, frameworksOk] = await Promise.all([
    validSiteIds(supabase, clientId, siteIds),
    validFrameworkIds(supabase, frameworkIds),
  ]);
  if (!sitesOk) return { ok: false, error: "One or more selected sites are no longer valid for this client." };
  if (!frameworksOk) return { ok: false, error: "One or more selected frameworks are no longer valid." };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      client_id: clientId,
      name,
      status,
      start_date: startDate ?? null,
      end_date: endDate ?? null,
    })
    .select("id")
    .single();
  if (projectError) {
    if (projectError.code === "23503") {
      return { ok: false, error: "This client could not be found." };
    }
    return { ok: false, error: "Couldn't create the project. Try again." };
  }

  const assignmentErrors: string[] = [];
  if (siteIds.length > 0) {
    const { error } = await supabase
      .from("project_sites")
      .insert(siteIds.map((siteId) => ({ project_id: project.id, site_id: siteId })));
    if (error) assignmentErrors.push("sites");
  }
  if (frameworkIds.length > 0) {
    const { error } = await supabase
      .from("project_frameworks")
      .insert(frameworkIds.map((frameworkId) => ({ project_id: project.id, framework_id: frameworkId })));
    if (error) assignmentErrors.push("frameworks");
  }

  if (assignmentErrors.length > 0) {
    // Cascades project_sites/project_frameworks: nothing partial is left behind.
    await supabase.from("projects").delete().eq("id", project.id);
    return { ok: false, error: "Couldn't save the project's site or framework assignments. Try again." };
  }

  revalidatePath("/projects");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, data: { id: project.id } };
}

type SyncResult = { ok: true } | { ok: false; error: string };

/** Diffs the desired site scope against what's stored and applies only the delta. */
async function syncProjectSites(
  supabase: SupabaseServerClient,
  projectId: string,
  nextIds: string[],
): Promise<SyncResult> {
  const { data: currentRows, error: currentError } = await supabase
    .from("project_sites")
    .select("site_id")
    .eq("project_id", projectId);
  if (currentError) return { ok: false, error: "Couldn't load the current site scope." };

  const currentIds = new Set((currentRows ?? []).map((r) => r.site_id));
  const nextSet = new Set(nextIds);
  const toAdd = nextIds.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !nextSet.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("project_sites")
      .delete()
      .eq("project_id", projectId)
      .in("site_id", toRemove);
    if (error) {
      if (error.code === "23503") {
        return { ok: false, error: "One or more sites couldn't be removed because they're already in use by project work." };
      }
      return { ok: false, error: "Couldn't save the changes. Try again." };
    }
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("project_sites")
      .insert(toAdd.map((siteId) => ({ project_id: projectId, site_id: siteId })));
    if (error) return { ok: false, error: "Couldn't save the changes. Try again." };
  }
  return { ok: true };
}

/** Diffs the desired framework assignments against what's stored and applies only the delta. */
async function syncProjectFrameworks(
  supabase: SupabaseServerClient,
  projectId: string,
  nextIds: string[],
): Promise<SyncResult> {
  const { data: currentRows, error: currentError } = await supabase
    .from("project_frameworks")
    .select("framework_id")
    .eq("project_id", projectId);
  if (currentError) return { ok: false, error: "Couldn't load the current framework assignments." };

  const currentIds = new Set((currentRows ?? []).map((r) => r.framework_id));
  const nextSet = new Set(nextIds);
  const toAdd = nextIds.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !nextSet.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("project_frameworks")
      .delete()
      .eq("project_id", projectId)
      .in("framework_id", toRemove);
    if (error) {
      if (error.code === "23503") {
        return { ok: false, error: "One or more frameworks couldn't be removed because they're already in use by project work." };
      }
      return { ok: false, error: "Couldn't save the changes. Try again." };
    }
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("project_frameworks")
      .insert(toAdd.map((frameworkId) => ({ project_id: projectId, framework_id: frameworkId })));
    if (error) return { ok: false, error: "Couldn't save the changes. Try again." };
  }
  return { ok: true };
}

/**
 * Updates a project's identity fields and diffs its site/framework assignments.
 * The client is never accepted here (BR-57): it is re-read from the existing row,
 * and site ids are validated against THAT client, not anything the caller sent.
 */
export async function updateProject(projectId: string, input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { name, status, startDate, endDate, siteIds, frameworkIds } = parsed.data;

  const supabase = await createSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("projects")
    .select("id, client_id")
    .eq("id", projectId)
    .maybeSingle();
  if (existingError) return { ok: false, error: "Couldn't save the project. Try again." };
  if (!existing) return { ok: false, error: "This project could not be found." };

  const [sitesOk, frameworksOk] = await Promise.all([
    validSiteIds(supabase, existing.client_id, siteIds),
    validFrameworkIds(supabase, frameworkIds),
  ]);
  if (!sitesOk) return { ok: false, error: "One or more selected sites are no longer valid for this client." };
  if (!frameworksOk) return { ok: false, error: "One or more selected frameworks are no longer valid." };

  const { data, error } = await supabase
    .from("projects")
    .update({ name, status, start_date: startDate ?? null, end_date: endDate ?? null })
    .eq("id", projectId)
    .select("id");
  if (error) return { ok: false, error: "Couldn't save the project. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This project could not be found." };

  const sitesResult = await syncProjectSites(supabase, projectId, siteIds);
  if (!sitesResult.ok) return { ok: false, error: sitesResult.error };

  const frameworksResult = await syncProjectFrameworks(supabase, projectId, frameworkIds);
  if (!frameworksResult.ok) return { ok: false, error: frameworksResult.error };

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);
  revalidatePath(`/clients/${existing.client_id}`);
  return { ok: true, data: undefined };
}
