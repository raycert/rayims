import { normalizeActivityIdentity, PROJECT_WIDE_LABEL, type RawImportRow } from "@/lib/import/verification-workbook";
import type { ImportCatalog } from "@/lib/queries/verification-import";
import { verificationItemSchema } from "./verification-items";

export type ImportRowStatus = "ready" | "warning" | "error";

/** Server-only: carries resolved ids. Never sent to the browser (see toPreviewRow). */
export type ValidatedRow = {
  rowNumber: number;
  status: ImportRowStatus;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
  display: {
    question: string;
    priorityLabel: string;
    siteLabel: string;
    siteInferred: boolean;
    targetActivity: string;
    frameworkLabel: string;
  };
  /** Present only when the row has no errors. */
  insert: {
    question: string;
    priority: "low" | "medium" | "high";
    siteId: string | null;
    targetActivityId: string | null;
    frameworkItemId: string | null;
  } | null;
};

const PRIORITIES: Record<string, "low" | "medium" | "high"> = { low: "low", medium: "medium", high: "high" };
const PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" } as const;

function lower(value: string): string {
  return value.trim().toLowerCase();
}

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

/**
 * The single authoritative validation of a parsed workbook against a freshly loaded
 * project catalog. Preview and Import both call this — no rule lives anywhere else.
 * All lookups are in-memory maps built once; there is no per-row database access.
 */
export function validateImportRows(rows: RawImportRow[], catalog: ImportCatalog): ValidatedRow[] {
  const sitesByName = group(catalog.sites, (s) => lower(s.name));
  const activitiesByIdentity = group(catalog.activities, (a) => a.identity);
  const assignedByIdentity = new Map(catalog.assignedFrameworks.map((f) => [lower(f.identity), f]));
  const knownFrameworks = new Set(catalog.allFrameworkIdentities.map(lower));
  const siteNameById = new Map(catalog.sites.map((s) => [s.id, s.name]));
  const itemIndex = new Map(
    catalog.assignedFrameworks.map((f) => [f.id, new Map(f.items.map((i) => [lower(i.code), i]))]),
  );

  const existingKeys = new Set(
    catalog.existingItems.map((v) => duplicateKey(v.question, v.siteId, v.targetActivityId, v.frameworkItemId)),
  );
  const firstRowByKey = new Map<string, number>();

  return rows.map((raw) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let duplicate = false;

    // Priority
    let priority: "low" | "medium" | "high" = "medium";
    let priorityLabel: string = PRIORITY_LABELS.medium;
    if (raw.priority.trim() !== "") {
      const mapped = PRIORITIES[lower(raw.priority)];
      if (mapped) {
        priority = mapped;
        priorityLabel = PRIORITY_LABELS[mapped];
      } else {
        priorityLabel = raw.priority.trim();
        errors.push(`Priority "${raw.priority}" isn't recognized. Use Low, Medium or High, or leave it blank.`);
      }
    }

    // Site (resolved only among this project's sites)
    let siteId: string | null = null;
    let siteResolved = false;
    if (raw.site.trim() !== "") {
      const matches = sitesByName.get(lower(raw.site)) ?? [];
      if (matches.length === 0) {
        errors.push(`Unknown Site "${raw.site}". Use one of this project's sites.`);
      } else if (matches.length > 1) {
        errors.push(`Ambiguous Site "${raw.site}": more than one site in this project has that name. Rename one of them first.`);
      } else {
        siteId = matches[0].id;
        siteResolved = true;
      }
    }

    // Target Activity (exact composed identity; never the name alone)
    let targetActivityId: string | null = null;
    let activityResolved = false;
    let activitySiteId: string | null = null;
    if (raw.targetActivity.trim() !== "") {
      const matches = activitiesByIdentity.get(normalizeActivityIdentity(raw.targetActivity)) ?? [];
      if (matches.length === 0) {
        errors.push(`Unknown Target Activity "${raw.targetActivity}". Copy the value exactly from the Instructions sheet.`);
      } else if (matches.length > 1) {
        errors.push(
          `Ambiguous Target Activity "${raw.targetActivity}": more than one activity has this exact date, time, site and name.`,
        );
      } else {
        targetActivityId = matches[0].id;
        activitySiteId = matches[0].siteId;
        activityResolved = true;
      }
    }

    // Site <-> Target Activity (Phase 4A rule: a site-specific activity fixes the site)
    let siteInferred = false;
    if (activityResolved && activitySiteId) {
      if (raw.site.trim() === "") {
        siteId = activitySiteId;
        siteInferred = true;
      } else if (siteResolved && siteId !== activitySiteId) {
        errors.push(
          `Site "${raw.site}" doesn't match the Target Activity's site (${siteNameById.get(activitySiteId) ?? "another site"}). Leave Site blank to use the activity's site.`,
        );
      }
    }

    // Framework + Framework Item: both blank or both filled
    let frameworkItemId: string | null = null;
    let frameworkLabel = "";
    const hasFramework = raw.framework.trim() !== "";
    const hasItem = raw.frameworkItem.trim() !== "";
    if (hasFramework && !hasItem) {
      errors.push("Framework Item is required when Framework is provided.");
    } else if (!hasFramework && hasItem) {
      errors.push("Framework is required when Framework Item is provided.");
    } else if (hasFramework && hasItem) {
      const framework = assignedByIdentity.get(lower(raw.framework));
      if (!framework) {
        errors.push(
          knownFrameworks.has(lower(raw.framework))
            ? `Framework "${raw.framework}" isn't assigned to this project.`
            : `Unknown Framework "${raw.framework}". Use the format shown on the Instructions sheet, for example ISO 14001:2015.`,
        );
      } else {
        const item = itemIndex.get(framework.id)?.get(lower(raw.frameworkItem));
        if (!item) {
          errors.push(`Framework Item "${raw.frameworkItem}" wasn't found in ${framework.identity}. Use the item's code, for example 8.1.`);
        } else {
          frameworkItemId = item.id;
          frameworkLabel = `${framework.identity} · ${item.code}`;
        }
      }
    }

    // Blank / invalid question — reuse the Phase 4A planning schema's own rule and message.
    const schemaCheck = verificationItemSchema.safeParse({
      question: raw.question,
      priority,
      siteId: null,
      targetActivityId: null,
      frameworkItemId: null,
    });
    if (!schemaCheck.success) {
      for (const issue of schemaCheck.error.issues) {
        if (issue.path[0] === "question") errors.push(issue.message);
      }
    }

    // Duplicates: only comparable once every reference resolved cleanly.
    const question = raw.question.trim();
    if (errors.length === 0) {
      const key = duplicateKey(question, siteId, targetActivityId, frameworkItemId);
      const firstRow = firstRowByKey.get(key);
      if (firstRow !== undefined) {
        warnings.push(`Possible duplicate of row ${firstRow} in this file.`);
        duplicate = true;
      } else {
        firstRowByKey.set(key, raw.rowNumber);
      }
      if (existingKeys.has(key)) {
        warnings.push("Possible duplicate of an existing verification item in this project.");
        duplicate = true;
      }
    }

    const status: ImportRowStatus = errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ready";
    const siteLabel = siteInferred
      ? (siteNameById.get(siteId ?? "") ?? "")
      : siteResolved
        ? (siteNameById.get(siteId ?? "") ?? raw.site.trim())
        : raw.site.trim() !== ""
          ? raw.site.trim()
          : PROJECT_WIDE_LABEL;

    return {
      rowNumber: raw.rowNumber,
      status,
      errors,
      warnings,
      duplicate,
      display: {
        question,
        priorityLabel,
        siteLabel,
        siteInferred,
        targetActivity: raw.targetActivity.trim(),
        frameworkLabel:
          frameworkLabel ||
          [raw.framework.trim(), raw.frameworkItem.trim()].filter(Boolean).join(" · "),
      },
      insert:
        errors.length === 0
          ? { question, priority, siteId, targetActivityId, frameworkItemId }
          : null,
    };
  });
}

/** Comparison key for a possible duplicate: priority is deliberately not part of it. */
function duplicateKey(
  question: string,
  siteId: string | null,
  targetActivityId: string | null,
  frameworkItemId: string | null,
): string {
  return JSON.stringify([question.trim(), siteId, targetActivityId, frameworkItemId]);
}

export type ImportPreviewRow = {
  rowNumber: number;
  status: ImportRowStatus;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
  question: string;
  priorityLabel: string;
  siteLabel: string;
  siteInferred: boolean;
  targetActivity: string;
  frameworkLabel: string;
};

export type ImportPreview = {
  totalRows: number;
  readyCount: number;
  warningCount: number;
  errorCount: number;
  duplicateCount: number;
  rows: ImportPreviewRow[];
};

/** Browser-safe projection: no ids. */
export function toPreview(validated: ValidatedRow[]): ImportPreview {
  return {
    totalRows: validated.length,
    readyCount: validated.filter((r) => r.status === "ready").length,
    warningCount: validated.filter((r) => r.status === "warning").length,
    errorCount: validated.filter((r) => r.status === "error").length,
    duplicateCount: validated.filter((r) => r.duplicate).length,
    rows: validated.map((r) => ({
      rowNumber: r.rowNumber,
      status: r.status,
      errors: r.errors,
      warnings: r.warnings,
      duplicate: r.duplicate,
      ...r.display,
    })),
  };
}
