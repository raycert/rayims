"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createProject, updateProject } from "@/lib/mutations/projects";
import { PROJECT_STATUSES } from "@/lib/constants/values";
import { projectStatusLabel } from "@/lib/ui/status-tones";
import { formatFrameworkIdentity, humanizeCategory } from "@/lib/ui/format";
import type { ClientOption, ExistingProject, FrameworkOption, SiteOption } from "@/lib/queries/projects";

type Mode = "create-global" | "create-for-client" | "edit";

/**
 * Native <input type="date"> only reliably opens its picker when the calendar icon is
 * clicked; clicking elsewhere in the field just places a text cursor. showPicker() makes
 * a click anywhere in the field open it too. Feature-detected (Firefox/Safari lack it as
 * of this writing) and wrapped in try/catch (throws if not called from a direct user
 * gesture in some browser states) — the native click-to-focus/type behavior is the
 * fallback either way, so this is purely additive.
 */
function openDatePicker(e: MouseEvent<HTMLInputElement>) {
  const input = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  if (typeof input.showPicker === "function") {
    try {
      input.showPicker();
    } catch {
      // Fallback: default click-to-focus behavior still applies.
    }
  }
}

export function ProjectSetupForm({
  mode,
  clients,
  sitesByClient,
  frameworks,
  lockedClient,
  project,
}: {
  mode: Mode;
  /** All clients — only used for the unlocked (global create) dropdown. */
  clients: ClientOption[];
  /** All sites, grouped by client_id — lets the form react to a client change with no round trip. */
  sitesByClient: Record<string, SiteOption[]>;
  frameworks: FrameworkOption[];
  /** Set for create-for-client and edit, where the client cannot be changed (BR-57). */
  lockedClient?: ClientOption;
  /** Set for edit. */
  project?: ExistingProject;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const isGlobal = mode === "create-global";

  const [clientId, setClientId] = useState<string | null>(isGlobal ? null : (lockedClient?.id ?? null));
  const [name, setName] = useState(project?.name ?? "");
  const [status, setStatus] = useState<string>(project?.status ?? "planning");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [endDate, setEndDate] = useState(project?.endDate ?? "");
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>(project?.siteIds ?? []);
  const [selectedFrameworkIds, setSelectedFrameworkIds] = useState<string[]>(project?.frameworkIds ?? []);

  const [nameError, setNameError] = useState(false);
  const [clientError, setClientError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sitesForClient = useMemo(
    () => (clientId ? (sitesByClient[clientId] ?? []) : []),
    [clientId, sitesByClient],
  );
  const allSiteIdsForClient = useMemo(() => sitesForClient.map((s) => s.id), [sitesForClient]);
  const allSitesSelected =
    allSiteIdsForClient.length > 0 && allSiteIdsForClient.every((id) => selectedSiteIds.includes(id));

  const frameworkGroups = useMemo(() => {
    const groups = new Map<string, FrameworkOption[]>();
    for (const fw of frameworks) {
      const key = fw.category ?? "Other";
      const list = groups.get(key) ?? [];
      list.push(fw);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [frameworks]);

  function handleClientChange(nextId: string) {
    setClientId(nextId || null);
    setClientError(false);
    // Changing the client during create always clears the site scope: sites belong to the old client.
    setSelectedSiteIds([]);
  }

  function toggleSite(id: string) {
    setSelectedSiteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleSelectAllSites() {
    setSelectedSiteIds(allSitesSelected ? [] : allSiteIdsForClient);
  }
  function toggleFramework(id: string) {
    setSelectedFrameworkIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleCancel() {
    if (isEdit) router.push(`/projects/${project!.id}`);
    else if (mode === "create-for-client") router.push(`/clients/${lockedClient!.id}`);
    else router.push("/projects");
  }

  function handleSave() {
    let hasError = false;
    if (isGlobal && !clientId) {
      setClientError(true);
      hasError = true;
    }
    if (!name.trim()) {
      setNameError(true);
      hasError = true;
    }
    if (hasError) return;

    setFormError(null);
    const input = {
      name,
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      siteIds: selectedSiteIds,
      frameworkIds: selectedFrameworkIds,
    };

    startTransition(async () => {
      if (isEdit) {
        const result = await updateProject(project!.id, input);
        if (!result.ok) {
          setFormError(result.error);
          if (result.fieldErrors?.name) setNameError(true);
          return;
        }
        router.push(`/projects/${project!.id}`);
        return;
      }
      const result = await createProject(clientId!, input);
      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors?.name) setNameError(true);
        return;
      }
      router.push(`/projects/${result.data.id}`);
    });
  }

  const breadcrumb = isEdit ? (
    <>
      <Link href={`/projects/${project!.id}`} className="hover:underline">
        {project!.name}
      </Link>
      <span className="mx-1.5">/</span>
      <span className="text-foreground">Edit Project</span>
    </>
  ) : mode === "create-for-client" ? (
    <>
      <Link href="/clients" className="hover:underline">
        Clients
      </Link>
      <span className="mx-1.5">/</span>
      <Link href={`/clients/${lockedClient!.id}`} className="hover:underline">
        {lockedClient!.name}
      </Link>
      <span className="mx-1.5">/</span>
      <span className="text-foreground">New Project</span>
    </>
  ) : (
    <>
      <Link href="/projects" className="hover:underline">
        Projects
      </Link>
      <span className="mx-1.5">/</span>
      <span className="text-foreground">New Project</span>
    </>
  );

  const pageTitle = isEdit ? "Edit Project" : "New Project";
  const clientLockedNote = isEdit
    ? "Client cannot be changed on an existing project."
    : "Set from the client you're viewing.";

  return (
    <div className="mx-auto max-w-190">
      <div className="mb-2 text-[13px] text-muted">{breadcrumb}</div>
      <h1 className="mb-5 text-xl font-semibold tracking-tight md:text-2xl">{pageTitle}</h1>

      <div className="mb-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Project Identity</h2>

        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-medium">Client</span>
          {isGlobal ? (
            <>
              <select
                value={clientId ?? ""}
                onChange={(e) => handleClientChange(e.target.value)}
                aria-invalid={clientError ? true : undefined}
                className={cn(
                  "min-h-11 w-full rounded-md border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm",
                  clientError ? "border-danger" : "border-border",
                )}
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {clientError ? (
                <p role="alert" className="mt-1.5 text-xs text-danger">
                  Select a client to continue.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex min-h-11 items-center rounded-md border border-border bg-neutral-soft px-3 text-sm font-semibold">
                {lockedClient?.name}
              </div>
              <p className="mt-1.5 text-xs text-muted">{clientLockedNote}</p>
            </>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="project-name" className="mb-1.5 block text-sm font-medium">
            Project name *
          </label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
            placeholder="e.g. Chinh Long – IMS Implementation 2026"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "project-name-error" : undefined}
          />
          {nameError ? (
            <p id="project-name-error" role="alert" className="mt-1.5 text-xs text-danger">
              Project name is required.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-40 flex-1">
            <label htmlFor="project-status" className="mb-1.5 block text-sm font-medium">
              Status
            </label>
            <select
              id="project-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary md:text-sm"
            >
              {PROJECT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {projectStatusLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-40 flex-1">
            <label htmlFor="project-start-date" className="mb-1.5 block text-sm font-medium">
              Start date
            </label>
            <Input
              id="project-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              onClick={openDatePicker}
            />
          </div>
          <div className="min-w-40 flex-1">
            <label htmlFor="project-end-date" className="mb-1.5 block text-sm font-medium">
              End date (optional)
            </label>
            <Input
              id="project-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onClick={openDatePicker}
            />
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Site Scope</h2>
          {clientId && sitesForClient.length > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-[12.5px] text-muted">
                {selectedSiteIds.length} of {sitesForClient.length} selected
              </span>
              <button
                type="button"
                onClick={toggleSelectAllSites}
                className="text-[12.5px] font-semibold text-primary"
              >
                {allSitesSelected ? "Clear all" : "Select all"}
              </button>
            </div>
          ) : null}
        </div>

        {!clientId ? (
          <p className="text-sm text-muted">Select a client to choose sites.</p>
        ) : sitesForClient.length === 0 ? (
          <p className="text-sm text-muted">
            This client has no sites yet.{" "}
            <Link href={`/clients/${clientId}`} className="font-semibold hover:underline">
              Add sites from the Client page
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-0.5">
              {sitesForClient.map((site) => {
                const checked = selectedSiteIds.includes(site.id);
                return (
                  <label
                    key={site.id}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-1.5",
                      checked && "bg-neutral-soft",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSite(site.id)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="text-sm font-semibold">{site.name}</span>
                    {site.address ? <span className="text-[12.5px] text-muted">— {site.address}</span> : null}
                  </label>
                );
              })}
            </div>
            {selectedSiteIds.length === 0 ? (
              <p className="mt-3.5 text-[12.5px] text-muted">
                No sites selected. You can define the project scope later.
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="mb-5 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Framework Assignment</h2>
          <span className="text-[12.5px] text-muted">
            {selectedFrameworkIds.length} of {frameworks.length} selected
          </span>
        </div>

        {frameworkGroups.length === 0 ? (
          <p className="text-sm text-muted">No framework reference data available.</p>
        ) : (
          frameworkGroups.map(([category, items]) => (
            <div key={category} className="mb-3">
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
                {humanizeCategory(category)}
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map((fw) => {
                  const checked = selectedFrameworkIds.includes(fw.id);
                  return (
                    <label
                      key={fw.id}
                      className={cn(
                        "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-1.5",
                        checked && "bg-neutral-soft",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFramework(fw.id)}
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span className="text-sm font-semibold">{formatFrameworkIdentity(fw.code, fw.edition)}</span>
                      <span className="text-[12.5px] text-muted">— {fw.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {selectedFrameworkIds.length === 0 ? (
          <p className="text-[12.5px] text-muted">No frameworks assigned yet. You can add these later.</p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      {/*
        Sticky action footer only — breadcrumb/title/Project Identity stay in normal flow.
        bottom-24 parks it just above the fixed mobile bottom nav (matching <main>'s own
        pb-24 reservation for that nav in app-shell.tsx); md:bottom-0 sits it flush against
        the bottom of the desktop scroll container, where there's no competing fixed nav.
        Sticky (not fixed) means a short form never gets an awkward floating bar — it only
        pins once scrolling would otherwise carry it past this point.
      */}
      <div className="sticky bottom-24 z-10 flex justify-end gap-2.5 border-t border-border bg-background py-3 md:bottom-0">
        <Button type="button" variant="secondary" onClick={handleCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={pending} aria-busy={pending}>
          {pending ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save Changes" : "Create Project"}
        </Button>
      </div>
    </div>
  );
}
