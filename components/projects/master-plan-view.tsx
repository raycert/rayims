"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, useToast } from "@/components/ui/toast";
import { activityStatusLabel, activityStatusTone } from "@/lib/ui/status-tones";
import { activityModeLabel, formatActivityDateTime, isActivityOverdue } from "@/lib/ui/format";
import { ActivityFormDrawer } from "@/components/activities/activity-form-drawer";
import type { ActivityFormCatalog, ActivityPlanRow } from "@/lib/queries/activities";

const STATUS_VALUES = ["planned", "in_progress", "completed", "cancelled"] as const;
const PROJECT_WIDE = "Project-wide";

/** Project-scoped Master Plan: search/filter over Activities, create, and navigate to Activity Detail. */
export function MasterPlanView({
  projectId,
  activities,
  catalog,
}: {
  projectId: string;
  activities: ActivityPlanRow[];
  catalog: ActivityFormCatalog;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const { message, show } = useToast();

  const siteOptions = useMemo(
    () => Array.from(new Set(activities.map((a) => a.siteName ?? PROJECT_WIDE))).sort(),
    [activities],
  );
  const typeOptions = useMemo(
    () => Array.from(new Set(activities.map((a) => a.activityTypeLabel))).sort(),
    [activities],
  );

  const filtered = useMemo(() => {
    let list = activities;
    if (siteFilter !== "all") list = list.filter((a) => (a.siteName ?? PROJECT_WIDE) === siteFilter);
    if (typeFilter !== "all") list = list.filter((a) => a.activityTypeLabel === typeFilter);
    if (statusFilter !== "all") list = list.filter((a) => a.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.activityTypeLabel.toLowerCase().includes(q) ||
          (a.siteName ?? PROJECT_WIDE).toLowerCase().includes(q) ||
          (a.consultantName ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [activities, search, siteFilter, typeFilter, statusFilter]);

  const filtersActive = search || siteFilter !== "all" || typeFilter !== "all" || statusFilter !== "all";

  function clearFilters() {
    setSearch("");
    setSiteFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
  }

  function openActivity(id: string) {
    router.push(`/projects/${projectId}/activities/${id}`);
  }

  function handleCreated(msg: string) {
    setCreating(false);
    router.refresh();
    show(msg);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Master Plan</h2>
          <p className="mt-1 text-sm text-muted">
            {activities.length} {activities.length === 1 ? "activity" : "activities"}
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          + New Activity
        </Button>
      </div>

      {activities.length > 0 ? (
        <div className="my-4 flex flex-wrap items-center gap-2.5">
          <div className="max-w-xs flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activities…"
              aria-label="Search activities"
            />
          </div>
          <FilterSelect label="Site" value={siteFilter} onChange={setSiteFilter} options={siteOptions} />
          <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_VALUES.map((s) => ({ value: s, label: activityStatusLabel(s) }))}
          />
        </div>
      ) : null}

      {activities.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No activities planned yet"
            description="Add the first activity to start this project's Master Plan."
            action={
              <Button type="button" onClick={() => setCreating(true)}>
                + New Activity
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No activities match the current search or filters."
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
                    Date / Time
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Activity
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Type
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Site
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Mode
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Consultant
                  </th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const overdue = isActivityOverdue(a);
                  const cancelled = a.status === "cancelled";
                  return (
                    <tr
                      key={a.id}
                      tabIndex={0}
                      onClick={() => openActivity(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openActivity(a.id);
                      }}
                      className={cn(
                        "cursor-pointer border-t border-border hover:bg-neutral-soft/60 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2",
                        cancelled && "opacity-60",
                      )}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatActivityDateTime(a.startDate, a.startTime, a.endDate, a.endTime)}
                        {overdue ? <span className="ml-1.5 text-xs font-semibold text-danger">Overdue</span> : null}
                      </td>
                      <td className="px-2.5 py-3 font-semibold">{a.name}</td>
                      <td className="px-2.5 py-3 text-muted">{a.activityTypeLabel}</td>
                      <td className="px-2.5 py-3 text-muted">{a.siteName ?? PROJECT_WIDE}</td>
                      <td className="px-2.5 py-3 text-muted">{activityModeLabel(a.mode)}</td>
                      <td className="px-2.5 py-3 text-muted">{a.consultantName ?? "Unassigned"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge label={activityStatusLabel(a.status)} tone={activityStatusTone(a.status)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {filtered.map((a) => {
              const overdue = isActivityOverdue(a);
              const cancelled = a.status === "cancelled";
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openActivity(a.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openActivity(a.id);
                  }}
                  className={cn(
                    "cursor-pointer rounded-lg border border-border bg-surface p-3.5 shadow-sm focus-visible:outline-2 focus-visible:outline-primary",
                    cancelled && "opacity-60",
                  )}
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <div className="text-[12.5px] text-muted">
                      {formatActivityDateTime(a.startDate, a.startTime, a.endDate, a.endTime)}
                      {overdue ? <span className="ml-1.5 font-semibold text-danger">Overdue</span> : null}
                    </div>
                    <StatusBadge label={activityStatusLabel(a.status)} tone={activityStatusTone(a.status)} />
                  </div>
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="mt-0.5 text-[12.5px] text-muted">
                    {a.activityTypeLabel} · {a.siteName ?? PROJECT_WIDE}
                  </div>
                  <div className="mt-1 text-[12.5px] text-muted">
                    {activityModeLabel(a.mode)} · {a.consultantName ?? "Unassigned"}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {creating ? (
        <ActivityFormDrawer
          mode="create"
          projectId={projectId}
          catalog={catalog}
          onClose={() => setCreating(false)}
          onSaved={handleCreated}
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
      onClick={(e) => e.stopPropagation()}
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
