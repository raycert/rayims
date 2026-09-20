/**
 * Supabase public configuration. Read lazily so a missing value produces a clear
 * error at first use instead of breaking the build.
 * Only the publishable key is used here; no secret/service-role key is needed
 * in the foundation and none must ever be exposed to the browser.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Copy .env.example to .env.local and fill in the values.",
    );
  }

  return { url, key };
}
