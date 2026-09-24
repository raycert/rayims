import { createClient } from "@/lib/supabase/server";

export type ActivityTypeRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Referenced by at least one Activity — real FK state, never a demo flag. */
  referenced: boolean;
};

export async function listActivityTypes(): Promise<ActivityTypeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_types")
    .select("id, key, label, description, sort_order, is_active, activities(count)")
    .order("sort_order")
    .order("label");
  if (error) throw new Error("Could not load Activity Types.");

  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    description: r.description,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    referenced: (r.activities[0]?.count ?? 0) > 0,
  }));
}
