import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider } from "./types";

export const SUPABASE_PROVIDER_NAME = "supabase";

/** Supabase Storage implementation of StorageProvider (private bucket, RLS applies). */
export function createSupabaseStorage(
  client: SupabaseClient,
  bucket: string,
): StorageProvider {
  const objects = client.storage.from(bucket);

  return {
    name: SUPABASE_PROVIDER_NAME,

    async upload(key, body, options) {
      const { error } = await objects.upload(key, body, {
        contentType: options.contentType,
        upsert: false,
      });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },

    async createSignedUrl(key, expiresInSeconds, options) {
      const { data, error } = await objects.createSignedUrl(
        key,
        expiresInSeconds,
        options?.downloadName ? { download: options.downloadName } : undefined,
      );
      if (error || !data) {
        throw new Error(`Could not create signed URL: ${error?.message ?? "unknown"}`);
      }
      return data.signedUrl;
    },

    async stat(key) {
      try {
        const { data, error } = await objects.info(key);
        if (error || !data) return null;
        return { size: typeof data.size === "number" ? data.size : null };
      } catch {
        return null;
      }
    },

    async remove(keys) {
      const { error } = await objects.remove(keys);
      if (error) throw new Error(`Storage remove failed: ${error.message}`);
    },
  };
}
