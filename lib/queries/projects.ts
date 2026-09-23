import { createClient } from "@/lib/supabase/server";

export type ProjectListRow = {
  id: string;
  name: string;
  status: string;
  clientId: string;
  clientName: string;
  /** Sites assigned to the project (project_sites count). */
  sitesInScope: number;
  /** The client's current total sites — the denominator is live, never a frozen snapshot. */
  sitesTotal: number;
  frameworksCount: number;
};

/**
 * One query, two-level embed (projects -> client -> sites(count)) confirmed against
 * the hosted project: `client.sites[0].count` is the client's live site total, distinct
 * from `project_sites[0].count` (this project's actual scope).
 */
export async function listProjects(): Promise<ProjectListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, status, client_id, clients(name, sites(count)), project_sites(count), project_frameworks(count)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load projects.");

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    clientId: p.client_id,
    clientName: p.clients?.name ?? "",
    sitesInScope: p.project_sites[0]?.count ?? 0,
    sitesTotal: p.clients?.sites[0]?.count ?? 0,
    frameworksCount: p.project_frameworks[0]?.count ?? 0,
  }));
}

export type ClientOption = { id: string; name: string };
export type SiteOption = { id: string; name: string; address: string | null };
export type FrameworkOption = {
  id: string;
  code: string;
  edition: string;
  name: string;
  category: string | null;
};

export type ProjectFormCatalog = {
  /** All clients (for the unlocked global-create dropdown). */
  clients: ClientOption[];
  /** All sites, grouped by client_id — lets the form react to a client change with no round trip. */
  sitesByClient: Record<string, SiteOption[]>;
  /** Full framework catalog (reference data, not client-scoped). */
  frameworks: FrameworkOption[];
};

/** V1 scale (dozens of clients/sites) makes one upfront load cheaper and simpler than per-client fetches. */
export async function getProjectFormCatalog(): Promise<ProjectFormCatalog> {
  const supabase = await createClient();
  const [clientsRes, sitesRes, frameworksRes] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("sites").select("id, client_id, name, address").order("name"),
    supabase.from("frameworks").select("id, code, edition, name, category").order("category").order("code"),
  ]);
  if (clientsRes.error) throw new Error("Could not load clients.");
  if (sitesRes.error) throw new Error("Could not load sites.");
  if (frameworksRes.error) throw new Error("Could not load frameworks.");

  const sitesByClient: Record<string, SiteOption[]> = {};
  for (const s of sitesRes.data ?? []) {
    (sitesByClient[s.client_id] ??= []).push({ id: s.id, name: s.name, address: s.address });
  }

  return {
    clients: clientsRes.data ?? [],
    sitesByClient,
    frameworks: frameworksRes.data ?? [],
  };
}

export type ExistingProject = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  clientId: string;
  clientName: string;
  siteIds: string[];
  frameworkIds: string[];
};

/** Null when the project does not exist (caller should notFound()). */
export async function getProjectForEdit(projectId: string): Promise<ExistingProject | null> {
  const supabase = await createClient();
  const [projectRes, sitesRes, frameworksRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, status, start_date, end_date, client_id, clients(name)")
      .eq("id", projectId)
      .maybeSingle(),
    supabase.from("project_sites").select("site_id").eq("project_id", projectId),
    supabase.from("project_frameworks").select("framework_id").eq("project_id", projectId),
  ]);
  if (projectRes.error) throw new Error("Could not load the project.");
  if (!projectRes.data) return null;
  if (sitesRes.error) throw new Error("Could not load the project's sites.");
  if (frameworksRes.error) throw new Error("Could not load the project's frameworks.");

  return {
    id: projectRes.data.id,
    name: projectRes.data.name,
    status: projectRes.data.status,
    startDate: projectRes.data.start_date,
    endDate: projectRes.data.end_date,
    clientId: projectRes.data.client_id,
    clientName: projectRes.data.clients?.name ?? "",
    siteIds: (sitesRes.data ?? []).map((r) => r.site_id),
    frameworkIds: (frameworksRes.data ?? []).map((r) => r.framework_id),
  };
}

export type ProjectWorkspace = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  clientId: string;
  clientName: string;
  sites: { id: string; name: string; address: string | null }[];
  frameworks: { id: string; code: string; edition: string; name: string }[];
};

/** Null when the project does not exist (caller should notFound()). */
export async function getProjectWorkspace(projectId: string): Promise<ProjectWorkspace | null> {
  const supabase = await createClient();
  const projectRes = await supabase
    .from("projects")
    .select("id, name, status, start_date, end_date, client_id, clients(name)")
    .eq("id", projectId)
    .maybeSingle();
  if (projectRes.error) throw new Error("Could not load the project.");
  if (!projectRes.data) return null;

  const [sitesRes, frameworksRes] = await Promise.all([
    supabase.from("project_sites").select("sites(id, name, address)").eq("project_id", projectId),
    supabase.from("project_frameworks").select("frameworks(id, code, edition, name)").eq("project_id", projectId),
  ]);
  if (sitesRes.error) throw new Error("Could not load the project's sites.");
  if (frameworksRes.error) throw new Error("Could not load the project's frameworks.");

  return {
    id: projectRes.data.id,
    name: projectRes.data.name,
    status: projectRes.data.status,
    startDate: projectRes.data.start_date,
    endDate: projectRes.data.end_date,
    clientId: projectRes.data.client_id,
    clientName: projectRes.data.clients?.name ?? "",
    sites: (sitesRes.data ?? []).map((r) => r.sites).filter((s): s is NonNullable<typeof s> => s !== null),
    frameworks: (frameworksRes.data ?? [])
      .map((r) => r.frameworks)
      .filter((f): f is NonNullable<typeof f> => f !== null),
  };
}
