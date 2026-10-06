import { createClient } from "@/lib/supabase/server";
import type { BulkDocument } from "@/lib/documents/bulk-match";
import { siteNameMap } from "./activities";
import { fetchAllPages } from "./paging";

/**
 * The Documents a Bulk Upload can target (Phase 7C), for ONE project: identity, Site, applicability and the
 * state the Match Review previews (current Version number / file, open Gap Assessment). Read-only; the server
 * still revalidates every file through the single-upload actions. Ordered by title then id (deterministic).
 */
export async function getBulkUploadCatalog(projectId: string): Promise<BulkDocument[]> {
  const supabase = await createClient();
  const [pages, siteMap] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("documents")
        .select("id, doc_code, title, site_id, is_applicable, document_versions(version_no, files(original_name, size_bytes), document_reviews(status))", { count: "exact" })
        .eq("project_id", projectId)
        .order("title")
        .order("id")
        .range(from, to),
    ),
    siteNameMap(supabase, projectId),
  ]);
  if (pages.error) throw new Error("Could not load the project's documents.");
  return pages.data.map((d) => {
    const latest = [...(d.document_versions ?? [])].sort((a, b) => b.version_no - a.version_no)[0] ?? null;
    return {
      id: d.id,
      docCode: d.doc_code,
      title: d.title,
      siteId: d.site_id,
      siteName: d.site_id ? (siteMap.get(d.site_id) ?? null) : null,
      isApplicable: d.is_applicable,
      latestVersionNo: latest?.version_no ?? null,
      latestFileName: latest?.files?.original_name ?? null,
      latestFileSize: latest?.files?.size_bytes ?? null,
      hasOpenAssessment: !!latest && (latest.document_reviews ?? []).some((r) => r.status === "under_review"),
    };
  });
}
