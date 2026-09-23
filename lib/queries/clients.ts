import { createClient } from "@/lib/supabase/server";

export type ClientListRow = {
  id: string;
  name: string;
  status: string;
  notes: string | null;
  sitesCount: number;
  projectsCount: number;
};

/**
 * Clients with real site/project counts, via PostgREST embedded-count selects
 * (`sites(count)`, `projects(count)`) — no separate round trips per client.
 */
export async function listClients(): Promise<ClientListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, status, notes, sites(count), projects(count)")
    .order("name");
  if (error) throw new Error("Could not load clients.");

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    notes: c.notes,
    sitesCount: c.sites[0]?.count ?? 0,
    projectsCount: c.projects[0]?.count ?? 0,
  }));
}

export type SiteRow = {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  /** True when the site is in a project's site scope (project_sites); delete is blocked. */
  inUse: boolean;
};

export type ClientProjectRow = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
};

export type ClientDetail = {
  id: string;
  name: string;
  status: string;
  notes: string | null;
  sites: SiteRow[];
  projects: ClientProjectRow[];
};

/** Null when the client does not exist (caller should notFound()). */
export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  const supabase = await createClient();

  const [clientRes, sitesRes, projectsRes] = await Promise.all([
    supabase.from("clients").select("id, name, status, notes").eq("id", clientId).maybeSingle(),
    supabase
      .from("sites")
      .select("id, name, address, notes, project_sites(count)")
      .eq("client_id", clientId)
      .order("name"),
    supabase
      .from("projects")
      .select("id, name, status, start_date")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  ]);

  if (clientRes.error) throw new Error("Could not load the client.");
  if (!clientRes.data) return null;
  if (sitesRes.error) throw new Error("Could not load sites.");
  if (projectsRes.error) throw new Error("Could not load projects.");

  return {
    id: clientRes.data.id,
    name: clientRes.data.name,
    status: clientRes.data.status,
    notes: clientRes.data.notes,
    sites: (sitesRes.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      notes: s.notes,
      inUse: (s.project_sites[0]?.count ?? 0) > 0,
    })),
    projects: (projectsRes.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      startDate: p.start_date,
    })),
  };
}
