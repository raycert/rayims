"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { importVerificationItems, previewVerificationImport } from "@/lib/mutations/verification-import";
import type { ImportPreview, ImportPreviewRow } from "@/lib/validation/verification-import";

const MAX_BYTES = 2 * 1024 * 1024;

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_TONE = { ready: "success", warning: "warning", error: "danger" } as const;
const STATUS_LABEL = { ready: "Ready", warning: "Warning", error: "Error" } as const;

/** Desktop-oriented: pick a workbook, review the server's validation, then import it. */
export function ImportVerificationView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"validating" | "importing" | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function buildForm(f: File): FormData {
    const form = new FormData();
    form.append("file", f);
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
      const result = await previewVerificationImport(projectId, buildForm(selected));
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
      const result = await importVerificationItems(projectId, buildForm(file));
      if (requestId !== requestRef.current) return;
      if (!result.ok) {
        setError(result.error);
        setBusy(null);
        return;
      }
      if (result.data.imported) {
        router.push(`/projects/${projectId}/verification?imported=${result.data.count}`);
        return;
      }
      setPreview(result.data.preview);
      setConfirmed(false);
      setNotice("Nothing was imported. The project or the file no longer passes validation. Review the updated results below.");
      setBusy(null);
    } catch {
      if (requestId !== requestRef.current) return;
      setError("Couldn't import the file. Nothing was imported. Try again.");
      setBusy(null);
    }
  }

  const importable = preview ? preview.readyCount + preview.warningCount : 0;
  const hasErrors = !!preview && preview.errorCount > 0;
  const needsConfirm = !!preview && preview.duplicateCount > 0;
  const canImport = !!preview && !hasErrors && importable > 0 && (!needsConfirm || confirmed) && busy === null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Import Verification Items</h2>
          <p className="mt-1 text-sm text-muted">
            Create many checks at once from an Excel file. Up to 300 rows, .xlsx only, 2 MB maximum.
          </p>
        </div>
        <a href={`/projects/${projectId}/verification/template`} className={buttonClasses("secondary")}>
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
            <span className="text-sm">
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
        <div className="mt-5">
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
            <span className="text-muted">Ready and Warning rows are imported; any Error blocks the whole import.</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {["Row", "Check", "Priority", "Site", "Target Activity", "Framework", "Status"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <PreviewTableRow key={row.rowNumber} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {needsConfirm ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>I reviewed the duplicate warnings and want to import them.</span>
              </label>
            ) : null}
            {!hasErrors && importable > 0 ? (
              <p className="text-sm text-muted">
                You are about to create {importable} Verification {importable === 1 ? "Item" : "Items"}. A bulk import can&apos;t
                currently be undone as a batch.
              </p>
            ) : null}
            <div>
              <Button type="button" disabled={!canImport} onClick={() => void handleImport()}>
                {busy === "importing"
                  ? "Importing…"
                  : `Import ${importable} Verification ${importable === 1 ? "Item" : "Items"}`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreviewTableRow({ row }: { row: ImportPreviewRow }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-3 text-muted">{row.rowNumber}</td>
      <td className="max-w-xs px-3 py-3 font-semibold">{row.question || "—"}</td>
      <td className="px-3 py-3 text-muted">{row.priorityLabel}</td>
      <td className="px-3 py-3 text-muted">
        {row.siteLabel}
        {row.siteInferred ? <span className="ml-1 text-xs">(inferred)</span> : null}
      </td>
      <td className="max-w-xs px-3 py-3 text-muted">{row.targetActivity || "—"}</td>
      <td className="px-3 py-3 text-muted">{row.frameworkLabel || "—"}</td>
      <td className="min-w-56 px-3 py-3">
        <StatusBadge label={STATUS_LABEL[row.status]} tone={STATUS_TONE[row.status]} />
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
      </td>
    </tr>
  );
}
