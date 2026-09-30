import { createClient } from "@/lib/supabase/server";
import { formatFrameworkIdentity } from "@/lib/ui/format";
import { siteNameMap } from "./activities";

export type DocumentImportCatalog = {
  sites: { id: string; name: string }[];
  /** Every framework that exists (lets the import tell "unknown" from "not assigned"). */
  allFrameworkIdentities: string[];
  /** Frameworks assigned to this project, with their coded items only. */
  assignedFrameworks: { id: string; identity: string; items: { id: string; code: string }[] }[];
  /** Existing project Documents, reduced to the identity (title + site) and code. */
  existingDocuments: { title: string; siteId: string | null; docCode: string | null }[];
};

/**
 * Everything the Required Document import needs to validate a whole workbook, loaded once per
 * request (Preview and Import each call this fresh). Four batched queries; no per-row access.
 */
export async function getDocumentImportCatalog(projectId: string): Promise<DocumentImportCatalog> {
  const supabase = await createClient();
  const [siteMap, assignedRes, frameworksRes, docsRes] = await Promise.all([
    siteNameMap(supabase, projectId),
    supabase
      .from("project_frameworks")
      .select("framework_id, frameworks(id, code, edition, framework_items(id, code))")
      .eq("project_id", projectId),
    supabase.from("frameworks").select("code, edition"),
    supabase.from("documents").select("title, site_id, doc_code").eq("project_id", projectId),
  ]);
  if (assignedRes.error) throw new Error("Could not load the project's frameworks.");
  if (frameworksRes.error) throw new Error("Could not load frameworks.");
  if (docsRes.error) throw new Error("Could not load the project's documents.");

  return {
    sites: [...siteMap].map(([id, name]) => ({ id, name })),
    allFrameworkIdentities: (frameworksRes.data ?? []).map((f) => formatFrameworkIdentity(f.code, f.edition)),
    assignedFrameworks: (assignedRes.data ?? []).flatMap((row) => {
      const fw = row.frameworks;
      if (!fw) return [];
      return [
        {
          id: fw.id,
          identity: formatFrameworkIdentity(fw.code, fw.edition),
          items: (fw.framework_items ?? []).filter((i): i is { id: string; code: string } => !!i.code),
        },
      ];
    }),
    existingDocuments: (docsRes.data ?? []).map((d) => ({ title: d.title, siteId: d.site_id, docCode: d.doc_code })),
  };
}
