import ExcelJS from "exceljs";

/** Server-side only: parses untrusted uploaded workbooks and generates the template. */

export const DATA_SHEET_NAME = "Verification Items";
export const INSTRUCTIONS_SHEET_NAME = "Instructions";
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 300;
export const PROJECT_WIDE_LABEL = "Project-wide";

export const HEADERS = {
  question: "Check / Question",
  priority: "Priority",
  site: "Site",
  targetActivity: "Target Activity",
  framework: "Framework",
  frameworkItem: "Framework Item",
} as const;

type HeaderKey = keyof typeof HEADERS;
const HEADER_KEYS = Object.keys(HEADERS) as HeaderKey[];

export type RawImportRow = {
  /** The row's number in the Excel sheet (header = 1). */
  rowNumber: number;
  question: string;
  priority: string;
  site: string;
  targetActivity: string;
  framework: string;
  frameworkItem: string;
};

/** Trims each "|"-separated part so harmless spacing differences never change a match. */
export function normalizeActivityIdentity(value: string): string {
  return value
    .split("|")
    .map((part) => part.trim())
    .join(" | ");
}

/**
 * The ONE composer for a Target Activity's human-readable identity. Used by the template,
 * preview validation and import revalidation alike. Deliberately not a display formatter:
 * it never elides a field.
 *   dated + timed : 2026-10-27 | 09:00 | Viet Long | Site Assessment
 *   dated         : 2026-10-27 | Viet Long | Site Assessment
 *   undated       : Undated | Viet Long | Site Assessment
 *   project-wide  : same shapes with "Project-wide" in the site slot
 */
export function composeActivityIdentity(activity: {
  startDate: string | null;
  startTime: string | null;
  siteName: string | null;
  name: string;
}): string {
  const parts: string[] = [];
  if (activity.startDate) {
    parts.push(activity.startDate);
    const time = activity.startTime?.slice(0, 5);
    if (time) parts.push(time);
  } else {
    parts.push("Undated");
  }
  parts.push(activity.siteName ?? PROJECT_WIDE_LABEL);
  parts.push(activity.name);
  return normalizeActivityIdentity(parts.join(" | "));
}

export type ParseResult = { ok: true; rows: RawImportRow[] } | { ok: false; error: string };

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Plain text of a cell; a formula is read for its stored result only, never evaluated. */
function cellText(cell: ExcelJS.Cell): string {
  try {
    return (cell.text ?? "").trim();
  } catch {
    return "";
  }
}

const UNREADABLE = "Could not read this file. Use a .xlsx workbook, ideally the template downloaded from this page.";

export async function parseVerificationWorkbook(bytes: Uint8Array): Promise<ParseResult> {
  // An .xlsx is a zip archive: reject anything else (e.g. a CSV renamed to .xlsx) up front.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return { ok: false, error: UNREADABLE };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  } catch {
    return { ok: false, error: UNREADABLE };
  }

  const sheet = workbook.worksheets.find((s) => s.name.trim().toLowerCase() === DATA_SHEET_NAME.toLowerCase());
  if (!sheet) {
    return { ok: false, error: `The workbook has no "${DATA_SHEET_NAME}" sheet. Use the template downloaded from this page.` };
  }

  const columnByKey = new Map<HeaderKey, number>();
  const headerByNormalized = new Map<string, HeaderKey>(HEADER_KEYS.map((k) => [normalizeHeader(HEADERS[k]), k]));
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = headerByNormalized.get(normalizeHeader(cellText(cell)));
    if (key && !columnByKey.has(key)) columnByKey.set(key, colNumber);
  });
  const missing = HEADER_KEYS.filter((k) => !columnByKey.has(k)).map((k) => HEADERS[k]);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required column${missing.length > 1 ? "s" : ""} in the first row of "${DATA_SHEET_NAME}": ${missing.join(", ")}.`,
    };
  }

  const rows: RawImportRow[] = [];
  let overLimit = false;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1 || overLimit) return;
    const text = (key: HeaderKey) => cellText(row.getCell(columnByKey.get(key)!));
    const parsed: RawImportRow = {
      rowNumber,
      question: text("question"),
      priority: text("priority"),
      site: text("site"),
      targetActivity: text("targetActivity"),
      framework: text("framework"),
      frameworkItem: text("frameworkItem"),
    };
    const blank = HEADER_KEYS.every((k) => parsed[k] === "");
    if (blank) return;
    if (rows.length >= MAX_IMPORT_ROWS) {
      overLimit = true;
      return;
    }
    rows.push(parsed);
  });

  if (overLimit) {
    return { ok: false, error: `This workbook has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files.` };
  }
  if (rows.length === 0) {
    return { ok: false, error: `No data rows found. Add checks below the header row in the "${DATA_SHEET_NAME}" sheet.` };
  }
  return { ok: true, rows };
}

export type TemplateContext = {
  sites: string[];
  /** Target Activity identities, already composed by composeActivityIdentity. */
  activityIdentities: string[];
  /** A site-specific identity, if the project has one (used for the inference example). */
  siteActivityExample: string | null;
  frameworks: string[];
  frameworkExample: { framework: string; itemCode: string } | null;
};

const NAVY = "FF1F3A5F";

export async function buildVerificationTemplate(ctx: TemplateContext): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RayIMS";

  const data = workbook.addWorksheet(DATA_SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  data.columns = [
    { header: HEADERS.question, key: "question", width: 56 },
    { header: HEADERS.priority, key: "priority", width: 12 },
    { header: HEADERS.site, key: "site", width: 24 },
    { header: HEADERS.targetActivity, key: "targetActivity", width: 62 },
    { header: HEADERS.framework, key: "framework", width: 22 },
    { header: HEADERS.frameworkItem, key: "frameworkItem", width: 16 },
  ];
  // Text format, so a code such as "8.10" is never turned into the number 8.1.
  for (let c = 1; c <= 6; c += 1) data.getColumn(c).numFmt = "@";
  const header = data.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  header.alignment = { vertical: "middle" };

  const guide = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME);
  guide.getColumn(1).width = 58;
  for (let c = 2; c <= 6; c += 1) guide.getColumn(c).width = c === 4 ? 62 : 22;

  const heading = (text: string) => {
    const row = guide.addRow([text]);
    row.font = { bold: true, size: 12 };
  };
  const line = (text: string) => guide.addRow([text]);

  heading("How to fill in the Verification Items sheet");
  line("Add one check per row, starting on row 2 of the Verification Items sheet. Do not rename or remove the header row.");
  line("Check / Question: required. The check to verify.");
  line("Priority: optional. Low, Medium or High. Blank means Medium.");
  line("Site: optional. Blank means Project-wide, unless the Target Activity belongs to a site (then that site is used).");
  line("Target Activity: optional. Copy a value exactly from the list below.");
  line("Framework and Framework Item: optional pair. Fill in both, or leave both blank. Framework Item is the item's code, for example 8.1.");
  line("If you enter a Site and the Target Activity belongs to a different site, the import is rejected.");
  line("If any row has an error, nothing is imported. Fix the file and upload it again.");
  line("Only the Verification Items sheet is imported. This sheet is for guidance only.");
  guide.addRow([]);

  heading("Examples (illustration only - these rows are NOT imported)");
  const exampleHeader = guide.addRow(Object.values(HEADERS));
  exampleHeader.font = { bold: true };
  guide.addRow(["EXAMPLE: Review the internal audit schedule (project-wide check)", "", "", "", "", ""]);
  guide.addRow([
    "EXAMPLE: Check chemical storage and secondary containment (high priority)",
    "High",
    ctx.sites[0] ?? "Site A",
    "",
    "",
    "",
  ]);
  guide.addRow([
    "EXAMPLE: Verify emergency exit signage (Site taken from the Target Activity)",
    "",
    "",
    ctx.siteActivityExample ?? "2026-10-27 | 09:00 | Site A | Site Assessment",
    "",
    "",
  ]);
  guide.addRow([
    "EXAMPLE: Confirm documented information is controlled (framework requirement)",
    "Medium",
    "",
    "",
    ctx.frameworkExample?.framework ?? "ISO 9001:2015",
    ctx.frameworkExample?.itemCode ?? "7.5",
  ]);
  guide.addRow([]);

  heading("This project's Sites (copy exactly)");
  if (ctx.sites.length === 0) line("(none)");
  for (const s of ctx.sites) line(s);
  guide.addRow([]);

  heading("This project's Target Activities (copy exactly)");
  line("Format: date | time | site | name. Undated activities start with Undated; project-wide activities show Project-wide.");
  if (ctx.activityIdentities.length === 0) line("(none yet)");
  for (const a of ctx.activityIdentities) line(a);
  guide.addRow([]);

  heading("This project's Frameworks (copy exactly)");
  if (ctx.frameworks.length === 0) line("(none assigned)");
  for (const f of ctx.frameworks) line(f);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
