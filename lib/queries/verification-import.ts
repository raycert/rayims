import { createClient } from "@/lib/supabase/server";
import { composeActivityIdentity } from "@/lib/import/verification-workbook";
import { formatFrameworkIdentity } from "@/lib/ui/format";
import { siteNameMap } from "./activities";

export type ImportCatalog = {
  sites: { id: string; name: string }[];
  activities: { id: string; identity: string; siteId: string | null; siteName: string | null }[];
  /** Every framework that exists (lets the import tell "unknown" from "not assigned"). */
  allFrameworkIdentities: string[];
  /** Frameworks assigned to this project, with their coded items only. */
  assignedFrameworks: { id: string; identity: string; items: { id: string; code: string }[] }[];
  /** Existing project verification items, reduced to the duplicate-comparison key. */
  existingItems: { question: string; siteId: string | null; targetActivityId: string | null; frameworkItemId: string | null }[];
};

/**
 * Everything the import needs to validate a whole workbook, loaded once per request
 * (Preview and Import each call this fresh — a preview's resolution is never reused).
 */
export async function getVerificationImportCatalog(projectId: string): Promise<ImportCatalog> {
  const supabase = await createClient();
  const [siteMap, activitiesRes, assignedRes, frameworksRes, existingRes] = await Promise.all([
    siteNameMap(supabase, projectId),
    supabase.from("activities").select("id, name, start_date, start_time, site_id").eq("project_id", projectId),
    supabase
      .from("project_frameworks")
      .select("framework_id, frameworks(id, code, edition, framework_items(id, code))")
      .eq("project_id", projectId),
    supabase.from("frameworks").select("code, edition"),
    supabase
      .from("verification_items")
      .select("question, site_id, target_activity_id, framework_item_id")
      .eq("project_id", projectId),
  ]);
  if (activitiesRes.error) throw new Error("Could not load the project's activities.");
  if (assignedRes.error) throw new Error("Could not load the project's frameworks.");
  if (frameworksRes.error) throw new Error("Could not load frameworks.");
  if (existingRes.error) throw new Error("Could not load the project's verification items.");

  return {
    sites: [...siteMap].map(([id, name]) => ({ id, name })),
    activities: (activitiesRes.data ?? []).map((a) => {
      const siteName = a.site_id ? (siteMap.get(a.site_id) ?? null) : null;
      return {
        id: a.id,
        siteId: a.site_id,
        siteName,
        identity: composeActivityIdentity({
          startDate: a.start_date,
          startTime: a.start_time,
          siteName,
          name: a.name,
        }),
      };
    }),
    allFrameworkIdentities: (frameworksRes.data ?? []).map((f) => formatFrameworkIdentity(f.code, f.edition)),
    assignedFrameworks: (assignedRes.data ?? []).flatMap((row) => {
      const fw = row.frameworks;
      if (!fw) return [];
      return [
        {
          id: fw.id,
          identity: formatFrameworkIdentity(fw.code, fw.edition),
          items: (fw.framework_items ?? [])
            .filter((i): i is { id: string; code: string } => !!i.code)
            .map((i) => ({ id: i.id, code: i.code })),
        },
      ];
    }),
    existingItems: (existingRes.data ?? []).map((v) => ({
      question: v.question,
      siteId: v.site_id,
      targetActivityId: v.target_activity_id,
      frameworkItemId: v.framework_item_id,
    })),
  };
}
