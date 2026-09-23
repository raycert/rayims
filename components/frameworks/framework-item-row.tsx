"use client";

import { useState, useTransition } from "react";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { cn } from "@/lib/utils";
import type { FrameworkItemNode } from "@/lib/queries/frameworks";
import type { ActionResult } from "@/lib/mutations/types";

type ConfirmState = "none" | "blocked" | "confirm";

/**
 * One recursive hierarchy row. "Referenced" / "has children" are known up front
 * (from the query), so Delete opens straight into the right inline state — the
 * same pattern as SiteRow. The actual delete still goes through
 * deleteFrameworkItem, the authoritative FK-backed check.
 */
export function FrameworkItemRow({
  node,
  depth,
  isAdmin,
  expandedIds,
  onToggleExpand,
  onAddSubItem,
  onEdit,
  onDelete,
}: {
  node: FrameworkItemNode;
  depth: number;
  isAdmin: boolean;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onAddSubItem: (node: FrameworkItemNode) => void;
  onEdit: (node: FrameworkItemNode) => void;
  onDelete: (node: FrameworkItemNode) => Promise<ActionResult>;
}) {
  const [confirmState, setConfirmState] = useState<ConfirmState>("none");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const indent = 16 + depth * 20;

  function askDelete() {
    if (hasChildren) {
      setBlockedMessage("This item has sub-items and cannot be deleted. Delete its sub-items first.");
      setConfirmState("blocked");
      return;
    }
    if (node.referenced) {
      setBlockedMessage("This item is in use and cannot be deleted.");
      setConfirmState("blocked");
      return;
    }
    setConfirmState("confirm");
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await onDelete(node);
      if (!result.ok) {
        setBlockedMessage(result.error);
        setConfirmState("blocked");
        return;
      }
      // Success: the parent refreshes and this row disappears with it.
    });
  }

  if (confirmState === "blocked") {
    return (
      <div
        className="flex min-h-10 items-center gap-2.5 border-t border-border pr-4 text-sm first:border-t-0"
        style={{ paddingLeft: indent }}
      >
        <span className="text-[12.5px] text-warning">{blockedMessage}</span>
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
      <div
        className="flex min-h-10 items-center gap-2.5 border-t border-border pr-4 text-sm first:border-t-0"
        style={{ paddingLeft: indent }}
      >
        <span className="text-[12.5px] text-danger">Delete this item?</span>
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
    <>
      <div
        onClick={() => hasChildren && onToggleExpand(node.id)}
        className={cn(
          "relative flex min-h-10 items-center gap-2 border-t border-border pr-3 text-sm first:border-t-0",
          hasChildren && "cursor-pointer hover:bg-neutral-soft/60",
        )}
        style={{ paddingLeft: indent }}
      >
        <span className="w-3.5 shrink-0 text-[11px] text-muted" aria-hidden>
          {hasChildren ? (expanded ? "▾" : "▸") : ""}
        </span>
        {node.code ? <span className="shrink-0 font-semibold text-primary">{node.code}</span> : null}
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
        {isAdmin ? (
          <OverflowMenu
            items={[
              { label: "Add Sub-item", onSelect: () => onAddSubItem(node) },
              { label: "Edit Item", onSelect: () => onEdit(node) },
              { label: "Delete Item", onSelect: askDelete, danger: true },
            ]}
          />
        ) : null}
      </div>
      {hasChildren && expanded
        ? node.children.map((child) => (
            <FrameworkItemRow
              key={child.id}
              node={child}
              depth={depth + 1}
              isAdmin={isAdmin}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onAddSubItem={onAddSubItem}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        : null}
    </>
  );
}
