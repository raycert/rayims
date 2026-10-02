/** Requested page size; PostgREST may cap a response lower (`max_rows`, 1000 in supabase/config.toml). */
export const PAGE_SIZE = 1000;

/**
 * Reads a whole ORDERED result in pages, so a large project is never silently cut at the response
 * cap. The query should request `{ count: "exact" }`: reading continues until that many rows have
 * arrived, whatever the server's cap is (Phase 5G — a page shorter than requested no longer ends the
 * read on its own). One request for an ordinary project. Without a count, a short page ends the read.
 * The query must have a deterministic order, or pages can overlap / skip rows.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  let total: number | null = null;
  for (let from = 0; ; ) {
    const { data, error, count } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    if (typeof count === "number") total = count;
    const rows = data ?? [];
    all.push(...rows);
    from += rows.length;
    if (rows.length === 0) return { data: all, error: null };
    if (total !== null ? all.length >= total : rows.length < PAGE_SIZE) return { data: all, error: null };
  }
}
