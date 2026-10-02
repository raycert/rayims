"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, useToast } from "@/components/ui/toast";
import { FINDING_TYPES } from "@/lib/validation/findings";
import {
  findingStatusLabel,
  findingStatusTone,
  findingTypeLabel,
  findingTypeTone,
  priorityLabel,
  priorityTone,
} from "@/lib/ui/status-tones";
import { findingNumberFromQuery, formatFindingNumber } from "@/lib/ui/format";
import { FindingFormDrawer } from "./finding-form-drawer";
import type { FindingRow } from "@/lib/queries/findings";
import type { VerificationFormCatalog } from "@/lib/queries/verification-items";

const PROJECT_WIDE = "Project-wide";

/** Project-scoped Findings workspace. Response/effectiveness workflow arrives in Phase 4D. */
export function FindingsWorkspaceView({
  projectId,
  findings,
  catalog,
}: {
  projectId: string;
  findings: FindingRow[];
  catalog: VerificationFormCatalog;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const { message, show } = useToast();

  const siteOptions = useMemo(
    () => Array.from(new Set(findings.map((f) => f.siteName ?? PROJECT_WIDE))).sort(),
    [findings],
  );

  const filtered = useMemo(() => {
    let list = findings;
    if (typeFilter !== "all") list = list.filter((f) => f.findingType === typeFilter);
    if (statusFilter !== "all") list = list.filter((f) => f.status === statusFilter);
    if (siteFilter !== "all") list = list.filter((f) => (f.siteName ?? PROJECT_WIDE) === siteFilter);
    if (priorityFilter !== "all") list = list.filter((f) => f.priority === priorityFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      // "F-012", "012" or "12" also finds Finding number 12 (Phase 6A); text search is unchanged.
      const no = findingNumberFromQuery(q);
      list = list.filter(
        (f) =>
          f.findingNo === no ||
          f.title.toLowerCase().includes(q) ||
          (f.description ?? "").toLowerCase().includes(q) ||
          (f.siteName ?? "").toLowerCase().includes(q) ||
          (f.frameworkIdentity ?? "").toLowerCase().includes(q) ||
          (f.frameworkItemLabel ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [findings, search, typeFilter, statusFilter, siteFilter, priorityFilter]);

  const filtersActive =
    search || typeFilter !== "all" || statusFilter !== "all" || siteFilter !== "all" || priorityFilter !== "all";

  function clearFilters() {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setSiteFilter("all");
    setPriorityFilter("all");
  }

  function open(f: FindingRow) {
    router.push(`/projects/${projectId}/findings/${f.id}`);
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
          <h2 className="text-lg font-semibold tracking-tight">Findings</h2>
          <p className="mt-1 text-sm text-muted">
            {findings.length} {findings.length === 1 ? "finding" : "findings"}
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          + New Finding
        </Button>
      </div>

      {findings.length > 0 ? (
        <div className="my-4 flex flex-wrap items-center gap-2.5">
          <div className="w-full md:w-auto md:max-w-xs md:flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search findings…"
              aria-label="Search findings"
            />
          </div>
          <FilterSelect
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={FINDING_TYPES.map((t) => ({ value: t, label: findingTypeLabel(t) }))}
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
            ]}
          />
          <FilterSelect label="Site" value={siteFilter} onChange={setSiteFilter} options={siteOptions.map((s) => ({ value: s, label: s }))} />
          <FilterSelect
            label="Priority"
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={["high", "medium", "low"].map((p) => ({ value: p, label: priorityLabel(p) }))}
          />
        </div>
      ) : null}

      {findings.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No findings yet"
            description="Record findings from site visits and reviews, then track them to closure."
            action={
              <Button type="button" onClick={() => setCreating(true)}>
                + New Finding
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No findings match the current search or filters."
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
                  {["No.", "Finding", "Type", "Site", "Framework", "Priority", "Status"].map((h, i) => (
                    <th
                      key={h}
                      className={`py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted ${i === 0 || i === 6 ? "px-4" : "px-2.5"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr
                    key={f.id}
                    tabIndex={0}
                    onClick={() => open(f)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") open(f);
                    }}
                    className="cursor-pointer border-t border-border hover:bg-neutral-soft/60 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
                  >
                    <td className="whitespace-nowrap px-4 py-3 align-top font-semibold tabular-nums">{formatFindingNumber(f.findingNo)}</td>
                    <td className="max-w-sm px-2.5 py-3">
                      <Link
                        href={`/projects/${projectId}/findings/${f.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold hover:underline"
                      >
                        {f.title}
                      </Link>
                      {f.description ? <div className="mt-0.5 line-clamp-1 text-xs text-muted">{f.description}</div> : null}
                    </td>
                    <td className="px-2.5 py-3">
                      <StatusBadge label={findingTypeLabel(f.findingType)} tone={findingTypeTone(f.findingType)} />
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-muted">{f.siteName ?? PROJECT_WIDE}</td>
                    <td className="px-2.5 py-3 text-muted">
                      {f.frameworkIdentity ? (
                        <>
                          <div>{f.frameworkIdentity}</div>
                          <div className="text-xs">{f.frameworkItemLabel}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2.5 py-3">
                      <StatusBadge label={priorityLabel(f.priority)} tone={priorityTone(f.priority)} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={findingStatusLabel(f.status)} tone={findingStatusTone(f.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {filtered.map((f) => (
              <Link
                key={f.id}
                href={`/projects/${projectId}/findings/${f.id}`}
                className="block rounded-lg border border-border bg-surface p-3.5 shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-semibold tabular-nums">{formatFindingNumber(f.findingNo)}</span>
                  <StatusBadge label={findingTypeLabel(f.findingType)} tone={findingTypeTone(f.findingType)} />
                  <StatusBadge label={priorityLabel(f.priority)} tone={priorityTone(f.priority)} />
                  <StatusBadge label={findingStatusLabel(f.status)} tone={findingStatusTone(f.status)} />
                </div>
                <div className="text-sm font-semibold">{f.title}</div>
                {f.frameworkIdentity ? (
                  <div className="mt-1 text-[12.5px] text-muted">
                    {f.frameworkIdentity} · {f.frameworkItemLabel}
                  </div>
                ) : null}
                <div className="mt-1 text-[12.5px] text-muted">{f.siteName ?? PROJECT_WIDE}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      {creating ? (
        <FindingFormDrawer
          mode="create"
          projectId={projectId}
          catalog={catalog}
          onClose={() => setCreating(false)}
          onSaved={handleSaved}
        />
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
      <option value="all">All {label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
