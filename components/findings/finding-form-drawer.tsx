"use client";

import { useMemo, useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FINDING_TYPES } from "@/lib/validation/findings";
import { VERIFICATION_PRIORITIES } from "@/lib/validation/verification-items";
import { findingTypeLabel, priorityLabel } from "@/lib/ui/status-tones";
import { formatDate } from "@/lib/ui/format";
import { createFinding, createFindingFromVerification, updateFinding } from "@/lib/mutations/findings";
import type { FindingRow } from "@/lib/queries/findings";
import type { VerificationFormCatalog } from "@/lib/queries/verification-items";

type Scope = "project_wide" | "specific_site";

function activityIdentity(a: { name: string; startDate: string | null }): string {
  return a.startDate ? `${formatDate(a.startDate)} · ${a.name}` : `Undated · ${a.name}`;
}

/** Verification context for "Create Finding" on Activity Detail (Phase 4C-2). Read-only origin + prefill. */
export type VerificationOrigin = {
  verificationItemId: string;
  /** The Activity where the check was verified — the Finding's observation context. */
  activityId: string;
  question: string;
  siteId: string | null;
  frameworkItemId: string | null;
  notes: string | null;
  priority: string;
};

const SELECT_CLASS =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm";

/** Create / Edit for the core Finding fields (Phase 4C-1). Response fields are Phase 4D. */
export function FindingFormDrawer({
  mode,
  projectId,
  catalog,
  finding,
  origin,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  catalog: VerificationFormCatalog;
  finding?: FindingRow;
  /** Create-only: open from a Verification. Verification link and Activity are fixed. */
  origin?: VerificationOrigin;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  // No default Finding Type on create: the user must choose one.
  const [findingType, setFindingType] = useState(finding?.findingType ?? "");
  const [title, setTitle] = useState(finding?.title ?? "");
  // From a Verification: Description <- its Notes, Priority <- its priority, Framework <- its
  // requirement; Title and Finding Type stay blank (a checklist question is not a finding statement,
  // and a result never implies a type).
  const [description, setDescription] = useState(finding?.description ?? origin?.notes ?? "");
  const [priority, setPriority] = useState(finding?.priority ?? origin?.priority ?? "medium");
  const originActivity = origin ? catalog.activities.find((a) => a.id === origin.activityId) : undefined;
  const initialSiteId = finding?.siteId ?? originActivity?.siteId ?? origin?.siteId ?? "";
  const [scope, setScope] = useState<Scope>(initialSiteId ? "specific_site" : "project_wide");
  const [siteId, setSiteId] = useState(initialSiteId);
  const [activityId, setActivityId] = useState(finding?.activityId ?? origin?.activityId ?? "");
  const [frameworkItemId, setFrameworkItemId] = useState(finding?.frameworkItemId ?? origin?.frameworkItemId ?? "");
  // The Activity is fixed for a new Finding created from a Verification and for an existing
  // verification-linked Finding (traceability); manual Findings keep a free Activity picker.
  const activityFixed = !!origin || !!finding?.verificationItemId;

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedActivity = useMemo(
    () => catalog.activities.find((a) => a.id === activityId),
    [catalog.activities, activityId],
  );
  const siteLocked = !!selectedActivity?.siteId;
  const lockedSiteName = siteLocked ? catalog.sites.find((s) => s.id === selectedActivity!.siteId)?.name : undefined;

  const frameworkGroups = useMemo(() => {
    const groups = new Map<string, typeof catalog.frameworkItems>();
    for (const fi of catalog.frameworkItems) {
      const key = fi.inAssignedScope ? fi.frameworkIdentity : `${fi.frameworkIdentity} (not currently assigned)`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(fi);
    }
    return groups;
  }, [catalog]);

  function clearError(key: string) {
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function handleScopeChange(next: Scope) {
    setScope(next);
    if (next === "project_wide") setSiteId("");
    clearError("siteId");
  }

  function handleActivityChange(newId: string) {
    setActivityId(newId);
    const activity = catalog.activities.find((a) => a.id === newId);
    if (activity?.siteId) {
      // Site-specific Activity: auto-fill and lock (BR-73).
      setScope("specific_site");
      setSiteId(activity.siteId);
    }
    // Project-wide or no Activity: unlock but keep the user's current Site choice.
    clearError("siteId");
    clearError("activityId");
  }

  function handleSave() {
    const errors: Record<string, string> = {};
    if (!findingType) errors.findingType = "Select a Finding Type.";
    if (!title.trim()) errors.title = "Title is required.";
    if (scope === "specific_site" && !siteId) errors.siteId = "Select a site.";
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      findingType,
      title,
      description,
      priority,
      siteId: scope === "specific_site" ? siteId : "",
      activityId,
      frameworkItemId,
    };

    startTransition(async () => {
      const result = origin
        ? await createFindingFromVerification(projectId, origin.activityId, origin.verificationItemId, {
            findingType,
            title,
            description,
            priority,
            siteId: payload.siteId,
            frameworkItemId,
          })
        : mode === "create"
          ? await createFinding(projectId, payload)
          : await updateFinding(projectId, finding!.id, payload);

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onSaved(mode === "create" ? "Finding created" : "Finding updated");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={mode === "create" ? "New Finding" : "Edit Finding"}
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
        {origin ? (
          <div data-testid="finding-origin" className="rounded-md border border-border bg-neutral-soft px-3 py-2.5 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Origin</div>
            <div className="mt-1">
              <span className="text-muted">Verification: </span>
              <span className="font-semibold">{origin.question}</span>
            </div>
            <div className="mt-0.5">
              <span className="text-muted">Activity: </span>
              <span className="font-semibold">{originActivity ? activityIdentity(originActivity) : "—"}</span>
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Finding</h3>

          <div>
            <span id="fd-type-label" className="mb-1.5 block text-sm font-medium">
              Finding Type *
            </span>
            <div role="group" aria-labelledby="fd-type-label" className="flex flex-col gap-1.5">
              {FINDING_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFindingType(value);
                    clearError("findingType");
                  }}
                  aria-pressed={findingType === value}
                  className={cn(
                    "min-h-10 rounded-md border px-3 text-left text-sm font-medium",
                    findingType === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted hover:bg-neutral-soft",
                  )}
                >
                  {findingTypeLabel(value)}
                </button>
              ))}
            </div>
            {fieldErrors.findingType ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {fieldErrors.findingType}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="fd-title" className="mb-1.5 block text-sm font-medium">
              Title *
            </label>
            <Input
              id="fd-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearError("title");
              }}
              placeholder="e.g. Chemical containers stored without secondary containment"
              aria-invalid={fieldErrors.title ? true : undefined}
            />
            {fieldErrors.title ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {fieldErrors.title}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="fd-description" className="mb-1.5 block text-sm font-medium">
              Description
            </label>
            <Textarea
              id="fd-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

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

          {activityFixed ? (
            <div>
              <span className="mb-1.5 block text-sm font-medium">Activity</span>
              <div
                data-testid="finding-activity-fixed"
                className="flex min-h-11 items-center rounded-md border border-border bg-neutral-soft px-3 text-sm font-semibold text-muted"
              >
                {selectedActivity ? activityIdentity(selectedActivity) : "—"}
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Fixed because this finding {origin ? "is created from" : "was created from"} a verification.
              </p>
              {fieldErrors.activityId ? (
                <p role="alert" className="mt-1.5 text-xs text-danger">
                  {fieldErrors.activityId}
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <label htmlFor="fd-activity" className="mb-1.5 block text-sm font-medium">
                Activity
              </label>
              <select
                id="fd-activity"
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
          )}

          {siteLocked ? (
            <div>
              <span className="mb-1.5 block text-sm font-medium">Site</span>
              <div
                data-testid="finding-site-locked"
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
              <div>
                <span className="mb-1.5 block text-sm font-medium">Scope</span>
                <div className="flex gap-1.5">
                  {(["project_wide", "specific_site"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleScopeChange(value)}
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
              </div>

              {scope === "specific_site" ? (
                <div>
                  <label htmlFor="fd-site" className="mb-1.5 block text-sm font-medium">
                    Site *
                  </label>
                  <select
                    id="fd-site"
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

        <div className="space-y-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Framework</h3>

          <div>
            <label htmlFor="fd-framework" className="mb-1.5 block text-sm font-medium">
              Framework Requirement
            </label>
            <select
              id="fd-framework"
              value={frameworkItemId}
              onChange={(e) => setFrameworkItemId(e.target.value)}
              aria-invalid={fieldErrors.frameworkItemId ? true : undefined}
              className={SELECT_CLASS}
            >
              <option value="">No framework requirement</option>
              {[...frameworkGroups.entries()].map(([groupLabel, items]) => (
                <optgroup key={groupLabel} label={groupLabel}>
                  {items.map((fi) => (
                    <option key={fi.id} value={fi.id}>
                      {fi.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {catalog.frameworkItems.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted">No frameworks are assigned to this project.</p>
            ) : null}
            {fieldErrors.frameworkItemId ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {fieldErrors.frameworkItemId}
              </p>
            ) : null}
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
