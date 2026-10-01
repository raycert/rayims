import ExcelJS from "exceljs";
import type { GapAssessmentDocument } from "@/lib/queries/document-export";
import { documentStatusLabel, documentStatusTone, type Tone } from "@/lib/ui/status-tones";

/**
 * Gap Assessment Register export (Phase 5F): a consultant / client-facing workbook, not a data
 * dump — human labels only, no ids, storage keys or enum values. One row per Document × Framework
 * Requirement (a Document without mappings = one row with blank Framework / Requirement); every
 * row of a Document repeats its current state and follow-up counts.
 */
export const EXPORT_SHEET_NAME = "Gap Assessment";
export const SUMMARY_SHEET_NAME = "Summary";

export const EXPORT_COLUMNS = [
  { header: "Framework", width: 16 },
  { header: "Framework Requirement", width: 30, wrap: true },
  { header: "Required Document", width: 38, wrap: true },
  { header: "Document Code", width: 16 },
  { header: "Document Type", width: 16 },
  { header: "Site", width: 16 },
  { header: "Owner", width: 18, wrap: true },
  { header: "Applicable", width: 11 },
  { header: "Current Version", width: 10 },
  { header: "Current Revision", width: 12 },
  { header: "Current File", width: 30, wrap: true },
  { header: "Received On", width: 13 },
  { header: "Gap Assessment Status", width: 19 },
  { header: "Review Comments", width: 48, wrap: true },
  { header: "Reviewed By", width: 18 },
  { header: "Last Review", width: 13 },
  { header: "Findings", width: 10 },
  { header: "Verification Items", width: 12 },
  { header: "Follow-up Summary", width: 34, wrap: true },
] as const;

const PROJECT_WIDE = "Project-wide";
const DATE_FORMAT = "dd/mm/yyyy";
/** Wrapped rows grow with their text up to this many lines; longer text keeps its full value (scroll / expand). */
const MAX_ROW_LINES = 8;
const LINE_HEIGHT_PT = 15;

/** Subtle fills that follow the app's status tones; the status text is always present too. */
const TONE_FILL: Record<Tone, string> = {
  neutral: "FFF1F5F9",
  info: "FFE0ECFF",
  warning: "FFFEF3C7",
  success: "FFDCFCE7",
  danger: "FFFEE2E2",
};

export type GapAssessmentRow = {
  framework: string;
  requirement: string;
  requirementCode: string | null;
  doc: GapAssessmentDocument;
};

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/**
 * Row grain + order: Framework (natural) → Requirement code (natural: 4.1 < 7.5 < 10) → Site
 * (Project-wide first) → Required Document. Documents without a mapping come last.
 */
export function buildGapAssessmentRows(documents: GapAssessmentDocument[]): GapAssessmentRow[] {
  const rows: GapAssessmentRow[] = [];
  for (const doc of documents) {
    if (doc.frameworkItems.length === 0) {
      rows.push({ framework: "", requirement: "", requirementCode: null, doc });
      continue;
    }
    for (const item of doc.frameworkItems) {
      rows.push({ framework: item.frameworkIdentity, requirement: item.label, requirementCode: item.code, doc });
    }
  }
  const siteKey = (d: GapAssessmentDocument) => (d.siteName === null ? "" : `~${d.siteName}`);
  return rows.sort(
    (a, b) =>
      Number(a.framework === "") - Number(b.framework === "") ||
      natural(a.framework, b.framework) ||
      natural(a.requirementCode ?? a.requirement, b.requirementCode ?? b.requirement) ||
      natural(a.requirement, b.requirement) ||
      natural(siteKey(a.doc), siteKey(b.doc)) ||
      natural(a.doc.title, b.doc.title) ||
      (a.doc.id < b.doc.id ? -1 : a.doc.id > b.doc.id ? 1 : 0),
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 Findings (1 Open) · 3 Verification Items (2 Pending)"; blank when there is no follow-up. */
export function followUpSummary(doc: Pick<GapAssessmentDocument, "findings" | "verificationItems">): string {
  const parts: string[] = [];
  const { findings: f, verificationItems: v } = doc;
  if (f.total > 0) {
    const state = f.total === 1 ? (f.open === 1 ? "Open" : "Closed") : f.open > 0 ? `${f.open} Open` : "all Closed";
    parts.push(`${plural(f.total, "Finding", "Findings")} (${state})`);
  }
  if (v.total > 0) {
    const state = v.total === 1 ? (v.pending === 1 ? "Pending" : "Completed") : v.pending > 0 ? `${v.pending} Pending` : "all Completed";
    parts.push(`${plural(v.total, "Verification Item", "Verification Items")} (${state})`);
  }
  return parts.join(" · ");
}

/** Characters XML 1.0 cannot hold would corrupt the workbook; everything else is kept as typed. */
const clean = (v: string | null | undefined) => (v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** "2026-09-30" or an ISO timestamp → an Excel date (its calendar day, as the register shows it). */
function excelDate(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(Date.UTC(y, m - 1, d)) : null;
}

function estimatedLines(text: string, width: number): number {
  const perLine = Math.max(8, Math.floor(width * 1.15));
  return text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0);
}

/** "Chinh Long – IMS 2026" + date → "RayIMS-Gap-Assessment-Chinh-Long-IMS-2026-20260930.xlsx" */
export function gapAssessmentFileName(projectName: string, now: Date): string {
  const safe =
    projectName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "") || "Project";
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `RayIMS-Gap-Assessment-${safe}-${ymd}.xlsx`;
}

export async function buildGapAssessmentWorkbook(ctx: {
  projectName: string;
  clientName: string | null;
  documents: GapAssessmentDocument[];
  generatedAt: Date;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RayIMS";
  workbook.created = ctx.generatedAt;
  workbook.modified = ctx.generatedAt;
  workbook.title = `Gap Assessment Register — ${ctx.projectName}`;

  const sheet = workbook.addWorksheet(EXPORT_SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };

  for (const r of buildGapAssessmentRows(ctx.documents)) {
    const d = r.doc;
    const values = [
      clean(r.framework),
      clean(r.requirement),
      clean(d.title),
      clean(d.docCode),
      clean(d.documentType),
      clean(d.siteName ?? PROJECT_WIDE),
      clean(d.ownerName),
      d.isApplicable ? "Yes" : "No",
      d.latestVersionNo === null ? "" : `V${d.latestVersionNo}`,
      clean(d.latestRevision),
      clean(d.currentFileName),
      excelDate(d.receivedOn),
      documentStatusLabel(d.status),
      clean(d.reviewComments),
      clean(d.reviewedBy),
      excelDate(d.lastReviewAt),
      d.findings.total,
      d.verificationItems.total,
      followUpSummary(d),
    ];
    const row = sheet.addRow(values);
    row.alignment = { vertical: "top" };
    let lines = 1;
    EXPORT_COLUMNS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if ("wrap" in c && c.wrap) {
        cell.alignment = { vertical: "top", wrapText: true };
        lines = Math.max(lines, estimatedLines(String(values[i] ?? ""), c.width));
      }
    });
    row.getCell(12).numFmt = DATE_FORMAT;
    row.getCell(16).numFmt = DATE_FORMAT;
    const status = row.getCell(13);
    status.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TONE_FILL[documentStatusTone(d.status)] } };
    // Excel sizes wrapped rows itself; only very long text gets a capped height (value is never cut).
    if (lines > MAX_ROW_LINES) row.height = MAX_ROW_LINES * LINE_HEIGHT_PT;
  }

  addSummarySheet(workbook, ctx);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Document-level counts (not export rows) + direct Gap Assessment follow-up. */
function addSummarySheet(
  workbook: ExcelJS.Workbook,
  ctx: { projectName: string; clientName: string | null; documents: GapAssessmentDocument[]; generatedAt: Date },
) {
  const sheet = workbook.addWorksheet(SUMMARY_SHEET_NAME);
  sheet.columns = [{ width: 34 }, { width: 44 }];
  const count = (status: string) => ctx.documents.filter((d) => d.status === status).length;
  const g = ctx.generatedAt;
  const pad = (n: number) => String(n).padStart(2, "0");
  const generated = `${pad(g.getDate())}/${pad(g.getMonth() + 1)}/${g.getFullYear()} ${pad(g.getHours())}:${pad(g.getMinutes())}`;

  const title = sheet.addRow(["Gap Assessment Register"]);
  title.font = { bold: true, size: 14 };
  sheet.addRow(["Project", clean(ctx.projectName)]);
  if (ctx.clientName) sheet.addRow(["Client", clean(ctx.clientName)]);
  sheet.addRow(["Exported", generated]);
  sheet.addRow([]);
  sheet.addRow(["Documents"]).font = { bold: true };
  sheet.addRow(["Total", ctx.documents.length]);
  for (const s of ["not_received", "received", "under_review", "revision_required", "accepted", "n_a"]) {
    sheet.addRow([documentStatusLabel(s), count(s)]);
  }
  sheet.addRow([]);
  sheet.addRow(["Gap Assessment follow-up"]).font = { bold: true };
  sheet.addRow(["Open Findings", ctx.documents.reduce((n, d) => n + d.findings.open, 0)]);
  sheet.addRow(["Pending Verification Items", ctx.documents.reduce((n, d) => n + d.verificationItems.pending, 0)]);
  sheet.addRow([]);
  sheet.addRow([
    "Note",
    "Current state of each Document (latest version, latest assessment). Follow-up counts include Findings and Verification Items created directly from any assessment of the Document.",
  ]).getCell(2).alignment = { wrapText: true, vertical: "top" };
}
