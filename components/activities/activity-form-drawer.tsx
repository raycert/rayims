"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, openNativePicker } from "@/lib/utils";
import { createActivity, updateActivity } from "@/lib/mutations/activities";
import type { ActivityDetail, ActivityFormCatalog } from "@/lib/queries/activities";

type Scope = "project_wide" | "specific_site";

export function ActivityFormDrawer({
  mode,
  projectId,
  catalog,
  activity,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  catalog: ActivityFormCatalog;
  activity?: ActivityDetail;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [activityTypeId, setActivityTypeId] = useState(activity?.activityTypeId ?? "");
  const [name, setName] = useState(activity?.name ?? "");
  const [scope, setScope] = useState<Scope>(activity?.siteId ? "specific_site" : "project_wide");
  const [siteId, setSiteId] = useState(activity?.siteId ?? "");
  const [deliveryMode, setDeliveryMode] = useState(activity?.mode ?? "on_site");
  const [consultantId, setConsultantId] = useState(activity?.consultantId ?? "");
  const [startDate, setStartDate] = useState(activity?.startDate ?? "");
  const [startTime, setStartTime] = useState(activity?.startTime?.slice(0, 5) ?? "");
  const [endDate, setEndDate] = useState(activity?.endDate ?? "");
  const [endTime, setEndTime] = useState(activity?.endTime?.slice(0, 5) ?? "");
  const [plannedDays, setPlannedDays] = useState(activity?.plannedDays != null ? String(activity.plannedDays) : "");
  const [objectives, setObjectives] = useState(activity?.objectives ?? "");
  const [plannedWork, setPlannedWork] = useState(activity?.plannedWork ?? "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleScopeChange(next: Scope) {
    setScope(next);
    if (next === "project_wide") setSiteId("");
    setFieldErrors((prev) => ({ ...prev, siteId: "" }));
  }

  function handleSave() {
    const errors: Record<string, string> = {};
    if (!activityTypeId) errors.activityTypeId = "Select an Activity Type.";
    if (!name.trim()) errors.name = "Activity Name is required.";
    if (scope === "specific_site" && !siteId) errors.siteId = "Select a site.";
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      activityTypeId,
      name,
      siteId: scope === "specific_site" ? siteId : "",
      mode: deliveryMode,
      consultantId,
      startDate,
      startTime,
      endDate,
      endTime,
      plannedDays,
      objectives,
      plannedWork,
      // Status has its own dedicated control on Activity Detail (Phase 3B-3) — this
      // form never changes it, but the update schema still requires a value, so the
      // activity's current (unedited) status rides along unchanged.
      // The Outcome / Activity Summary has its own editor since Phase 6B (never sent from here).
      ...(mode === "edit" ? { status: activity!.status } : {}),
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createActivity(projectId, payload)
          : await updateActivity(projectId, activity!.id, payload);

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onSaved(mode === "create" ? "Activity created" : "Activity updated");
    });
  }

  const currentTypeInactive = mode === "edit" && activity ? !activity.activityTypeIsActive : false;

  return (
    <Drawer
      open
      onClose={onClose}
      title={mode === "create" ? "New Activity" : "Edit Activity"}
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
        {/* Section: Activity */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Activity</h3>

          <div>
            <label htmlFor="act-type" className="mb-1.5 block text-sm font-medium">
              Activity Type *
            </label>
            <select
              id="act-type"
              value={activityTypeId}
              onChange={(e) => {
                setActivityTypeId(e.target.value);
                setFieldErrors((prev) => ({ ...prev, activityTypeId: "" }));
              }}
              aria-invalid={fieldErrors.activityTypeId ? true : undefined}
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm"
            >
              <option value="">Select an Activity Type…</option>
              {catalog.activityTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.isActive ? "" : " (Inactive)"}
                </option>
              ))}
            </select>
            {currentTypeInactive ? (
              <p className="mt-1.5 text-xs text-warning">
                This Activity&apos;s current type is inactive. It stays selected until you choose a different one.
              </p>
            ) : null}
            {fieldErrors.activityTypeId ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {fieldErrors.activityTypeId}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="act-name" className="mb-1.5 block text-sm font-medium">
              Activity Name *
            </label>
            <Input
              id="act-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, name: "" }));
              }}
              placeholder="e.g. Site Assessment – Viet Long"
              aria-invalid={fieldErrors.name ? true : undefined}
              autoFocus
            />
            {fieldErrors.name ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {fieldErrors.name}
              </p>
            ) : null}
          </div>
        </div>

        {/* Section: Scope & Delivery */}
        <div className="space-y-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Scope &amp; Delivery</h3>

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
              <label htmlFor="act-site" className="mb-1.5 block text-sm font-medium">
                Site *
              </label>
              <select
                id="act-site"
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

          <div>
            <span className="mb-1.5 block text-sm font-medium">Mode</span>
            <div className="flex gap-1.5">
              {(["on_site", "online"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDeliveryMode(value)}
                  aria-pressed={deliveryMode === value}
                  className={cn(
                    "min-h-9 flex-1 rounded-md border text-sm font-medium",
                    deliveryMode === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted hover:bg-neutral-soft",
                  )}
                >
                  {value === "on_site" ? "On-site" : "Online"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="act-consultant" className="mb-1.5 block text-sm font-medium">
              Consultant
            </label>
            <select
              id="act-consultant"
              value={consultantId}
              onChange={(e) => setConsultantId(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm"
            >
              <option value="">Unassigned</option>
              {catalog.consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Section: Schedule */}
        <div className="space-y-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Schedule</h3>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-32 flex-1">
              <label htmlFor="act-start-date" className="mb-1.5 block text-sm font-medium">
                Start Date
              </label>
              <Input
                id="act-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onClick={openNativePicker}
              />
            </div>
            <div className="min-w-28 flex-1">
              <label htmlFor="act-start-time" className="mb-1.5 block text-sm font-medium">
                Start Time
              </label>
              <Input
                id="act-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                onClick={openNativePicker}
                aria-invalid={fieldErrors.startTime ? true : undefined}
              />
            </div>
          </div>
          {fieldErrors.startTime ? (
            <p role="alert" className="text-xs text-danger">
              {fieldErrors.startTime}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <div className="min-w-32 flex-1">
              <label htmlFor="act-end-date" className="mb-1.5 block text-sm font-medium">
                End Date
              </label>
              <Input
                id="act-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onClick={openNativePicker}
                aria-invalid={fieldErrors.endDate ? true : undefined}
              />
            </div>
            <div className="min-w-28 flex-1">
              <label htmlFor="act-end-time" className="mb-1.5 block text-sm font-medium">
                End Time
              </label>
              <Input
                id="act-end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                onClick={openNativePicker}
                aria-invalid={fieldErrors.endTime ? true : undefined}
              />
            </div>
          </div>
          {fieldErrors.endDate ? (
            <p role="alert" className="text-xs text-danger">
              {fieldErrors.endDate}
            </p>
          ) : null}
          {fieldErrors.endTime ? (
            <p role="alert" className="text-xs text-danger">
              {fieldErrors.endTime}
            </p>
          ) : null}

          <div>
            <label htmlFor="act-planned-days" className="mb-1.5 block text-sm font-medium">
              Planned Days
            </label>
            <Input
              id="act-planned-days"
              type="number"
              min="0.5"
              step="0.5"
              value={plannedDays}
              onChange={(e) => setPlannedDays(e.target.value)}
              placeholder="e.g. 0.5"
              className="max-w-32"
              aria-invalid={fieldErrors.plannedDays ? true : undefined}
            />
            {fieldErrors.plannedDays ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {fieldErrors.plannedDays}
              </p>
            ) : null}
          </div>
        </div>

        {/* Section: Plan */}
        <div className="space-y-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Plan</h3>

          <div>
            <label htmlFor="act-objectives" className="mb-1.5 block text-sm font-medium">
              Objectives
            </label>
            <Textarea
              id="act-objectives"
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              placeholder="Why this activity — the intended outcome"
              rows={3}
            />
          </div>

          <div>
            <label htmlFor="act-planned-work" className="mb-1.5 block text-sm font-medium">
              Planned Work
            </label>
            <Textarea
              id="act-planned-work"
              value={plannedWork}
              onChange={(e) => setPlannedWork(e.target.value)}
              placeholder="What will be done"
              rows={4}
            />
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
