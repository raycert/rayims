/** "ISO 9001" + "2015" -> "ISO 9001:2015" — the reference identity used across Projects screens. */
export function formatFrameworkIdentity(code: string, edition: string): string {
  return `${code}:${edition}`;
}

/** "management_system" -> "Management System" — cosmetic only; the stored value never changes. */
export function humanizeCategory(category: string): string {
  return category
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
