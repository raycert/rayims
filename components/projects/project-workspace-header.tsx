import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { projectStatusLabel, projectStatusTone } from "@/lib/ui/status-tones";
import { formatFrameworkIdentity } from "@/lib/ui/format";
import { KeepActiveTabVisible } from "./keep-active-tab-visible";

export type WorkspaceTab = "overview" | "plan" | "verification" | "findings" | "documents";

type WorkspaceHeaderProject = {
  id: string;
  name: string;
  status: string;
  sites: { id: string }[];
  frameworks: { id: string; code: string; edition: string }[];
};

const LIVE_TABS: { key: WorkspaceTab; label: string; href: (id: string) => string }[] = [
  { key: "overview", label: "Overview", href: (id) => `/projects/${id}` },
  { key: "plan", label: "Plan", href: (id) => `/projects/${id}/plan` },
  { key: "verification", label: "Verification", href: (id) => `/projects/${id}/verification` },
  { key: "findings", label: "Findings & Actions", href: (id) => `/projects/${id}/findings` },
  { key: "documents", label: "Documents", href: (id) => `/projects/${id}/documents` },
];

/** Not built yet — shown inert, never linked, no route exists (Phase 6+). */
const FUTURE_TABS = ["Reports"];

/**
 * Shared identity/tabs header for the Project Workspace, used by both Overview
 * (`/projects/[projectId]`) and Plan (`/projects/[projectId]/plan`) so the two screens
 * stay visually identical apart from which tab is active and the content below.
 */
export function ProjectWorkspaceHeader({
  project,
  activeTab,
}: {
  project: WorkspaceHeaderProject;
  activeTab: WorkspaceTab;
}) {
  return (
    <div>
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/projects" className="hover:underline">
          Projects
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{project.name}</span>
      </div>

      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{project.name}</h1>
        <Link href={`/projects/${project.id}/edit`} className={buttonClasses("secondary", "min-h-9")}>
          Edit Project
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <StatusBadge label={projectStatusLabel(project.status)} tone={projectStatusTone(project.status)} />
        <span>·</span>
        <span>
          {project.sites.length} {project.sites.length === 1 ? "Site" : "Sites"}
        </span>
        {project.frameworks.map((fw) => (
          <span key={fw.id} className="contents">
            <span>·</span>
            <span>{formatFrameworkIdentity(fw.code, fw.edition)}</span>
          </span>
        ))}
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {LIVE_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href(project.id)}
            aria-current={tab.key === activeTab ? "page" : undefined}
            className={
              tab.key === activeTab
                ? "flex min-h-10 items-center whitespace-nowrap border-b-2 border-primary px-1 text-sm font-medium text-primary"
                : "flex min-h-10 items-center whitespace-nowrap border-b-2 border-transparent px-1 text-sm font-medium text-muted hover:text-foreground"
            }
          >
            {tab.label}
          </Link>
        ))}
        {FUTURE_TABS.map((label) => (
          <span
            key={label}
            aria-disabled="true"
            title="Coming in a later phase"
            className="flex min-h-10 cursor-not-allowed items-center whitespace-nowrap border-b-2 border-transparent px-1 text-sm font-medium text-muted opacity-60"
          >
            {label}
          </span>
        ))}
        <KeepActiveTabVisible />
      </div>
    </div>
  );
}
