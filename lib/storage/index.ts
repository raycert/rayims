import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseStorage } from "./supabase";
import type { StorageProvider } from "./types";

export { buildStorageKey } from "./keys";
export type { StorageProvider } from "./types";

/** Bucket name is configuration, never stored in database rows. */
export const STORAGE_BUCKET =
  process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "rayims-files";

/**
 * The only place that chooses the storage provider. All other code must call
 * this (or receive a StorageProvider) instead of using Supabase Storage directly.
 */
export function getStorage(client: SupabaseClient): StorageProvider {
  return createSupabaseStorage(client, STORAGE_BUCKET);
}
