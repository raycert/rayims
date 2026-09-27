"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, useToast } from "@/components/ui/toast";
import { ACTION_STATUSES } from "@/lib/validation/actions";
import { actionStatusLabel, priorityLabel, priorityTone } from "@/lib/ui/status-tones";
import { formatDate, isActionOverdue } from "@/lib/ui/format";
import { ActionCard } from "./action-card";
import { ActionFormDrawer } from "./action-form-drawer";
import { ActionStatusControl } from "./action-status-control";
import type { ActionRow } from "@/lib/queries/actions";
import type { VerificationFormCatalog } from "@/lib/queries/verification-items";

const PROJECT_WIDE = "Project-wide";

/** Project Actions workspace: linked (Finding) and standalone actions (Phase 4D-1). */
export function ActionsWorkspaceView({
  projectId,
  actions,
  catalog,
}: {
  projectId: string;
  actions: ActionRow[];
  catalog: VerificationFormCatalog;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [linkFilter, setLinkFilter] = useState("all");
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; action: ActionRow } | null>(null);
  const { message, show } = useToast();

  const siteOptions = useMemo(
    () => Array.from(new Set(actions.map((a) => a.siteName ?? PROJECT_WIDE))).sort(),
    [actions],
  );

  const filtered = useMemo(() => {
    let list = actions;
    if (statusFilter === "overdue") list = list.filter((a) => isActionOverdue(a));
    else if (statusFilter !== "all") list = list.filter((a) => a.status === statusFilter);
    if (siteFilter !== "all") list = list.filter((a) => (a.siteName ?? PROJECT_WIDE) === siteFilter);
    if (priorityFilter !== "all") list = list.filter((a) => a.priority === priorityFilter);
    if (linkFilter === "linked") list = list.filter((a) => a.findingId !== null);
    if (linkFilter === "standalone") list = list.filter((a) => a.findingId === null);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.description.toLowerCase().includes(q) ||
          (a.ownerName ?? "").toLowerCase().includes(q) ||
          (a.findingTitle ?? "").toLowerCase().includes(q) ||
          (a.siteName ?? "").toLowerCase().includes(q) ||
          (a.activityName ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [actions, search, statusFilter, siteFilter, priorityFilter, linkFilter]);

  const filtersActive =
    search || statusFilter !== "all" || siteFilter !== "all" || priorityFilter !== "all" || linkFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setSiteFilter("all");
    setPriorityFilter("all");
    setLinkFilter("all");
  }

  function refreshWith(msg: string) {
    setDrawer(null);
    router.refresh();
    show(msg);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Actions</h2>
          <p className="mt-1 text-sm text-muted">
            {actions.length} {actions.length === 1 ? "action" : "actions"}
          </p>
        </div>
        <Button type="button" onClick={() => setDrawer({ mode: "create" })}>
          + New Action
        </Button>
      </div>

      {actions.length > 0 ? (
        <div className="my-4 flex flex-wrap items-center gap-2.5">
          <div className="w-full md:w-auto md:max-w-xs md:flex-1">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actions…" aria-label="Search actions" />
          </div>
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ...ACTION_STATUSES.map((s) => ({ value: s, label: actionStatusLabel(s) })),
              { value: "overdue", label: "Overdue" },
            ]}
          />
          <FilterSelect label="Site" value={siteFilter} onChange={setSiteFilter} options={siteOptions.map((s) => ({ value: s, label: s }))} />
          <FilterSelect
            label="Priority"
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={["high", "medium", "low"].map((p) => ({ value: p, label: priorityLabel(p) }))}
          />
          <select
            value={linkFilter}
            onChange={(e) => setLinkFilter(e.target.value)}
            aria-label="Filter by Finding link"
            className="min-h-9 rounded-md border border-border bg-surface px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <option value="all">All Actions</option>
            <option value="linked">Linked to Finding</option>
            <option value="standalone">Standalone</option>
          </select>
        </div>
      ) : null}

      {actions.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No actions yet"
            description="Add corrective actions from a finding, or record a standalone project action."
            action={
              <Button type="button" onClick={() => setDrawer({ mode: "create" })}>
                + New Action
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No actions match the current search or filters."
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
                  {["Action", "Finding", "Site", "Owner", "Due", "Priority", "Status"].map((h, i) => (
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
                {filtered.map((a) => {
                  const overdue = isActionOverdue(a);
                  const frozen = a.findingStatus === "closed";
                  return (
                    <tr key={a.id} data-action-id={a.id} className="border-t border-border align-top">
                      <td className="max-w-xs px-4 py-3">
                        {a.status !== "closed" && !frozen ? (
                          <button
                            type="button"
                            onClick={() => setDrawer({ mode: "edit", action: a })}
                            className="text-left font-semibold hover:underline"
                          >
                            {a.description}
                          </button>
                        ) : (
                          <span className="font-semibold text-muted">{a.description}</span>
                        )}
                        {a.status === "closed" && a.completionNotes ? (
                          <div className="mt-0.5 line-clamp-1 text-xs text-muted">Completion: {a.completionNotes}</div>
                        ) : null}
                      </td>
                      <td className="max-w-[200px] px-2.5 py-3 text-muted">
                        {a.findingId ? (
                          <Link href={`/projects/${projectId}/findings/${a.findingId}`} className="text-primary hover:underline">
                            {a.findingTitle}
                          </Link>
                        ) : (
                          "Standalone"
                        )}
                      </td>
                      <td className="px-2.5 py-3 text-muted">{a.siteName ?? PROJECT_WIDE}</td>
                      <td className="px-2.5 py-3 text-muted">{a.ownerName ?? "—"}</td>
                      <td className="whitespace-nowrap px-2.5 py-3 text-muted">
                        {a.dueDate ? formatDate(a.dueDate) : "—"}
                        {overdue ? (
                          <div className="mt-1">
                            <StatusBadge label="Overdue" tone="danger" />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2.5 py-3">
                        <StatusBadge label={priorityLabel(a.priority)} tone={priorityTone(a.priority)} />
                      </td>
                      <td className="min-w-44 px-4 py-3">
                        {frozen ? (
                          <span className="text-xs text-muted">
                            {actionStatusLabel(a.status)} · finding closed
                          </span>
                        ) : (
                          <ActionStatusControl projectId={projectId} action={a} onChanged={refreshWith} onError={show} hideLabel />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {filtered.map((a) => (
              <ActionCard
                key={a.id}
                projectId={projectId}
                action={a}
                showFinding
                onEdit={(action) => setDrawer({ mode: "edit", action })}
                onChanged={refreshWith}
                onError={show}
              />
            ))}
          </div>
        </>
      )}

      {drawer ? (
        <ActionFormDrawer
          mode={drawer.mode}
          projectId={projectId}
          catalog={catalog}
          action={drawer.mode === "edit" ? drawer.action : undefined}
          onClose={() => setDrawer(null)}
          onSaved={refreshWith}
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
