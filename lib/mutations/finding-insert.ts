import type { TablesInsert } from "@/types/database";
import type { SupabaseServerClient } from "./scope-validation";

/**
 * A new Finding row WITHOUT `finding_no`. The number is assigned by the database at INSERT (trigger
 * `assign_finding_no`, per-project counter — ADR-019) and is never chosen or sent by the app or the
 * browser. The generated Insert type marks the NOT NULL column as required, hence the one cast here.
 */
export type NewFindingRow = Omit<TablesInsert<"issues">, "finding_no">;

/** The one insert path for Findings; returns the id and the number the database assigned. */
export function insertFinding(supabase: SupabaseServerClient, row: NewFindingRow) {
  return supabase
    .from("issues")
    .insert(row as TablesInsert<"issues">)
    .select("id, finding_no")
    .single();
}
