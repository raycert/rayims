"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { importDocuments, previewDocumentImport } from "@/lib/mutations/document-import";
import type { ImportPreview, ImportPreviewRow } from "@/lib/validation/document-import";

const MAX_BYTES = 2 * 1024 * 1024;
const STATUS_TONE = { ready: "success", warning: "warning", error: "danger" } as const;
const STATUS_LABEL = { ready: "Ready", warning: "Warning", error: "Error" } as const;
const ACTION_LABEL = { create: "New document", merge: "Merged into an earlier row", skip: "Skipped (already exists)" } as const;

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Messages({ row }: { row: ImportPreviewRow }) {
  return (
    <>
      {row.errors.map((m) => (
        <div key={m} className="mt-1 text-xs text-danger">
          {m}
        </div>
      ))}
      {row.warnings.map((m) => (
        <div key={m} className="mt-1 text-xs text-warning">
          {m}
        </div>
      ))}
    </>
  );
}

/**
 * Required Document Excel import (Phase 5E): download the template, choose a .xlsx, review the
 * server's validation, confirm warnings, import. Imports the REQUIRED DOCUMENT list only.
 */
export function ImportDocumentsView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"validating" | "importing" | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function buildForm(f: File, confirmedWarnings = 0): FormData {
    const form = new FormData();
    form.append("file", f);
    form.append("confirmedWarnings", String(confirmedWarnings));
    return form;
  }

  async function handleFile(selected: File) {
    const requestId = ++requestRef.current;
    setFile(selected);
    setPreview(null);
    setError(null);
    setNotice(null);
    setConfirmed(false);
    if (!selected.name.toLowerCase().endsWith(".xlsx")) {
      setError("Only .xlsx workbooks are supported.");
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError("This file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    setBusy("validating");
    try {
      const result = await previewDocumentImport(projectId, buildForm(selected));
      if (requestId !== requestRef.current) return;
      if (result.ok) setPreview(result.data);
      else setError(result.error);
    } catch {
      if (requestId !== requestRef.current) return;
      setError("Couldn't check this file. Make sure it is a .xlsx workbook under 2 MB and try again.");
    } finally {
      if (requestId === requestRef.current) setBusy(null);
    }
  }

  async function handleImport() {
    if (!file || !preview) return;
    const requestId = ++requestRef.current;
    setBusy("importing");
    setError(null);
    setNotice(null);
    try {
      const result = await importDocuments(projectId, buildForm(file, confirmed ? preview.warningCount : 0));
      if (requestId !== requestRef.current) return;
      if (!result.ok) {
        setError(result.error);
        setBusy(null);
        return;
      }
      if (result.data.imported) {
        const { created, skipped, warnings } = result.data;
        router.push(`/projects/${projectId}/documents?imported=${created}&skipped=${skipped}&warnings=${warnings}`);
        return;
      }
      setPreview(result.data.preview);
      setConfirmed(false);
      setNotice(
        result.data.reason === "errors"
          ? "Nothing was imported. The project or the file no longer passes validation. Review the updated results below."
          : "Nothing was imported. The warnings changed since your review (for example, a document was created meanwhile). Review them below and confirm again.",
      );
      setBusy(null);
    } catch {
      if (requestId !== requestRef.current) return;
      setError("Couldn't import the file. Nothing was imported. Try again.");
      setBusy(null);
    }
  }

  const hasErrors = !!preview && preview.errorCount > 0;
  const needsConfirm = !!preview && preview.warningCount > 0;
  const canImport = !!preview && !hasErrors && preview.createCount > 0 && (!needsConfirm || confirmed) && busy === null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Import Required Documents</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Import the list of documents required for this project. Files and assessment results are added later. Up to 500 rows,
            .xlsx only, 2 MB maximum.
          </p>
        </div>
        <a href={`/projects/${projectId}/documents/template`} className={buttonClasses("secondary")}>
          Download Template
        </a>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label="Choose an Excel workbook"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              e.target.value = "";
              if (selected) void handleFile(selected);
            }}
          />
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => inputRef.current?.click()}>
            {file ? "Replace file" : "Choose .xlsx file"}
          </Button>
          {file ? (
            <span className="min-w-0 break-all text-sm">
              <span className="font-semibold">{file.name}</span>
              <span className="ml-2 text-muted">{formatSize(file.size)}</span>
            </span>
          ) : (
            <span className="text-sm text-muted">No file selected.</span>
          )}
          {busy === "validating" ? <span className="text-sm text-muted">Checking the file…</span> : null}
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          {notice}
        </div>
      ) : null}

      {preview ? (
        <div className="mt-5" data-testid="import-preview">
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="font-semibold">{preview.totalRows} rows</span>
            <span>
              <span className="font-semibold text-success">{preview.readyCount}</span> Ready
            </span>
            <span>
              <span className="font-semibold text-warning">{preview.warningCount}</span> Warnings
            </span>
            <span>
              <span className="font-semibold text-danger">{preview.errorCount}</span> Errors
            </span>
            <span className="text-muted">Any Error blocks the whole import.</span>
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface shadow-sm md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {["Row", "Required Document", "Code", "Site", "Framework Requirement(s)", "Applicable", "Result"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} data-testid="import-row" className="border-t border-border align-top">
                    <td className="px-3 py-3 text-muted">{row.rowNumber}</td>
                    <td className="max-w-xs px-3 py-3 font-semibold">{row.title}</td>
                    <td className="px-3 py-3 text-muted">{row.code || "—"}</td>
                    <td className="px-3 py-3 text-muted">{row.siteLabel}</td>
                    <td className="max-w-[220px] px-3 py-3 text-muted">{row.requirementsLabel || "—"}</td>
                    <td className="px-3 py-3 text-muted">{row.applicableLabel}</td>
                    <td className="min-w-64 px-3 py-3">
                      <StatusBadge label={STATUS_LABEL[row.status]} tone={STATUS_TONE[row.status]} />
                      {row.action && row.action !== "create" ? <span className="ml-2 text-xs text-muted">{ACTION_LABEL[row.action]}</span> : null}
                      <Messages row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {preview.rows.map((row) => (
              <div key={row.rowNumber} data-testid="import-card" className="rounded-lg border border-border bg-surface p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm font-semibold">
                    <span className="mr-1 text-xs font-normal text-muted">Row {row.rowNumber}</span>
                    {row.title}
                  </div>
                  <span className="shrink-0">
                    <StatusBadge label={STATUS_LABEL[row.status]} tone={STATUS_TONE[row.status]} />
                  </span>
                </div>
                <div className="mt-1 text-[12.5px] text-muted">
                  {[row.code, row.siteLabel, row.requirementsLabel, `Applicable: ${row.applicableLabel}`].filter(Boolean).join(" · ")}
                </div>
                <Messages row={row} />
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {needsConfirm && !hasErrors ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4" />
                <span>I reviewed the warnings (merged rows, existing documents that will be skipped, repeated codes) and want to import.</span>
              </label>
            ) : null}
            {!hasErrors ? (
              <p className="text-sm text-muted">
                {preview.createCount} {preview.createCount === 1 ? "document" : "documents"} will be created as Not Received (or Not
                Applicable){preview.skipCount > 0 ? `; ${preview.skipCount} existing ${preview.skipCount === 1 ? "document is" : "documents are"} skipped` : ""}.
                No files, versions or assessments are created.
              </p>
            ) : null}
            <div>
              <Button type="button" disabled={!canImport} onClick={() => void handleImport()}>
                {busy === "importing"
                  ? "Importing…"
                  : `Import ${preview.createCount} ${preview.createCount === 1 ? "Document" : "Documents"}`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
