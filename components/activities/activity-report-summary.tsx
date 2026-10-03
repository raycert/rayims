"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getEvidenceUrl } from "@/lib/mutations/evidence";
import { isViewableEvidence } from "@/lib/validation/evidence";
import { formatFileSize } from "@/components/evidence/evidence-format";
import { findingLabel, formatDate, formatFindingNumber, isActionOverdue } from "@/lib/ui/format";
import {
  actionStatusLabel,
  actionStatusTone,
  findingStatusLabel,
  findingStatusTone,
  findingTypeLabel,
  findingTypeTone,
  priorityLabel,
  priorityTone,
  verificationResultLabel,
  verificationResultTone,
} from "@/lib/ui/status-tones";
import type { ActivityReport, ReportEvidenceItem } from "@/lib/reports/activity-report";

const PROJECT_WIDE = "Project-wide";

function Block({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
        {/* A real space (not only a margin), so the text reads "Evidence (4)". */}
        {count !== undefined ? <span className="font-normal normal-case tracking-normal"> ({count})</span> : null}
      </h3>
      {children}
    </div>
  );
}

const empty = (text: string) => <p className="text-sm text-muted">{text}</p>;
const requirement = (identity: string | null, label: string | null) =>
  identity || label ? <div className="text-xs text-muted">{[identity, label].filter(Boolean).join(" · ")}</div> : null;

/**
 * Activity Report Summary (Phase 6C): the system-derived side of the Activity Report, rendered from
 * the report model (lib/reports/activity-report.ts — the single source of report rules, also used by
 * the export). Compact and read-only: Verification counts + only the checks with Issue Identified /
 * Follow-up Required, the Activity's Findings (F-nnn), its Actions / follow-up and its Evidence
 * (metadata; View / Download through the usual short-lived link). Current state. Export Report
 * (Phase 6D) downloads the same model as an editable .docx.
 */
export function ActivityReportSummary({ report }: { report: ActivityReport }) {
  const { verification: v, findings, actions, evidence } = report;
  const projectId = report.activity.projectId;
  const activitySite = report.activity.siteName;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /** Downloads the .docx built on the server from the same report model (nothing is stored). */
  async function exportReport() {
    setExporting(true);
    setExportError(null);
    try {
      // The viewer's time zone only formats the export time (and the file date for an undated Activity).
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/projects/${projectId}/activities/${report.activity.id}/report?tz=${encodeURIComponent(tz)}`, { cache: "no-store" });
      const type = res.headers.get("Content-Type") ?? "";
      if (!res.ok || !type.includes("wordprocessingml")) throw new Error("export failed");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "RayIMS-Activity-Report.docx";
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setExportError("Could not export the report. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section data-testid="activity-report-summary" className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Activity Report Summary</h2>
          <p className="text-xs text-muted">Derived from this Activity&apos;s records — current state.</p>
          {exportError ? (
            <p role="alert" className="mt-1 text-xs text-danger">
              {exportError}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="secondary" className="min-h-9" onClick={exportReport} disabled={exporting} aria-busy={exporting}>
          {exporting ? "Exporting…" : "Export Report"}
        </Button>
      </div>
      <div className="divide-y divide-border">
        <Block title="Verification Summary">
          <div data-testid="report-verification-metrics" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {v.executed.total === 0 ? (
              <span className="text-muted">No checks executed.</span>
            ) : (
              <>
                <span className="font-semibold">{v.executed.total} executed</span>
                <span>{v.executed.verifiedOk} Verified OK</span>
                <span>{v.executed.issueIdentified} Issue Identified</span>
                <span>{v.executed.followUpRequired} Follow-up Required</span>
              </>
            )}
            {v.plannedNotCompleted > 0 ? <span className="text-muted">{v.plannedNotCompleted} planned, not completed</span> : null}
            {v.completedElsewhere > 0 ? <span className="text-muted">{v.completedElsewhere} completed in another activity</span> : null}
          </div>
          {v.issues.length > 0 ? (
            <ul className="mt-2.5 space-y-2">
              {v.issues.map((i) => (
                <li key={i.id} data-testid="report-verification-issue" className="rounded-md border border-border px-3 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 break-words text-sm font-medium">{i.question}</span>
                    <StatusBadge label={verificationResultLabel(i.result)} tone={verificationResultTone(i.result)} />
                  </div>
                  {requirement(i.frameworkIdentity, i.frameworkItemLabel)}
                  {i.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-xs">{i.notes}</p> : null}
                  {i.findings.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      {i.findings.map((f) => (
                        <Link key={f.id} href={`/projects/${projectId}/findings/${f.id}`} className="font-semibold text-primary hover:underline">
                          {findingLabel(f)}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Block>

        <Block title="Findings" count={findings.length}>
          {findings.length === 0 ? (
            empty("No Findings recorded.")
          ) : (
            <ul className="space-y-2">
              {findings.map((f) => (
                <li key={f.id} data-testid="report-finding" className="rounded-md border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold tabular-nums">{formatFindingNumber(f.findingNo)}</span>
                    <StatusBadge label={findingTypeLabel(f.findingType)} tone={findingTypeTone(f.findingType)} />
                    <StatusBadge label={priorityLabel(f.priority)} tone={priorityTone(f.priority)} />
                    <StatusBadge label={findingStatusLabel(f.status)} tone={findingStatusTone(f.status)} />
                  </div>
                  <Link
                    href={`/projects/${projectId}/findings/${f.id}`}
                    className="mt-1 block break-words text-sm font-semibold hover:underline"
                  >
                    {f.title}
                  </Link>
                  {f.description ? <p className="line-clamp-2 break-words text-xs text-muted">{f.description}</p> : null}
                  {requirement(f.frameworkIdentity, f.frameworkItemLabel)}
                  {/* Site only when it differs from the Activity's (kept in the model for the export). */}
                  {(f.siteName ?? PROJECT_WIDE) !== (activitySite ?? PROJECT_WIDE) ? (
                    <div className="text-xs text-muted">{f.siteName ?? PROJECT_WIDE}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="Actions / Follow-up" count={actions.length}>
          {actions.length === 0 ? (
            empty("No Actions recorded.")
          ) : (
            <ul className="space-y-2">
              {actions.map((a) => (
                <li key={a.id} data-testid="report-action" className="rounded-md border border-border px-3 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 break-words text-sm font-medium">{a.description}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {isActionOverdue(a) ? <StatusBadge label="Overdue" tone="danger" /> : null}
                      <StatusBadge label={actionStatusLabel(a.status)} tone={actionStatusTone(a.status)} />
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span>
                      {a.finding ? (
                        <Link href={`/projects/${projectId}/findings/${a.finding.id}`} className="font-semibold text-primary hover:underline">
                          {formatFindingNumber(a.finding.findingNo)}
                        </Link>
                      ) : (
                        "Standalone"
                      )}
                    </span>
                    <span>Owner: {a.ownerName ?? "—"}</span>
                    <span>Due: {a.dueDate ? formatDate(a.dueDate) : "—"}</span>
                    <span>{priorityLabel(a.priority)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="Evidence" count={evidence.total}>
          {evidence.total === 0 ? (
            empty("No report Evidence recorded.")
          ) : (
            <div className="space-y-3">
              {evidence.groups.map((g) => (
                <div key={g.key} data-testid={`report-evidence-${g.key}`}>
                  <div className="mb-1 text-xs font-medium">
                    {g.label} <span className="text-muted">({g.items.length})</span>
                  </div>
                  <ul className="space-y-1.5">
                    {g.items.map((e) => (
                      <EvidenceRow key={e.id} projectId={projectId} item={e} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Block>
      </div>
    </section>
  );
}

function EvidenceRow({ projectId, item }: { projectId: string; item: ReportEvidenceItem }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open(mode: "view" | "download") {
    // Same flow as the Evidence panels: the tab opens synchronously, the 60 s link is made on click.
    const win = mode === "view" ? window.open("", "_blank") : null;
    startTransition(async () => {
      const result = await getEvidenceUrl(projectId, item.id, mode);
      if (!result.ok) {
        win?.close();
        setError(result.error);
        return;
      }
      setError(null);
      if (win) win.location.href = result.data.url;
      else window.location.assign(result.data.url);
    });
  }

  return (
    <li data-testid="report-evidence-item" className="flex flex-wrap items-start justify-between gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="break-all">
          {item.fileName} <span className="text-xs text-muted">{formatFileSize(item.sizeBytes)}</span>
        </div>
        {item.caption ? <div className="break-words text-xs">{item.caption}</div> : null}
        {item.attachedTo ? <div className="break-words text-xs text-muted">{item.attachedTo}</div> : null}
        {error ? <div className="text-xs text-danger">{error}</div> : null}
      </div>
      <span className="flex gap-3 text-xs font-semibold">
        {isViewableEvidence(item.mimeType) ? (
          <button type="button" onClick={() => open("view")} disabled={pending} className="min-h-9 text-primary hover:underline">
            View
          </button>
        ) : null}
        <button type="button" onClick={() => open("download")} disabled={pending} className="min-h-9 text-primary hover:underline">
          Download
        </button>
      </span>
    </li>
  );
}
