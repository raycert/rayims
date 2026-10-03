/**
 * Helpers shared by the file exports (Gap Assessment .xlsx, Activity Report .docx): the viewer's time
 * zone (formatting only — Phase 5G), its calendar parts, XML-safe text and file-name parts.
 */

/** A time zone Intl knows (the viewer's, sent by the browser); anything else → UTC. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** Calendar parts of a moment in a time zone ("2026", "10", "03", "14", "05"). */
export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}

/** Characters XML 1.0 cannot hold would corrupt an Office file; everything else is kept as typed. */
export const xmlSafe = (v: string | null | undefined) => (v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/**
 * A file-name part without accents or unsafe characters: "Chinh Long – IMS 2026" → "Chinh-Long-IMS-2026"
 * (Vietnamese đ → d; everything but letters and digits collapses to "-"; at most `max` characters).
 */
export function fileNamePart(text: string, fallback: string, max = 80): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/, "") || fallback
  );
}
