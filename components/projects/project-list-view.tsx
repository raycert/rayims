"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { projectStatusLabel, projectStatusTone } from "@/lib/ui/status-tones";
import type { ProjectListRow } from "@/lib/queries/projects";

function siteScopeLabel(p: ProjectListRow) {
  return `${p.sitesInScope} of ${p.sitesTotal} sites`;
}
function frameworkLabel(p: ProjectListRow) {
  return `${p.frameworksCount} ${p.frameworksCount === 1 ? "framework" : "frameworks"}`;
}

export function ProjectListView({ projects }: { projects: ProjectListRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q),
    );
  }, [projects, search]);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Projects</h1>
          <p className="mt-1 text-sm text-muted">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </p>
        </div>
        <Button type="button" onClick={() => router.push("/projects/new")}>
          + New Project
        </Button>
      </div>

      <div className="my-4 max-w-xs">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects"
        />
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No projects yet"
            description="Create a project to start assigning sites and frameworks."
            action={
              <Button type="button" onClick={() => router.push("/projects/new")}>
                + New Project
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title={`No projects match "${search}".`}
            action={
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Clear search
              </button>
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface shadow-sm md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Project
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Client
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Site Scope
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Frameworks
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-[13px] font-semibold uppercase tracking-wide text-muted" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    onClick={() => router.push(`/projects/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/projects/${p.id}`);
                    }}
                    className="cursor-pointer border-t border-border hover:bg-neutral-soft/60 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
                  >
                    <td className="px-4 py-3 font-semibold">{p.name}</td>
                    <td className="px-2.5 py-3 text-muted">{p.clientName}</td>
                    <td className="px-2.5 py-3 text-muted">{siteScopeLabel(p)}</td>
                    <td className="px-2.5 py-3 text-muted">{frameworkLabel(p)}</td>
                    <td className="px-2.5 py-3">
                      <StatusBadge label={projectStatusLabel(p.status)} tone={projectStatusTone(p.status)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <OverflowMenu
                        items={[{ label: "Edit Project", onSelect: () => router.push(`/projects/${p.id}/edit`) }]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {filtered.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="block rounded-lg border border-border bg-surface p-3.5 shadow-sm"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <StatusBadge label={projectStatusLabel(p.status)} tone={projectStatusTone(p.status)} />
                </div>
                <div className="text-[13px] text-muted">{p.clientName}</div>
                <div className="mt-1 text-[12.5px] text-muted/80">
                  {siteScopeLabel(p)} · {frameworkLabel(p)}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
