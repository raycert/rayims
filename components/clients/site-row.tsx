"use client";

import { useState, useTransition } from "react";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import type { SiteRow as SiteRowData } from "@/lib/queries/clients";
import type { ActionResult } from "@/lib/mutations/types";

type ConfirmState = "none" | "blocked" | "confirm";

/**
 * "In use" is known up front (project_sites count from the query), so Delete opens
 * straight into the right inline state, matching docs/phase-2. The actual delete
 * still goes through deleteSiteRecord, which is the authoritative FK-backed check.
 */
export function SiteRow({
  site,
  onEdit,
  onDelete,
}: {
  site: SiteRowData;
  onEdit: () => void;
  onDelete: () => Promise<ActionResult>;
}) {
  const [confirmState, setConfirmState] = useState<ConfirmState>("none");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function askDelete() {
    setConfirmState(site.inUse ? "blocked" : "confirm");
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await onDelete();
      if (!result.ok) {
        setBlockedMessage(result.error);
        setConfirmState("blocked");
        return;
      }
      // Success: the parent refreshes and this row's data disappears with it.
    });
  }

  if (confirmState === "blocked") {
    return (
      <div className="flex min-h-[46px] items-center justify-between gap-3 border-t border-border px-4 py-2 text-sm">
        <div className="min-w-0">
          <div className="truncate font-semibold">{site.name}</div>
        </div>
        <div className="flex items-center gap-2.5 whitespace-nowrap">
          <span className="text-[13px] text-warning">
            {blockedMessage ?? "In use by a project — cannot be removed."}
          </span>
          <button
            type="button"
            onClick={() => {
              setConfirmState("none");
              setBlockedMessage(null);
            }}
            className="text-[13px] font-semibold text-muted"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  if (confirmState === "confirm") {
    return (
      <div className="flex min-h-[46px] items-center justify-between gap-3 border-t border-border px-4 py-2 text-sm">
        <div className="min-w-0">
          <div className="truncate font-semibold">{site.name}</div>
        </div>
        <div className="flex items-center gap-2.5 whitespace-nowrap">
          <span className="text-[13px] text-danger">Delete this site?</span>
          <button
            type="button"
            onClick={() => setConfirmState("none")}
            disabled={pending}
            className="text-[13px] font-semibold text-muted"
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
      </div>
    );
  }

  return (
    <div className="flex min-h-[46px] items-center justify-between gap-3 border-t border-border px-4 py-2 text-sm">
      <div className="min-w-0">
        <div className="truncate font-semibold">{site.name}</div>
        {site.address ? <div className="truncate text-[13px] text-muted">{site.address}</div> : null}
      </div>
      <OverflowMenu
        items={[
          { label: "Edit", onSelect: onEdit },
          { label: "Delete", onSelect: askDelete, danger: true },
        ]}
      />
    </div>
  );
}
