"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, useToast } from "@/components/ui/toast";
import { priorityLabel, priorityTone, verificationResultLabel, verificationResultTone } from "@/lib/ui/status-tones";
import { formatDate } from "@/lib/ui/format";
import { VerificationItemFormDrawer } from "./verification-item-form-drawer";
import type { VerificationFormCatalog, VerificationItemRow } from "@/lib/queries/verification-items";

const RESULT_VALUES = ["pending", "verified_ok", "issue_identified", "follow_up_required"] as const;
const PROJECT_WIDE = "Project-wide";
const NOT_ASSIGNED = "Not assigned yet";

function activityDisplay(name: string | null, startDate: string | null): string {
  if (!name) return NOT_ASSIGNED;
  return startDate ? `${formatDate(startDate)} · ${name}` : `Undated · ${name}`;
}

function matchesResultFilter(item: VerificationItemRow, filter: string): boolean {
  if (filter === "pending") return item.result === null;
  return item.result === filter;
}

/** Project-scoped Verification workspace: plan/manage checks. Result is read-only here — execution is Phase 4B. */
export function VerificationWorkspaceView({
  projectId,
  items,
  catalog,
}: {
  projectId: string;
  items: VerificationItemRow[];
  catalog: VerificationFormCatalog;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; item: VerificationItemRow } | null>(null);
  const { message, show } = useToast();

  const siteOptions = useMemo(
    () => Array.from(new Set(items.map((v) => v.siteName ?? PROJECT_WIDE))).sort(),
    [items],
  );
  const activityOptions = useMemo(
    () =>
      Array.from(
        new Map(
          items.map((v) => [v.targetActivityId ?? "", activityDisplay(v.targetActivityName, v.targetActivityStartDate)]),
        ),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [items],
  );
  const frameworkOptions = useMemo(
    () => Array.from(new Set(items.map((v) => v.frameworkIdentity).filter((f): f is string => !!f))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    let list = items;
    if (siteFilter !== "all") list = list.filter((v) => (v.siteName ?? PROJECT_WIDE) === siteFilter);
    if (activityFilter !== "all") list = list.filter((v) => (v.targetActivityId ?? "") === activityFilter);
    if (resultFilter !== "all") list = list.filter((v) => matchesResultFilter(v, resultFilter));
    if (frameworkFilter !== "all") list = list.filter((v) => v.frameworkIdentity === frameworkFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          v.question.toLowerCase().includes(q) ||
          (v.frameworkIdentity ?? "").toLowerCase().includes(q) ||
          (v.frameworkItemLabel ?? "").toLowerCase().includes(q) ||
          (v.targetActivityName ?? "").toLowerCase().includes(q) ||
          (v.siteName ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, search, siteFilter, activityFilter, resultFilter, frameworkFilter]);

  const filtersActive =
    search || siteFilter !== "all" || activityFilter !== "all" || resultFilter !== "all" || frameworkFilter !== "all";

  function clearFilters() {
    setSearch("");
    setSiteFilter("all");
    setActivityFilter("all");
    setResultFilter("all");
    setFrameworkFilter("all");
  }

  function handleSaved(msg: string) {
    setDrawer(null);
    router.refresh();
    show(msg);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Verification</h2>
          <p className="mt-1 text-sm text-muted">
            {items.length} {items.length === 1 ? "item" : "items"}
          </p>
        </div>
        <Button type="button" onClick={() => setDrawer({ mode: "create" })}>
          + New Verification Item
        </Button>
      </div>

      {items.length > 0 ? (
        <div className="my-4 flex flex-wrap items-center gap-2.5">
          <div className="max-w-xs flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search verification items…"
              aria-label="Search verification items"
            />
          </div>
          <FilterSelect label="Site" value={siteFilter} onChange={setSiteFilter} options={siteOptions} />
          <FilterSelect
            label="Target Activity"
            value={activityFilter}
            onChange={setActivityFilter}
            options={activityOptions.map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            label="Result"
            value={resultFilter}
            onChange={setResultFilter}
            options={RESULT_VALUES.map((r) => ({
              value: r,
              label: r === "pending" ? "Pending" : verificationResultLabel(r),
            }))}
          />
          {frameworkOptions.length > 0 ? (
            <FilterSelect label="Framework" value={frameworkFilter} onChange={setFrameworkFilter} options={frameworkOptions} />
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No verification items yet"
            description="Add checks to prepare for project reviews and site visits."
            action={
              <Button type="button" onClick={() => setDrawer({ mode: "create" })}>
                + New Verification Item
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No verification items match the current search or filters."
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
                  <th className="px-4 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Check
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Framework
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Target Activity
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Site
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Priority
                  </th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr
                    key={v.id}
                    tabIndex={0}
                    onClick={() => setDrawer({ mode: "edit", item: v })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setDrawer({ mode: "edit", item: v });
                    }}
                    className="cursor-pointer border-t border-border hover:bg-neutral-soft/60 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
                  >
                    <td className="max-w-sm px-4 py-3 font-semibold">{v.question}</td>
                    <td className="px-2.5 py-3 text-muted">
                      {v.frameworkIdentity ? (
                        <>
                          <div>{v.frameworkIdentity}</div>
                          <div className="text-xs">{v.frameworkItemLabel}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2.5 py-3 text-muted">{activityDisplay(v.targetActivityName, v.targetActivityStartDate)}</td>
                    <td className="px-2.5 py-3 text-muted">{v.siteName ?? PROJECT_WIDE}</td>
                    <td className="px-2.5 py-3">
                      <StatusBadge label={priorityLabel(v.priority)} tone={priorityTone(v.priority)} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={verificationResultLabel(v.result)} tone={verificationResultTone(v.result)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {filtered.map((v) => (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => setDrawer({ mode: "edit", item: v })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setDrawer({ mode: "edit", item: v });
                }}
                className="cursor-pointer rounded-lg border border-border bg-surface p-3.5 shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <StatusBadge label={priorityLabel(v.priority)} tone={priorityTone(v.priority)} />
                  <StatusBadge label={verificationResultLabel(v.result)} tone={verificationResultTone(v.result)} />
                </div>
                <div className="text-sm font-semibold">{v.question}</div>
                {v.frameworkIdentity ? (
                  <div className="mt-1 text-[12.5px] text-muted">
                    {v.frameworkIdentity} · {v.frameworkItemLabel}
                  </div>
                ) : null}
                <div className="mt-1 text-[12.5px] text-muted">
                  {activityDisplay(v.targetActivityName, v.targetActivityStartDate)} · {v.siteName ?? PROJECT_WIDE}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {drawer ? (
        <VerificationItemFormDrawer
          mode={drawer.mode}
          projectId={projectId}
          catalog={catalog}
          item={drawer.mode === "edit" ? drawer.item : undefined}
          onClose={() => setDrawer(null)}
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
  options: string[] | { value: string; label: string }[];
}) {
  const normalized = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Filter by ${label}`}
      className="min-h-9 rounded-md border border-border bg-surface px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
    >
      <option value="all">All {label}</option>
      {normalized.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
