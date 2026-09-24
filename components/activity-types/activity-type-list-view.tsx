"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, useToast } from "@/components/ui/toast";
import { activeStatusLabel, activeStatusTone } from "@/lib/ui/status-tones";
import { deleteActivityType, setActivityTypeActive } from "@/lib/mutations/activity-types";
import { ActivityTypeFormDrawer } from "./activity-type-form-drawer";
import type { ActivityTypeRow as ActivityTypeRowData } from "@/lib/queries/activity-types";

type DrawerState = { mode: "create" } | { mode: "edit"; activityType: ActivityTypeRowData } | null;
type ConfirmState = "none" | "blocked" | "confirm";

export function ActivityTypeListView({
  activityTypes,
  isAdmin,
}: {
  activityTypes: ActivityTypeRowData[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const { message, show } = useToast();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activityTypes;
    return activityTypes.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.key.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q),
    );
  }, [activityTypes, search]);

  function handleSaved(msg: string) {
    setDrawer(null);
    router.refresh();
    show(msg);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Activity Types</h1>
          <p className="mt-1 text-sm text-muted">
            {activityTypes.length} {activityTypes.length === 1 ? "type" : "types"} · read-only reference
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" onClick={() => setDrawer({ mode: "create" })}>
            + New Activity Type
          </Button>
        ) : null}
      </div>

      <div className="my-4 max-w-xs">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Activity Types…"
          aria-label="Search Activity Types"
        />
      </div>

      {activityTypes.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No Activity Types yet"
            description="Add an Activity Type to start building the catalog."
            action={
              isAdmin ? (
                <Button type="button" onClick={() => setDrawer({ mode: "create" })}>
                  + New Activity Type
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title={`No Activity Types match "${search}".`}
            action={
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Clear search
              </button>
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
                    Label
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Key
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Description
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Status
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Sort
                  </th>
                  <th className="px-4 py-3 text-right text-[13px] font-semibold uppercase tracking-wide text-muted" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <ActivityTypeRow
                    key={a.id}
                    activityType={a}
                    isAdmin={isAdmin}
                    onEdit={() => setDrawer({ mode: "edit", activityType: a })}
                    onChanged={(msg) => {
                      router.refresh();
                      show(msg);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {filtered.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-surface p-3.5 shadow-sm">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{a.label}</span>
                  <StatusBadge label={activeStatusLabel(a.isActive)} tone={activeStatusTone(a.isActive)} />
                </div>
                <div className="text-[13px] text-muted">{a.key}</div>
                {a.description ? <div className="mt-1 text-[12.5px] text-muted">{a.description}</div> : null}
                {isAdmin ? (
                  <div className="mt-2.5 flex justify-end">
                    <MobileRowActions
                      activityType={a}
                      onEdit={() => setDrawer({ mode: "edit", activityType: a })}
                      onChanged={(msg) => {
                        router.refresh();
                        show(msg);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}

      {drawer ? (
        <ActivityTypeFormDrawer
          mode={drawer.mode}
          activityType={drawer.mode === "edit" ? drawer.activityType : undefined}
          onClose={() => setDrawer(null)}
          onSaved={handleSaved}
        />
      ) : null}
      <Toast message={message} />
    </div>
  );
}

function ActivityTypeRow({
  activityType,
  isAdmin,
  onEdit,
  onChanged,
}: {
  activityType: ActivityTypeRowData;
  isAdmin: boolean;
  onEdit: () => void;
  onChanged: (message: string) => void;
}) {
  const [confirmState, setConfirmState] = useState<ConfirmState>("none");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function askDelete() {
    setConfirmState(activityType.referenced ? "blocked" : "confirm");
  }
  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteActivityType(activityType.id);
      if (!result.ok) {
        setBlockedMessage(result.error);
        setConfirmState("blocked");
        return;
      }
      onChanged("Activity Type deleted");
    });
  }
  function toggleActive() {
    startTransition(async () => {
      const result = await setActivityTypeActive(activityType.id, !activityType.isActive);
      if (!result.ok) {
        setBlockedMessage(result.error);
        setConfirmState("blocked");
        return;
      }
      onChanged(activityType.isActive ? "Activity Type deactivated" : "Activity Type activated");
    });
  }

  if (confirmState === "blocked") {
    return (
      <tr className="border-t border-border">
        <td colSpan={6} className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[12.5px] text-warning">
              {blockedMessage ?? "This Activity Type is in use and cannot be deleted."}
            </span>
            <button
              type="button"
              onClick={() => {
                setConfirmState("none");
                setBlockedMessage(null);
              }}
              className="text-[12.5px] font-semibold text-muted"
            >
              OK
            </button>
          </div>
        </td>
      </tr>
    );
  }

  if (confirmState === "confirm") {
    return (
      <tr className="border-t border-border">
        <td colSpan={6} className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[12.5px] text-danger">Delete this Activity Type?</span>
            <button
              type="button"
              onClick={() => setConfirmState("none")}
              disabled={pending}
              className="text-[12.5px] font-semibold text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={pending}
              aria-busy={pending}
              className="rounded-md bg-danger px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border hover:bg-neutral-soft/60">
      <td className="px-4 py-3 font-semibold">{activityType.label}</td>
      <td className="px-2.5 py-3 text-muted">{activityType.key}</td>
      <td className="max-w-xs truncate px-2.5 py-3 text-muted">{activityType.description ?? "—"}</td>
      <td className="px-2.5 py-3">
        <StatusBadge
          label={activeStatusLabel(activityType.isActive)}
          tone={activeStatusTone(activityType.isActive)}
        />
      </td>
      <td className="px-2.5 py-3 text-muted">{activityType.sortOrder}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {isAdmin ? (
          <OverflowMenu
            items={[
              { label: "Edit", onSelect: onEdit },
              { label: activityType.isActive ? "Deactivate" : "Activate", onSelect: toggleActive },
              { label: "Delete", onSelect: askDelete, danger: true },
            ]}
          />
        ) : null}
      </td>
    </tr>
  );
}

function MobileRowActions({
  activityType,
  onEdit,
  onChanged,
}: {
  activityType: ActivityTypeRowData;
  onEdit: () => void;
  onChanged: (message: string) => void;
}) {
  const [confirmState, setConfirmState] = useState<ConfirmState>("none");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function askDelete() {
    setConfirmState(activityType.referenced ? "blocked" : "confirm");
  }
  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteActivityType(activityType.id);
      if (!result.ok) {
        setBlockedMessage(result.error);
        setConfirmState("blocked");
        return;
      }
      onChanged("Activity Type deleted");
    });
  }
  function toggleActive() {
    startTransition(async () => {
      const result = await setActivityTypeActive(activityType.id, !activityType.isActive);
      if (!result.ok) {
        setBlockedMessage(result.error);
        setConfirmState("blocked");
        return;
      }
      onChanged(activityType.isActive ? "Activity Type deactivated" : "Activity Type activated");
    });
  }

  if (confirmState === "blocked") {
    return (
      <div className="flex items-center gap-2.5">
        <span className="text-[12.5px] text-warning">
          {blockedMessage ?? "This Activity Type is in use and cannot be deleted."}
        </span>
        <button
          type="button"
          onClick={() => {
            setConfirmState("none");
            setBlockedMessage(null);
          }}
          className="text-[12.5px] font-semibold text-muted"
        >
          OK
        </button>
      </div>
    );
  }

  if (confirmState === "confirm") {
    return (
      <div className="flex items-center gap-2.5">
        <span className="text-[12.5px] text-danger">Delete?</span>
        <button
          type="button"
          onClick={() => setConfirmState("none")}
          disabled={pending}
          className="text-[12.5px] font-semibold text-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirmDelete}
          disabled={pending}
          aria-busy={pending}
          className="rounded-md bg-danger px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
    );
  }

  return (
    <OverflowMenu
      items={[
        { label: "Edit", onSelect: onEdit },
        { label: activityType.isActive ? "Deactivate" : "Activate", onSelect: toggleActive },
        { label: "Delete", onSelect: askDelete, danger: true },
      ]}
    />
  );
}
