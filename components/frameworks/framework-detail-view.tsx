"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { Toast, useToast } from "@/components/ui/toast";
import { formatFrameworkIdentity, humanizeCategory } from "@/lib/ui/format";
import { deleteFramework, deleteFrameworkItem } from "@/lib/mutations/frameworks";
import { FrameworkFormDrawer } from "./framework-form-drawer";
import { FrameworkItemFormDrawer } from "./framework-item-form-drawer";
import { FrameworkItemRow } from "./framework-item-row";
import type { FrameworkDetail, FrameworkItemNode } from "@/lib/queries/frameworks";

type ItemDrawerState =
  | { mode: "create"; parentId: string | null }
  | { mode: "edit"; item: FrameworkItemNode }
  | null;
type FwDeleteState = "none" | "blocked" | "confirm";

function collectRootIds(nodes: FrameworkItemNode[]): string[] {
  return nodes.map((n) => n.id);
}

/** Ancestor titles for a search match, e.g. "4 Context › 4.1 Organization and context". */
function pathFor(flatItems: FrameworkItemNode[], itemId: string): string {
  const byId = new Map(flatItems.map((i) => [i.id, i]));
  const segments: string[] = [];
  let current = byId.get(itemId)?.parentId ?? null;
  while (current) {
    const node = byId.get(current);
    if (!node) break;
    segments.unshift(node.code ? `${node.code} ${node.title}` : node.title);
    current = node.parentId;
  }
  return segments.length > 0 ? segments.join(" › ") : "Top level";
}

export function FrameworkDetailView({
  framework,
  categories,
  isAdmin,
}: {
  framework: FrameworkDetail;
  categories: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [itemSearch, setItemSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(collectRootIds(framework.tree)));
  const [itemDrawer, setItemDrawer] = useState<ItemDrawerState>(null);
  const [fwDrawerOpen, setFwDrawerOpen] = useState(false);
  const [fwDeleteState, setFwDeleteState] = useState<FwDeleteState>("none");
  const [fwDeleteMessage, setFwDeleteMessage] = useState<string | null>(null);
  const [fwDeletePending, startFwDeleteTransition] = useTransition();
  const { message, show } = useToast();

  const searchMatches = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return null;
    return framework.flatItems
      .filter((i) => (i.code ?? "").toLowerCase().includes(q) || i.title.toLowerCase().includes(q))
      .map((i) => ({ ...i, path: pathFor(framework.flatItems, i.id) }));
  }, [framework.flatItems, itemSearch]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleFrameworkSaved(msg: string) {
    setFwDrawerOpen(false);
    router.refresh();
    show(msg);
  }
  function handleItemSaved(msg: string) {
    setItemDrawer(null);
    router.refresh();
    show(msg);
  }

  async function handleDeleteItem(node: FrameworkItemNode) {
    return deleteFrameworkItem(node.id, framework.id);
  }

  function askDeleteFramework() {
    setFwDeleteState(framework.referenced ? "blocked" : "confirm");
  }
  function confirmDeleteFramework() {
    startFwDeleteTransition(async () => {
      const result = await deleteFramework(framework.id);
      if (!result.ok) {
        setFwDeleteMessage(result.error);
        setFwDeleteState("blocked");
        return;
      }
      router.push("/frameworks");
    });
  }

  return (
    <div>
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/frameworks" className="hover:underline">
          Framework Library
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{formatFrameworkIdentity(framework.code, framework.edition)}</span>
      </div>

      <div className="mb-1">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {formatFrameworkIdentity(framework.code, framework.edition)}
        </h1>
        <p className="mt-1 text-sm text-muted">{framework.name}</p>
      </div>
      {framework.category ? (
        <span className="mb-2 inline-flex items-center rounded bg-neutral-soft px-2 py-0.5 text-[11.5px] font-medium text-foreground">
          {humanizeCategory(framework.category)}
        </span>
      ) : null}
      <p className="mb-4 text-xs text-muted">
        {framework.itemCount} {framework.itemCount === 1 ? "framework item" : "framework items"}
      </p>

      {fwDeleteState === "blocked" ? (
        <div className="mb-4 flex items-center gap-2.5 rounded-md bg-warning-soft px-3.5 py-2.5">
          <span className="text-[13px] text-warning">
            {fwDeleteMessage ?? "This framework is in use and cannot be deleted."}
          </span>
          <button
            type="button"
            onClick={() => {
              setFwDeleteState("none");
              setFwDeleteMessage(null);
            }}
            className="text-[13px] font-semibold text-muted"
          >
            OK
          </button>
        </div>
      ) : null}
      {fwDeleteState === "confirm" ? (
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-md bg-danger-soft px-3.5 py-2.5">
          <span className="text-[13px] text-danger">
            Delete this framework and all its framework items? This cannot be undone.
          </span>
          <button
            type="button"
            onClick={() => setFwDeleteState("none")}
            disabled={fwDeletePending}
            className="text-[13px] font-semibold text-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDeleteFramework}
            disabled={fwDeletePending}
            aria-busy={fwDeletePending}
            className="rounded-md bg-danger px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
          >
            {fwDeletePending ? "Deleting…" : "Delete Framework"}
          </button>
        </div>
      ) : null}

      {/*
        Compact sticky work area (desktop only — md:sticky; mobile keeps normal flow so it
        never eats into the smaller viewport). Holds exactly what's needed while scrolling a
        long hierarchy: identity for context, admin actions, search, Add Item. Breadcrumb,
        the large heading, category and item count stay above it and scroll away normally.
      */}
      <div className="md:sticky md:top-0 z-10 mb-3 flex flex-wrap items-center gap-2.5 border-b border-border bg-background py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 truncate text-sm font-semibold">
            {formatFrameworkIdentity(framework.code, framework.edition)}
          </span>
          {isAdmin ? (
            <>
              <Button
                type="button"
                variant="secondary"
                className="min-h-8 shrink-0 px-3 text-xs"
                onClick={() => setFwDrawerOpen(true)}
              >
                Edit
              </Button>
              <OverflowMenu items={[{ label: "Delete Framework", onSelect: askDeleteFramework, danger: true }]} />
            </>
          ) : null}
        </div>
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2.5 sm:flex-none">
          <div className="max-w-xs flex-1">
            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search framework items…"
              aria-label="Search framework items"
            />
          </div>
          {isAdmin ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-8 shrink-0 px-3 text-xs"
              onClick={() => setItemDrawer({ mode: "create", parentId: null })}
            >
              + Add Item
            </Button>
          ) : null}
        </div>
      </div>

      {searchMatches ? (
        searchMatches.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
            <p className="mb-2 text-sm text-muted">{`No framework items match "${itemSearch}".`}</p>
            <button
              type="button"
              onClick={() => setItemSearch("")}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            {searchMatches.map((m) => (
              <div key={m.id} className="flex items-baseline gap-2.5 border-t border-border px-4 py-2.5 text-sm first:border-t-0">
                {m.code ? <span className="shrink-0 font-semibold text-primary">{m.code}</span> : null}
                <div className="min-w-0">
                  <div>{m.title}</div>
                  <div className="text-[11.5px] text-muted">{m.path}</div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : framework.tree.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
          <p className="text-sm text-muted">No framework items yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {framework.tree.map((node) => (
            <FrameworkItemRow
              key={node.id}
              node={node}
              depth={0}
              isAdmin={isAdmin}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpand}
              onAddSubItem={(n) => setItemDrawer({ mode: "create", parentId: n.id })}
              onEdit={(n) => setItemDrawer({ mode: "edit", item: n })}
              onDelete={handleDeleteItem}
            />
          ))}
        </div>
      )}

      {fwDrawerOpen ? (
        <FrameworkFormDrawer
          mode="edit"
          framework={framework}
          categories={categories}
          onClose={() => setFwDrawerOpen(false)}
          onSaved={handleFrameworkSaved}
        />
      ) : null}
      {itemDrawer ? (
        <FrameworkItemFormDrawer
          frameworkId={framework.id}
          items={framework.flatItems}
          mode={itemDrawer.mode}
          item={itemDrawer.mode === "edit" ? itemDrawer.item : undefined}
          initialParentId={itemDrawer.mode === "create" ? itemDrawer.parentId : undefined}
          onClose={() => setItemDrawer(null)}
          onSaved={handleItemSaved}
        />
      ) : null}
      <Toast message={message} />
    </div>
  );
}
