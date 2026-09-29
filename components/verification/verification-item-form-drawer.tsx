"use client";

import { useMemo, useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { VERIFICATION_PRIORITIES } from "@/lib/validation/verification-items";
import { priorityLabel } from "@/lib/ui/status-tones";
import { formatDate } from "@/lib/ui/format";
import { createVerificationItem, createVerificationItemFromReview, updateVerificationItem } from "@/lib/mutations/verification-items";
import type { VerificationFormCatalog, VerificationItemRow } from "@/lib/queries/verification-items";

type Scope = "project_wide" | "specific_site";

function activityIdentity(a: { name: string; startDate: string | null }): string {
  return a.startDate ? `${formatDate(a.startDate)} · ${a.name}` : `Undated · ${a.name}`;
}

/** Gap Assessment context for "Add to Verification" on Document Detail (Phase 5D). */
export type VerificationReviewOrigin = {
  reviewId: string;
  documentTitle: string;
  versionLabel: string;
  resultLabel: string;
  /** A site-specific Document fixes the check's site. */
  documentSiteId: string | null;
  /** Prefilled only when the Document maps exactly ONE requirement. */
  prefillFrameworkItemId: string | null;
};

export function VerificationItemFormDrawer({
  mode,
  projectId,
  catalog,
  item,
  defaultTargetActivityId,
  defaultSiteId,
  reviewOrigin,
  lockedSiteId,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  catalog: VerificationFormCatalog;
  item?: VerificationItemRow;
  /** Create-only shortcut (Activity Detail's "+ Add Check", Phase 4B §8-9): preset
   *  Target Activity (and its Site, which then locks normally via the same rule as a
   *  manual selection) instead of opening on an empty form. */
  defaultTargetActivityId?: string;
  defaultSiteId?: string | null;
  /** Create-only: "Add to Verification" from a Gap Assessment (Phase 5D). */
  reviewOrigin?: VerificationReviewOrigin;
  /** Edit of a review-origin check whose Document is site-specific: the site stays fixed. */
  lockedSiteId?: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const documentSiteId = reviewOrigin?.documentSiteId ?? lockedSiteId ?? null;
  const [question, setQuestion] = useState(item?.question ?? "");
  const [priority, setPriority] = useState(item?.priority ?? "medium");
  const [scope, setScope] = useState<Scope>(
    item?.siteId || defaultSiteId || documentSiteId ? "specific_site" : "project_wide",
  );
  const [siteId, setSiteId] = useState(item?.siteId ?? defaultSiteId ?? documentSiteId ?? "");
  const [targetActivityId, setTargetActivityId] = useState(item?.targetActivityId ?? defaultTargetActivityId ?? "");
  const [frameworkItemId, setFrameworkItemId] = useState(item?.frameworkItemId ?? reviewOrigin?.prefillFrameworkItemId ?? "");
  // A site-specific Document only allows project-wide Activities or Activities at the same site.
  const activityOptions = documentSiteId
    ? catalog.activities.filter((a) => !a.siteId || a.siteId === documentSiteId)
    : catalog.activities;

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedActivity = useMemo(
    () => catalog.activities.find((a) => a.id === targetActivityId),
    [catalog.activities, targetActivityId],
  );
  const lockedBy: "document" | "activity" | null = documentSiteId ? "document" : selectedActivity?.siteId ? "activity" : null;
  const siteLocked = lockedBy !== null;
  const lockedSiteName = siteLocked
    ? catalog.sites.find((s) => s.id === (documentSiteId ?? selectedActivity!.siteId))?.name
    : undefined;

  const frameworkGroups = useMemo(() => {
    const groups = new Map<string, typeof catalog.frameworkItems>();
    for (const fi of catalog.frameworkItems) {
      const key = fi.groupLabel ?? (fi.inAssignedScope ? fi.frameworkIdentity : `${fi.frameworkIdentity} (not currently assigned)`);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(fi);
    }
    return groups;
  }, [catalog]);

  function handleScopeChange(next: Scope) {
    setScope(next);
    if (next === "project_wide") setSiteId("");
    setFieldErrors((prev) => ({ ...prev, siteId: "" }));
  }

  function handleTargetActivityChange(newId: string) {
    setTargetActivityId(newId);
    const activity = catalog.activities.find((a) => a.id === newId);
    if (activity?.siteId) {
      // Site-specific Target Activity: auto-fill and lock (Phase 4 review §18).
      setScope("specific_site");
      setSiteId(activity.siteId);
    }
    // Project-wide Target Activity or "Not assigned yet": unlock, but do NOT clear
    // the current Site — the user's existing scope/site choice is preserved (§19/§20).
    setFieldErrors((prev) => ({ ...prev, siteId: "", targetActivityId: "" }));
  }

  function handleSave() {
    const errors: Record<string, string> = {};
    if (!question.trim()) errors.question = "Check / Question is required.";
    if (scope === "specific_site" && !siteId) errors.siteId = "Select a site.";
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      question,
      priority,
      siteId: scope === "specific_site" ? siteId : "",
      targetActivityId,
      frameworkItemId,
    };

    startTransition(async () => {
      const result = reviewOrigin
        ? await createVerificationItemFromReview(projectId, reviewOrigin.reviewId, payload)
        : mode === "create"
          ? await createVerificationItem(projectId, payload)
          : await updateVerificationItem(projectId, item!.id, payload);

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onSaved(mode === "create" ? "Verification item created" : "Verification item updated");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={reviewOrigin ? "Add to Verification" : mode === "create" ? "New Verification Item" : "Edit Verification Item"}
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
        {reviewOrigin ? (
          <div data-testid="verification-review-origin" className="rounded-md border border-border bg-neutral-soft px-3 py-2.5 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">From Gap Assessment</div>
            <div className="mt-1">
              <span className="text-muted">Document: </span>
              <span className="font-semibold">{reviewOrigin.documentTitle}</span>
            </div>
            <div className="mt-0.5">
              <span className="text-muted">Version: </span>
              <span className="font-semibold">{reviewOrigin.versionLabel}</span>
              <span className="text-muted"> · Assessment: </span>
              <span className="font-semibold">{reviewOrigin.resultLabel}</span>
            </div>
          </div>
        ) : null}
        {/* Section: Verification */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Verification</h3>

          <div>
            <label htmlFor="vi-question" className="mb-1.5 block text-sm font-medium">
              Check / Question *
            </label>
            <Textarea
              id="vi-question"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setFieldErrors((prev) => ({ ...prev, question: "" }));
              }}
              placeholder="e.g. Check chemical storage and secondary containment"
              rows={3}
              aria-invalid={fieldErrors.question ? true : undefined}
              autoFocus
            />
            {fieldErrors.question ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {fieldErrors.question}
              </p>
            ) : null}
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

        {/* Section: Scope */}
        <div className="space-y-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Scope</h3>

          <div>
            <label htmlFor="vi-target-activity" className="mb-1.5 block text-sm font-medium">
              Target Activity
            </label>
            <select
              id="vi-target-activity"
              value={targetActivityId}
              onChange={(e) => handleTargetActivityChange(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm"
            >
              <option value="">Not assigned yet</option>
              {activityOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {activityIdentity(a)}
                </option>
              ))}
            </select>
          </div>

          {siteLocked ? (
            <div>
              <span className="mb-1.5 block text-sm font-medium">Site</span>
              <div className="flex min-h-11 items-center rounded-md border border-border bg-neutral-soft px-3 text-sm font-semibold text-muted">
                {lockedSiteName}
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {lockedBy === "document"
                  ? "Locked because the document is site-specific."
                  : "Locked because the Target Activity is site-specific."}
              </p>
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
                  <label htmlFor="vi-site" className="mb-1.5 block text-sm font-medium">
                    Site *
                  </label>
                  <select
                    id="vi-site"
                    value={siteId}
                    onChange={(e) => {
                      setSiteId(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, siteId: "" }));
                    }}
                    aria-invalid={fieldErrors.siteId ? true : undefined}
                    className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm"
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

        {/* Section: Framework */}
        <div className="space-y-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Framework</h3>

          <div>
            <label htmlFor="vi-framework" className="mb-1.5 block text-sm font-medium">
              Framework Requirement
            </label>
            <select
              id="vi-framework"
              value={frameworkItemId}
              onChange={(e) => setFrameworkItemId(e.target.value)}
              aria-invalid={fieldErrors.frameworkItemId ? true : undefined}
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm"
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
