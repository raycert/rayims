import { createClient } from "@/lib/supabase/server";
import { todayBand } from "@/lib/ui/business-date";
import { findingLabel } from "@/lib/ui/format";
import type { OverdueActionItem, OverdueActionsData, UpcomingActivitiesData, UpcomingActivityItem } from "@/lib/domain/work-lists";

/**
 * Cross-project "what needs my attention" data for the consultant Home, and the same Overdue /
 * Upcoming rules for one Project (Overview). A small FIXED number of queries (no N+1): round 1
 * runs in parallel, round 2 resolves site names once. V1 authorization is authenticated full
 * business access (RLS), so Home deliberately spans every Project the user can read.
 */

const ACTIVITY_COLUMNS =
  "id, project_id, site_id, name, start_date, start_time, end_date, end_time, status, activity_types(label), projects(name)";
const ACTION_COLUMNS =
  "id, project_id, description, owner_name, due_date, priority, status, issue_id, projects(name), issues(finding_no, title)";
/** Rows kept for the certain-overdue list: enough to order by priority inside a due date. */
const DEFINITE_ROWS = 50;

export type HomeDocumentUnderReview = {
  reviewId: string;
  documentId: string;
  projectId: string;
  projectName: string;
  title: string;
  docCode: string | null;
  siteName: string | null;
  versionNo: number;
};

export type HomeRecentProject = { id: string; name: string; clientName: string; status: string };

export type WorkLists = {
  upcoming: UpcomingActivitiesData;
  overdue: OverdueActionsData;
  /** Documents whose current Version has an open (Under Review) Gap Assessment — oldest open first. */
  documentsUnderReview: { items: HomeDocumentUnderReview[]; total: number };
  recentProjects: HomeRecentProject[];
};

/** scopeProjectId = null → every Project (Home); an id → that Project only (Overview; no Documents / Projects lists). */
export async function getWorkLists(options: { scopeProjectId: string | null; limit: number }): Promise<WorkLists> {
  const { scopeProjectId, limit } = options;
  const supabase = await createClient();
  const band = todayBand();
  const home = scopeProjectId === null;

  let undecidedActivities = supabase
    .from("activities")
    .select(ACTIVITY_COLUMNS)
    .gte("start_date", band.dayBefore)
    .lte("start_date", band.today)
    .not("status", "in", "(completed,cancelled)")
    .order("start_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  let laterActivities = supabase
    .from("activities")
    .select(ACTIVITY_COLUMNS)
    .gt("start_date", band.today)
    .not("status", "in", "(completed,cancelled)")
    .order("start_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(limit);
  let definiteActions = supabase
    .from("actions")
    .select(ACTION_COLUMNS, { count: "exact" })
    .neq("status", "closed")
    .lt("due_date", band.dayBefore)
    .order("due_date", { ascending: true })
    .limit(DEFINITE_ROWS);
  let undecidedActions = supabase
    .from("actions")
    .select(ACTION_COLUMNS)
    .neq("status", "closed")
    .gte("due_date", band.dayBefore)
    .lte("due_date", band.today)
    .order("due_date", { ascending: true });
  if (scopeProjectId) {
    undecidedActivities = undecidedActivities.eq("project_id", scopeProjectId);
    laterActivities = laterActivities.eq("project_id", scopeProjectId);
    definiteActions = definiteActions.eq("project_id", scopeProjectId);
    undecidedActions = undecidedActions.eq("project_id", scopeProjectId);
  }

  const reviewsQuery = home
    ? supabase
        .from("document_reviews")
        .select(
          "id, created_at, document_versions!inner(version_no, documents!inner(id, project_id, title, doc_code, site_id, projects(name)))",
          { count: "exact" },
        )
        .eq("status", "under_review")
        .order("created_at", { ascending: true })
        .limit(limit)
    : null;
  const projectsQuery = home
    ? supabase.from("projects").select("id, name, status, clients(name)").order("created_at", { ascending: false }).limit(limit)
    : null;

  const [uRes, lRes, dRes, aRes, rRes, pRes] = await Promise.all([
    undecidedActivities,
    laterActivities,
    definiteActions,
    undecidedActions,
    reviewsQuery,
    projectsQuery,
  ]);
  if (uRes.error || lRes.error) throw new Error("Could not load upcoming activities.");
  if (dRes.error || aRes.error) throw new Error("Could not load overdue actions.");
  if (rRes?.error) throw new Error("Could not load documents under review.");
  if (pRes?.error) throw new Error("Could not load recent projects.");

  // Round 2: site names for every row shown (activities and documents have no direct FK to sites).
  const siteIds = new Set<string>();
  for (const a of [...(uRes.data ?? []), ...(lRes.data ?? [])]) if (a.site_id) siteIds.add(a.site_id);
  for (const r of rRes?.data ?? []) {
    const siteId = r.document_versions?.documents?.site_id;
    if (siteId) siteIds.add(siteId);
  }
  const siteNames = new Map<string, string>();
  if (siteIds.size > 0) {
    const { data, error } = await supabase.from("sites").select("id, name").in("id", [...siteIds]);
    if (error) throw new Error("Could not load site names.");
    for (const s of data ?? []) siteNames.set(s.id, s.name);
  }

  const projectName = (name: string | null | undefined) => (home ? (name ?? "") : null);
  const toActivity = (a: NonNullable<typeof uRes.data>[number]): UpcomingActivityItem => ({
    id: a.id,
    projectId: a.project_id,
    projectName: projectName(a.projects?.name),
    name: a.name,
    typeLabel: a.activity_types?.label ?? "",
    siteName: a.site_id ? (siteNames.get(a.site_id) ?? null) : null,
    status: a.status,
    startDate: a.start_date ?? "",
    startTime: a.start_time,
    endDate: a.end_date,
    endTime: a.end_time,
  });
  const toAction = (a: NonNullable<typeof dRes.data>[number]): OverdueActionItem => ({
    id: a.id,
    projectId: a.project_id,
    projectName: projectName(a.projects?.name),
    description: a.description,
    ownerName: a.owner_name,
    dueDate: a.due_date ?? "",
    priority: a.priority,
    status: a.status,
    findingId: a.issue_id,
    findingLabel: a.issues ? findingLabel({ findingNo: a.issues.finding_no, title: a.issues.title }) : null,
  });

  return {
    upcoming: { undecided: (uRes.data ?? []).map(toActivity), later: (lRes.data ?? []).map(toActivity) },
    overdue: { definite: (dRes.data ?? []).map(toAction), definiteTotal: dRes.count ?? 0, undecided: (aRes.data ?? []).map(toAction) },
    documentsUnderReview: {
      items: (rRes?.data ?? []).flatMap((r) => {
        const v = r.document_versions;
        const d = v?.documents;
        if (!v || !d) return [];
        return [
          {
            reviewId: r.id,
            documentId: d.id,
            projectId: d.project_id,
            projectName: d.projects?.name ?? "",
            title: d.title,
            docCode: d.doc_code,
            siteName: d.site_id ? (siteNames.get(d.site_id) ?? null) : null,
            versionNo: v.version_no,
          },
        ];
      }),
      total: rRes?.count ?? 0,
    },
    recentProjects: (pRes?.data ?? []).map((p) => ({ id: p.id, name: p.name, clientName: p.clients?.name ?? "", status: p.status })),
  };
}
