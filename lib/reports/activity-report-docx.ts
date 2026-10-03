import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { fileNamePart, xmlSafe, zonedParts } from "@/lib/export/shared";
import { formatFindingNumber, isActionOverdue } from "@/lib/ui/format";
import {
  actionStatusLabel,
  activityStatusLabel,
  findingStatusLabel,
  findingTypeLabel,
  priorityLabel,
  verificationResultLabel,
} from "@/lib/ui/status-tones";
import type { ActivityReport } from "./activity-report";

/**
 * Activity Report → DOCX (Phase 6D, ADR-020). PRESENTATION ONLY: the input is the ActivityReport
 * model built by `getActivityReportData` / `assembleActivityReport` (the same model the Activity Detail
 * summary shows) — no database access, no authorization, no inclusion rules here. One built-in
 * template: A4 portrait, Arial, navy headings, light table borders, no images, no links.
 */

const FONT = "Arial";
const NAVY = "1F3A5F";
const MUTED = "5B6675";
const BORDER = "C5CCD6";
const HEADER_FILL = "E9EEF4";
const SIZE = 19; // 9.5 pt body
const SMALL = 17; // 8.5 pt tables
const CONTENT_WIDTH = 9638; // A4 (11906 twips) minus 2 × 2 cm margins

/** "Site Assessment" → "Site Assessment Report"; a label already ending in "Report" is kept. */
export function activityReportTitle(typeLabel: string): string {
  const label = typeLabel.trim() || "Activity";
  return /\breport$/i.test(label) ? label : `${label} Report`;
}

/** "RayIMS-Site-Assessment-Report-Chinh-Long-IMS-20261027-Viet-Long.docx" — no ids. */
export function activityReportFileName(report: ActivityReport, now: Date, timeZone: string): string {
  const a = report.activity;
  const ymd = a.startDate ? a.startDate.slice(0, 10).replace(/-/g, "") : (() => { const p = zonedParts(now, timeZone); return `${p.y}${p.m}${p.d}`; })();
  return [
    "RayIMS",
    fileNamePart(activityReportTitle(a.typeLabel), "Activity-Report", 60),
    fileNamePart(a.projectName, "Project", 60),
    ymd,
    fileNamePart(a.siteName ?? "Project-wide", "Project-wide", 40),
  ].join("-") + ".docx";
}

const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

function period(a: ActivityReport["activity"]): string {
  const start = [dmy(a.startDate), hm(a.startTime)].filter(Boolean).join(" ");
  const end = [a.endDate && a.endDate !== a.startDate ? dmy(a.endDate) : "", hm(a.endTime)].filter(Boolean).join(" ");
  if (!start && !end) return "";
  return end ? `${start} – ${end}` : start;
}

// ----- building blocks -----

const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({ text: xmlSafe(text), font: FONT, size: o.size ?? SIZE, bold: o.bold, color: o.color, italics: o.italics });

/** Consultant text: one paragraph per line, so paragraph breaks and blank lines are kept as typed. */
function textParagraphs(text: string, o: { size?: number; spacingAfter?: number } = {}): Paragraph[] {
  return xmlSafe(text)
    .split(/\r?\n/)
    .map((line) => new Paragraph({ children: [run(line, { size: o.size })], spacing: { after: o.spacingAfter ?? 60 } }));
}

const muted = (text: string) => new Paragraph({ children: [run(text, { italics: true, color: MUTED })], spacing: { after: 120 } });

function heading(text: string): Paragraph {
  return new Paragraph({
    keepNext: true,
    keepLines: true,
    spacing: { before: 280, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 2 } },
    children: [run(text, { bold: true, size: 24, color: NAVY })],
  });
}
const subheading = (text: string) =>
  new Paragraph({ keepNext: true, spacing: { before: 120, after: 60 }, children: [run(text, { bold: true, size: 20, color: NAVY })] });

const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  left: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
};

function cell(content: string | Paragraph[], width: number, o: { header?: boolean; bold?: boolean } = {}): TableCell {
  const children =
    typeof content === "string"
      ? (content === "" ? [""] : xmlSafe(content).split(/\r?\n/)).map(
          (line) => new Paragraph({ children: [run(line, { size: SMALL, bold: o.header || o.bold, color: o.header ? NAVY : undefined })] }),
        )
      : content;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    shading: o.header ? { type: ShadingType.CLEAR, fill: HEADER_FILL, color: "auto" } : undefined,
    children,
  });
}

/** A data table: fixed column widths (no sideways overflow), header row repeated on every page. */
function table(headers: string[], widths: number[], rows: (string | Paragraph[])[][]): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, widths[i], { header: true })) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i])) })),
    ],
  });
}

/** Label / value pairs (Project / Activity information, Verification counts). Empty values are left out. */
function facts(pairs: [string, string][], labelWidth = 2600): Table {
  const shown = pairs.filter(([, v]) => v.trim() !== "");
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [labelWidth, CONTENT_WIDTH - labelWidth],
    layout: TableLayoutType.FIXED,
    borders,
    rows: shown.map(
      ([label, value]) =>
        new TableRow({
          cantSplit: true,
          children: [cell(label, labelWidth, { header: true }), cell(value, CONTENT_WIDTH - labelWidth)],
        }),
    ),
  });
}

const spacer = () => new Paragraph({ children: [], spacing: { after: 80 } });
const cellLines = (lines: { text: string; bold?: boolean; muted?: boolean }[]) =>
  lines
    .filter((l) => l.text.trim() !== "")
    .flatMap((l) =>
      xmlSafe(l.text)
        .split(/\r?\n/)
        .map((line) => new Paragraph({ children: [run(line, { size: SMALL, bold: l.bold, color: l.muted ? MUTED : undefined })] })),
    );

// ----- the document -----

export async function buildActivityReportDocx(report: ActivityReport, ctx: { generatedAt: Date; timeZone: string }): Promise<Buffer> {
  const { activity: a, narrative: n, verification: v, findings, actions, evidence } = report;
  const g = zonedParts(ctx.generatedAt, ctx.timeZone);
  const generated = `${g.d}/${g.m}/${g.y} ${g.hh}:${g.mm} (${ctx.timeZone})`;
  const title = activityReportTitle(a.typeLabel);
  const requirement = (identity: string | null, label: string | null) => [identity, label].filter(Boolean).join(" · ");
  const body: (Paragraph | Table)[] = [];

  // Title block
  body.push(
    new Paragraph({ children: [run(title, { bold: true, size: 36, color: NAVY })], spacing: { after: 60 } }),
    new Paragraph({ children: [run(a.name, { bold: true, size: 24 })], spacing: { after: 40 } }),
    new Paragraph({
      children: [run([a.clientName, a.projectName].filter(Boolean).join(" · "), { color: MUTED })],
      spacing: { after: 200 },
    }),
  );

  // 1. Project / Activity Information
  body.push(
    heading("1. Project / Activity Information"),
    facts([
      ["Client", a.clientName ?? ""],
      ["Project", a.projectName],
      ["Activity", a.name],
      ["Activity Type", a.typeLabel],
      ["Site", a.siteName ?? "Project-wide"],
      ["Mode", a.mode === "on_site" ? "On-site" : a.mode === "online" ? "Online" : a.mode],
      ["Date / Period", period(a)],
      ["Consultant", a.consultantName ?? ""],
      ["Activity Status", activityStatusLabel(a.status)],
      ["Client Participants", n.clientParticipants ?? ""],
    ]),
  );

  // 2. Objectives & Scope — one compact line when both are empty (keeps the numbering stable)
  body.push(heading("2. Objectives & Scope"));
  if (!n.objectives && !n.plannedWork) body.push(muted("No objectives or planned work recorded."));
  if (n.objectives) body.push(subheading("Objectives"), ...textParagraphs(n.objectives));
  if (n.plannedWork) body.push(subheading("Planned Work / Scope"), ...textParagraphs(n.plannedWork));

  // 3. Work Performed
  body.push(heading("3. Work Performed"), ...(n.workPerformed ? textParagraphs(n.workPerformed) : [muted("No work performed recorded.")]));

  // 4. Verification Summary (counts from the model; optional counts only when non-zero)
  body.push(heading("4. Verification Summary"));
  if (v.executed.total === 0 && v.plannedNotCompleted === 0 && v.completedElsewhere === 0) {
    body.push(muted("No checks executed."));
  } else {
    const counts: [string, string][] = [
      ["Executed", String(v.executed.total)],
      ["Verified OK", String(v.executed.verifiedOk)],
      ["Issue Identified", String(v.executed.issueIdentified)],
      ["Follow-up Required", String(v.executed.followUpRequired)],
    ];
    if (v.plannedNotCompleted > 0) counts.push(["Planned, not completed", String(v.plannedNotCompleted)]);
    if (v.completedElsewhere > 0) counts.push(["Completed in another Activity", String(v.completedElsewhere)]);
    body.push(facts(counts, 3400), spacer());
  }
  body.push(subheading("Issue and follow-up checks"));
  body.push(
    v.issues.length === 0
      ? muted("No issue or follow-up checks recorded.")
      : table(
          ["Requirement", "Check / Question", "Result", "Notes", "Related Finding(s)"],
          [1900, 2700, 1250, 2388, 1400],
          v.issues.map((i) => [
            requirement(i.frameworkIdentity, i.frameworkItemLabel),
            i.question,
            verificationResultLabel(i.result),
            i.notes ?? "",
            i.findings.map((f) => formatFindingNumber(f.findingNo)).join(", "),
          ]),
        ),
  );

  // 5. Findings
  body.push(heading("5. Findings"));
  body.push(
    findings.length === 0
      ? muted("No Findings recorded.")
      : table(
          ["No.", "Type", "Framework Requirement", "Finding", "Site", "Priority", "Status"],
          [760, 1300, 1700, 3178, 1100, 800, 800],
          findings.map((f) => [
            formatFindingNumber(f.findingNo),
            findingTypeLabel(f.findingType),
            requirement(f.frameworkIdentity, f.frameworkItemLabel),
            cellLines([{ text: f.title, bold: true }, { text: f.description ?? "", muted: true }]),
            f.siteName ?? "Project-wide",
            priorityLabel(f.priority),
            findingStatusLabel(f.status),
          ]),
        ),
  );

  // 6. Actions / Follow-up
  body.push(heading("6. Actions / Follow-up"));
  body.push(
    actions.length === 0
      ? muted("No Actions recorded.")
      : table(
          ["Action", "Related Finding", "Owner", "Due Date", "Priority", "Status"],
          [3538, 1100, 1500, 1100, 900, 1500],
          actions.map((x) => [
            x.description,
            x.finding ? formatFindingNumber(x.finding.findingNo) : "—",
            x.ownerName ?? "",
            dmy(x.dueDate),
            priorityLabel(x.priority),
            isActionOverdue(x) ? `${actionStatusLabel(x.status)} — Overdue` : actionStatusLabel(x.status),
          ]),
        ),
  );

  // 7. Evidence (metadata only — no images, no links)
  body.push(heading("7. Evidence"));
  const originLabel: Record<string, string> = { activity: "Activity", verification: "Verification", finding: "Finding", action: "Action" };
  const evidenceRows = evidence.groups.flatMap((grp) =>
    grp.items.map((e) => [originLabel[grp.key], e.attachedTo ?? "", e.caption ?? "", e.fileName]),
  );
  body.push(
    evidenceRows.length === 0
      ? muted("No report Evidence recorded.")
      : table(["Origin", "Attached to", "Caption", "File"], [1200, 3200, 2400, 2838], evidenceRows),
  );

  // 8. Consultant Summary, 9. Recommendations / Next Steps
  body.push(heading("8. Consultant Summary"), ...(n.summary ? textParagraphs(n.summary) : [muted("No consultant summary recorded.")]));
  body.push(
    heading("9. Recommendations / Next Steps"),
    ...(n.nextSteps ? textParagraphs(n.nextSteps) : [muted("No next steps recorded.")]),
  );

  const doc = new Document({
    creator: "RayIMS",
    title,
    description: `${title} — ${a.name}`,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run(`${title} · ${a.name} · Generated by RayIMS ${generated} · Page `, { size: 15, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 15, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
