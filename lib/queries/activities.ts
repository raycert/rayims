import { createClient } from "@/lib/supabase/server";

export type ActivityPlanRow = {
  id: string;
  projectId: string;
  name: string;
  activityTypeId: string;
  /** Resolved live from activity_types.label — never snapshotted (ADR-017). */
  activityTypeLabel: string;
  activityTypeIsActive: boolean;
  siteId: string | null;
  /** null means project-wide (site_id IS NULL); display as "Project-wide", never blank. */
  siteName: string | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  plannedDays: number | null;
  mode: string;
  consultantId: string | null;
  consultantName: string | null;
  status: string;
};

/**
 * Master Plan is always Project-scoped — there is no global listActivities().
 * Two queries (activities + the project's sites), not N+1: activities.site_id has no
 * direct FK to `sites` (only the composite FK to `project_sites`), so the site name is
 * resolved by joining against the project's own site scope in application code, the same
 * way `getProjectWorkspace` resolves sites for the Overview tab.
 * Default order matches the Master Plan's planning sequence, not insertion order:
 * start_date, then start_time, then name — undated activities sort last.
 */
export async function listActivities(projectId: string): Promise<ActivityPlanRow[]> {
  const supabase = await createClient();
  const [activitiesRes, sitesRes] = await Promise.all([
    supabase
      .from("activities")
      .select(
        "id, project_id, site_id, name, start_date, start_time, end_date, end_time, planned_days, mode, status, activity_type_id, consultant_id, activity_types(label, is_active), profiles!activities_consultant_id_fkey(display_name)",
      )
      .eq("project_id", projectId)
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    supabase.from("project_sites").select("sites(id, name)").eq("project_id", projectId),
  ]);
  if (activitiesRes.error) throw new Error("Could not load activities.");
  if (sitesRes.error) throw new Error("Could not load the project's sites.");

  const siteNameById = new Map<string, string>();
  for (const row of sitesRes.data ?? []) {
    if (row.sites) siteNameById.set(row.sites.id, row.sites.name);
  }

  return (activitiesRes.data ?? []).map((a) => ({
    id: a.id,
    projectId: a.project_id,
    name: a.name,
    activityTypeId: a.activity_type_id,
    activityTypeLabel: a.activity_types?.label ?? "",
    activityTypeIsActive: a.activity_types?.is_active ?? true,
    siteId: a.site_id,
    siteName: a.site_id ? (siteNameById.get(a.site_id) ?? null) : null,
    startDate: a.start_date,
    startTime: a.start_time,
    endDate: a.end_date,
    endTime: a.end_time,
    plannedDays: a.planned_days,
    mode: a.mode,
    consultantId: a.consultant_id,
    consultantName: a.profiles?.display_name ?? null,
    status: a.status,
  }));
}
