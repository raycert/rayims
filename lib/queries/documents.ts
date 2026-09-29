import { createClient } from "@/lib/supabase/server";
import { formatFrameworkIdentity } from "@/lib/ui/format";
import { siteNameMap } from "./activities";

/** A mapped (or selectable) Framework Requirement, human-readable. */
export type DocumentFrameworkItem = {
  id: string;
  frameworkId: string;
  /** "ISO 9001:2015" */
  frameworkIdentity: string;
  /** "ISO 9001" — compact register display */
  frameworkCode: string;
  code: string | null;
  /** "7.5.2 — Creating and updating" */
  label: string;
  /** false = its Framework is no longer assigned to the project (historical mapping, kept). */
  inAssignedScope: boolean;
};

/** One row of the Document Register. Status is DERIVED by the `document_register` view (ADR-005). */
export type DocumentRow = {
  id: string;
  title: string;
  docCode: string | null;
  documentType: string | null;
  ownerName: string | null;
  siteId: string | null;
  siteName: string | null;
  isApplicable: boolean;
  status: string;
  latestVersionNo: number | null;
  latestRevision: string | null;
  /** reviewed_at (or created_at while open) of the latest review of the latest version. */
  lastReviewAt: string | null;
  frameworkItems: DocumentFrameworkItem[];
};

export type DocumentVersionSummary = {
  id: string;
  versionNo: number;
  revision: string | null;
  receivedOn: string | null;
  notes: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByName: string | null;
  createdAt: string;
  reviewCount: number;
  /** Status of the latest review record of this version (created_at, id), read-only; null = none. */
  latestReviewStatus: string | null;
};

export type DocumentDetail = DocumentRow & {
  projectId: string;
  createdAt: string;
  /** Newest first (highest version_no = Current). One embedded query: file metadata, uploader, reviews. */
  versions: DocumentVersionSummary[];
};

export type DocumentFormCatalog = {
  sites: { id: string; name: string }[];
  /** Items of the Frameworks currently assigned to the project, grouped order (framework code, item code). */
  frameworkItems: DocumentFrameworkItem[];
  /** Existing codes in the project -> title (non-blocking duplicate hint only). */
  existingCodes: { code: string; title: string; documentId: string }[];
};

type RawItem = {
  id: string;
  code: string | null;
  title: string;
  framework_id: string;
  frameworks: { code: string; edition: string } | null;
};

const ITEM_EMBED = "framework_items(id, code, title, framework_id, frameworks(code, edition))";

const naturalCode = (a: string | null, b: string | null) =>
  (a ?? "").localeCompare(b ?? "", undefined, { numeric: true, sensitivity: "base" });

/** Natural order: ISO 9001 before ISO 14001; 6.1.2 before 10.1. */
export function compareFrameworkItems(a: DocumentFrameworkItem, b: DocumentFrameworkItem): number {
  return naturalCode(a.frameworkIdentity, b.frameworkIdentity) || naturalCode(a.code, b.code) || a.label.localeCompare(b.label);
}

function mapItem(item: RawItem, assigned: Set<string>): DocumentFrameworkItem {
  return {
    id: item.id,
    frameworkId: item.framework_id,
    frameworkIdentity: item.frameworks ? formatFrameworkIdentity(item.frameworks.code, item.frameworks.edition) : "",
    frameworkCode: item.frameworks?.code ?? "",
    code: item.code,
    label: [item.code, item.title].filter(Boolean).join(" — "),
    inAssignedScope: assigned.has(item.framework_id),
  };
}

/** Title A–Z (natural, case-insensitive), then id — predictable and independent of status. */
export function compareDocuments(a: { title: string; id: string }, b: { title: string; id: string }): number {
  return (
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

async function assignedFrameworkIds(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string) {
  const { data, error } = await supabase.from("project_frameworks").select("framework_id").eq("project_id", projectId);
  if (error) throw new Error("Could not load the project's frameworks.");
  return new Set((data ?? []).map((r) => r.framework_id));
}

/**
 * Document Register (Phase 5A). Batched, no per-document query:
 *   1. `document_register` view (identity + derived status + latest version) for the project
 *   2. all framework mappings of the project's documents (inner join on documents.project_id)
 *   3. site names + assigned frameworks (small lookups)
 *   4. only if any latest review exists: those review rows, for "Last Review"
 */
export async function listDocuments(projectId: string): Promise<DocumentRow[]> {
  const supabase = await createClient();
  const [registerRes, mappingsRes, siteMap, assigned] = await Promise.all([
    supabase
      .from("document_register")
      .select("document_id, title, doc_code, document_type, owner_name, site_id, is_applicable, status, latest_version_no, latest_revision, latest_review_id")
      .eq("project_id", projectId),
    supabase
      .from("document_framework_items")
      .select(`document_id, documents!inner(project_id), ${ITEM_EMBED}`)
      .eq("documents.project_id", projectId),
    siteNameMap(supabase, projectId),
    assignedFrameworkIds(supabase, projectId),
  ]);
  if (registerRes.error) throw new Error("Could not load documents.");
  if (mappingsRes.error) throw new Error("Could not load document framework requirements.");

  const itemsByDoc = new Map<string, DocumentFrameworkItem[]>();
  for (const m of mappingsRes.data ?? []) {
    if (!m.framework_items) continue;
    const list = itemsByDoc.get(m.document_id) ?? [];
    list.push(mapItem(m.framework_items as RawItem, assigned));
    itemsByDoc.set(m.document_id, list);
  }

  const reviewIds = (registerRes.data ?? []).map((r) => r.latest_review_id).filter((id): id is string => !!id);
  const reviewDates = new Map<string, string>();
  if (reviewIds.length > 0) {
    const { data, error } = await supabase.from("document_reviews").select("id, reviewed_at, created_at").in("id", reviewIds);
    if (error) throw new Error("Could not load document reviews.");
    for (const r of data ?? []) reviewDates.set(r.id, r.reviewed_at ?? r.created_at);
  }

  return (registerRes.data ?? [])
    .filter((r): r is typeof r & { document_id: string; title: string } => !!r.document_id && r.title !== null)
    .map((r) => ({
      id: r.document_id,
      title: r.title,
      docCode: r.doc_code,
      documentType: r.document_type,
      ownerName: r.owner_name,
      siteId: r.site_id,
      siteName: r.site_id ? (siteMap.get(r.site_id) ?? null) : null,
      isApplicable: r.is_applicable ?? true,
      status: r.status ?? "not_received",
      latestVersionNo: r.latest_version_no,
      latestRevision: r.latest_revision,
      lastReviewAt: r.latest_review_id ? (reviewDates.get(r.latest_review_id) ?? null) : null,
      frameworkItems: (itemsByDoc.get(r.document_id) ?? []).sort(compareFrameworkItems),
    }))
    .sort(compareDocuments);
}

/** null when the Document does not exist OR belongs to another project (same outcome for both). */
export async function getDocument(projectId: string, documentId: string): Promise<DocumentDetail | null> {
  const supabase = await createClient();
  const [docRes, registerRes, siteMap, assigned] = await Promise.all([
    supabase
      .from("documents")
      .select(
        `id, project_id, site_id, doc_code, title, document_type, owner_name, is_applicable, created_at, document_framework_items(${ITEM_EMBED}), document_versions(id, version_no, revision, received_on, notes, created_at, files(original_name, mime_type, size_bytes), uploader:profiles!document_versions_uploaded_by_fkey(display_name, email), document_reviews(id, status, created_at))`,
      )
      .eq("id", documentId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("document_register")
      .select("status, latest_version_no, latest_revision, latest_review_id")
      .eq("document_id", documentId)
      .eq("project_id", projectId)
      .maybeSingle(),
    siteNameMap(supabase, projectId),
    assignedFrameworkIds(supabase, projectId),
  ]);
  if (docRes.error || registerRes.error) throw new Error("Could not load the document.");
  const d = docRes.data;
  if (!d || !registerRes.data) return null;
  const reg = registerRes.data;

  let lastReviewAt: string | null = null;
  if (reg.latest_review_id) {
    const { data } = await supabase.from("document_reviews").select("reviewed_at, created_at").eq("id", reg.latest_review_id).maybeSingle();
    lastReviewAt = data ? (data.reviewed_at ?? data.created_at) : null;
  }

  return {
    id: d.id,
    projectId: d.project_id,
    title: d.title,
    docCode: d.doc_code,
    documentType: d.document_type,
    ownerName: d.owner_name,
    siteId: d.site_id,
    siteName: d.site_id ? (siteMap.get(d.site_id) ?? null) : null,
    isApplicable: d.is_applicable,
    status: reg.status ?? "not_received",
    latestVersionNo: reg.latest_version_no,
    latestRevision: reg.latest_revision,
    lastReviewAt,
    createdAt: d.created_at,
    frameworkItems: (d.document_framework_items ?? [])
      .map((m) => m.framework_items)
      .filter((i): i is NonNullable<typeof i> => !!i)
      .map((i) => mapItem(i as RawItem, assigned))
      .sort(compareFrameworkItems),
    versions: (d.document_versions ?? [])
      .map((v) => {
        const reviews = [...(v.document_reviews ?? [])].sort((a, b) =>
          a.created_at !== b.created_at ? (a.created_at < b.created_at ? 1 : -1) : a.id < b.id ? 1 : -1,
        );
        return {
          id: v.id,
          versionNo: v.version_no,
          revision: v.revision,
          receivedOn: v.received_on,
          notes: v.notes,
          fileName: v.files?.original_name ?? null,
          mimeType: v.files?.mime_type ?? null,
          sizeBytes: v.files?.size_bytes ?? null,
          uploadedByName: v.uploader?.display_name ?? v.uploader?.email ?? null,
          createdAt: v.created_at,
          reviewCount: reviews.length,
          latestReviewStatus: reviews[0]?.status ?? null,
        };
      })
      .sort((a, b) => b.versionNo - a.versionNo),
  };
}

/** Sites in scope + items of the currently assigned Frameworks (+ existing codes for a duplicate hint). */
export async function getDocumentFormCatalog(projectId: string): Promise<DocumentFormCatalog> {
  const supabase = await createClient();
  const [sitesRes, assignedRes, codesRes] = await Promise.all([
    supabase.from("project_sites").select("sites(id, name)").eq("project_id", projectId),
    supabase
      .from("project_frameworks")
      .select("framework_id, frameworks(code, edition, framework_items(id, code, title, framework_id))")
      .eq("project_id", projectId),
    supabase.from("documents").select("id, doc_code, title").eq("project_id", projectId).not("doc_code", "is", null),
  ]);
  if (sitesRes.error) throw new Error("Could not load the project's sites.");
  if (assignedRes.error) throw new Error("Could not load the project's frameworks.");
  if (codesRes.error) throw new Error("Could not load document codes.");

  const assigned = new Set((assignedRes.data ?? []).map((r) => r.framework_id));
  const frameworkItems: DocumentFrameworkItem[] = [];
  for (const row of assignedRes.data ?? []) {
    const fw = row.frameworks;
    if (!fw) continue;
    for (const item of fw.framework_items ?? []) {
      frameworkItems.push(mapItem({ ...item, frameworks: { code: fw.code, edition: fw.edition } }, assigned));
    }
  }

  return {
    sites: (sitesRes.data ?? [])
      .map((r) => r.sites)
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
    frameworkItems: frameworkItems.sort(compareFrameworkItems),
    existingCodes: (codesRes.data ?? [])
      .filter((r): r is typeof r & { doc_code: string } => !!r.doc_code)
      .map((r) => ({ code: r.doc_code, title: r.title, documentId: r.id })),
  };
}
