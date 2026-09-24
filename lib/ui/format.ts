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

/** "14:30:00" (Postgres time) -> "14:30". Never renders "00:00" for a null value. */
export function formatTime(time: string | null): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}

export function activityModeLabel(mode: string): string {
  return mode === "on_site" ? "On-site" : mode === "online" ? "Online" : mode;
}

/**
 * Compact Master Plan date/time cell. A multi-day range (end_date differs from
 * start_date) shows dates only — mixing in times would produce an unreadable string.
 * A same-day activity shows the date plus a time range or single start time when set.
 */
export function formatActivityDateTime(
  startDate: string | null,
  startTime: string | null,
  endDate: string | null,
  endTime: string | null,
): string {
  if (!startDate) return "Undated";
  if (endDate && endDate !== startDate) {
    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }
  const start = formatTime(startTime);
  const end = formatTime(endTime);
  if (start && end) return `${formatDate(startDate)} · ${start}–${end}`;
  if (start) return `${formatDate(startDate)} · ${start}`;
  return formatDate(startDate);
}

/**
 * Overdue is derived, never stored (BR-63): effective end date is `endDate` if set,
 * else `startDate`; overdue when that date is before today and status is not
 * completed/cancelled. An undated activity is never overdue. Clock time is not
 * considered — a today's activity isn't overdue because its end_time already passed.
 * String comparison avoids timezone parsing.
 */
export function isActivityOverdue(activity: {
  status: string;
  startDate: string | null;
  endDate: string | null;
}): boolean {
  if (activity.status === "completed" || activity.status === "cancelled") return false;
  const effectiveEnd = activity.endDate ?? activity.startDate;
  if (!effectiveEnd) return false;
  const today = new Date().toISOString().slice(0, 10);
  return effectiveEnd < today;
}
