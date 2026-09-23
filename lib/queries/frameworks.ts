import { createClient } from "@/lib/supabase/server";

export type FrameworkListRow = {
  id: string;
  code: string;
  edition: string;
  name: string;
  category: string | null;
  itemCount: number;
  /** Assigned to at least one project (project_frameworks) — real FK state, never a demo flag. */
  referenced: boolean;
};

export async function listFrameworks(): Promise<FrameworkListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("frameworks")
    .select("id, code, edition, name, category, framework_items(count), project_frameworks(count)")
    .order("code")
    .order("edition");
  if (error) throw new Error("Could not load frameworks.");

  return (data ?? []).map((f) => ({
    id: f.id,
    code: f.code,
    edition: f.edition,
    name: f.name,
    category: f.category,
    itemCount: f.framework_items[0]?.count ?? 0,
    referenced: (f.project_frameworks[0]?.count ?? 0) > 0,
  }));
}

/**
 * Distinct category values currently in use across the catalog (sorted, raw stored
 * values). Drives the Category select in the Create/Edit Framework drawer — no new
 * taxonomy table, just what the existing data already contains.
 */
export async function listFrameworkCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("frameworks").select("category");
  if (error) throw new Error("Could not load framework categories.");

  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.category) set.add(row.category);
  }
  return [...set].sort();
}

export type FrameworkItemNode = {
  id: string;
  parentId: string | null;
  code: string | null;
  title: string;
  itemType: string;
  description: string | null;
  sortOrder: number;
  /** Referenced by document_framework_items, verification_items or issues — real FK state. */
  referenced: boolean;
  children: FrameworkItemNode[];
};

export type FrameworkDetail = {
  id: string;
  code: string;
  edition: string;
  name: string;
  category: string | null;
  description: string | null;
  /** Assigned to at least one project — real FK state. */
  referenced: boolean;
  itemCount: number;
  /** Flat list (for the parent picker / search), sorted by sort_order. */
  flatItems: FrameworkItemNode[];
  /** Root nodes with nested children, in sort_order (for the tree view). */
  tree: FrameworkItemNode[];
};

/** Null when the framework does not exist (caller should notFound()). */
export async function getFrameworkDetail(frameworkId: string): Promise<FrameworkDetail | null> {
  const supabase = await createClient();

  const frameworkRes = await supabase
    .from("frameworks")
    .select("id, code, edition, name, category, description, project_frameworks(count)")
    .eq("id", frameworkId)
    .maybeSingle();
  if (frameworkRes.error) throw new Error("Could not load the framework.");
  if (!frameworkRes.data) return null;

  const itemsRes = await supabase
    .from("framework_items")
    .select("id, parent_id, code, title, item_type, description, sort_order")
    .eq("framework_id", frameworkId)
    .order("sort_order");
  if (itemsRes.error) throw new Error("Could not load the framework's items.");

  const itemIds = (itemsRes.data ?? []).map((i) => i.id);
  const referencedIds = await getReferencedItemIds(supabase, itemIds);

  const flatItems: FrameworkItemNode[] = (itemsRes.data ?? []).map((i) => ({
    id: i.id,
    parentId: i.parent_id,
    code: i.code,
    title: i.title,
    itemType: i.item_type,
    description: i.description,
    sortOrder: i.sort_order,
    referenced: referencedIds.has(i.id),
    children: [],
  }));

  const tree = buildTree(flatItems);

  return {
    id: frameworkRes.data.id,
    code: frameworkRes.data.code,
    edition: frameworkRes.data.edition,
    name: frameworkRes.data.name,
    category: frameworkRes.data.category,
    description: frameworkRes.data.description,
    referenced: (frameworkRes.data.project_frameworks[0]?.count ?? 0) > 0,
    itemCount: flatItems.length,
    flatItems,
    tree,
  };
}

/**
 * A framework item is "referenced" (undeletable, per BR-53) when it's used by
 * document_framework_items, verification_items or issues. None of those
 * features exist yet in this phase, so this is normally empty — but it must
 * reflect real FK state, never a hardcoded/demo value.
 */
async function getReferencedItemIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemIds: string[],
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();

  const [docRes, verificationRes, issuesRes] = await Promise.all([
    supabase.from("document_framework_items").select("framework_item_id").in("framework_item_id", itemIds),
    supabase.from("verification_items").select("framework_item_id").in("framework_item_id", itemIds),
    supabase.from("issues").select("framework_item_id").in("framework_item_id", itemIds),
  ]);
  if (docRes.error || verificationRes.error || issuesRes.error) {
    throw new Error("Could not determine framework item usage.");
  }

  const ids = new Set<string>();
  for (const r of docRes.data ?? []) ids.add(r.framework_item_id);
  for (const r of verificationRes.data ?? []) if (r.framework_item_id) ids.add(r.framework_item_id);
  for (const r of issuesRes.data ?? []) if (r.framework_item_id) ids.add(r.framework_item_id);
  return ids;
}

function buildTree(flat: FrameworkItemNode[]): FrameworkItemNode[] {
  const byId = new Map(flat.map((n) => [n.id, { ...n, children: [] as FrameworkItemNode[] }]));
  const roots: FrameworkItemNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
