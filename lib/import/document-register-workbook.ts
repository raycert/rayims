import ExcelJS from "exceljs";

/**
 * Required Document register import (Phase 5E). Server-side only: parses untrusted uploaded
 * workbooks and generates the template. Imports the REQUIRED DOCUMENT list only — never files,
 * versions, assessment results, Findings or evidence.
 */

export const DATA_SHEET_NAME = "Required Documents";
export const INSTRUCTIONS_SHEET_NAME = "Instructions";
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;
/** The header row is searched in the first rows of the sheet (title banners above the table). */
export const HEADER_SCAN_ROWS = 10;
export const PROJECT_WIDE_LABEL = "Project-wide";

/** Canonical template headers. */
export const HEADERS = {
  framework: "Framework",
  requirement: "Framework Requirement",
  title: "Required Document",
  code: "Document Code",
  type: "Document Type",
  owner: "Owner",
  site: "Site",
  applicable: "Applicable",
  expectedRecords: "Expected Records",
} as const;

type HeaderKey = keyof typeof HEADERS;
const HEADER_KEYS = Object.keys(HEADERS) as HeaderKey[];

/** Accepted alternative headers (common in existing ISO gap-assessment workbooks). */
const ALIASES: Record<HeaderKey, string[]> = {
  framework: [],
  requirement: ["Clause", "Clause / Requirement", "Requirement"],
  title: ["Document Required", "Required Documents"],
  code: [],
  type: [],
  owner: ["PIC"],
  site: [],
  applicable: [],
  expectedRecords: ["Required Evidence", "Records", "Expected Records / Required Evidence"],
};

export type RawDocumentRow = {
  /** The row's number in the Excel sheet (as Excel shows it; the header row may be below a banner). */
  rowNumber: number;
  framework: string;
  requirement: string;
  title: string;
  code: string;
  type: string;
  owner: string;
  site: string;
  applicable: string;
  /** Expected Records / Required Evidence (Phase 7D): multiline cell text, line breaks kept. */
  expectedRecords: string;
  /** Headers of formula cells that have no stored value (never evaluated). */
  unreadableFormulas: string[];
};

export type ParseResult = { ok: true; rows: RawDocumentRow[] } | { ok: false; error: string };

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Displayed text of a cell. A formula is read for its stored (cached) result only, never
 * evaluated; a formula without a stored result is reported. Numbers are read as Excel shows them
 * (7.5 stays "7.5"); codes such as "8.10" must be typed as text — the template column is text.
 */
function readCell(cell: ExcelJS.Cell): { text: string; unreadable: boolean } {
  try {
    if (cell.type === ExcelJS.ValueType.Formula) {
      const result = (cell.value as ExcelJS.CellFormulaValue | null)?.result;
      if (result === undefined || result === null || typeof result === "object") return { text: "", unreadable: true };
      return { text: String(result).trim(), unreadable: false };
    }
    return { text: (cell.text ?? "").trim(), unreadable: false };
  } catch {
    return { text: "", unreadable: true };
  }
}

const UNREADABLE = "Could not read this file. Use a .xlsx workbook, ideally the template downloaded from this page.";

export async function parseDocumentRegisterWorkbook(bytes: Uint8Array): Promise<ParseResult> {
  // An .xlsx is a zip archive: reject anything else (e.g. a CSV renamed to .xlsx) up front.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { ok: false, error: UNREADABLE };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  } catch {
    return { ok: false, error: UNREADABLE };
  }

  // The template's sheet by name; otherwise the first sheet (existing client workbooks).
  const sheet =
    workbook.worksheets.find((s) => s.name.trim().toLowerCase() === DATA_SHEET_NAME.toLowerCase()) ?? workbook.worksheets[0];
  if (!sheet) return { ok: false, error: UNREADABLE };

  const keyByHeader = new Map<string, HeaderKey>();
  for (const k of HEADER_KEYS) {
    keyByHeader.set(normalizeHeader(HEADERS[k]), k);
    for (const alias of ALIASES[k]) keyByHeader.set(normalizeHeader(alias), k);
  }
  // Header row (Phase 5G): existing client workbooks often have a title / project banner above the
  // table, so the header is searched in the first HEADER_SCAN_ROWS rows: the row with a Required
  // Document column and the most recognized headers (the earliest on a tie). Rows above it are ignored.
  let headerRow = 0;
  let bestCount = 0;
  for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, sheet.rowCount); r += 1) {
    const keys = new Set<HeaderKey>();
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const key = keyByHeader.get(normalizeHeader(readCell(cell).text));
      if (key) keys.add(key);
    });
    if (keys.has("title") && keys.size > bestCount) {
      headerRow = r;
      bestCount = keys.size;
    }
  }
  if (!headerRow) {
    return {
      ok: false,
      error: `No "${HEADERS.title}" column was found in the first ${HEADER_SCAN_ROWS} rows of the "${sheet.name}" sheet.`,
    };
  }

  const columnByKey = new Map<HeaderKey, number>();
  const duplicateHeaders: string[] = [];
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = keyByHeader.get(normalizeHeader(readCell(cell).text));
    if (!key) return; // unknown columns are ignored
    if (columnByKey.has(key)) duplicateHeaders.push(HEADERS[key]);
    else columnByKey.set(key, colNumber);
  });
  if (duplicateHeaders.length > 0) {
    return {
      ok: false,
      error: `More than one column is read as "${duplicateHeaders[0]}" (check for a repeated or alias header such as Clause / Framework Requirement). Keep only one.`,
    };
  }

  const rows: RawDocumentRow[] = [];
  let overLimit = false;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRow || overLimit) return;
    const unreadableFormulas: string[] = [];
    const text = (key: HeaderKey) => {
      const col = columnByKey.get(key);
      if (!col) return "";
      const r = readCell(row.getCell(col));
      if (r.unreadable) unreadableFormulas.push(HEADERS[key]);
      return r.text;
    };
    const parsed: RawDocumentRow = {
      rowNumber,
      framework: text("framework"),
      requirement: text("requirement"),
      title: text("title"),
      code: text("code"),
      type: text("type"),
      owner: text("owner"),
      site: text("site"),
      applicable: text("applicable"),
      expectedRecords: text("expectedRecords"),
      unreadableFormulas,
    };
    const blank = HEADER_KEYS.every((k) => parsed[k] === "") && unreadableFormulas.length === 0;
    if (blank) return;
    if (rows.length >= MAX_IMPORT_ROWS) {
      overLimit = true;
      return;
    }
    rows.push(parsed);
  });

  if (overLimit) return { ok: false, error: `This workbook has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files.` };
  if (rows.length === 0) return { ok: false, error: `No data rows found below the header row of the "${sheet.name}" sheet.` };
  return { ok: true, rows };
}

export type TemplateContext = {
  sites: string[];
  frameworks: string[];
  frameworkExample: { framework: string; code: string } | null;
};

const NAVY = "FF1F3A5F";

export async function buildDocumentRegisterTemplate(ctx: TemplateContext): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RayIMS";

  const data = workbook.addWorksheet(DATA_SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  data.columns = [
    { header: HEADERS.framework, key: "framework", width: 18 },
    { header: HEADERS.requirement, key: "requirement", width: 22 },
    { header: HEADERS.title, key: "title", width: 52 },
    { header: HEADERS.code, key: "code", width: 16 },
    { header: HEADERS.type, key: "type", width: 16 },
    { header: HEADERS.owner, key: "owner", width: 22 },
    { header: HEADERS.site, key: "site", width: 20 },
    { header: HEADERS.applicable, key: "applicable", width: 12 },
    { header: HEADERS.expectedRecords, key: "expectedRecords", width: 44 },
  ];
  // Text format, so a clause such as "8.10" is never turned into the number 8.1.
  for (let c = 1; c <= 9; c += 1) data.getColumn(c).numFmt = "@";
  data.getColumn(9).alignment = { wrapText: true, vertical: "top" };
  const header = data.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };

  const guide = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME);
  guide.getColumn(1).width = 60;
  for (let c = 2; c <= 8; c += 1) guide.getColumn(c).width = c === 3 ? 46 : 18;
  const heading = (text: string) => {
    guide.addRow([text]).font = { bold: true, size: 12 };
  };
  const line = (text: string) => guide.addRow([text]);

  heading("Import the list of documents required for this project");
  line("Files and Gap Assessment results are added later in RayIMS — this sheet only lists the required documents.");
  line("One document per row on the Required Documents sheet, starting on row 2. Keep the header row.");
  line("Required Document: required. The document's title, e.g. Documented Information Control Procedure.");
  line("Framework + Framework Requirement: optional pair — fill in both or leave both blank.");
  line("Framework Requirement: the requirement code from RayIMS's Framework Library, e.g. 7.5. Several codes of the SAME framework: separate with ; (e.g. 6.1; 8.1).");
  line("Same document under another framework (e.g. ISO 14001 8.2 and ISO 45001 8.2): repeat the row with the same Required Document and Site — the rows become ONE document.");
  line("Document Code, Document Type, Owner: optional free text. Codes need not be unique.");
  line("Site: optional. Blank = Project-wide. Otherwise one of this project's sites (listed below).");
  line("Applicable: optional. Yes / No (also Y / N, True / False). Blank = Yes.");
  line("Expected Records (also Required Evidence / Records): optional. The records or evidence you expect to review for the document, one per line inside the cell (Alt+Enter). Up to 2,000 characters.");
  line("The same document repeated for several requirements: give the same Expected Records on each row or leave it blank on the others; different texts are an error.");
  line("A document that already exists in the project (same title and site) is skipped, never changed.");
  line("If any row has an error, nothing is imported. Fix the file and upload it again.");
  line("Also accepted as headers: Clause (= Framework Requirement), PIC (= Owner), Document Required (= Required Document).");
  guide.addRow([]);

  heading("Examples (illustration only — these rows are NOT imported)");
  guide.addRow(Object.values(HEADERS)).font = { bold: true };
  guide.addRow([
    ctx.frameworkExample?.framework ?? "ISO 9001:2015",
    ctx.frameworkExample?.code ?? "7.5",
    "EXAMPLE: Documented Information Control Procedure",
    "PR-QMS-01",
    "Procedure",
    "Quality Manager",
    "",
    "Yes",
    "EXAMPLE: Document register\nRevision history of controlled documents\nDistribution list",
  ]);
  guide.addRow(["", "", "EXAMPLE: Emergency Response Plan (site-specific)", "", "Plan", "HSE Manager", ctx.sites[0] ?? "Site A", ""]);
  guide.addRow([]);

  heading("This project's Frameworks (copy exactly)");
  if (ctx.frameworks.length === 0) line("(none assigned)");
  for (const f of ctx.frameworks) line(f);
  guide.addRow([]);
  heading("This project's Sites (copy exactly)");
  if (ctx.sites.length === 0) line("(none)");
  for (const s of ctx.sites) line(s);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
