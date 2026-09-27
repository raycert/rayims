import { createClient } from "@/lib/supabase/server";
import { formatFrameworkIdentity } from "@/lib/ui/format";
import { siteNameMap } from "./activities";
import { loadScopeCatalog, type VerificationFormCatalog } from "./verification-items";

/** A Finding is the `issues` table (ADR-018). */
export type FindingRow = {
  id: string;
  projectId: string;
  findingType: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  siteId: string | null;
  siteName: string | null;
  activityId: string | null;
  activityName: string | null;
  activityStartDate: string | null;
  activityStartTime: string | null;
  frameworkItemId: string | null;
  /** "8.1 — Operational planning and control" */
  frameworkItemLabel: string | null;
  /** "ISO 14001:2015" */
  frameworkIdentity: string | null;
  createdAt: string;
  closedAt: string | null;
};

export type FindingDetail = FindingRow & {
  /** Set only when created from a real Verification context (Phase 4C-2). */
  verificationItemId: string | null;
  verificationQuestion: string | null;
  /** Set only when created from a Document Review (Phase 5). */
  documentReviewId: string | null;
  createdByName: string | null;
  closedByName: string | null;
};

const FINDING_COLUMNS =
  "id, project_id, finding_type, title, description, priority, status, site_id, activity_id, framework_item_id, created_at, closed_at, framework_items(id, code, title, frameworks(code, edition)), activities(id, name, start_date, start_time)";

const DETAIL_COLUMNS = `${FINDING_COLUMNS}, verification_item_id, document_review_id, verification_items(id, question), created_by_profile:profiles!issues_created_by_fkey(display_name), closed_by_profile:profiles!issues_closed_by_fkey(display_name)`;

type RawFinding = {
  id: string;
  project_id: string;
  finding_type: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  site_id: string | null;
  activity_id: string | null;
  framework_item_id: string | null;
  created_at: string;
  closed_at: string | null;
  framework_items: { id: string; code: string | null; title: string; frameworks: { code: string; edition: string } | null } | null;
  activities: { id: string; name: string; start_date: string | null; start_time: string | null } | null;
};

function mapRow(f: RawFinding, siteMap: Map<string, string>): FindingRow {
  return {
    id: f.id,
    projectId: f.project_id,
    findingType: f.finding_type,
    title: f.title,
    description: f.description,
    priority: f.priority,
    status: f.status,
    siteId: f.site_id,
    siteName: f.site_id ? (siteMap.get(f.site_id) ?? null) : null,
    activityId: f.activity_id,
    activityName: f.activities?.name ?? null,
    activityStartDate: f.activities?.start_date ?? null,
    activityStartTime: f.activities?.start_time ?? null,
    frameworkItemId: f.framework_item_id,
    frameworkItemLabel: f.framework_items
      ? [f.framework_items.code, f.framework_items.title].filter(Boolean).join(" — ")
      : null,
    frameworkIdentity: f.framework_items?.frameworks
      ? formatFrameworkIdentity(f.framework_items.frameworks.code, f.framework_items.frameworks.edition)
      : null,
    createdAt: f.created_at,
    closedAt: f.closed_at,
  };
}

/**
 * Deterministic default order (Phase 4C-1): Open before Closed, then priority
 * high -> medium -> low, then created_at newest first, then title A-Z. Applied in
 * application code after one query — same approach as the Verification list.
 */
export function compareFindings(a: FindingRow, b: FindingRow): number {
  const aOpen = a.status !== "closed";
  const bOpen = b.status !== "closed";
  if (aOpen !== bOpen) return aOpen ? -1 : 1;

  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const aRank = rank[a.priority] ?? 1;
  const bRank = rank[b.priority] ?? 1;
  if (aRank !== bRank) return aRank - bRank;

  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.title.localeCompare(b.title);
}

/** Project Findings workspace is always Project-scoped — there is no global query. */
export async function listFindings(projectId: string): Promise<FindingRow[]> {
  const supabase = await createClient();
  const [res, siteMap] = await Promise.all([
    supabase.from("issues").select(FINDING_COLUMNS).eq("project_id", projectId),
    siteNameMap(supabase, projectId),
  ]);
  if (res.error) throw new Error("Could not load findings.");
  return (res.data ?? []).map((f: RawFinding) => mapRow(f, siteMap)).sort(compareFindings);
}

/** null when the Finding does not exist OR belongs to a different project (same outcome for both). */
export async function getFinding(projectId: string, findingId: string): Promise<FindingDetail | null> {
  const supabase = await createClient();
  const [res, siteMap] = await Promise.all([
    supabase.from("issues").select(DETAIL_COLUMNS).eq("id", findingId).eq("project_id", projectId).maybeSingle(),
    siteNameMap(supabase, projectId),
  ]);
  if (res.error) throw new Error("Could not load the finding.");
  if (!res.data) return null;
  const f = res.data;
  return {
    ...mapRow(f as RawFinding, siteMap),
    verificationItemId: f.verification_item_id,
    verificationQuestion: f.verification_items?.question ?? null,
    documentReviewId: f.document_review_id,
    createdByName: f.created_by_profile?.display_name ?? null,
    closedByName: f.closed_by_profile?.display_name ?? null,
  };
}

/** Same project-scope catalog as Verification; historical framework items come from issues. */
export async function getFindingFormCatalog(projectId: string): Promise<VerificationFormCatalog> {
  return loadScopeCatalog(projectId, "issues");
}
