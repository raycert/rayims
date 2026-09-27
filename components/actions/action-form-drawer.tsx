"use client";

import { useMemo, useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, openNativePicker } from "@/lib/utils";
import { VERIFICATION_PRIORITIES } from "@/lib/validation/verification-items";
import { priorityLabel } from "@/lib/ui/status-tones";
import { formatDate } from "@/lib/ui/format";
import { createAction, updateAction } from "@/lib/mutations/actions";
import type { ActionRow } from "@/lib/queries/actions";
import type { VerificationFormCatalog } from "@/lib/queries/verification-items";

type Scope = "project_wide" | "specific_site";

/** Finding context when adding an action from Finding Detail (link is server-derived and immutable). */
export type ActionFindingContext = {
  id: string;
  title: string;
  isNonconformity: boolean;
  activityId: string | null;
  siteId: string | null;
};

const SELECT_CLASS =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm";

function activityIdentity(a: { name: string; startDate: string | null }): string {
  return a.startDate ? `${formatDate(a.startDate)} · ${a.name}` : `Undated · ${a.name}`;
}

/**
 * One Action form for every case (Phase 4D-1): a Corrective Action / Action added from a Finding,
 * a standalone project action, and editing either. The Finding link is shown read-only and is
 * never sent — the server derives it (create) or keeps it (edit). Status is not chosen here.
 */
export function ActionFormDrawer({
  mode,
  projectId,
  catalog,
  finding,
  action,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  catalog: VerificationFormCatalog;
  /** Create from a Finding. Omit for a standalone action. */
  finding?: ActionFindingContext;
  action?: ActionRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const initialSite = action?.siteId ?? finding?.siteId ?? "";
  const [description, setDescription] = useState(action?.description ?? "");
  const [ownerName, setOwnerName] = useState(action?.ownerName ?? "");
  const [dueDate, setDueDate] = useState(action?.dueDate ?? "");
  const [priority, setPriority] = useState(action?.priority ?? "medium");
  const [scope, setScope] = useState<Scope>(initialSite ? "specific_site" : "project_wide");
  const [siteId, setSiteId] = useState(initialSite);
  const [activityId, setActivityId] = useState(action?.activityId ?? finding?.activityId ?? "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedActivity = useMemo(
    () => catalog.activities.find((a) => a.id === activityId),
    [catalog.activities, activityId],
  );
  const siteLocked = !!selectedActivity?.siteId;
  const lockedSiteName = siteLocked ? catalog.sites.find((s) => s.id === selectedActivity!.siteId)?.name : undefined;

  const linkedTitle = finding?.title ?? action?.findingTitle ?? null;
  const isCorrective = finding ? finding.isNonconformity : action?.findingType === "nonconformity";
  const noun = isCorrective ? "Corrective Action" : "Action";

  function clearError(key: string) {
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function handleActivityChange(newId: string) {
    setActivityId(newId);
    const activity = catalog.activities.find((a) => a.id === newId);
    if (activity?.siteId) {
      setScope("specific_site");
      setSiteId(activity.siteId);
    }
    clearError("siteId");
    clearError("activityId");
  }

  function handleSave() {
    const errors: Record<string, string> = {};
    if (!description.trim()) errors.description = "Action is required.";
    if (scope === "specific_site" && !siteId) errors.siteId = "Select a site.";
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      description,
      ownerName,
      dueDate,
      priority,
      siteId: scope === "specific_site" ? siteId : "",
      activityId,
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createAction(projectId, finding?.id ?? null, payload)
          : await updateAction(projectId, action!.id, payload);
      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onSaved(mode === "create" ? `${noun} added` : `${noun} updated`);
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={mode === "create" ? `New ${noun}` : `Edit ${noun}`}
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
        <div data-testid="action-finding-context" className="rounded-md border border-border bg-neutral-soft px-3 py-2.5 text-sm">
          <span className="text-muted">Finding: </span>
          <span className="font-semibold">{linkedTitle ?? "Standalone action (no finding)"}</span>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="ac-description" className="mb-1.5 block text-sm font-medium">
              Action *
            </label>
            <Textarea
              id="ac-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearError("description");
              }}
              rows={3}
              placeholder="e.g. Update the warehouse inspection checklist"
              aria-invalid={fieldErrors.description ? true : undefined}
            />
            {fieldErrors.description ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {fieldErrors.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-40 flex-[2]">
              <label htmlFor="ac-owner" className="mb-1.5 block text-sm font-medium">
                Owner
              </label>
              <Input
                id="ac-owner"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Warehouse Manager"
              />
            </div>
            <div className="min-w-36 flex-1">
              <label htmlFor="ac-due" className="mb-1.5 block text-sm font-medium">
                Due Date
              </label>
              <Input
                id="ac-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                onClick={openNativePicker}
                aria-invalid={fieldErrors.dueDate ? true : undefined}
              />
            </div>
          </div>
          {fieldErrors.dueDate ? (
            <p role="alert" className="text-xs text-danger">
              {fieldErrors.dueDate}
            </p>
          ) : null}

          <div>
            <span className="mb-1.5 block text-sm font-medium">Priority</span>
            <div className="flex gap-1.5">
              {VERIFICATION_PRIORITIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  aria-pressed={priority === value}
                  className={cn(
                    "min-h-9 flex-1 rounded-md border text-sm font-medium",
                    priority === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted hover:bg-neutral-soft",
                  )}
                >
                  {priorityLabel(value)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Scope</h3>
          <div>
            <label htmlFor="ac-activity" className="mb-1.5 block text-sm font-medium">
              Activity
            </label>
            <select
              id="ac-activity"
              value={activityId}
              onChange={(e) => handleActivityChange(e.target.value)}
              aria-invalid={fieldErrors.activityId ? true : undefined}
              className={SELECT_CLASS}
            >
              <option value="">No activity</option>
              {catalog.activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {activityIdentity(a)}
                </option>
              ))}
            </select>
            {fieldErrors.activityId ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {fieldErrors.activityId}
              </p>
            ) : null}
          </div>

          {siteLocked ? (
            <div>
              <span className="mb-1.5 block text-sm font-medium">Site</span>
              <div
                data-testid="action-site-locked"
                className="flex min-h-11 items-center rounded-md border border-border bg-neutral-soft px-3 text-sm font-semibold text-muted"
              >
                {lockedSiteName}
              </div>
              <p className="mt-1.5 text-xs text-muted">Locked because the Activity is site-specific.</p>
              {fieldErrors.siteId ? (
                <p role="alert" className="mt-1.5 text-xs text-danger">
                  {fieldErrors.siteId}
                </p>
              ) : null}
            </div>
          ) : (
            <>
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
                      scope === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted hover:bg-neutral-soft",
                    )}
                  >
                    {value === "project_wide" ? "Project-wide" : "Specific site"}
                  </button>
                ))}
              </div>
              {scope === "specific_site" ? (
                <div>
                  <label htmlFor="ac-site" className="mb-1.5 block text-sm font-medium">
                    Site *
                  </label>
                  <select
                    id="ac-site"
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
                  {fieldErrors.siteId ? (
                    <p role="alert" className="mt-1.5 text-xs text-danger">
                      {fieldErrors.siteId}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
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
