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

    async createSignedUrl(key, expiresInSeconds) {
      const { data, error } = await objects.createSignedUrl(key, expiresInSeconds);
      if (error || !data) {
        throw new Error(`Could not create signed URL: ${error?.message ?? "unknown"}`);
      }
      return data.signedUrl;
    },

    async remove(keys) {
      const { error } = await objects.remove(keys);
      if (error) throw new Error(`Storage remove failed: ${error.message}`);
    },
  };
}
