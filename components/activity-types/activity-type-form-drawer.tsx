"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createActivityType, updateActivityType } from "@/lib/mutations/activity-types";
import { suggestKeyFromLabel } from "@/lib/validation/activity-types";
import type { ActivityTypeRow } from "@/lib/queries/activity-types";

export function ActivityTypeFormDrawer({
  mode,
  activityType,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  activityType?: ActivityTypeRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [label, setLabel] = useState(activityType?.label ?? "");
  const [key, setKey] = useState(activityType?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState(activityType?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(activityType?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(activityType?.isActive ?? true);

  const [labelError, setLabelError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [sortOrderError, setSortOrderError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLabelChange(value: string) {
    setLabel(value);
    setLabelError(null);
    // Create-only, and only while the Admin hasn't started editing Key themselves —
    // a live suggestion they can still review and change before save.
    if (mode === "create" && !keyTouched) {
      setKey(suggestKeyFromLabel(value));
    }
  }

  function handleSave() {
    setLabelError(null);
    setKeyError(null);
    setSortOrderError(null);
    setFormError(null);

    let hasError = false;
    if (!label.trim()) {
      setLabelError("Label is required.");
      hasError = true;
    }
    if (mode === "create" && !key.trim()) {
      setKeyError("Key is required.");
      hasError = true;
    }
    const sortOrderNumber = Number(sortOrder);
    if (!Number.isInteger(sortOrderNumber)) {
      setSortOrderError("Sort order must be a whole number.");
      hasError = true;
    }
    if (hasError) return;

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createActivityType({ key, label, description, sortOrder: sortOrderNumber, isActive })
          : await updateActivityType(activityType!.id, { label, description, sortOrder: sortOrderNumber, isActive });

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors?.key) setKeyError(result.fieldErrors.key);
        if (result.fieldErrors?.label) setLabelError(result.fieldErrors.label);
        if (result.fieldErrors?.sortOrder) setSortOrderError(result.fieldErrors.sortOrder);
        return;
      }
      onSaved(mode === "create" ? "Activity Type created" : "Activity Type updated");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={mode === "create" ? "New Activity Type" : "Edit Activity Type"}
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
        {mode === "edit" && activityType?.referenced ? (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            This Activity Type is in use. Changes will be visible wherever it&apos;s
            referenced.
          </p>
        ) : null}

        <div>
          <label htmlFor="at-label" className="mb-1.5 block text-sm font-medium">
            Label *
          </label>
          <Input
            id="at-label"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="e.g. Management Review"
            aria-invalid={labelError ? true : undefined}
            autoFocus
          />
          {labelError ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {labelError}
            </p>
          ) : null}
        </div>

        {mode === "create" ? (
          <div>
            <label htmlFor="at-key" className="mb-1.5 block text-sm font-medium">
              Key *
            </label>
            <Input
              id="at-key"
              value={key}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value);
                setKeyError(null);
              }}
              placeholder="e.g. management_review"
              aria-invalid={keyError ? true : undefined}
            />
            <p className="mt-1.5 text-xs text-muted">
              Lowercase letters, numbers and underscores only. Suggested from the label —
              review before saving. Cannot be changed later.
            </p>
            {keyError ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {keyError}
              </p>
            ) : null}
          </div>
        ) : (
          <div>
            <span className="mb-1.5 block text-sm font-medium">Key</span>
            <div className="flex min-h-11 items-center rounded-md border border-border bg-neutral-soft px-3 text-sm font-semibold text-muted">
              {activityType?.key}
            </div>
            <p className="mt-1.5 text-xs text-muted">Stable identifier — cannot be changed.</p>
          </div>
        )}

        <div>
          <label htmlFor="at-description" className="mb-1.5 block text-sm font-medium">
            Description
          </label>
          <Textarea
            id="at-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            rows={3}
          />
        </div>

        <div>
          <label htmlFor="at-sort-order" className="mb-1.5 block text-sm font-medium">
            Sort order
          </label>
          <Input
            id="at-sort-order"
            type="number"
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value);
              setSortOrderError(null);
            }}
            aria-invalid={sortOrderError ? true : undefined}
          />
          {sortOrderError ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {sortOrderError}
            </p>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium">Status</span>
          <div className="flex gap-1.5">
            {([true, false] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setIsActive(value)}
                aria-pressed={isActive === value}
                className={cn(
                  "min-h-9 flex-1 rounded-md border text-sm font-medium",
                  isActive === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted hover:bg-neutral-soft",
                )}
              >
                {value ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
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
