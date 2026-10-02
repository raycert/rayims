import { createClient } from "@/lib/supabase/server";
import { formatFrameworkIdentity } from "@/lib/ui/format";
import { siteNameMap } from "./activities";
import { EVIDENCE_EMBED, mapEvidence, type EvidenceItem, type RawEvidence } from "./evidence";

export type VerificationItemRow = {
  id: string;
  projectId: string;
  question: string;
  priority: string;
  /** null = Pending (not yet verified). Read-only in 4A — execution is Phase 4B. */
  result: string | null;
  siteId: string | null;
  siteName: string | null;
  targetActivityId: string | null;
  targetActivityName: string | null;
  targetActivityStartDate: string | null;
  targetActivityStartTime: string | null;
  frameworkItemId: string | null;
  /** "8.1 — Operational planning and control" */
  frameworkItemLabel: string | null;
  /** "ISO 9001:2015" */
  frameworkIdentity: string | null;
  /** Set when the check was added from a Document Gap Assessment (Phase 5D). */
  reviewOrigin: VerificationReviewSource | null;
};

/** The Gap Assessment a check came from: Document + Version (for the source line and the site lock). */
export type VerificationReviewSource = {
  documentId: string;
  documentTitle: string;
  versionNo: number;
  revision: string | null;
  documentSiteId: string | null;
};

const VERIFICATION_ITEM_COLUMNS =
  "id, project_id, question, priority, result, site_id, target_activity_id, framework_item_id, framework_items(id, code, title, framework_id, frameworks(code, edition)), activities!verification_items_target_activity_id_fkey(id, name, start_date, start_time, site_id), document_reviews(document_versions(version_no, revision, documents(id, title, site_id)))";

type RawVerificationItemRow = {
  id: string;
  project_id: string;
  question: string;
  priority: string;
  result: string | null;
  site_id: string | null;
  target_activity_id: string | null;
  framework_item_id: string | null;
  framework_items: { id: string; code: string | null; title: string; framework_id: string; frameworks: { code: string; edition: string } | null } | null;
  activities: { id: string; name: string; start_date: string | null; start_time: string | null; site_id: string | null } | null;
  document_reviews: {
    document_versions: { version_no: number; revision: string | null; documents: { id: string; title: string; site_id: string | null } | null } | null;
  } | null;
};

function mapRow(v: RawVerificationItemRow, siteMap: Map<string, string>): VerificationItemRow {
  return {
    id: v.id,
    projectId: v.project_id,
    question: v.question,
    priority: v.priority,
    result: v.result,
    siteId: v.site_id,
    siteName: v.site_id ? (siteMap.get(v.site_id) ?? null) : null,
    targetActivityId: v.target_activity_id,
    targetActivityName: v.activities?.name ?? null,
    targetActivityStartDate: v.activities?.start_date ?? null,
    targetActivityStartTime: v.activities?.start_time ?? null,
    frameworkItemId: v.framework_item_id,
    frameworkItemLabel: v.framework_items ? [v.framework_items.code, v.framework_items.title].filter(Boolean).join(" — ") : null,
    frameworkIdentity: v.framework_items?.frameworks
      ? formatFrameworkIdentity(v.framework_items.frameworks.code, v.framework_items.frameworks.edition)
      : null,
    reviewOrigin: v.document_reviews?.document_versions?.documents
      ? {
          documentId: v.document_reviews.document_versions.documents.id,
          documentTitle: v.document_reviews.document_versions.documents.title,
          versionNo: v.document_reviews.document_versions.version_no,
          revision: v.document_reviews.document_versions.revision,
          documentSiteId: v.document_reviews.document_versions.documents.site_id,
        }
      : null,
  };
}

/**
 * Deterministic planning order (Phase 4A review, §11): pending before completed,
 * then Target Activity start_date/start_time (undated last), then priority
 * high->medium->low, then question A-Z. This orders by a related table's columns
 * (the target Activity's date/time), which PostgREST cannot express as a single-query
 * `.order()` on the parent table — so it's applied here in application code after the
 * one query returns, not as repeated database round trips.
 */
function compareVerificationItems(a: VerificationItemRow, b: VerificationItemRow): number {
  const aPending = a.result === null;
  const bPending = b.result === null;
  if (aPending !== bPending) return aPending ? -1 : 1;

  const aDate = a.targetActivityStartDate;
  const bDate = b.targetActivityStartDate;
  if (aDate !== bDate) {
    if (aDate === null) return 1;
    if (bDate === null) return -1;
    return aDate < bDate ? -1 : 1;
  }

  const aTime = a.targetActivityStartTime;
  const bTime = b.targetActivityStartTime;
  if (aTime !== bTime) {
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return aTime < bTime ? -1 : 1;
  }

  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const aRank = rank[a.priority] ?? 1;
  const bRank = rank[b.priority] ?? 1;
  if (aRank !== bRank) return aRank - bRank;

  return a.question.localeCompare(b.question);
}

/** Project Verification workspace is always Project-scoped — no global query. */
export async function listVerificationItems(projectId: string): Promise<VerificationItemRow[]> {
  const supabase = await createClient();
  const [itemsRes, siteMap] = await Promise.all([
    supabase
      .from("verification_items")
      .select(VERIFICATION_ITEM_COLUMNS)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    siteNameMap(supabase, projectId),
  ]);
  if (itemsRes.error) throw new Error("Could not load verification items.");

  return (itemsRes.data ?? []).map((v) => mapRow(v, siteMap)).sort(compareVerificationItems);
}

/** Compact summary of a Finding linked to a verification item (issues.verification_item_id). */
export type LinkedFindingSummary = { id: string; findingNo: number; title: string; findingType: string; status: string };

export type ActivityVerificationItemRow = {
  id: string;
  question: string;
  priority: string;
  result: string | null;
  notes: string | null;
  siteId: string | null;
  frameworkItemId: string | null;
  /** Every Finding created from this verification item (open AND closed), oldest first. */
  findings: LinkedFindingSummary[];
  /** Evidence attached to this verification item. */
  evidence: EvidenceItem[];
  frameworkItemLabel: string | null;
  frameworkIdentity: string | null;
  targetActivityId: string | null;
  verifiedActivityId: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
};

/**
 * Onsite ordering (Phase 4B review §34): pending first, then priority high->medium->low,
 * then question A-Z; completed items follow the same priority/question order after
 * pending. No target-activity-date sort here — every row is already scoped to one
 * Activity, so that ordering key from the planning list isn't meaningful.
 */
function compareActivityVerificationItems(a: ActivityVerificationItemRow, b: ActivityVerificationItemRow): number {
  const aPending = a.result === null;
  const bPending = b.result === null;
  if (aPending !== bPending) return aPending ? -1 : 1;

  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const aRank = rank[a.priority] ?? 1;
  const bRank = rank[b.priority] ?? 1;
  if (aRank !== bRank) return aRank - bRank;

  return a.question.localeCompare(b.question);
}

/**
 * Verification Items shown on Activity Detail (Phase 4B review §5): target_activity_id
 * = this Activity OR verified_activity_id = this Activity, de-duplicated by id — an item
 * planned here and later completed elsewhere still shows here (for traceability), and an
 * item planned elsewhere but completed here shows here too. Two OR'd queries + a Map
 * keyed by id give the de-duplication without a client-side OR filter PostgREST can't
 * express cleanly against two different columns pointing at the same table with an embed.
 */
export async function listActivityVerificationItems(
  projectId: string,
  activityId: string,
): Promise<ActivityVerificationItemRow[]> {
  const supabase = await createClient();
  const columns =
    `id, question, priority, result, notes, site_id, framework_item_id, target_activity_id, verified_activity_id, verified_at, framework_items(code, title, frameworks(code, edition)), profiles!verification_items_verified_by_fkey(display_name), issues(id, finding_no, title, finding_type, status, created_at), ${EVIDENCE_EMBED}`;

  const [targetRes, verifiedRes] = await Promise.all([
    supabase.from("verification_items").select(columns).eq("project_id", projectId).eq("target_activity_id", activityId),
    supabase.from("verification_items").select(columns).eq("project_id", projectId).eq("verified_activity_id", activityId),
  ]);
  if (targetRes.error) throw new Error("Could not load verification items for this activity.");
  if (verifiedRes.error) throw new Error("Could not load verification items for this activity.");

  const byId = new Map<string, ActivityVerificationItemRow>();
  for (const row of [...(targetRes.data ?? []), ...(verifiedRes.data ?? [])]) {
    if (byId.has(row.id)) continue;
    byId.set(row.id, {
      id: row.id,
      question: row.question,
      priority: row.priority,
      result: row.result,
      notes: row.notes,
      siteId: row.site_id,
      frameworkItemId: row.framework_item_id,
      evidence: mapEvidence(row.attachments as RawEvidence[]),
      findings: [...(row.issues ?? [])]
        .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
        .map((f) => ({ id: f.id, findingNo: f.finding_no, title: f.title, findingType: f.finding_type, status: f.status })),
      frameworkItemLabel: row.framework_items ? [row.framework_items.code, row.framework_items.title].filter(Boolean).join(" — ") : null,
      frameworkIdentity: row.framework_items?.frameworks
        ? formatFrameworkIdentity(row.framework_items.frameworks.code, row.framework_items.frameworks.edition)
        : null,
      targetActivityId: row.target_activity_id,
      verifiedActivityId: row.verified_activity_id,
      verifiedByName: row.profiles?.display_name ?? null,
      verifiedAt: row.verified_at,
    });
  }

  return [...byId.values()].sort(compareActivityVerificationItems);
}

export type VerificationSiteOption = { id: string; name: string };
export type VerificationActivityOption = {
  id: string;
  name: string;
  startDate: string | null;
  startTime: string | null;
  /** null = project-wide Activity — a new Verification Item's site is NOT locked to it. */
  siteId: string | null;
};
export type VerificationFrameworkItemOption = {
  id: string;
  label: string;
  frameworkIdentity: string;
  /** false = the item's framework is not currently assigned to the project — only
   *  possible for the current value of an existing item (historical preservation). */
  inAssignedScope: boolean;
  /** Optional explicit option group (Phase 5D: "Mapped to this document" listed first). */
  groupLabel?: string;
};

export type VerificationFormCatalog = {
  sites: VerificationSiteOption[];
  activities: VerificationActivityOption[];
  frameworkItems: VerificationFrameworkItemOption[];
};

/**
 * One catalog serves the whole Verification workspace list, whose items may each
 * reference a DIFFERENT framework item that's since become unassigned — unlike
 * Activity Detail's per-record catalog (one "current" value to preserve), this
 * fetches every framework_item_id actually referenced by the project's verification
 * items and includes whichever of those aren't in the current assignment, so any
 * item's Edit form can preserve its historical selection (§26).
 */
export async function getVerificationFormCatalog(projectId: string): Promise<VerificationFormCatalog> {
  return loadScopeCatalog(projectId, "verification_items");
}

/**
 * The project-scope catalog (sites, activities, assigned framework items + any historically
 * referenced but now-unassigned ones) shared by Verification and Findings forms.
 * `referencedTable` is the table whose rows' framework_item_id values must stay selectable.
 */
export async function loadScopeCatalog(
  projectId: string,
  referencedTable: "verification_items" | "issues",
): Promise<VerificationFormCatalog> {
  const supabase = await createClient();
  const [sitesRes, activitiesRes, assignedRes, referencedRes] = await Promise.all([
    supabase.from("project_sites").select("sites(id, name)").eq("project_id", projectId),
    supabase
      .from("activities")
      .select("id, name, start_date, start_time, site_id")
      .eq("project_id", projectId)
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    supabase
      .from("project_frameworks")
      .select("frameworks(code, edition, framework_items(id, code, title))")
      .eq("project_id", projectId),
    supabase.from(referencedTable).select("framework_item_id").eq("project_id", projectId).not("framework_item_id", "is", null),
  ]);
  if (sitesRes.error) throw new Error("Could not load the project's sites.");
  if (activitiesRes.error) throw new Error("Could not load the project's activities.");
  if (assignedRes.error) throw new Error("Could not load the project's frameworks.");
  if (referencedRes.error) throw new Error("Could not load the project's verification items.");

  const frameworkItems: VerificationFrameworkItemOption[] = [];
  const assignedIds = new Set<string>();
  for (const row of assignedRes.data ?? []) {
    const fw = row.frameworks;
    if (!fw) continue;
    const identity = formatFrameworkIdentity(fw.code, fw.edition);
    for (const item of fw.framework_items ?? []) {
      assignedIds.add(item.id);
      frameworkItems.push({
        id: item.id,
        label: [item.code, item.title].filter(Boolean).join(" — "),
        frameworkIdentity: identity,
        inAssignedScope: true,
      });
    }
  }

  const referencedIds = new Set((referencedRes.data ?? []).map((r) => r.framework_item_id).filter((id): id is string => !!id));
  const historicalIds = [...referencedIds].filter((id) => !assignedIds.has(id));
  if (historicalIds.length > 0) {
    const { data: historical, error } = await supabase
      .from("framework_items")
      .select("id, code, title, frameworks(code, edition)")
      .in("id", historicalIds);
    if (error) throw new Error("Could not load historical framework items.");
    for (const item of historical ?? []) {
      if (!item.frameworks) continue;
      frameworkItems.push({
        id: item.id,
        label: [item.code, item.title].filter(Boolean).join(" — "),
        frameworkIdentity: formatFrameworkIdentity(item.frameworks.code, item.frameworks.edition),
        inAssignedScope: false,
      });
    }
  }

  return {
    sites: (sitesRes.data ?? [])
      .map((r) => r.sites)
      .filter((s): s is NonNullable<typeof s> => s !== null),
    activities: (activitiesRes.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      startDate: a.start_date,
      startTime: a.start_time,
      siteId: a.site_id,
    })),
    frameworkItems,
  };
}
