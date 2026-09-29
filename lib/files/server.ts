import type { StorageProvider } from "@/lib/storage";
import type { SupabaseServerClient } from "@/lib/mutations/scope-validation";

/**
 * Shared server-side file helpers (Phase 5B), used by Evidence and Document Versions. Deliberately
 * NOT a "use server" module: these are internal steps, never callable Server Actions. They know
 * nothing about attachments or document versions — each lifecycle keeps its own parent rules.
 */

export const SIGNED_URL_SECONDS = 60;
export const FILE_UNAVAILABLE = "File is unavailable.";

/** A server-generated key of this project: `{projectId}/{uuid}-{sanitized-name}` (lib/storage/keys). */
export function isProjectStorageKey(projectId: string, key: string): boolean {
  return key.startsWith(`${projectId}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}-[A-Za-z0-9._-]+$/i.test(key);
}

/**
 * Removes a just-uploaded object — but NEVER one already registered in `files` (a re-sent or
 * foreign key must not delete someone else's file). Best effort: an unreferenced object left
 * behind is found later by its project prefix (manual cleanup, see 10_RUNBOOK).
 */
export async function discardUnregisteredObject(supabase: SupabaseServerClient, storage: StorageProvider, key: string): Promise<void> {
  try {
    const { data: registered } = await supabase.from("files").select("id").eq("storage_key", key).maybeSingle();
    if (registered) return;
    await storage.remove([key]);
  } catch {
    // Best effort.
  }
}

/** true when a `files` row already uses this key (null = could not check). */
export async function isKeyRegistered(supabase: SupabaseServerClient, key: string): Promise<boolean | null> {
  const { data, error } = await supabase.from("files").select("id").eq("storage_key", key).maybeSingle();
  if (error) return null;
  return !!data;
}

/** The real size of the stored object (null = the object does not exist). */
export async function storedObjectSize(storage: StorageProvider, key: string, declaredSize: number): Promise<number | null> {
  const stat = await storage.stat(key);
  if (!stat) return null;
  return stat.size ?? declaredSize;
}

export async function insertFileRow(
  supabase: SupabaseServerClient,
  row: { projectId: string; provider: string; key: string; originalName: string; mimeType: string; size: number; uploadedBy: string },
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("files")
    .insert({
      project_id: row.projectId,
      storage_provider: row.provider,
      storage_key: row.key,
      original_name: row.originalName.slice(0, 255),
      mime_type: row.mimeType,
      size_bytes: row.size,
      uploaded_by: row.uploadedBy,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return { id: data.id };
}

/**
 * Short-lived signed URL (SIGNED_URL_SECONDS), generated only on request and never stored. A
 * missing object returns null (never a working-looking link). Download keeps the original name.
 */
export async function createFileSignedUrl(
  storage: StorageProvider,
  key: string,
  originalName: string,
  mode: "view" | "download",
): Promise<string | null> {
  if (!(await storage.stat(key))) return null;
  try {
    return await storage.createSignedUrl(key, SIGNED_URL_SECONDS, mode === "download" ? { downloadName: originalName } : undefined);
  } catch {
    return null;
  }
}

/** Removes a stored object; false when Storage refused (the caller reports manual cleanup). */
export async function removeStoredObject(storage: StorageProvider, key: string): Promise<boolean> {
  try {
    await storage.remove([key]);
    return true;
  } catch {
    return false;
  }
}
