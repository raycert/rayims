import { PROJECT_WIDE_LABEL, type RawDocumentRow } from "@/lib/import/document-register-workbook";
import type { DocumentImportCatalog } from "@/lib/queries/document-import";
import { EXPECTED_RECORDS_MAX, normalizeExpectedRecords } from "@/lib/validation/documents";

/**
 * Required Document import validation (Phase 5E) — the single authoritative rule set, used by
 * Preview and by Import (which re-parses and re-validates against a fresh catalog). All lookups
 * are in-memory maps; there is no per-row database access.
 *
 * Identity: normalized title + resolved site. Rows with the same identity become ONE Document
 * (their requirements are merged; blank cells inherit, different non-blank values are an error).
 * A Document that already exists in the project with that identity is skipped — never changed.
 */

export type ImportRowStatus = "ready" | "warning" | "error";
export type ImportRowAction = "create" | "merge" | "skip";

type ResolvedRow = {
  raw: RawDocumentRow;
  errors: string[];
  warnings: string[];
  title: string;
  siteId: string | null;
  siteLabel: string;
  /** null = the Applicable cell was blank */
  applicable: boolean | null;
  /** Expected Records, trimmed with \n line endings; null = blank. */
  expectedRecords: string | null;
  itemIds: string[];
  requirementsLabel: string;
  action: ImportRowAction | null;
};

/** One Document to create (server-only; carries ids). */
export type ImportGroup = {
  key: string;
  firstRow: number;
  title: string;
  docCode: string | null;
  documentType: string | null;
  ownerName: string | null;
  expectedRecords: string | null;
  siteId: string | null;
  isApplicable: boolean;
  frameworkItemIds: string[];
};

export type ImportPreviewRow = {
  rowNumber: number;
  status: ImportRowStatus;
  errors: string[];
  warnings: string[];
  title: string;
  code: string;
  siteLabel: string;
  requirementsLabel: string;
  applicableLabel: string;
  /** First line of the Expected Records (short), "" when blank — the preview never carries the whole text. */
  expectedRecordsPreview: string;
  /** Number of lines of the Expected Records (0 = blank). */
  expectedRecordsLines: number;
  action: ImportRowAction | null;
};

export type ImportPreview = {
  totalRows: number;
  readyCount: number;
  warningCount: number;
  errorCount: number;
  /** Documents that would be created (after merging rows). */
  createCount: number;
  /** Existing Documents that would be skipped. */
  skipCount: number;
  rows: ImportPreviewRow[];
};

const lower = (v: string) => v.trim().toLowerCase();
/** Title identity: case-insensitive, surrounding / repeated whitespace ignored. */
export const normalizeTitle = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
const identityKey = (title: string, siteId: string | null) => `${normalizeTitle(title)}|${siteId ?? ""}`;

const APPLICABLE: Record<string, boolean> = { yes: true, y: true, true: true, no: false, n: false, false: false };

const MAX_TITLE = 300;
const MAX_TEXT = 200;

function group<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function resolveRow(raw: RawDocumentRow, maps: ReturnType<typeof buildMaps>): ResolvedRow {
  const errors: string[] = [];
  for (const h of raw.unreadableFormulas) {
    errors.push(`"${h}" is a formula without a stored value. Open and save the file in Excel, or type the value.`);
  }

  const title = raw.title.trim().replace(/\s+/g, " ");
  if (!title && !raw.unreadableFormulas.includes("Required Document")) errors.push("Required Document is required.");
  if (title.length > MAX_TITLE) errors.push(`Required Document is longer than ${MAX_TITLE} characters.`);
  for (const [label, value] of [
    ["Document Code", raw.code],
    ["Document Type", raw.type],
    ["Owner", raw.owner],
  ] as const) {
    if (value.trim().length > MAX_TEXT) errors.push(`${label} is longer than ${MAX_TEXT} characters.`);
  }

  // Expected Records (Phase 7D): optional, multiline, at most EXPECTED_RECORDS_MAX characters — never silently truncated.
  const expectedRecords = normalizeExpectedRecords(raw.expectedRecords);
  if (expectedRecords && expectedRecords.length > EXPECTED_RECORDS_MAX) {
    errors.push(`Expected Records is longer than ${EXPECTED_RECORDS_MAX.toLocaleString("en-US")} characters (${expectedRecords.length.toLocaleString("en-US")}). Shorten it; nothing is truncated.`);
  }

  // Site — only this project's sites, exact (case-insensitive) name.
  let siteId: string | null = null;
  let siteLabel = PROJECT_WIDE_LABEL;
  if (raw.site.trim() !== "") {
    siteLabel = raw.site.trim();
    const matches = maps.sitesByName.get(lower(raw.site)) ?? [];
    if (matches.length === 0) errors.push(`Unknown Site "${raw.site.trim()}". Use one of this project's sites.`);
    else if (matches.length > 1) errors.push(`Ambiguous Site "${raw.site.trim()}": more than one site in this project has that name.`);
    else {
      siteId = matches[0].id;
      siteLabel = matches[0].name;
    }
  }

  // Applicable — Yes/No/Y/N/True/False, blank = Yes.
  let applicable: boolean | null = null;
  if (raw.applicable.trim() !== "") {
    const parsed = APPLICABLE[lower(raw.applicable)];
    if (parsed === undefined) errors.push(`Applicable "${raw.applicable.trim()}" isn't recognized. Use Yes or No, or leave it blank.`);
    else applicable = parsed;
  }

  // Framework + Requirement(s): both blank or both filled; several codes of ONE framework with ";".
  const itemIds: string[] = [];
  let requirementsLabel = "";
  const hasFramework = raw.framework.trim() !== "";
  const hasReq = raw.requirement.trim() !== "";
  if (hasFramework && !hasReq) errors.push("Framework Requirement is required when Framework is provided.");
  else if (!hasFramework && hasReq) errors.push("Framework is required when Framework Requirement is provided.");
  else if (hasFramework && hasReq) {
    const framework = maps.assignedByIdentity.get(lower(raw.framework));
    if (!framework) {
      errors.push(
        maps.knownFrameworks.has(lower(raw.framework))
          ? `Framework "${raw.framework.trim()}" isn't assigned to this project.`
          : `Unknown Framework "${raw.framework.trim()}". Use the format on the Instructions sheet, for example ISO 14001:2015.`,
      );
    } else {
      const codes = [...new Set(raw.requirement.split(";").map((c) => c.trim()).filter(Boolean))];
      const found: string[] = [];
      for (const code of codes) {
        const item = maps.itemIndex.get(framework.id)?.get(lower(code));
        if (!item) {
          errors.push(
            `Requirement "${code}" wasn't found in ${framework.identity}. Use a code from the Framework Library exactly (for example 7.5); nothing is guessed.`,
          );
        } else {
          itemIds.push(item.id);
          found.push(item.code);
        }
      }
      requirementsLabel = `${framework.identity} · ${(errors.length ? codes : found).join(", ")}`;
    }
  }
  if (!requirementsLabel && (hasFramework || hasReq)) requirementsLabel = [raw.framework.trim(), raw.requirement.trim()].filter(Boolean).join(" · ");

  return { raw, errors, warnings: [], title, siteId, siteLabel, applicable, expectedRecords, itemIds, requirementsLabel, action: null };
}

function buildMaps(catalog: DocumentImportCatalog) {
  return {
    sitesByName: group(catalog.sites, (s) => lower(s.name)),
    assignedByIdentity: new Map(catalog.assignedFrameworks.map((f) => [lower(f.identity), f])),
    knownFrameworks: new Set(catalog.allFrameworkIdentities.map(lower)),
    itemIndex: new Map(catalog.assignedFrameworks.map((f) => [f.id, new Map(f.items.map((i) => [lower(i.code), i]))])),
  };
}

export function validateDocumentRows(
  rows: RawDocumentRow[],
  catalog: DocumentImportCatalog,
): { rows: ResolvedRow[]; groups: ImportGroup[]; skippedKeys: Set<string> } {
  const maps = buildMaps(catalog);
  const resolved = rows.map((r) => resolveRow(r, maps));
  const existingKeys = new Set(catalog.existingDocuments.map((d) => identityKey(d.title, d.siteId)));

  // Pass 2: identity grouping (only rows without errors take part).
  const groups = new Map<string, ImportGroup & { rows: ResolvedRow[] }>();
  const skippedKeys = new Set<string>();
  for (const r of resolved) {
    if (r.errors.length > 0) continue;
    const key = identityKey(r.title, r.siteId);
    if (existingKeys.has(key)) {
      r.action = "skip";
      skippedKeys.add(key);
      r.warnings.push(
        "Document already exists in this project (same title and site). This row will be skipped; the existing document is not changed.",
      );
      continue;
    }
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key,
        firstRow: r.raw.rowNumber,
        title: r.title,
        docCode: r.raw.code.trim() || null,
        documentType: r.raw.type.trim() || null,
        ownerName: r.raw.owner.trim() || null,
        expectedRecords: r.expectedRecords,
        siteId: r.siteId,
        isApplicable: r.applicable ?? true,
        frameworkItemIds: [...r.itemIds],
        rows: [r],
      });
      r.action = "create";
      continue;
    }
    // Merge: blank cells inherit; a different non-blank value is a conflict (never silently chosen).
    const conflicts: string[] = [];
    const firstApplicable = g.rows.find((x) => x.applicable !== null)?.applicable ?? null;
    for (const [label, mine, theirs] of [
      ["Document Code", r.raw.code.trim(), g.docCode ?? ""],
      ["Document Type", r.raw.type.trim(), g.documentType ?? ""],
      ["Owner", r.raw.owner.trim(), g.ownerName ?? ""],
    ] as const) {
      if (mine && theirs && mine.toLowerCase() !== theirs.toLowerCase()) conflicts.push(`${label} "${mine}" vs "${theirs}"`);
    }
    // Expected Records: blank inherits; the same text (after trimming and line-ending normalization only — lines are never
    // reordered or reworded) is kept once; different non-blank texts are a conflict, never silently chosen.
    if (r.expectedRecords && g.expectedRecords && r.expectedRecords !== g.expectedRecords) {
      const first = (t: string) => (t.split("\n")[0].length > 40 ? `${t.split("\n")[0].slice(0, 40)}…` : t.split("\n")[0]);
      conflicts.push(`Expected Records "${first(r.expectedRecords)}" vs "${first(g.expectedRecords)}"`);
    }
    if (r.applicable !== null && firstApplicable !== null && r.applicable !== firstApplicable) {
      conflicts.push(`Applicable "${r.applicable ? "Yes" : "No"}" vs "${firstApplicable ? "Yes" : "No"}"`);
    }
    if (conflicts.length > 0) {
      r.errors.push(`Same document as row ${g.firstRow} but with different values: ${conflicts.join("; ")}. Make them match or leave the cells blank.`);
      continue;
    }
    g.docCode ??= r.raw.code.trim() || null;
    g.documentType ??= r.raw.type.trim() || null;
    g.ownerName ??= r.raw.owner.trim() || null;
    g.expectedRecords ??= r.expectedRecords;
    if (r.applicable !== null) g.isApplicable = r.applicable;
    for (const id of r.itemIds) if (!g.frameworkItemIds.includes(id)) g.frameworkItemIds.push(id);
    g.rows.push(r);
    r.action = "merge";
    r.warnings.push(`Same document as row ${g.firstRow} — its framework requirements are merged into one document.`);
  }

  // Pass 3: duplicate Document Codes (warning only; codes are not unique).
  const existingCodes = new Map<string, string>();
  for (const d of catalog.existingDocuments) {
    if (d.docCode) existingCodes.set(lower(d.docCode), identityKey(d.title, d.siteId));
  }
  const groupsByCode = group([...groups.values()].filter((g) => g.docCode), (g) => lower(g.docCode!));
  for (const g of groups.values()) {
    if (!g.docCode) continue;
    const others = (groupsByCode.get(lower(g.docCode)) ?? []).filter((o) => o !== g);
    const usedByExisting = existingCodes.has(lower(g.docCode)) && existingCodes.get(lower(g.docCode)) !== g.key;
    if (others.length > 0 || usedByExisting) {
      const where = [
        ...others.map((o) => `row ${o.firstRow}`),
        ...(usedByExisting ? ["an existing document"] : []),
      ].join(", ");
      g.rows[0].warnings.push(`Document Code "${g.docCode}" is also used by ${where}. Codes don't have to be unique.`);
    }
  }

  // Any error blocks the whole import, so groups are only ever written when every row is valid.
  const validGroups: ImportGroup[] = [...groups.values()].map((g) => ({
    key: g.key,
    firstRow: g.firstRow,
    title: g.title,
    docCode: g.docCode,
    documentType: g.documentType,
    ownerName: g.ownerName,
    expectedRecords: g.expectedRecords,
    siteId: g.siteId,
    isApplicable: g.isApplicable,
    frameworkItemIds: g.frameworkItemIds,
  }));
  return { rows: resolved, groups: validGroups, skippedKeys };
}

export function toPreview(result: ReturnType<typeof validateDocumentRows>): ImportPreview {
  const rows: ImportPreviewRow[] = result.rows.map((r) => {
    const status: ImportRowStatus = r.errors.length > 0 ? "error" : r.warnings.length > 0 ? "warning" : "ready";
    return {
      rowNumber: r.raw.rowNumber,
      status,
      errors: r.errors,
      warnings: r.warnings,
      title: r.title || "—",
      code: r.raw.code.trim(),
      siteLabel: r.siteLabel,
      requirementsLabel: r.requirementsLabel,
      applicableLabel: r.applicable === false ? "No" : r.applicable === true ? "Yes" : "Yes (default)",
      expectedRecordsPreview: r.expectedRecords ? r.expectedRecords.split("\n")[0].slice(0, 120) : "",
      expectedRecordsLines: r.expectedRecords ? r.expectedRecords.split("\n").length : 0,
      action: r.errors.length > 0 ? null : r.action,
    };
  });
  return {
    totalRows: rows.length,
    readyCount: rows.filter((r) => r.status === "ready").length,
    warningCount: rows.filter((r) => r.status === "warning").length,
    errorCount: rows.filter((r) => r.status === "error").length,
    createCount: result.groups.length,
    skipCount: result.skippedKeys.size,
    rows,
  };
}
