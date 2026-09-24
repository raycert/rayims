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

const ACTIVITY_LIST_COLUMNS =
  "id, project_id, site_id, name, start_date, start_time, end_date, end_time, planned_days, mode, status, activity_type_id, consultant_id, activity_types(label, is_active), profiles!activities_consultant_id_fkey(display_name)";

type RawActivityRow = {
  id: string;
  project_id: string;
  site_id: string | null;
  name: string;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  planned_days: number | null;
  mode: string;
  status: string;
  activity_type_id: string;
  consultant_id: string | null;
  activity_types: { label: string; is_active: boolean } | null;
  profiles: { display_name: string | null } | null;
};

function mapActivityRow(a: RawActivityRow, siteNameById: Map<string, string>): ActivityPlanRow {
  return {
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
  };
}

/** Resolves site names for a project's activities without N+1: activities.site_id has
 *  no direct FK to `sites` (only the composite FK to `project_sites`), so this joins
 *  against the project's own site scope in application code, the same way
 *  `getProjectWorkspace` resolves sites for the Overview tab. Exported: verification_items
 *  has the identical site_id shape and reuses this rather than duplicating it. */
export async function siteNameMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("project_sites").select("sites(id, name)").eq("project_id", projectId);
  if (error) throw new Error("Could not load the project's sites.");
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.sites) map.set(row.sites.id, row.sites.name);
  }
  return map;
}

/**
 * Master Plan is always Project-scoped — there is no global listActivities().
 * Default order matches the Master Plan's planning sequence, not insertion order:
 * start_date, then start_time, then name — undated activities sort last.
 */
export async function listActivities(projectId: string): Promise<ActivityPlanRow[]> {
  const supabase = await createClient();
  const [activitiesRes, siteMap] = await Promise.all([
    supabase
      .from("activities")
      .select(ACTIVITY_LIST_COLUMNS)
      .eq("project_id", projectId)
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    siteNameMap(supabase, projectId),
  ]);
  if (activitiesRes.error) throw new Error("Could not load activities.");

  return (activitiesRes.data ?? []).map((a) => mapActivityRow(a, siteMap));
}

/**
 * Project Workspace Overview's small "Upcoming Activities" widget (Phase 3B-3).
 * Rule: status not in (completed, cancelled) AND start_date >= today, ordered
 * start_date -> start_time -> name, limited server-side (never fetches the whole
 * Master Plan just to show 3 rows). Undated activities are never "upcoming".
 */
export async function listUpcomingActivities(projectId: string, limit = 3): Promise<ActivityPlanRow[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [activitiesRes, siteMap] = await Promise.all([
    supabase
      .from("activities")
      .select(ACTIVITY_LIST_COLUMNS)
      .eq("project_id", projectId)
      .gte("start_date", today)
      .not("status", "in", "(completed,cancelled)")
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
      .limit(limit),
    siteNameMap(supabase, projectId),
  ]);
  if (activitiesRes.error) throw new Error("Could not load upcoming activities.");

  return (activitiesRes.data ?? []).map((a) => mapActivityRow(a, siteMap));
}

export type ActivityDetail = ActivityPlanRow & {
  objectives: string | null;
  plannedWork: string | null;
  workPerformed: string | null;
  nextSteps: string | null;
};

/**
 * Null when the activity doesn't exist OR belongs to a different project — same
 * "not found" outcome either way, so a cross-project URL can never distinguish
 * "wrong id" from "right id, wrong project" (caller should notFound() on null).
 */
export async function getActivity(projectId: string, activityId: string): Promise<ActivityDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, project_id, site_id, name, start_date, start_time, end_date, end_time, planned_days, mode, status, activity_type_id, consultant_id, objectives, planned_work, work_performed, next_steps, activity_types(label, is_active), profiles!activities_consultant_id_fkey(display_name)",
    )
    .eq("id", activityId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error("Could not load the activity.");
  if (!data) return null;

  let siteName: string | null = null;
  if (data.site_id) {
    const siteRes = await supabase.from("sites").select("name").eq("id", data.site_id).maybeSingle();
    siteName = siteRes.data?.name ?? null;
  }

  return {
    id: data.id,
    projectId: data.project_id,
    name: data.name,
    activityTypeId: data.activity_type_id,
    activityTypeLabel: data.activity_types?.label ?? "",
    activityTypeIsActive: data.activity_types?.is_active ?? true,
    siteId: data.site_id,
    siteName,
    startDate: data.start_date,
    startTime: data.start_time,
    endDate: data.end_date,
    endTime: data.end_time,
    plannedDays: data.planned_days,
    mode: data.mode,
    consultantId: data.consultant_id,
    consultantName: data.profiles?.display_name ?? null,
    status: data.status,
    objectives: data.objectives,
    plannedWork: data.planned_work,
    workPerformed: data.work_performed,
    nextSteps: data.next_steps,
  };
}

export type ActivityTypeOption = { id: string; label: string; isActive: boolean };
export type ActivitySiteOption = { id: string; name: string };
export type ActivityConsultantOption = { id: string; name: string };

export type ActivityFormCatalog = {
  /** Active types, plus the current Activity's type if it happens to be inactive
   *  (§6 — it must stay visible/selectable; other inactive types never appear). */
  activityTypes: ActivityTypeOption[];
  /** This project's site scope only — never the full sites catalog. */
  sites: ActivitySiteOption[];
  consultants: ActivityConsultantOption[];
};

export async function getActivityFormCatalog(
  projectId: string,
  currentActivityTypeId?: string | null,
): Promise<ActivityFormCatalog> {
  const supabase = await createClient();
  const [typesRes, sitesRes, consultantsRes] = await Promise.all([
    supabase.from("activity_types").select("id, label, is_active").order("sort_order").order("label"),
    supabase.from("project_sites").select("sites(id, name)").eq("project_id", projectId),
    supabase.from("profiles").select("id, display_name").order("display_name"),
  ]);
  if (typesRes.error) throw new Error("Could not load Activity Types.");
  if (sitesRes.error) throw new Error("Could not load the project's sites.");
  if (consultantsRes.error) throw new Error("Could not load consultants.");

  const activityTypes = (typesRes.data ?? [])
    .filter((t) => t.is_active || t.id === currentActivityTypeId)
    .map((t) => ({ id: t.id, label: t.label, isActive: t.is_active }));

  return {
    activityTypes,
    sites: (sitesRes.data ?? [])
      .map((r) => r.sites)
      .filter((s): s is NonNullable<typeof s> => s !== null),
    consultants: (consultantsRes.data ?? []).map((c) => ({ id: c.id, name: c.display_name ?? "(no name)" })),
  };
}
