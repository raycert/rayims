"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createFramework, updateFramework } from "@/lib/mutations/frameworks";
import { humanizeCategory } from "@/lib/ui/format";
import type { FrameworkListRow } from "@/lib/queries/frameworks";

type Existing = Pick<FrameworkListRow, "id" | "code" | "edition" | "name" | "category"> & {
  description?: string | null;
  referenced?: boolean;
};

const NO_CATEGORY = "__none__";
const OTHER_CATEGORY = "__other__";

export function FrameworkFormDrawer({
  mode,
  framework,
  categories,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  framework?: Existing;
  /** Distinct category values already in the catalog (raw stored values, no taxonomy table). */
  categories: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [code, setCode] = useState(framework?.code ?? "");
  const [edition, setEdition] = useState(framework?.edition ?? "");
  const [name, setName] = useState(framework?.name ?? "");
  const existingCategory = framework?.category ?? "";
  const [categorySelection, setCategorySelection] = useState<string>(() => {
    if (!existingCategory) return NO_CATEGORY;
    return categories.includes(existingCategory) ? existingCategory : OTHER_CATEGORY;
  });
  const [customCategory, setCustomCategory] = useState(
    existingCategory && !categories.includes(existingCategory) ? existingCategory : "",
  );
  const [description, setDescription] = useState(framework?.description ?? "");

  const [codeError, setCodeError] = useState<string | null>(null);
  const [editionError, setEditionError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setCodeError(null);
    setEditionError(null);
    setNameError(null);
    setFormError(null);

    let hasError = false;
    if (!code.trim()) {
      setCodeError("Code is required.");
      hasError = true;
    }
    if (!edition.trim()) {
      setEditionError("Edition is required.");
      hasError = true;
    }
    if (!name.trim()) {
      setNameError("Name is required.");
      hasError = true;
    }
    if (hasError) return;

    const category =
      categorySelection === NO_CATEGORY
        ? ""
        : categorySelection === OTHER_CATEGORY
          ? customCategory.trim()
          : categorySelection;

    startTransition(async () => {
      const input = { code, edition, name, category, description };
      const result =
        mode === "create" ? await createFramework(input) : await updateFramework(framework!.id, input);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors?.code) setCodeError(result.fieldErrors.code);
        if (result.fieldErrors?.edition) setEditionError(result.fieldErrors.edition);
        if (result.fieldErrors?.name) setNameError(result.fieldErrors.name);
        return;
      }
      onSaved(mode === "create" ? "Framework created" : "Framework updated");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={mode === "create" ? "New Framework" : "Edit Framework"}
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
        {mode === "edit" && framework?.referenced ? (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            This framework is used by one or more projects. Changes will be visible there.
          </p>
        ) : null}

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="fw-code" className="mb-1.5 block text-sm font-medium">
              Code *
            </label>
            <Input
              id="fw-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError(null);
              }}
              placeholder="e.g. ISO 22000"
              aria-invalid={codeError ? true : undefined}
              autoFocus
            />
            {codeError ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {codeError}
              </p>
            ) : null}
          </div>
          <div className="flex-1">
            <label htmlFor="fw-edition" className="mb-1.5 block text-sm font-medium">
              Edition *
            </label>
            <Input
              id="fw-edition"
              value={edition}
              onChange={(e) => {
                setEdition(e.target.value);
                setEditionError(null);
              }}
              placeholder="e.g. 2018"
              aria-invalid={editionError ? true : undefined}
            />
            {editionError ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {editionError}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="fw-name" className="mb-1.5 block text-sm font-medium">
            Name *
          </label>
          <Input
            id="fw-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            placeholder="e.g. Food safety management systems"
            aria-invalid={nameError ? true : undefined}
          />
          {nameError ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {nameError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="fw-category" className="mb-1.5 block text-sm font-medium">
            Category
          </label>
          <select
            id="fw-category"
            value={categorySelection}
            onChange={(e) => setCategorySelection(e.target.value)}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm"
          >
            <option value={NO_CATEGORY}>No category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {humanizeCategory(c)}
              </option>
            ))}
            <option value={OTHER_CATEGORY}>Other…</option>
          </select>
          {categorySelection === OTHER_CATEGORY ? (
            <Input
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="e.g. Sustainability Reporting"
              className="mt-2"
              aria-label="New category name"
            />
          ) : null}
        </div>

        <div>
          <label htmlFor="fw-description" className="mb-1.5 block text-sm font-medium">
            Description
          </label>
          <Textarea
            id="fw-description"
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
