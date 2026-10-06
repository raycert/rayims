/**
 * Bulk Document Upload (Phase 7C, ADR-021): the pure, deterministic matching and row-state rules. No I/O,
 * no database, no AI, no fuzzy-matching library — the same input always gives the same result, so it is
 * unit-tested directly. The browser uses it only for UX (a suggestion the consultant confirms); every file is
 * revalidated by the server through the existing Version upload actions, so nothing here is trusted.
 *
 * Self-contained on purpose (no imports): it is loaded straight by Node in the unit test.
 */

export const MAX_BATCH_FILES = 50;
/** Advisory only: a larger total is warned about, never blocked (the 10 MB per-file limit stays authoritative). */
export const TOTAL_SIZE_WARNING_BYTES = 300 * 1024 * 1024;
/** A title-token suggestion needs this share of the title's AND of the file name's words in common … */
export const TOKEN_OVERLAP_THRESHOLD = 0.8;
/** … with at least this many words shared … */
export const MIN_SHARED_TOKENS = 2;
/** … and a Document Code shorter than this (letters + digits) is never searched for in a file name. */
export const MIN_CODE_LENGTH = 3;
/** The best title-token candidate must beat the runner-up by at least this much to count as unique. */
export const TOKEN_UNIQUE_MARGIN = 0.1;

// Messages shared with the server's single-upload rules (lib/mutations/document-versions.ts).
export const NOT_APPLICABLE_MESSAGE = "Versions cannot be uploaded while this document is Not Applicable.";
export const OPEN_ASSESSMENT_MESSAGE = "Complete the current Gap Assessment before uploading a new Version.";
export const SAME_AS_CURRENT_WARNING = "Same file name and size as current Version.";
export const DUPLICATE_FILE_MESSAGE = "Duplicate of an earlier selected file.";
export const CONFLICT_MESSAGE = "Another file in this batch targets the same Document. Keep one, reassign or skip.";
export const DOCUMENT_GONE_MESSAGE = "This Document is no longer available.";

export type BulkDocument = {
  id: string;
  docCode: string | null;
  title: string;
  siteId: string | null;
  siteName: string | null;
  isApplicable: boolean;
  /** Highest version_no, null = no Version yet. */
  latestVersionNo: number | null;
  latestFileName: string | null;
  latestFileSize: number | null;
  /** The current Version has an open (Under Review) Gap Assessment. */
  hasOpenAssessment: boolean;
};

export type BulkFile = {
  /** Identity inside the batch: name|size|lastModified. */
  key: string;
  name: string;
  size: number;
  lastModified: number;
  /** The file-policy message (type / size / empty), null = acceptable. */
  error: string | null;
};

export type MatchReason = "code" | "code-duplicate" | "title" | "title-duplicate" | "title-tokens";

export type MatchCandidate = { documentId: string; siteHint: boolean };

export type FileMatch = {
  /** auto = unique Document Code; suggested = needs the consultant's acceptance; none = nothing found. */
  kind: "auto" | "suggested" | "none";
  reason: MatchReason | null;
  /** The pre-selected Document (null when the consultant must choose, e.g. a code shared by several Documents). */
  documentId: string | null;
  candidates: MatchCandidate[];
  /** e.g. "Rev.02" — prefills the optional revision field; never a Version number. */
  revisionHint: string | null;
};

// ---------------------------------------------------------------------------------------------- normalization

/** Lower case, accents folded (Vietnamese included: "Quy trình" → "quy trinh", đ → d). Matching only. */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/** Folded words separated by single spaces; "-", "_", "." and any other punctuation are separators. */
export function normalizeWords(value: string): string {
  return foldText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A Document Code compared without separators or case: "PR-QMS-01" → "prqms01". */
export function normalizeCode(code: string): string {
  return normalizeWords(code).replace(/ /g, "");
}

export function stripExtension(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{1,5}$/, "");
}

const REVISION_RE = /(?:^|[\s_\-.()[\]])((?:rev(?:ision)?\.?\s*(\d{1,3}))|(?:v(\d{1,3}(?:\.\d{1,2})?)))(?![A-Za-z0-9])/gi;
const DATE_RES = [/(?:^|[^0-9])\d{4}[-_.]\d{1,2}[-_.]\d{1,2}(?![0-9])/g, /(?:^|[^0-9])\d{1,2}[-_.]\d{1,2}[-_.]\d{4}(?![0-9])/g, /(?:^|[^0-9])(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?![0-9])/g];

/**
 * A revision hint from the file name: "…_Rev.02.pdf", "Rev02", "Revision 2" → "Rev.02" / "Rev.2"; "V2" → "V2".
 * The LAST such token wins. A hint only prefills the optional Revision field — RayIMS' own Version number
 * (V1, V2, …) is always assigned by the server.
 */
export function revisionHint(fileName: string): string | null {
  const stem = stripExtension(fileName);
  let last: string | null = null;
  for (const m of stem.matchAll(REVISION_RE)) {
    last = m[2] !== undefined ? `Rev.${m[2]}` : `V${m[3]}`;
  }
  return last;
}

/**
 * The words of a file name used for TITLE matching: extension, revision tokens (Rev01, Rev.02, Revision 2, V2) and
 * obvious dates (2026-10-01, 01.10.2026, 20261001) removed, then normalized. The original name is never changed.
 */
export function cleanedStemWords(fileName: string): string {
  let stem = stripExtension(fileName);
  stem = stem.replace(REVISION_RE, " ");
  for (const re of DATE_RES) stem = stem.replace(re, " ");
  return normalizeWords(stem);
}

function fileWords(fileName: string): string[] {
  const w = normalizeWords(stripExtension(fileName));
  return w ? w.split(" ") : [];
}

/** The code's letters/digits appear in the file name as whole tokens (possibly split differently): "PR-QMS-01" in "PR_QMS_01 rev2". */
export function containsCode(tokens: string[], codeSquashed: string): boolean {
  if (codeSquashed.length < MIN_CODE_LENGTH) return false;
  for (let i = 0; i < tokens.length; i += 1) {
    let acc = "";
    for (let j = i; j < tokens.length; j += 1) {
      acc += tokens[j];
      if (acc === codeSquashed) return true;
      if (!codeSquashed.startsWith(acc)) break;
    }
  }
  return false;
}

/** A site name that appears in the file name as whole words: used only to rank / disambiguate candidates. */
function siteHintFor(tokens: string[], siteName: string | null): boolean {
  if (!siteName) return false;
  const site = normalizeWords(siteName);
  if (site.replace(/ /g, "").length < 3) return false;
  const s = site.split(" ");
  for (let i = 0; i + s.length <= tokens.length; i += 1) {
    if (s.every((w, k) => tokens[i + k] === w)) return true;
  }
  return false;
}

function rankCandidates(docs: BulkDocument[], tokens: string[]): MatchCandidate[] {
  const withHint = docs.map((d) => ({ documentId: d.id, siteHint: siteHintFor(tokens, d.siteName) }));
  return [...withHint.filter((c) => c.siteHint), ...withHint.filter((c) => !c.siteHint)];
}

/** Several Documents qualify: pre-select one only when the file name's site words single one out. */
function suggestAmong(docs: BulkDocument[], tokens: string[], reason: MatchReason, hint: string | null): FileMatch {
  const candidates = rankCandidates(docs, tokens);
  const hinted = candidates.filter((c) => c.siteHint);
  return { kind: "suggested", reason, documentId: hinted.length === 1 ? hinted[0].documentId : null, candidates, revisionHint: hint };
}

const none = (hint: string | null): FileMatch => ({ kind: "none", reason: null, documentId: null, candidates: [], revisionHint: hint });

// ------------------------------------------------------------------------------------------------- matching

/**
 * Matches ONE file name to the project's Documents. Order of evidence:
 *  1. Document Code as whole tokens in the file name — unique → AUTO; shared by several Documents → SUGGESTED (choose).
 *     When several different codes appear, the longest (most specific) wins.
 *  2. The cleaned file name equals a Document title (accents / case / separators ignored) → SUGGESTED.
 *  3. High word overlap with exactly one title (≥ TOKEN_OVERLAP_THRESHOLD of both sides, ≥ MIN_SHARED_TOKENS) → SUGGESTED.
 * A site name is only a ranking / disambiguation hint — it never matches a file by itself. Nothing is written anywhere.
 */
export function matchFileName(fileName: string, catalog: BulkDocument[]): FileMatch {
  const hint = revisionHint(fileName);
  const tokens = fileWords(fileName);
  if (tokens.length === 0) return none(hint);

  // 1. Document Code
  const byCode = catalog
    .map((d) => ({ d, code: d.docCode ? normalizeCode(d.docCode) : "" }))
    .filter((x) => x.code.length >= MIN_CODE_LENGTH && containsCode(tokens, x.code));
  if (byCode.length > 0) {
    const longest = Math.max(...byCode.map((x) => x.code.length));
    const top = byCode.filter((x) => x.code.length === longest);
    if (top.length === 1) {
      return { kind: "auto", reason: "code", documentId: top[0].d.id, candidates: [{ documentId: top[0].d.id, siteHint: false }], revisionHint: hint };
    }
    return suggestAmong(top.map((x) => x.d), tokens, "code-duplicate", hint);
  }

  // 2. Exact title (after removing revision / date suffixes)
  const stem = cleanedStemWords(fileName);
  if (stem) {
    const exact = catalog.filter((d) => normalizeWords(d.title) === stem);
    if (exact.length === 1) {
      return { kind: "suggested", reason: "title", documentId: exact[0].id, candidates: [{ documentId: exact[0].id, siteHint: false }], revisionHint: hint };
    }
    if (exact.length > 1) return suggestAmong(exact, tokens, "title-duplicate", hint);
  }

  // 3. Title word overlap
  const fileSet = new Set(stem ? stem.split(" ") : []);
  if (fileSet.size > 0) {
    const scored = catalog
      .map((d) => {
        const titleWords = normalizeWords(d.title);
        const t = new Set(titleWords ? titleWords.split(" ") : []);
        let shared = 0;
        for (const w of t) if (fileSet.has(w)) shared += 1;
        const titleCoverage = t.size ? shared / t.size : 0;
        const fileCoverage = shared / fileSet.size;
        return { d, titleWords, shared, score: Math.min(titleCoverage, fileCoverage), ok: shared >= MIN_SHARED_TOKENS && titleCoverage >= TOKEN_OVERLAP_THRESHOLD && fileCoverage >= TOKEN_OVERLAP_THRESHOLD };
      })
      .filter((x) => x.ok)
      .sort((a, b) => b.score - a.score);
    if (scored.length === 1) {
      return { kind: "suggested", reason: "title-tokens", documentId: scored[0].d.id, candidates: [{ documentId: scored[0].d.id, siteHint: false }], revisionHint: hint };
    }
    if (scored.length > 1) {
      // Documents sharing one title across Sites are one candidate group; otherwise the best must clearly win.
      const sameTitle = scored.every((x) => x.titleWords === scored[0].titleWords);
      if (sameTitle) return suggestAmong(scored.map((x) => x.d), tokens, "title-duplicate", hint);
      if (scored[0].score - scored[1].score >= TOKEN_UNIQUE_MARGIN) {
        return { kind: "suggested", reason: "title-tokens", documentId: scored[0].d.id, candidates: [{ documentId: scored[0].d.id, siteHint: false }], revisionHint: hint };
      }
    }
  }
  return none(hint);
}

/** key = name|size|lastModified — two selections with the same key are the same file picked twice. */
export function fileKey(f: { name: string; size: number; lastModified: number }): string {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

/** For each file, the index of the EARLIER identical selection (null = first occurrence). */
export function duplicateOf(files: Pick<BulkFile, "key">[]): (number | null)[] {
  const seen = new Map<string, number>();
  return files.map((f, i) => {
    const first = seen.get(f.key);
    if (first === undefined) {
      seen.set(f.key, i);
      return null;
    }
    return first;
  });
}

/** Matches a whole batch. Invalid files are not matched (they are blocked by the file policy anyway). */
export function matchBatch(files: BulkFile[], catalog: BulkDocument[]): { match: FileMatch; duplicateOf: number | null }[] {
  const dup = duplicateOf(files);
  return files.map((f, i) => ({ match: f.error ? none(null) : matchFileName(f.name, catalog), duplicateOf: dup[i] }));
}

// ------------------------------------------------------------------------------------------------- row state

export type RowInput = {
  file: BulkFile;
  /** Index of an earlier identical selection, null = none. */
  duplicateOf: number | null;
  /** The Document the consultant (or the matcher) targets, null = none. */
  documentId: string | null;
  /** The consultant has accepted the assignment (AUTO and manual assignments start accepted; suggestions do not). */
  accepted: boolean;
  /** false = Skip. */
  included: boolean;
};

export type RowStatus = "ready" | "needs-review" | "unmatched" | "blocked" | "skipped" | "conflict";

export type RowEvaluation = {
  status: RowStatus;
  /** Why the row cannot upload (blocked / conflict); null otherwise. */
  blocker: string | null;
  warning: string | null;
  /** Preview only — the server assigns the real Version number. */
  nextVersionNo: number | null;
};

/**
 * The state of every row of the Match Review. Ready means: a valid file, included, matched to ONE Applicable Document
 * whose current Version has no open Gap Assessment, accepted, and no other included file targets the same Document.
 */
export function evaluateRows(rows: RowInput[], catalog: BulkDocument[]): RowEvaluation[] {
  const byId = new Map(catalog.map((d) => [d.id, d]));
  const base = rows.map((r): RowEvaluation => {
    const doc = r.documentId ? byId.get(r.documentId) ?? null : null;
    const next = doc ? (doc.latestVersionNo ?? 0) + 1 : null;
    const warning = doc && doc.latestFileName !== null && doc.latestFileName === r.file.name && doc.latestFileSize === r.file.size ? SAME_AS_CURRENT_WARNING : null;
    const make = (status: RowStatus, blocker: string | null = null): RowEvaluation => ({ status, blocker, warning, nextVersionNo: next });
    if (r.file.error) return { status: "blocked", blocker: r.file.error, warning: null, nextVersionNo: null };
    if (r.duplicateOf !== null) return { status: "blocked", blocker: DUPLICATE_FILE_MESSAGE, warning: null, nextVersionNo: null };
    if (!r.included) return make("skipped");
    if (!r.documentId) return { status: "unmatched", blocker: null, warning: null, nextVersionNo: null };
    if (!doc) return make("blocked", DOCUMENT_GONE_MESSAGE);
    if (!doc.isApplicable) return make("blocked", NOT_APPLICABLE_MESSAGE);
    if (doc.hasOpenAssessment) return make("blocked", OPEN_ASSESSMENT_MESSAGE);
    return make(r.accepted ? "ready" : "needs-review");
  });
  // One file per Document per batch: every included row that could otherwise upload and shares its Document is a conflict.
  const live = new Map<string, number[]>();
  rows.forEach((r, i) => {
    if (r.documentId && (base[i].status === "ready" || base[i].status === "needs-review")) live.set(r.documentId, [...(live.get(r.documentId) ?? []), i]);
  });
  for (const idx of live.values()) {
    if (idx.length > 1) for (const i of idx) base[i] = { ...base[i], status: "conflict", blocker: CONFLICT_MESSAGE };
  }
  return base;
}

export type BatchSummary = { ready: number; needsReview: number; unmatched: number; blocked: number; skipped: number; conflicts: number };

export function summarize(evals: RowEvaluation[]): BatchSummary {
  const n = (s: RowStatus) => evals.filter((e) => e.status === s).length;
  return { ready: n("ready"), needsReview: n("needs-review"), unmatched: n("unmatched"), blocked: n("blocked"), skipped: n("skipped"), conflicts: n("conflict") };
}

/** "PR-QMS-01 · Document Control Procedure · Viet Long" — "Project-wide" for a Document without a Site. */
export function documentLabel(d: Pick<BulkDocument, "docCode" | "title" | "siteName">): string {
  return [d.docCode, d.title, d.siteName ?? "Project-wide"].filter(Boolean).join(" · ");
}
