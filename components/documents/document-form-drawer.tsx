"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createDocument, updateDocument } from "@/lib/mutations/documents";
import { EXPECTED_RECORDS_MAX } from "@/lib/validation/documents";
import { FrameworkRequirementPicker } from "./framework-requirement-picker";
import type { DocumentFormCatalog, DocumentFrameworkItem, DocumentRow } from "@/lib/queries/documents";

type Scope = "project_wide" | "specific_site";

const SELECT_CLASS =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm";

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1.5 text-xs text-danger">
      {message}
    </p>
  ) : null;
}

/**
 * Create / Edit a logical Document (Phase 5A): identity, scope, applicability and Framework
 * Requirements in one save. No status, version, file or review fields — status is derived.
 */
export function DocumentFormDrawer({
  mode,
  projectId,
  catalog,
  document,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  catalog: DocumentFormCatalog;
  document?: DocumentRow & { expectedRecords?: string | null };
  onClose: () => void;
  onSaved: (message: string, documentId?: string) => void;
}) {
  const [title, setTitle] = useState(document?.title ?? "");
  const [docCode, setDocCode] = useState(document?.docCode ?? "");
  const [documentType, setDocumentType] = useState(document?.documentType ?? "");
  const [ownerName, setOwnerName] = useState(document?.ownerName ?? "");
  const [expectedRecords, setExpectedRecords] = useState(document?.expectedRecords ?? "");
  const [scope, setScope] = useState<Scope>(document?.siteId ? "specific_site" : "project_wide");
  const [siteId, setSiteId] = useState(document?.siteId ?? "");
  const [isApplicable, setIsApplicable] = useState(document?.isApplicable ?? true);
  const [items, setItems] = useState<DocumentFrameworkItem[]>(document?.frameworkItems ?? []);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const code = docCode.trim().toLowerCase();
  const duplicate = code
    ? catalog.existingCodes.find((c) => c.code.trim().toLowerCase() === code && c.documentId !== document?.id)
    : undefined;

  function clearError(key: string) {
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function handleSave() {
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = "Title is required.";
    if (scope === "specific_site" && !siteId) errors.siteId = "Select a site.";
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      title,
      docCode,
      documentType,
      ownerName,
      expectedRecords,
      siteId: scope === "specific_site" ? siteId : "",
      isApplicable,
      frameworkItemIds: items.map((i) => i.id),
    };
    startTransition(async () => {
      if (mode === "create") {
        const result = await createDocument(projectId, payload);
        if (!result.ok) {
          setFormError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }
        onSaved("Document created", result.data.id);
        return;
      }
      const result = await updateDocument(projectId, document!.id, payload);
      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onSaved("Document updated");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={mode === "create" ? "New Document" : "Edit Document"}
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
      <div className="space-y-5">
        <div className="space-y-4">
          <div>
            <label htmlFor="doc-title" className="mb-1.5 block text-sm font-medium">
              Title *
            </label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearError("title");
              }}
              placeholder="e.g. Document Control Procedure"
              aria-invalid={fieldErrors.title ? true : undefined}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="doc-code" className="mb-1.5 block text-sm font-medium">
                Document Code
              </label>
              <Input id="doc-code" value={docCode} onChange={(e) => setDocCode(e.target.value)} placeholder="e.g. PR-QMS-01" />
              {duplicate ? (
                <p data-testid="duplicate-code" className="mt-1.5 text-xs text-muted">
                  Also used by “{duplicate.title}”.
                </p>
              ) : null}
              <FieldError message={fieldErrors.docCode} />
            </div>
            <div>
              <label htmlFor="doc-type" className="mb-1.5 block text-sm font-medium">
                Document Type
              </label>
              <Input
                id="doc-type"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                placeholder="e.g. Procedure, Manual, Register"
              />
              <FieldError message={fieldErrors.documentType} />
            </div>
          </div>

          <div>
            <label htmlFor="doc-owner" className="mb-1.5 block text-sm font-medium">
              Owner
            </label>
            <Input id="doc-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Quality Manager" />
            <FieldError message={fieldErrors.ownerName} />
          </div>

          <div>
            <label htmlFor="doc-expected-records" className="mb-1.5 block text-sm font-medium">
              Expected Records / Required Evidence
            </label>
            <Textarea
              id="doc-expected-records"
              data-testid="doc-expected-records"
              value={expectedRecords}
              onChange={(e) => {
                setExpectedRecords(e.target.value);
                clearError("expectedRecords");
              }}
              rows={5}
              placeholder={"Annual training plan\nTraining attendance records\nCompetence evaluation"}
              aria-invalid={fieldErrors.expectedRecords ? true : undefined}
              aria-describedby="doc-expected-records-help"
            />
            <p id="doc-expected-records-help" className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
              <span>Records or evidence the consultant expects to review for this Required Document. One per line.</span>
              <span className={expectedRecords.length > EXPECTED_RECORDS_MAX ? "font-semibold text-danger" : undefined}>
                {expectedRecords.length.toLocaleString("en-US")} / {EXPECTED_RECORDS_MAX.toLocaleString("en-US")}
              </span>
            </p>
            <FieldError message={fieldErrors.expectedRecords} />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2.5">
            <input
              id="doc-applicable"
              type="checkbox"
              checked={isApplicable}
              onChange={(e) => setIsApplicable(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium">Applicable</span>
              <span className="block text-xs text-muted">
                Untick if this document does not apply to the project. Its status becomes Not Applicable; nothing is deleted.
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Scope</h3>
          <div className="flex gap-1.5">
            {(["project_wide", "specific_site"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setScope(value);
                  if (value === "project_wide") setSiteId("");
                  clearError("siteId");
                }}
                aria-pressed={scope === value}
                className={cn(
                  "min-h-9 flex-1 rounded-md border text-sm font-medium",
                  scope === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-neutral-soft",
                )}
              >
                {value === "project_wide" ? "Project-wide" : "Specific site"}
              </button>
            ))}
          </div>
          {scope === "specific_site" ? (
            <div>
              <label htmlFor="doc-site" className="mb-1.5 block text-sm font-medium">
                Site *
              </label>
              <select
                id="doc-site"
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  clearError("siteId");
                }}
                aria-invalid={fieldErrors.siteId ? true : undefined}
                className={SELECT_CLASS}
              >
                <option value="">Select a site…</option>
                {catalog.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.siteId} />
            </div>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Framework Requirements</h3>
          <FrameworkRequirementPicker
            options={catalog.frameworkItems}
            selected={items}
            onChange={(next) => {
              setItems(next);
              clearError("frameworkItemIds");
            }}
            error={fieldErrors.frameworkItemIds}
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
