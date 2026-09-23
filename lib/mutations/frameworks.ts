"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { frameworkItemSchema, frameworkSchema } from "@/lib/validation/frameworks";
import { fieldErrorsFrom, type ActionResult } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseClient>>;

function isUniqueViolation(code: string | undefined) {
  return code === "23505";
}
function isForeignKeyViolation(code: string | undefined) {
  return code === "23503";
}

export async function createFramework(input: unknown): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = frameworkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.from("frameworks").insert(parsed.data).select("id").single();
  if (error) {
    if (isUniqueViolation(error.code)) {
      return {
        ok: false,
        error: "A framework with this code and edition already exists.",
        fieldErrors: { edition: "Already used with this code." },
      };
    }
    return { ok: false, error: "Couldn't save the framework. Try again." };
  }

  revalidatePath("/frameworks");
  return { ok: true, data: { id: data.id } };
}

export async function updateFramework(frameworkId: string, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = frameworkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("frameworks")
    .update(parsed.data)
    .eq("id", frameworkId)
    .select("id");
  if (error) {
    if (isUniqueViolation(error.code)) {
      return {
        ok: false,
        error: "A framework with this code and edition already exists.",
        fieldErrors: { edition: "Already used with this code." },
      };
    }
    return { ok: false, error: "Couldn't save the framework. Try again." };
  }
  // 0 rows: either the framework doesn't exist, or (BR-52/ADR-016) a non-admin's write was
  // silently filtered to nothing by RLS. requireAdmin() already rejects the latter case
  // before this point, so 0 rows here means "not found".
  if (!data || data.length === 0) return { ok: false, error: "This framework could not be found." };

  revalidatePath("/frameworks");
  revalidatePath(`/frameworks/${frameworkId}`);
  return { ok: true, data: undefined };
}

/**
 * Controlled delete (BR-53): a framework assigned to a project, or one whose own items are
 * referenced elsewhere, cannot be deleted — real FK integrity (23503), never a "seeded" flag.
 * Deleting an unreferenced framework cascades only to its own framework_items.
 */
export async function deleteFramework(frameworkId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.from("frameworks").delete().eq("id", frameworkId).select("id");
  if (error) {
    if (isForeignKeyViolation(error.code)) {
      return {
        ok: false,
        error: "This framework is in use and cannot be deleted.",
      };
    }
    return { ok: false, error: "Couldn't delete the framework. Try again." };
  }
  if (!data || data.length === 0) return { ok: false, error: "This framework could not be found." };

  revalidatePath("/frameworks");
  return { ok: true, data: undefined };
}

/** All ids belong to `frameworkId`? Used to validate a parent selection server-side. */
async function belongsToFramework(
  supabase: SupabaseServerClient,
  frameworkId: string,
  itemId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("framework_items")
    .select("id")
    .eq("id", itemId)
    .eq("framework_id", frameworkId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** All descendant ids of `itemId`, gathered breadth-first (V1 scale: a handful of levels/items). */
async function descendantIds(supabase: SupabaseServerClient, frameworkId: string, itemId: string): Promise<Set<string>> {
  const result = new Set<string>();
  let frontier = [itemId];
  while (frontier.length > 0) {
    const { data, error } = await supabase
      .from("framework_items")
      .select("id")
      .eq("framework_id", frameworkId)
      .in("parent_id", frontier);
    if (error) break;
    const nextIds = (data ?? []).map((r) => r.id).filter((id) => !result.has(id));
    if (nextIds.length === 0) break;
    nextIds.forEach((id) => result.add(id));
    frontier = nextIds;
  }
  return result;
}

/**
 * Validates parentId for `frameworkId` (and, on edit, that it isn't the item itself or one
 * of its descendants — BR-55). Cross-framework parents are rejected here too, ahead of the
 * database's own composite FK, so the error is a clear message rather than a raw 23503/23514.
 */
async function validateParent(
  supabase: SupabaseServerClient,
  frameworkId: string,
  parentId: string | undefined,
  editingItemId?: string,
): Promise<string | null> {
  if (!parentId) return null;

  if (editingItemId && parentId === editingItemId) {
    return "An item cannot be its own parent.";
  }
  if (!(await belongsToFramework(supabase, frameworkId, parentId))) {
    return "The selected parent item doesn't belong to this framework.";
  }
  if (editingItemId) {
    const descendants = await descendantIds(supabase, frameworkId, editingItemId);
    if (descendants.has(parentId)) {
      return "An item's parent cannot be one of its own sub-items.";
    }
  }
  return null;
}

export async function createFrameworkItem(
  frameworkId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = frameworkItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { parentId, code, title, description } = parsed.data;

  const supabase = await createSupabaseClient();

  const parentError = await validateParent(supabase, frameworkId, parentId);
  if (parentError) return { ok: false, error: parentError, fieldErrors: { parentId: parentError } };

  const { data: maxRow } = await supabase
    .from("framework_items")
    .select("sort_order")
    .eq("framework_id", frameworkId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("framework_items")
    .insert({
      framework_id: frameworkId,
      parent_id: parentId ?? null,
      code: code ?? null,
      title,
      // The normal Add Item form doesn't expose item_type; every item created through it
      // is a plain "item" (Slice 3 UI polish). The column stays free-text for future
      // non-ISO structures — it's just not client-controlled here.
      item_type: "item",
      description: description ?? null,
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();
  if (error) {
    if (isUniqueViolation(error.code)) {
      return {
        ok: false,
        error: "This code is already used by another item in this framework.",
        fieldErrors: { code: "Already used in this framework." },
      };
    }
    if (isForeignKeyViolation(error.code)) {
      return { ok: false, error: "The selected parent item doesn't belong to this framework." };
    }
    return { ok: false, error: "Couldn't save the item. Try again." };
  }

  revalidatePath(`/frameworks/${frameworkId}`);
  return { ok: true, data: { id: data.id } };
}

export async function updateFrameworkItem(
  itemId: string,
  frameworkId: string,
  input: unknown,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = frameworkItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { parentId, code, title, description } = parsed.data;

  const supabase = await createSupabaseClient();

  const parentError = await validateParent(supabase, frameworkId, parentId, itemId);
  if (parentError) return { ok: false, error: parentError, fieldErrors: { parentId: parentError } };

  const { data, error } = await supabase
    .from("framework_items")
    .update({
      parent_id: parentId ?? null,
      code: code ?? null,
      title,
      description: description ?? null,
      // item_type intentionally omitted: the normal Edit Item form doesn't expose it, so an
      // edit must never overwrite a seeded item's real item_type (e.g. "clause") with "item".
    })
    .eq("id", itemId)
    .eq("framework_id", frameworkId)
    .select("id");
  if (error) {
    if (isUniqueViolation(error.code)) {
      return {
        ok: false,
        error: "This code is already used by another item in this framework.",
        fieldErrors: { code: "Already used in this framework." },
      };
    }
    if (isForeignKeyViolation(error.code)) {
      return { ok: false, error: "The selected parent item doesn't belong to this framework." };
    }
    return { ok: false, error: "Couldn't save the item. Try again." };
  }
  if (!data || data.length === 0) return { ok: false, error: "This item could not be found." };

  revalidatePath(`/frameworks/${frameworkId}`);
  return { ok: true, data: undefined };
}

/**
 * Controlled delete (BR-53): an item with children, or one referenced by document/
 * verification/issue data, cannot be deleted. Children are checked first so the UI can
 * show a clear reason without attempting (and failing) the write; the referenced-elsewhere
 * case is still caught from the database (23503) as the authoritative fallback.
 */
export async function deleteFrameworkItem(itemId: string, frameworkId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const supabase = await createSupabaseClient();

  const { data: children, error: childrenError } = await supabase
    .from("framework_items")
    .select("id")
    .eq("parent_id", itemId)
    .limit(1);
  if (childrenError) return { ok: false, error: "Couldn't delete the item. Try again." };
  if (children && children.length > 0) {
    return { ok: false, error: "This item has sub-items and cannot be deleted. Delete its sub-items first." };
  }

  const { data, error } = await supabase
    .from("framework_items")
    .delete()
    .eq("id", itemId)
    .eq("framework_id", frameworkId)
    .select("id");
  if (error) {
    if (isForeignKeyViolation(error.code)) {
      return { ok: false, error: "This item is in use and cannot be deleted." };
    }
    return { ok: false, error: "Couldn't delete the item. Try again." };
  }
  if (!data || data.length === 0) return { ok: false, error: "This item could not be found." };

  revalidatePath(`/frameworks/${frameworkId}`);
  return { ok: true, data: undefined };
}
