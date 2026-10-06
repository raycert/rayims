"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { BulkDocumentPicker } from "@/components/documents/bulk-document-picker";
import { formatFileSize } from "@/components/evidence/evidence-format";
import { createClient } from "@/lib/supabase/client";
import { getStorage } from "@/lib/storage";
import { checkDocumentVersionFile, DOCUMENT_VERSION_ACCEPT } from "@/lib/validation/document-versions";
import { prepareDocumentVersionUpload, registerDocumentVersion } from "@/lib/mutations/document-versions";
import {
  evaluateRows,
  fileKey,
  matchBatch,
  MAX_BATCH_FILES,
  summarize,
  TOTAL_SIZE_WARNING_BYTES,
  type BulkDocument,
  type BulkFile,
  type FileMatch,
  type RowEvaluation,
  type RowStatus,
} from "@/lib/documents/bulk-match";
import { dateInZone } from "@/lib/ui/business-date";
import type { Tone } from "@/lib/ui/status-tones";

type Entry = { id: string; file: File; bulk: BulkFile };
type Origin = "auto" | "suggested" | "none" | "manual";
type Row = {
  id: string;
  file: File;
  bulk: BulkFile;
  duplicateOf: number | null;
  match: FileMatch;
  documentId: string | null;
  accepted: boolean;
  included: boolean;
  revision: string;
  origin: Origin;
};
type RunState = { phase: "queued" | "uploading" | "completed" | "failed"; versionNo?: number; error?: string };
type Job = { rowId: string; file: File; documentId: string; revision: string };
type Filter = "all" | "ready" | "review" | "unmatched" | "blocked";

const STATUS_LABEL: Record<RowStatus, string> = { ready: "Ready", "needs-review": "Needs review", unmatched: "Unmatched", blocked: "Blocked", skipped: "Skipped", conflict: "Conflict" };
const STATUS_TONE: Record<RowStatus, Tone> = { ready: "success", "needs-review": "warning", unmatched: "neutral", blocked: "danger", skipped: "neutral", conflict: "danger" };
const ORIGIN_LABEL: Record<Origin, string> = { auto: "Auto-match", suggested: "Suggested", none: "No match", manual: "Manual" };
const ORIGIN_TONE: Record<Origin, Tone> = { auto: "success", suggested: "info", none: "neutral", manual: "neutral" };
const RUN_LABEL: Record<RunState["phase"], string> = { queued: "Queued", uploading: "Uploading…", completed: "Completed", failed: "Failed" };
const RUN_TONE: Record<RunState["phase"], Tone> = { queued: "neutral", uploading: "info", completed: "success", failed: "danger" };

function makeEntry(file: File): Entry {
  const check = checkDocumentVersionFile({ name: file.name, size: file.size, type: file.type });
  const base = { name: file.name, size: file.size, lastModified: file.lastModified };
  return { id: crypto.randomUUID(), file, bulk: { ...base, key: fileKey(base), error: check.ok ? null : check.error } };
}

/**
 * Bulk Document Upload (Phase 7C, ADR-021). Choose files → analyze / Match Review → confirm → upload one file at a
 * time → result summary. Client-orchestrated: each file goes through the SAME three steps as a single Version upload
 * (prepareDocumentVersionUpload → direct browser upload to the private bucket → registerDocumentVersion), so every file
 * is revalidated by the server and is atomic on its own; a failure never rolls back the files that succeeded. Nothing
 * about the batch, the matching or its confidence is stored — the Versions created are the audit trail.
 */
export function BulkUploadView({ projectId, catalog }: { projectId: string; catalog: BulkDocument[] }) {
  const router = useRouter();
  const [stage, setStage] = useState<"select" | "review" | "upload">("select");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [receivedOn, setReceivedOn] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [run, setRun] = useState<Record<string, RunState>>({});
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const jobs = useRef<Map<string, Job>>(new Map());
  const receivedOnRef = useRef("");

  const tooMany = entries.length > MAX_BATCH_FILES;
  const totalSize = entries.reduce((n, e) => n + e.file.size, 0);

  useEffect(() => {
    if (!busy) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);

  // ---- Step 1: choose files
  function addFiles(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    // Copy the files NOW: a FileList from an <input> is live and is emptied when the input is reset below.
    const incoming = Array.from(list).map(makeEntry);
    setEntries((prev) => [...prev, ...incoming]);
  }

  // ---- Step 2: analyze / Match Review
  function analyze() {
    const bulk = entries.map((e) => e.bulk);
    const matched = matchBatch(bulk, catalog);
    setRows(
      entries.map((e, i): Row => {
        const m = matched[i];
        return {
          id: e.id,
          file: e.file,
          bulk: e.bulk,
          duplicateOf: m.duplicateOf,
          match: m.match,
          documentId: m.match.documentId,
          accepted: m.match.kind === "auto",
          included: true,
          revision: m.match.revisionHint ?? "",
          origin: m.match.kind,
        };
      }),
    );
    setFilter("all");
    setReceivedOn((v) => v || dateInZone(new Date()));
    setRun({});
    setStage("review");
  }

  const evals: RowEvaluation[] = useMemo(
    () => evaluateRows(rows.map((r) => ({ file: r.bulk, duplicateOf: r.duplicateOf, documentId: r.documentId, accepted: r.accepted, included: r.included })), catalog),
    [rows, catalog],
  );
  const summary = useMemo(() => summarize(evals), [evals]);
  const byId = useMemo(() => new Map(catalog.map((d) => [d.id, d])), [catalog]);

  function patch(i: number, p: Partial<Row>) {
    setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...p } : r)));
  }

  function choose(i: number, documentId: string | null) {
    const r = rows[i];
    patch(i, { documentId, accepted: documentId !== null, origin: documentId === null ? r.origin : documentId === r.match.documentId ? r.match.kind : "manual" });
  }

  const visible = rows
    .map((r, i) => ({ r, e: evals[i], i }))
    .filter(({ e }) => {
      if (filter === "all") return true;
      if (filter === "ready") return e.status === "ready";
      if (filter === "review") return e.status === "needs-review" || e.status === "conflict";
      if (filter === "unmatched") return e.status === "unmatched";
      return e.status === "blocked";
    });

  // ---- Steps 4-5: upload, one file at a time
  async function uploadOne(job: Job): Promise<RunState> {
    try {
      const meta = { name: job.file.name, size: job.file.size, type: job.file.type };
      // Every attempt (first or retry) starts with a fresh prepare: a fresh key and a fresh server validation.
      const prepared = await prepareDocumentVersionUpload(projectId, job.documentId, meta);
      if (!prepared.ok) return { phase: "failed", error: prepared.error };
      try {
        await getStorage(createClient()).upload(prepared.data.storageKey, job.file, { contentType: prepared.data.contentType });
      } catch {
        return { phase: "failed", error: "The upload failed. Check your connection and retry." };
      }
      const registered = await registerDocumentVersion(projectId, job.documentId, {
        storageKey: prepared.data.storageKey,
        ...meta,
        revision: job.revision,
        receivedOn: receivedOnRef.current,
        notes: "",
      });
      if (!registered.ok) return { phase: "failed", error: registered.error };
      return { phase: "completed", versionNo: registered.data.versionNo };
    } catch {
      return { phase: "failed", error: "The upload failed. Try again." };
    }
  }

  async function processQueue(rowIds: string[]) {
    setBusy(true);
    setRun((prev) => ({ ...prev, ...Object.fromEntries(rowIds.map((id) => [id, { phase: "queued" } as RunState])) }));
    for (const id of rowIds) {
      const job = jobs.current.get(id);
      if (!job) continue;
      setCurrent(job.file.name);
      setRun((prev) => ({ ...prev, [id]: { phase: "uploading" } }));
      const result = await uploadOne(job);
      setRun((prev) => ({ ...prev, [id]: result }));
    }
    setCurrent(null);
    setBusy(false);
  }

  function startUpload() {
    setConfirming(false);
    receivedOnRef.current = receivedOn;
    jobs.current = new Map();
    const ids: string[] = [];
    rows.forEach((r, i) => {
      if (evals[i].status === "ready" && r.documentId) {
        jobs.current.set(r.id, { rowId: r.id, file: r.file, documentId: r.documentId, revision: r.revision.trim() });
        ids.push(r.id);
      }
    });
    setStage("upload");
    void processQueue(ids);
  }

  const failedIds = rows.filter((r) => run[r.id]?.phase === "failed").map((r) => r.id);
  const jobRows = rows.filter((r) => run[r.id]);
  const processed = jobRows.filter((r) => run[r.id]?.phase === "completed" || run[r.id]?.phase === "failed").length;
  const done = stage === "upload" && !busy && jobRows.length > 0 && processed === jobRows.length;
  const dateOk = receivedOn === "" || /^\d{4}-\d{2}-\d{2}$/.test(receivedOn);
  const canUpload = summary.ready > 0 && summary.conflicts === 0 && dateOk && !busy;

  function reset() {
    setEntries([]);
    setRows([]);
    setRun({});
    setStage("select");
    router.refresh();
  }

  // ---------------------------------------------------------------------------------------------- pieces
  const statusPill = (e: RowEvaluation) => <StatusBadge label={STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} />;

  const fileCell = (r: Row, e: RowEvaluation) => (
    <>
      <div className="break-words font-semibold" data-testid="bulk-file-name">
        {r.file.name}
      </div>
      <div className="text-xs text-muted">{formatFileSize(r.file.size)}</div>
      {e.blocker ? (
        <div role="note" className="mt-1 break-words text-xs font-medium text-danger">
          {e.blocker}
        </div>
      ) : null}
      {e.warning ? (
        <div role="note" className="mt-1 break-words text-xs font-medium text-warning">
          Warning: {e.warning}
        </div>
      ) : null}
    </>
  );

  const docCell = (r: Row, i: number, e: RowEvaluation) => (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge label={ORIGIN_LABEL[r.origin]} tone={ORIGIN_TONE[r.origin]} />
        {e.status === "needs-review" && r.documentId ? (
          <button type="button" onClick={() => patch(i, { accepted: true })} className="text-xs font-semibold text-primary hover:underline" aria-label={`Accept suggestion for ${r.file.name}`}>
            Accept
          </button>
        ) : null}
      </div>
      <BulkDocumentPicker catalog={catalog} value={r.documentId} candidates={r.match.candidates.map((c) => c.documentId)} onChange={(id) => choose(i, id)} label={r.file.name} />
    </div>
  );

  const versionCell = (e: RowEvaluation) => (e.nextVersionNo ? <span title="Preview — the server assigns the real number">→ V{e.nextVersionNo}</span> : <span className="text-muted">—</span>);

  const revisionCell = (r: Row, i: number) => (
    <Input value={r.revision} maxLength={100} onChange={(ev) => patch(i, { revision: ev.target.value })} placeholder="e.g. Rev.02" aria-label={`Revision for ${r.file.name}`} className="min-h-10" />
  );

  const includeCell = (r: Row, i: number, e: RowEvaluation) => (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
      <input type="checkbox" checked={r.included && !r.bulk.error && r.duplicateOf === null} disabled={!!r.bulk.error || r.duplicateOf !== null} onChange={(ev) => patch(i, { included: ev.target.checked })} aria-label={`Include ${r.file.name}`} className="size-4" />
      <span>{e.status === "skipped" ? "Skipped" : "Include"}</span>
    </label>
  );

  const actionBar = (testid: string) => (
    <div data-testid={testid} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-sm" data-testid={`${testid}-summary`}>
        <span className="font-semibold">{summary.ready} ready</span>
        {" · "}
        {summary.needsReview + summary.conflicts} needs review · {summary.unmatched} unmatched · {summary.blocked} blocked · {summary.skipped} skipped
      </p>
      <div className="flex flex-col items-end gap-1">
        <Button type="button" onClick={() => setConfirming(true)} disabled={!canUpload} data-testid={`${testid}-upload`}>
          Upload {summary.ready} {summary.ready === 1 ? "file" : "files"}
        </Button>
        {summary.conflicts > 0 ? (
          <span role="alert" className="text-xs text-danger">
            Resolve {summary.conflicts} conflicting {summary.conflicts === 1 ? "file" : "files"} first — one file per Document.
          </span>
        ) : !dateOk ? (
          <span role="alert" className="text-xs text-danger">
            Enter a valid received date.
          </span>
        ) : summary.ready === 0 ? (
          <span className="text-xs text-muted">No file is ready yet.</span>
        ) : null}
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------------------------- render
  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Bulk Upload</h2>
        <p className="mt-1 text-sm text-muted">
          Attach many client files to existing Required Documents. Each file becomes a new Version; no Documents are created. You confirm every match before anything is uploaded.
        </p>
      </div>

      {stage === "select" ? (
        <div className="space-y-4">
          {catalog.length === 0 ? (
            <div role="note" className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
              This project has no Documents yet. <Link href={`/projects/${projectId}/documents`} className="font-semibold text-primary hover:underline">Create or import Required Documents</Link> first.
            </div>
          ) : null}
          <div
            data-testid="bulk-dropzone"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`rounded-lg border-2 border-dashed px-4 py-8 text-center ${dragging ? "border-primary bg-primary/5" : "border-border bg-surface"}`}
          >
            <p className="text-sm font-medium">Drag files here, or choose them</p>
            <div className="mt-3 flex justify-center">
              <input
                id="bulk-files"
                data-testid="bulk-file-input"
                type="file"
                multiple
                accept={DOCUMENT_VERSION_ACCEPT}
                className="peer sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <label htmlFor="bulk-files" className={`${buttonClasses("secondary")} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary`}>
                Choose files
              </label>
            </div>
            <p className="mt-3 text-xs text-muted">PDF, Word, Excel or PowerPoint · up to 10 MB each · up to {MAX_BATCH_FILES} files per batch</p>
          </div>

          {entries.length > 0 ? (
            <section className="rounded-lg border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold" data-testid="bulk-selected-count">
                  {entries.length} {entries.length === 1 ? "file" : "files"} selected · {formatFileSize(totalSize)}
                </h3>
                <button type="button" onClick={() => setEntries([])} className="text-xs font-semibold text-primary hover:underline">
                  Clear all
                </button>
              </div>
              {tooMany ? (
                <p role="alert" data-testid="bulk-too-many" className="border-b border-border px-4 py-2.5 text-sm font-medium text-danger">
                  Select up to {MAX_BATCH_FILES} files per batch. Remove {entries.length - MAX_BATCH_FILES} to continue.
                </p>
              ) : null}
              {totalSize > TOTAL_SIZE_WARNING_BYTES ? (
                <p role="note" data-testid="bulk-size-warning" className="border-b border-border px-4 py-2.5 text-sm text-warning">
                  The selected files total {formatFileSize(totalSize)}. A large batch takes a long time on a slow connection; it is not blocked.
                </p>
              ) : null}
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="break-words font-medium">{e.file.name}</div>
                      <div className="text-xs text-muted">{formatFileSize(e.file.size)}</div>
                      {e.bulk.error ? <div className="mt-0.5 break-words text-xs font-medium text-danger">{e.bulk.error}</div> : null}
                    </div>
                    <button type="button" onClick={() => setEntries((prev) => prev.filter((x) => x.id !== e.id))} className="min-h-10 shrink-0 text-xs font-semibold text-primary hover:underline" aria-label={`Remove ${e.file.name}`}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
                <Button type="button" onClick={analyze} disabled={tooMany || catalog.length === 0} data-testid="bulk-analyze">
                  Analyze {entries.length} {entries.length === 1 ? "file" : "files"}
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {stage === "review" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <button type="button" onClick={() => setStage("select")} className="text-sm font-semibold text-primary hover:underline">
              ← Change files
            </button>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted">Received on (every Version of this batch)</span>
                <Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className="min-h-10 md:w-44" aria-label="Received on" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted">Show</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Show files" className="min-h-10 rounded-md border border-border bg-surface px-2.5 text-sm">
                  <option value="all">All ({rows.length})</option>
                  <option value="ready">Ready ({summary.ready})</option>
                  <option value="review">Needs review ({summary.needsReview + summary.conflicts})</option>
                  <option value="unmatched">Unmatched ({summary.unmatched})</option>
                  <option value="blocked">Blocked ({summary.blocked})</option>
                </select>
              </label>
            </div>
          </div>
          {actionBar("bulk-bar-top")}

          {visible.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">No files in this view.</p>
          ) : (
            <>
              {/* Desktop table — not overflow-hidden: the Document picker panel must not be clipped */}
              <div className="hidden rounded-lg border border-border bg-surface shadow-sm md:block" data-testid="bulk-table">
                <table className="w-full table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                      <th className="w-[24%] px-4 py-3">File</th>
                      <th className="w-[32%] px-2.5 py-3">Document</th>
                      <th className="w-[8%] px-2.5 py-3">Next</th>
                      <th className="w-[14%] px-2.5 py-3">Revision</th>
                      <th className="w-[12%] px-2.5 py-3">Status</th>
                      <th className="w-[10%] px-2.5 py-3">
                        <span className="sr-only">Include</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(({ r, e, i }) => (
                      <tr key={r.id} data-testid="bulk-row" data-file={r.file.name} data-status={e.status} className="border-t border-border align-top">
                        <td className="px-4 py-3">{fileCell(r, e)}</td>
                        <td className="px-2.5 py-3">{docCell(r, i, e)}</td>
                        <td className="px-2.5 py-3 pt-4">{versionCell(e)}</td>
                        <td className="px-2.5 py-3">{revisionCell(r, i)}</td>
                        <td className="px-2.5 py-3 pt-4">{statusPill(e)}</td>
                        <td className="px-2.5 py-3">{includeCell(r, i, e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Phone: stacked cards, no horizontal scrolling */}
              <div className="flex flex-col gap-2.5 md:hidden" data-testid="bulk-cards">
                {visible.map(({ r, e, i }) => (
                  <div key={r.id} data-testid="bulk-card" data-file={r.file.name} data-status={e.status} className="rounded-lg border border-border bg-surface p-3.5 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">{fileCell(r, e)}</div>
                      {statusPill(e)}
                    </div>
                    {docCell(r, i, e)}
                    <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
                      <span className="text-muted">Next Version</span>
                      <span>{versionCell(e)}</span>
                      <span className="text-muted">Revision</span>
                      {revisionCell(r, i)}
                    </div>
                    <div className="mt-1">{includeCell(r, i, e)}</div>
                  </div>
                ))}
              </div>
              {visible.length > 8 ? actionBar("bulk-bar-bottom") : null}
            </>
          )}
        </div>
      ) : null}

      {stage === "upload" ? (
        <div className="space-y-4" data-testid="bulk-upload-stage">
          <section className="rounded-lg border border-border bg-surface px-4 py-3">
            <div aria-live="polite" className="text-sm" data-testid="bulk-progress">
              <span className="font-semibold">
                {processed} / {jobRows.length}
              </span>{" "}
              {busy ? `· Uploading ${current ?? ""}` : done ? "· Finished" : ""}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-neutral-soft" role="progressbar" aria-valuemin={0} aria-valuemax={jobRows.length} aria-valuenow={processed} aria-label="Upload progress">
              <div className="h-full bg-primary transition-all" style={{ width: `${jobRows.length ? (processed / jobRows.length) * 100 : 0}%` }} />
            </div>
            {busy ? <p className="mt-2 text-xs text-muted">Files upload one at a time. Keep this page open until it finishes.</p> : null}
          </section>

          <section className="rounded-lg border border-border bg-surface" data-testid="bulk-run-list">
            <ul className="divide-y divide-border">
              {jobRows.map((r) => {
                const s = run[r.id] ?? { phase: "queued" as const };
                const doc = r.documentId ? byId.get(r.documentId) : null;
                return (
                  <li key={r.id} data-testid="bulk-run-row" data-file={r.file.name} data-phase={s.phase} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="break-words font-medium">{r.file.name}</div>
                      <div className="break-words text-xs text-muted">
                        {doc ? doc.title : ""}
                        {s.phase === "completed" ? ` · created V${s.versionNo}` : ""}
                      </div>
                      {s.phase === "failed" ? (
                        <div role="note" className="mt-0.5 break-words text-xs font-medium text-danger">
                          {s.error}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={RUN_LABEL[s.phase]} tone={RUN_TONE[s.phase]} />
                      {s.phase === "failed" && !busy ? (
                        <Button type="button" variant="secondary" className="min-h-9 px-3" onClick={() => void processQueue([r.id])} aria-label={`Retry ${r.file.name}`}>
                          Retry
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {done ? (
            <section data-testid="bulk-result" className="rounded-lg border border-border bg-surface px-4 py-4">
              <h3 className="text-base font-semibold">Upload finished</h3>
              <p className="mt-1 text-sm" data-testid="bulk-result-counts">
                Completed: {jobRows.filter((r) => run[r.id]?.phase === "completed").length} · Failed: {failedIds.length} · Skipped: {summary.skipped} · Not uploaded (needs review, unmatched or blocked):{" "}
                {summary.needsReview + summary.unmatched + summary.blocked + summary.conflicts}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/projects/${projectId}/documents`} className={buttonClasses("primary")} data-testid="bulk-back">
                  Back to Documents
                </Link>
                {failedIds.length > 0 ? (
                  <Button type="button" variant="secondary" onClick={() => void processQueue(failedIds)} data-testid="bulk-retry-failed">
                    Retry Failed ({failedIds.length})
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={reset}>
                  Upload more files
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {confirming ? (
        <>
          <div className="fixed inset-0 z-[55] bg-black/30" onClick={() => setConfirming(false)} aria-hidden="true" />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bulk-confirm-title"
            data-testid="bulk-confirm"
            onKeyDown={(e) => {
              if (e.key === "Escape") setConfirming(false);
            }}
            className="fixed z-[56] w-full bg-surface p-5 shadow-xl max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-2xl max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))] md:top-1/2 md:left-1/2 md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg"
          >
            <h2 id="bulk-confirm-title" className="text-base font-semibold">
              Upload {summary.ready} {summary.ready === 1 ? "file" : "files"}?
            </h2>
            <ul className="mt-3 space-y-1 text-sm">
              <li>Ready to upload: {summary.ready}</li>
              <li>Skipped: {summary.skipped}</li>
              <li>Blocked: {summary.blocked}</li>
              <li>Unmatched: {summary.unmatched}</li>
              <li>Needs review (not uploaded): {summary.needsReview}</li>
            </ul>
            <p className="mt-3 text-xs text-muted">Only the ready files are uploaded, one at a time. Each creates a new Version; a Version cannot be edited afterwards.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button autoFocus type="button" variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={startUpload} data-testid="bulk-confirm-upload">
                Upload
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
