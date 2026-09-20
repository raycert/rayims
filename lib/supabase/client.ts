import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/** Supabase client for Client Components (runs in the browser, uses RLS). */
export function createClient() {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient(url, key);
}
