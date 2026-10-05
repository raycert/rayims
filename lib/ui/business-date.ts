/**
 * Business dates (Phase 7A). A business date is a plain calendar day ("2026-10-03"): an Action's due
 * date, an Activity's start / end date, a Version's received date. It is NOT a moment, so it must
 * read as the same day for every viewer — never shifted by a time zone — and "today" is the
 * VIEWER's local calendar day, not the server's UTC day. Pure functions; no React, no I/O.
 */

const DATE_PARTS = { year: "numeric", month: "2-digit", day: "2-digit" } as const;

/**
 * The calendar day of `now` as YYYY-MM-DD in `timeZone`; without a time zone, in the runtime's own
 * (the browser's) zone. Intl is used instead of Date arithmetic so DST and odd offsets are exact.
 */
export function dateInZone(now: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { ...DATE_PARTS, ...(timeZone ? { timeZone } : {}) }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The server's UTC day — only a stand-in for "today" where the viewer's zone is unknown (server render). */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** YYYY-MM-DD plus whole days, as a calendar operation (no time zone involved). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A date-only value as text. The value is parsed as UTC midnight and formatted in UTC, so the day
 * printed is the day stored in every time zone (−12 … +14). Timestamps (moments) must not use this.
 */
export function formatBusinessDate(date: string, locale?: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Local "today" is always within one day of the server's UTC day (zones run from UTC−12 to UTC+14).
 * Server queries that depend on the viewer's today therefore split the dates into
 *   definitely before today  (< utcToday − 1)  |  undecided (utcToday − 1 … utcToday)  |  later
 * and let the browser decide the undecided days with its own today (see lib/queries/home.ts).
 */
export function todayBand(serverToday: string = utcToday()): { dayBefore: string; today: string } {
  return { dayBefore: addDays(serverToday, -1), today: serverToday };
}
