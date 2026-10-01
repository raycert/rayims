/** PostgREST caps every response at `max_rows` (1000, supabase/config.toml). */
export const PAGE_SIZE = 1000;

/**
 * Reads a whole ORDERED result in pages of PAGE_SIZE, so a large project is never silently cut
 * at the response cap. One request for results under 1000 rows (the normal case). The query
 * passed in must have a deterministic order, or pages can overlap / skip rows.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: all, error: null };
  }
}
