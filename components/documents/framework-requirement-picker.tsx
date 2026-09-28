"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { DocumentFrameworkItem } from "@/lib/queries/documents";

/**
 * Multi-select for a Document's Framework Requirements (Phase 5A). Only items of the Frameworks
 * currently assigned to the project are offered (`options`); existing mappings to a Framework
 * that has since been unassigned (`selected` items with inAssignedScope=false) stay as chips and
 * can be removed, but nothing new can be picked from that Framework. The server re-validates.
 */
export function FrameworkRequirementPicker({
  options,
  selected,
  onChange,
  error,
}: {
  options: DocumentFrameworkItem[];
  selected: DocumentFrameworkItem[];
  onChange: (next: DocumentFrameworkItem[]) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, DocumentFrameworkItem[]>();
    for (const item of options) {
      if (q && !item.label.toLowerCase().includes(q) && !item.frameworkIdentity.toLowerCase().includes(q)) continue;
      const list = map.get(item.frameworkIdentity) ?? [];
      list.push(item);
      map.set(item.frameworkIdentity, list);
    }
    return [...map.entries()];
  }, [options, query]);

  function toggle(item: DocumentFrameworkItem) {
    onChange(selectedIds.has(item.id) ? selected.filter((s) => s.id !== item.id) : [...selected, item]);
  }

  return (
    <div data-testid="framework-picker">
      {selected.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Selected framework requirements">
          {selected.map((item) => (
            <li
              key={item.id}
              data-testid="framework-chip"
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-neutral-soft py-0.5 pr-0.5 pl-2 text-xs"
            >
              <span className="min-w-0 truncate" title={`${item.frameworkIdentity} · ${item.label}`}>
                <span className="text-muted">{item.frameworkIdentity} · </span>
                <span className="font-semibold">{item.code ?? item.label}</span>
                {!item.inAssignedScope ? <span className="text-warning"> (not currently assigned)</span> : null}
              </span>
              <button
                type="button"
                onClick={() => onChange(selected.filter((s) => s.id !== item.id))}
                aria-label={`Remove ${item.frameworkIdentity} ${item.label}`}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-border/60 hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {options.length === 0 ? (
        <p className="text-xs text-muted">No frameworks are assigned to this project.</p>
      ) : (
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by clause or title…"
            aria-label="Search framework requirements"
          />
          <div className="mt-1.5 max-h-60 overflow-y-auto rounded-md border border-border" role="group" aria-label="Framework requirements">
            {groups.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-muted">No requirements match.</p>
            ) : (
              groups.map(([identity, items]) => (
                <div key={identity}>
                  <div className="sticky top-0 border-b border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    {identity}
                  </div>
                  {items.map((item) => (
                    <label
                      key={item.id}
                      className="flex min-h-9 cursor-pointer items-start gap-2.5 px-3 py-1.5 text-sm hover:bg-neutral-soft/60"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggle(item)}
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
