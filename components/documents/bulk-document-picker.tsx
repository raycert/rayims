"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { documentLabel, foldText, type BulkDocument } from "@/lib/documents/bulk-match";

const MAX_LISTED = 60;

/**
 * Searchable Document selector of the Bulk Upload Match Review (Phase 7C): a button showing the chosen Document
 * ("PR-QMS-01 · Document Control Procedure · Viet Long", "Project-wide" for a Document without a Site) that opens a
 * small panel with a search box and a list. Plain buttons in a list, reachable by Tab / Arrow keys, closed by Escape
 * or a click elsewhere. Candidate Documents of a suggestion are listed first.
 */
export function BulkDocumentPicker({
  catalog,
  value,
  candidates,
  onChange,
  label,
}: {
  catalog: BulkDocument[];
  value: string | null;
  /** Suggested Documents (ids), best first — shown above everything else while the search is empty. */
  candidates: string[];
  onChange: (documentId: string | null) => void;
  /** Accessible name, e.g. the file name this row is for. */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = value ? (catalog.find((d) => d.id === value) ?? null) : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const listed = useMemo(() => {
    const q = foldText(query).trim();
    const text = (d: BulkDocument) => foldText(`${d.docCode ?? ""} ${d.title} ${d.siteName ?? "project-wide"}`);
    const hit = q ? catalog.filter((d) => q.split(/\s+/).every((w) => text(d).includes(w))) : catalog;
    if (q) return { preferred: [] as BulkDocument[], rest: hit.slice(0, MAX_LISTED), total: hit.length };
    const preferred = candidates.map((id) => catalog.find((d) => d.id === id)).filter((d): d is BulkDocument => !!d);
    const rest = catalog.filter((d) => !candidates.includes(d.id));
    return { preferred, rest: rest.slice(0, MAX_LISTED), total: rest.length };
  }, [catalog, candidates, query]);

  function choose(id: string | null) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-picker-option]") ?? []);
      if (items.length === 0) return;
      e.preventDefault();
      const i = items.findIndex((el) => el === document.activeElement);
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[next].focus();
    }
  }

  // A render function, not a component: a component defined here would remount (and lose focus) on every render.
  const option = (d: BulkDocument, key: string) => (
    <li key={key} role="presentation">
      <button
        type="button"
        role="option"
        aria-selected={d.id === value}
        data-picker-option
        data-document-id={d.id}
        onClick={() => choose(d.id)}
        className={cn("block w-full px-3 py-2 text-left text-sm hover:bg-neutral-soft focus-visible:bg-neutral-soft focus-visible:outline-none", d.id === value && "bg-primary/10")}
      >
        <span className="block break-words font-medium">{documentLabel(d)}</span>
        <span className="block text-xs text-muted">
          {d.latestVersionNo ? `Current V${d.latestVersionNo}` : "No Version yet"}
          {!d.isApplicable ? " · Not Applicable" : ""}
          {d.hasOpenAssessment ? " · Gap Assessment open" : ""}
        </span>
      </button>
    </li>
  );

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Document for ${label}`}
        data-testid="document-picker"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      >
        <span className={cn("min-w-0 break-words", !selected && "text-muted")}>{selected ? documentLabel(selected) : "Choose Document…"}</span>
        <span aria-hidden className="shrink-0 text-xs text-muted">
          ▾
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 z-30 mt-1 w-[min(34rem,calc(100vw-2rem))] rounded-md border border-border bg-surface shadow-lg max-md:w-full">
          <div className="border-b border-border p-2">
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code, title or site…" aria-label="Search Documents" />
          </div>
          <ul id={listId} role="listbox" aria-label="Documents" className="max-h-72 overflow-y-auto py-1">
            {selected ? (
              <li role="presentation">
                <button type="button" onClick={() => choose(null)} data-picker-option className="block w-full px-3 py-2 text-left text-sm text-muted hover:bg-neutral-soft focus-visible:bg-neutral-soft focus-visible:outline-none">
                  Clear selection
                </button>
              </li>
            ) : null}
            {listed.preferred.length > 0 ? (
              <>
                <li role="presentation" className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  Suggested
                </li>
                {listed.preferred.map((d) => option(d, `s-${d.id}`))}
                <li role="presentation" className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  All Documents
                </li>
              </>
            ) : null}
            {listed.rest.map((d) => option(d, d.id))}
            {listed.rest.length === 0 && listed.preferred.length === 0 ? <li role="presentation" className="px-3 py-3 text-sm text-muted">No Document matches.</li> : null}
            {listed.total > listed.rest.length ? (
              <li role="presentation" className="px-3 py-2 text-xs text-muted">
                Showing {listed.rest.length} of {listed.total} — type to narrow down.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
