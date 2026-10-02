import { createClient } from "@/lib/supabase/server";
import { isActionOverdue } from "@/lib/ui/format";
import { siteNameMap } from "./activities";
import { EVIDENCE_EMBED, mapEvidence, type EvidenceItem, type RawEvidence } from "./evidence";

/** An `actions` row. Linked to a Finding (issue_id) or standalone (issue_id NULL). */
export type ActionRow = {
  id: string;
  projectId: string;
  description: string;
  ownerName: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  completionNotes: string | null;
  completedAt: string | null;
  siteId: string | null;
  siteName: string | null;
  activityId: string | null;
  activityName: string | null;
  activityStartDate: string | null;
  /** null = standalone action. Immutable after creation. */
  findingId: string | null;
  /** Per-project number of the related Finding (ADR-019); null = standalone action. */
  findingNo: number | null;
  findingTitle: string | null;
  findingType: string | null;
  /** A closed Finding freezes its linked actions (read-only until the Finding is reopened). */
  findingStatus: string | null;
  createdAt: string;
  evidence: EvidenceItem[];
};

/** Columns of an action plus its Activity and (when linked) its Finding — one embed, no extra query. */
export const ACTION_COLUMNS =
  `id, project_id, description, owner_name, due_date, priority, status, completion_notes, completed_at, site_id, activity_id, issue_id, created_at, activities(id, name, start_date), issues(id, finding_no, title, finding_type, status), ${EVIDENCE_EMBED}`;

export type RawAction = {
  id: string;
  project_id: string;
  description: string;
  owner_name: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  completion_notes: string | null;
  completed_at: string | null;
  site_id: string | null;
  activity_id: string | null;
  issue_id: string | null;
  created_at: string;
  activities: { id: string; name: string; start_date: string | null } | null;
  issues?: { id: string; finding_no: number; title: string; finding_type: string; status: string } | null;
  attachments?: RawEvidence[] | null;
};

export function mapAction(a: RawAction, siteMap: Map<string, string>): ActionRow {
  return {
    id: a.id,
    projectId: a.project_id,
    description: a.description,
    ownerName: a.owner_name,
    dueDate: a.due_date,
    priority: a.priority,
    status: a.status,
    completionNotes: a.completion_notes,
    completedAt: a.completed_at,
    siteId: a.site_id,
    siteName: a.site_id ? (siteMap.get(a.site_id) ?? null) : null,
    activityId: a.activity_id,
    activityName: a.activities?.name ?? null,
    activityStartDate: a.activities?.start_date ?? null,
    findingId: a.issue_id,
    findingNo: a.issues?.finding_no ?? null,
    findingTitle: a.issues?.title ?? null,
    findingType: a.issues?.finding_type ?? null,
    findingStatus: a.issues?.status ?? null,
    createdAt: a.created_at,
    evidence: mapEvidence(a.attachments),
  };
}

/**
 * Default order (Phase 4D-1): Overdue first, then not-closed before closed, then due date
 * ascending (no due date last), then priority high -> medium -> low, then created_at newest
 * first, then id (deterministic tie breaker).
 */
export function compareActions(a: ActionRow, b: ActionRow): number {
  const aOver = isActionOverdue(a);
  const bOver = isActionOverdue(b);
  if (aOver !== bOver) return aOver ? -1 : 1;

  const aOpen = a.status !== "closed";
  const bOpen = b.status !== "closed";
  if (aOpen !== bOpen) return aOpen ? -1 : 1;

  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }

  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const aRank = rank[a.priority] ?? 1;
  const bRank = rank[b.priority] ?? 1;
  if (aRank !== bRank) return aRank - bRank;

  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Project Overview (Phase 4F): the overdue actions of one project — the same rule as everywhere
 * (due date before today, status not Closed; isActionOverdue) — soonest due first, then priority.
 * Returns at most `limit` rows plus the total overdue count. One query; the database pre-filters.
 */
export async function listOverdueActions(
  projectId: string,
  limit = 5,
): Promise<{ items: ActionRow[]; total: number }> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [res, siteMap] = await Promise.all([
    supabase
      .from("actions")
      .select(ACTION_COLUMNS)
      .eq("project_id", projectId)
      .neq("status", "closed")
      .lt("due_date", today),
    siteNameMap(supabase, projectId),
  ]);
  if (res.error) throw new Error("Could not load overdue actions.");
  const overdue = (res.data ?? [])
    .map((a) => mapAction(a as RawAction, siteMap))
    .filter(isActionOverdue)
    .sort(compareActions);
  return { items: overdue.slice(0, limit), total: overdue.length };
}

/** Project Actions workspace: linked AND standalone actions of one project, in one query. */
export async function listProjectActions(projectId: string): Promise<ActionRow[]> {
  const supabase = await createClient();
  const [res, siteMap] = await Promise.all([
    supabase.from("actions").select(ACTION_COLUMNS).eq("project_id", projectId),
    siteNameMap(supabase, projectId),
  ]);
  if (res.error) throw new Error("Could not load actions.");
  return (res.data ?? []).map((a) => mapAction(a as RawAction, siteMap)).sort(compareActions);
}
