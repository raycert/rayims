"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, useToast } from "@/components/ui/toast";
import { DOCUMENT_STATUSES, documentStatusLabel, documentStatusTone } from "@/lib/ui/status-tones";
import { formatDate } from "@/lib/ui/format";
import { DocumentFormDrawer } from "./document-form-drawer";
import type { DocumentFormCatalog, DocumentRow } from "@/lib/queries/documents";

const PROJECT_WIDE = "Project-wide";

/** "ISO 9001 7.5.2, ISO 9001 7.5.3 +2" — compact, first two mappings. */
export function RequirementsSummary({ doc }: { doc: DocumentRow }) {
  if (doc.frameworkItems.length === 0) return <span className="text-muted">—</span>;
  const shown = doc.frameworkItems.slice(0, 2).map((i) => `${i.frameworkCode} ${i.code ?? i.label}`);
  const more = doc.frameworkItems.length - shown.length;
  return (
    <span title={doc.frameworkItems.map((i) => `${i.frameworkIdentity} · ${i.label}`).join("\n")}>
      {shown.join(", ")}
      {more > 0 ? <span className="ml-1 font-semibold text-muted">+{more}</span> : null}
    </span>
  );
}

export function latestVersionLabel(doc: { latestVersionNo: number | null; latestRevision: string | null }): string {
  if (doc.latestVersionNo === null) return "—";
  return doc.latestRevision ? `V${doc.latestVersionNo} · ${doc.latestRevision}` : `V${doc.latestVersionNo}`;
}

/** Project Document Register (Phase 5A): logical documents with their derived status. */
export function DocumentsWorkspaceView({
  projectId,
  documents,
  catalog,
  importResult,
}: {
  projectId: string;
  documents: DocumentRow[];
  catalog: DocumentFormCatalog;
  /** Set (via ?imported=&skipped=&warnings=) right after an Excel import: shown once. */
  importResult?: { imported: number; skipped: number; warnings: number } | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { message, show } = useToast();

  useEffect(() => {
    if (!importResult) return;
    show(
      `Imported: ${importResult.imported} ${importResult.imported === 1 ? "Document" : "Documents"} · Skipped existing: ${importResult.skipped} · Warnings: ${importResult.warnings}`,
    );
    // Drop the query so a refresh or back-navigation doesn't repeat the message.
    window.history.replaceState(null, "", `/projects/${projectId}/documents`);
  }, [importResult, projectId, show]);

  const siteOptions = useMemo(() => Array.from(new Set(documents.map((d) => d.siteName ?? PROJECT_WIDE))).sort(), [documents]);
  const frameworkOptions = useMemo(
    () =>
      Array.from(new Set(documents.flatMap((d) => d.frameworkItems.map((i) => i.frameworkIdentity)))).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [documents],
  );

  const filtered = useMemo(() => {
    let list = documents;
    if (statusFilter !== "all") list = list.filter((d) => d.status === statusFilter);
    if (siteFilter !== "all") list = list.filter((d) => (d.siteName ?? PROJECT_WIDE) === siteFilter);
    if (frameworkFilter !== "all") list = list.filter((d) => d.frameworkItems.some((i) => i.frameworkIdentity === frameworkFilter));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.docCode ?? "").toLowerCase().includes(q) ||
          (d.documentType ?? "").toLowerCase().includes(q) ||
          (d.ownerName ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [documents, search, statusFilter, siteFilter, frameworkFilter]);

  const filtersActive = search || statusFilter !== "all" || siteFilter !== "all" || frameworkFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setSiteFilter("all");
    setFrameworkFilter("all");
  }

  function open(d: DocumentRow) {
    router.push(`/projects/${projectId}/documents/${d.id}`);
  }

  /** Whole register (not the filtered view), built on the server from current data (Phase 5F). */
  async function exportRegister() {
    setExporting(true);
    try {
      // The viewer's time zone only formats dates (Last Review day, export time) like the screens do.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/projects/${projectId}/documents/export?tz=${encodeURIComponent(tz)}`, { cache: "no-store" });
      const type = res.headers.get("Content-Type") ?? "";
      if (!res.ok || !type.includes("spreadsheetml")) throw new Error("export failed");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "RayIMS-Gap-Assessment.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      show("Could not export the register. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function handleSaved(msg: string) {
    setCreating(false);
    router.refresh();
    show(msg);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Documents</h2>
          <p className="mt-1 text-sm text-muted">
            {documents.length} {documents.length === 1 ? "document" : "documents"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setCreating(true)}>
            + New Document
          </Button>
          <Link href={`/projects/${projectId}/documents/import`} className={buttonClasses("secondary")}>
            Import Excel
          </Link>
          <Button type="button" variant="secondary" onClick={exportRegister} disabled={exporting}>
            {exporting ? "Exporting…" : "Export Excel"}
          </Button>
        </div>
      </div>

      {documents.length > 0 ? (
        <div className="my-4 flex flex-wrap items-center gap-2.5">
          <div className="w-full md:w-auto md:max-w-xs md:flex-1">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" aria-label="Search documents" />
          </div>
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={DOCUMENT_STATUSES.map((s) => ({ value: s, label: documentStatusLabel(s) }))}
          />
          <FilterSelect label="Site" value={siteFilter} onChange={setSiteFilter} options={siteOptions.map((s) => ({ value: s, label: s }))} />
          {frameworkOptions.length > 0 ? (
            <FilterSelect
              label="Framework"
              value={frameworkFilter}
              onChange={setFrameworkFilter}
              options={frameworkOptions.map((f) => ({ value: f, label: f }))}
            />
          ) : null}
        </div>
      ) : null}

      {documents.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No documents yet."
            description="Register the documents this project needs — before any file is received."
            action={
              <Button type="button" onClick={() => setCreating(true)}>
                + New Document
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No documents match the current search or filters."
            action={
              filtersActive ? (
                <button type="button" onClick={clearFilters} className="text-sm font-semibold text-primary hover:underline">
                  Clear search and filters
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface shadow-sm md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {["Document", "Site", "Framework Requirements", "Latest Version", "Status", "Last Review"].map((h, i) => (
                    <th
                      key={h}
                      className={`py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted ${i === 0 || i === 5 ? "px-4" : "px-2.5"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr
                    key={d.id}
                    tabIndex={0}
                    onClick={() => open(d)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.target === e.currentTarget) open(d);
                    }}
                    className="cursor-pointer border-t border-border align-top hover:bg-neutral-soft/60 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
                  >
                    <td className="max-w-sm px-4 py-3">
                      <Link
                        href={`/projects/${projectId}/documents/${d.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold hover:underline"
                      >
                        {d.title}
                      </Link>
                      {d.docCode ? <div className="mt-0.5 text-xs text-muted">{d.docCode}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-muted">{d.siteName ?? PROJECT_WIDE}</td>
                    <td className="px-2.5 py-3 text-muted">
                      <RequirementsSummary doc={d} />
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-muted">{latestVersionLabel(d)}</td>
                    <td className="whitespace-nowrap px-2.5 py-3">
                      <StatusBadge label={documentStatusLabel(d.status)} tone={documentStatusTone(d.status)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{d.lastReviewAt ? formatDate(d.lastReviewAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {filtered.map((d) => (
              <Link
                key={d.id}
                href={`/projects/${projectId}/documents/${d.id}`}
                className="block rounded-lg border border-border bg-surface p-3.5 shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{d.title}</div>
                    {d.docCode ? <div className="text-[12.5px] text-muted">{d.docCode}</div> : null}
                  </div>
                  <span className="shrink-0">
                    <StatusBadge label={documentStatusLabel(d.status)} tone={documentStatusTone(d.status)} />
                  </span>
                </div>
                <div className="mt-1.5 text-[12.5px] text-muted">{d.siteName ?? PROJECT_WIDE}</div>
                {d.frameworkItems.length > 0 ? (
                  <div className="mt-0.5 text-[12.5px] text-muted">
                    <RequirementsSummary doc={d} />
                  </div>
                ) : null}
                <div className="mt-0.5 text-[12.5px] text-muted">
                  Latest version: {d.latestVersionNo === null ? "None" : latestVersionLabel(d)}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {creating ? (
        <DocumentFormDrawer mode="create" projectId={projectId} catalog={catalog} onClose={() => setCreating(false)} onSaved={handleSaved} />
      ) : null}
      <Toast message={message} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Filter by ${label}`}
      className="min-h-9 rounded-md border border-border bg-surface px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
    >
      <option value="all">All {label === "Status" ? "Statuses" : label === "Site" ? "Sites" : "Frameworks"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
