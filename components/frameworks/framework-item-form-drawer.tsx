"use client";

import { useMemo, useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createFrameworkItem, updateFrameworkItem } from "@/lib/mutations/frameworks";
import type { FrameworkItemNode } from "@/lib/queries/frameworks";

type Existing = Pick<FrameworkItemNode, "id" | "parentId" | "code" | "title" | "description" | "referenced">;

/** All descendant ids of `itemId` within `items` (BFS over parentId links). */
function descendantIdsOf(items: FrameworkItemNode[], itemId: string): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const it of items) {
    if (!it.parentId) continue;
    (byParent.get(it.parentId) ?? byParent.set(it.parentId, []).get(it.parentId)!).push(it.id);
  }
  const result = new Set<string>();
  let frontier = [itemId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const childId of byParent.get(id) ?? []) {
        if (!result.has(childId)) {
          result.add(childId);
          next.push(childId);
        }
      }
    }
    frontier = next;
  }
  return result;
}

function depthOf(items: FrameworkItemNode[], itemId: string): number {
  const byId = new Map(items.map((i) => [i.id, i]));
  let depth = 0;
  let current = byId.get(itemId);
  while (current?.parentId) {
    depth += 1;
    current = byId.get(current.parentId);
  }
  return depth;
}

export function FrameworkItemFormDrawer({
  frameworkId,
  items,
  mode,
  item,
  initialParentId,
  onClose,
  onSaved,
}: {
  frameworkId: string;
  /** Flat list of every item in this framework (for the parent picker). */
  items: FrameworkItemNode[];
  mode: "create" | "edit";
  item?: Existing;
  /** Pre-selected parent for "Add Sub-item". Ignored in edit mode. */
  initialParentId?: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [parentId, setParentId] = useState<string>(
    (mode === "edit" ? item?.parentId : initialParentId) ?? "",
  );
  const [code, setCode] = useState(item?.code ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");

  const [titleError, setTitleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const excludedIds = useMemo(() => {
    if (mode !== "edit" || !item) return new Set<string>();
    return new Set([item.id, ...descendantIdsOf(items, item.id)]);
  }, [items, mode, item]);

  const parentOptions = useMemo(
    () =>
      items
        .filter((i) => !excludedIds.has(i.id))
        .map((i) => ({
          id: i.id,
          label: `${"— ".repeat(depthOf(items, i.id))}${i.code ? `${i.code} ` : ""}${i.title}`,
        })),
    [items, excludedIds],
  );

  function handleSave() {
    setTitleError(null);
    setFormError(null);

    if (!title.trim()) {
      setTitleError("Title is required.");
      return;
    }

    startTransition(async () => {
      const input = { parentId: parentId || undefined, code, title, description };
      const result =
        mode === "create"
          ? await createFrameworkItem(frameworkId, input)
          : await updateFrameworkItem(item!.id, frameworkId, input);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors?.title) setTitleError(result.fieldErrors.title);
        return;
      }
      onSaved(mode === "create" ? "Item created" : "Item updated");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={mode === "create" ? "Add Item" : "Edit Item"}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mode === "edit" && item?.referenced ? (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            This item is in use. Changes will be visible wherever it&apos;s referenced.
          </p>
        ) : null}

        <div>
          <label htmlFor="item-parent" className="mb-1.5 block text-sm font-medium">
            Parent item
          </label>
          <select
            id="item-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm"
          >
            <option value="">— Top level —</option>
            {parentOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="item-code" className="mb-1.5 block text-sm font-medium">
            Item code
          </label>
          <Input
            id="item-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 6.1.5 (optional)"
          />
        </div>

        <div>
          <label htmlFor="item-title" className="mb-1.5 block text-sm font-medium">
            Title *
          </label>
          <Input
            id="item-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
            placeholder="Short label"
            aria-invalid={titleError ? true : undefined}
          />
          {titleError ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {titleError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="item-description" className="mb-1.5 block text-sm font-medium">
            Description
          </label>
          <Textarea
            id="item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            rows={3}
          />
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
