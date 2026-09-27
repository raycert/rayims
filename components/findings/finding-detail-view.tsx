"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, useToast } from "@/components/ui/toast";
import {
  findingStatusLabel,
  findingStatusTone,
  findingTypeLabel,
  findingTypeTone,
  effectivenessLabel,
  effectivenessTone,
  priorityLabel,
  priorityTone,
} from "@/lib/ui/status-tones";
import { formatDate } from "@/lib/ui/format";
import { closeFinding, getFindingClosureState, reopenFinding } from "@/lib/mutations/findings";
import type { ClosureEvaluation } from "@/lib/domain/finding-closure";
import { EffectivenessDrawer } from "./effectiveness-drawer";
import { EvidenceSection } from "@/components/evidence/evidence-panel";
import { FindingFormDrawer } from "./finding-form-drawer";
import { NcResponseDrawer } from "./nc-response-drawer";
import { ActionCard } from "@/components/actions/action-card";
import { ActionFormDrawer } from "@/components/actions/action-form-drawer";
import type { ActionRow } from "@/lib/queries/actions";
import type { FindingDetail } from "@/lib/queries/findings";
import type { VerificationFormCatalog } from "@/lib/queries/verification-items";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TextField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <p className="mt-1 whitespace-pre-wrap text-sm">
        {value ? value : <span className="text-muted">Not set.</span>}
      </p>
    </div>
  );
}

type Confirm = "close" | "reopen" | null;

function ProgressRow({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm">{label}</span>
      <StatusBadge label={value} tone={done ? "success" : "neutral"} />
    </div>
  );
}

export function FindingDetailView({
  projectName,
  finding,
  catalog,
}: {
  projectName: string;
  finding: FindingDetail;
  catalog: VerificationFormCatalog;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingResponse, setEditingResponse] = useState(false);
  const [editingEffectiveness, setEditingEffectiveness] = useState(false);
  const [closure, setClosure] = useState<ClosureEvaluation | null>(null);
  const [actionDrawer, setActionDrawer] = useState<{ mode: "create" } | { mode: "edit"; action: ActionRow } | null>(null);
  const { message, show } = useToast();

  const isNc = finding.findingType === "nonconformity";
  const actionsNoun = isNc ? "Corrective Actions" : "Actions";
  const closedActions = finding.actions.filter((a) => a.status === "closed").length;
  const actionsProgress =
    finding.actions.length === 0 ? "None recorded" : `${closedActions} of ${finding.actions.length} Closed`;
  const hasCorrection = !!finding.correction?.trim();
  const hasRootCause = !!finding.rootCause?.trim();

  function refreshWith(msg: string) {
    setEditingResponse(false);
    setEditingEffectiveness(false);
    setActionDrawer(null);
    router.refresh();
    show(msg);
  }

  const isClosed = finding.status === "closed";
  const canClose = !isClosed;

  const fromVerification = !!finding.verificationItemId;
  const origin = fromVerification
    ? "Created from Verification"
    : finding.documentReviewId
      ? "From a document review"
      : "Recorded manually";

  function handleSaved(msg: string) {
    setEditing(false);
    router.refresh();
    show(msg);
  }

  /** Close is always evaluated on the server from current data (hard blockers / warnings). */
  function openClose() {
    setConfirm("close");
    setBlocked(null);
    setClosure(null);
    startTransition(async () => {
      const result = await getFindingClosureState(finding.projectId, finding.id);
      if (!result.ok) {
        setBlocked(result.error);
        return;
      }
      setClosure(result.data);
    });
  }

  function runClose(confirmWarnings: boolean) {
    startTransition(async () => {
      const result = await closeFinding(finding.projectId, finding.id, { confirmWarnings });
      if (!result.ok) {
        setBlocked(result.error);
        return;
      }
      if (!result.data.closed) {
        // The state changed since the check: show the fresh evaluation instead.
        setClosure(result.data.evaluation);
        return;
      }
      setConfirm(null);
      setClosure(null);
      router.refresh();
      show("Finding closed");
    });
  }

  function runReopen() {
    startTransition(async () => {
      const result = await reopenFinding(finding.projectId, finding.id);
      if (!result.ok) {
        setBlocked(result.error);
        return;
      }
      setConfirm(null);
      router.refresh();
      show("Finding reopened");
    });
  }

  function cancelConfirm() {
    setConfirm(null);
    setBlocked(null);
    setClosure(null);
  }

  return (
    <div>
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/projects" className="hover:underline">
          Projects
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/projects/${finding.projectId}`} className="hover:underline">
          {projectName}
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/projects/${finding.projectId}/findings`} className="hover:underline">
          Findings
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{finding.title}</span>
      </div>

      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{finding.title}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {!isClosed ? (
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              Edit Finding
            </Button>
          ) : null}
          {canClose ? (
            <Button type="button" variant="secondary" onClick={openClose}>
              Close Finding
            </Button>
          ) : null}
          {isClosed ? (
            <Button type="button" variant="secondary" onClick={() => setConfirm("reopen")}>
              Reopen Finding
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <StatusBadge label={findingTypeLabel(finding.findingType)} tone={findingTypeTone(finding.findingType)} />
        <StatusBadge label={priorityLabel(finding.priority)} tone={priorityTone(finding.priority)} />
        <StatusBadge label={findingStatusLabel(finding.status)} tone={findingStatusTone(finding.status)} />
        <span>·</span>
        <span>{finding.siteName ?? "Project-wide"}</span>
        <span>·</span>
        <span>
          {finding.activityId ? (
            <Link href={`/projects/${finding.projectId}/activities/${finding.activityId}`} className="hover:underline">
              {finding.activityStartDate ? `${formatDate(finding.activityStartDate)} · ` : ""}
              {finding.activityName}
            </Link>
          ) : (
            "No activity"
          )}
        </span>
        <span>·</span>
        <span>
          {finding.frameworkIdentity ? `${finding.frameworkIdentity} · ${finding.frameworkItemLabel}` : "No framework requirement"}
        </span>
      </div>

      {isClosed ? (
        <p className="mb-5 text-sm text-muted">This finding is closed and read-only. Reopen it to make changes.</p>
      ) : null}

      {confirm === "close" ? (
        <div
          role="alertdialog"
          aria-labelledby="close-title"
          data-testid="close-panel"
          className={`mb-5 rounded-lg border px-4 py-3 ${closure && !closure.canClose ? "border-danger bg-danger-soft" : "border-warning bg-warning-soft"}`}
        >
          {blocked ? (
            <>
              <p role="alert" className="text-sm text-danger">
                {blocked}
              </p>
              <button type="button" onClick={cancelConfirm} className="mt-2 text-sm font-semibold text-muted">
                Back
              </button>
            </>
          ) : !closure ? (
            <p className="text-sm text-muted">Checking whether this finding can be closed…</p>
          ) : !closure.canClose ? (
            <>
              <h3 id="close-title" className="text-sm font-semibold text-danger">
                Cannot close this Finding
              </h3>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-danger">
                {closure.hardBlockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <button type="button" onClick={cancelConfirm} className="mt-2.5 text-sm font-semibold text-muted">
                Back
              </button>
            </>
          ) : (
            <>
              <h3 id="close-title" className="text-sm font-semibold text-warning">
                Close Finding?
              </h3>
              {closure.warnings.length > 0 ? (
                <>
                  <p className="mt-1 text-sm text-warning">Please review:</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-warning">
                    {closure.warnings.map((w) => (
                      <li key={w}>⚠ {w}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-sm text-warning">
                  {isNc
                    ? "All recorded Corrective Actions are closed and the current response has no closure warnings."
                    : "It becomes read-only until reopened."}
                </p>
              )}
              {closure.info.map((i) => (
                <p key={i} className="mt-1 text-sm text-muted">
                  {i}
                </p>
              ))}
              {closure.warnings.length > 0 ? (
                <p className="mt-1.5 text-sm text-warning">You can still close this Finding.</p>
              ) : null}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" onClick={cancelConfirm} disabled={pending} className="text-sm font-semibold text-muted">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => runClose(closure.warnings.length > 0)}
                  disabled={pending}
                  aria-busy={pending}
                  className="rounded-md bg-warning px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending ? "Closing…" : closure.warnings.length > 0 ? "Close Anyway" : "Close Finding"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {confirm === "reopen" ? (
        <div className="mb-5 rounded-lg border border-warning bg-warning-soft px-4 py-3">
          {blocked ? (
            <>
              <p role="alert" className="text-sm text-warning">
                {blocked}
              </p>
              <button type="button" onClick={cancelConfirm} className="mt-2 text-sm font-semibold text-muted">
                OK
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-warning">
                {isNc
                  ? "Reopening this Finding clears the current Effectiveness Result and its reviewer and timestamp. The effectiveness notes, Correction, Root Cause Analysis and Corrective Actions are kept."
                  : "Reopen this finding? It returns to Open and can be edited again."}
              </p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={cancelConfirm} disabled={pending} className="text-sm font-semibold text-muted">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={runReopen}
                  disabled={pending}
                  aria-busy={pending}
                  className="rounded-md bg-warning px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending ? "Reopening…" : "Reopen Finding"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Finding</h2>
          </div>
          <div className="divide-y divide-border">
            <TextField label="Description" value={finding.description} />
          </div>
        </section>

        {isNc ? (
          <section data-testid="nc-progress" className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Progress</h2>
            </div>
            <div className="divide-y divide-border">
              <ProgressRow label="Correction" value={hasCorrection ? "Complete" : "Pending"} done={hasCorrection} />
              <ProgressRow label="Root Cause Analysis" value={hasRootCause ? "Complete" : "Pending"} done={hasRootCause} />
              <ProgressRow
                label="Corrective Actions"
                value={actionsProgress}
                done={finding.actions.length > 0 && closedActions === finding.actions.length}
              />
              <ProgressRow
                label="Effectiveness Review"
                value={effectivenessLabel(finding.effectivenessResult)}
                done={finding.effectivenessResult === "effective"}
              />
            </div>
          </section>
        ) : null}

        {isNc ? (
          <section data-testid="nc-response" className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">NC Response</h2>
              {!isClosed ? (
                <Button type="button" variant="secondary" className="min-h-9" onClick={() => setEditingResponse(true)}>
                  Edit NC Response
                </Button>
              ) : null}
            </div>
            <div className="divide-y divide-border">
              <div className="px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Correction</div>
                <p className="text-xs text-muted">Immediate action taken to address the detected problem.</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {finding.correction ? finding.correction : <span className="text-muted">Not recorded.</span>}
                </p>
              </div>
              <div className="px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Root Cause Analysis</div>
                <p className="text-xs text-muted">The identified cause or causes behind the nonconformity.</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {finding.rootCause ? finding.rootCause : <span className="text-muted">Not recorded.</span>}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section data-testid="finding-actions" className="rounded-lg border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">{actionsNoun}</h2>
              <p className="text-xs text-muted">
                {finding.actions.length === 0
                  ? isNc
                    ? "No corrective actions recorded"
                    : "No actions recorded"
                  : `${closedActions} of ${finding.actions.length} Closed`}
              </p>
            </div>
            {!isClosed ? (
              <Button type="button" variant="secondary" className="min-h-9" onClick={() => setActionDrawer({ mode: "create" })}>
                {isNc ? "+ Add Corrective Action" : "+ Add Action"}
              </Button>
            ) : null}
          </div>
          {finding.actions.length > 0 ? (
            <div className="flex flex-col gap-2.5 p-4">
              {finding.actions.map((a, i) => (
                <div key={a.id} className="flex gap-2">
                  <span className="pt-3.5 text-xs font-semibold text-muted">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <ActionCard
                      projectId={finding.projectId}
                      action={a}
                      onEdit={(action) => setActionDrawer({ mode: "edit", action })}
                      onChanged={refreshWith}
                      onError={show}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {isNc ? (
          <section data-testid="effectiveness" className="rounded-lg border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Effectiveness Review</h2>
              {!isClosed ? (
                <Button type="button" variant="secondary" className="min-h-9" onClick={() => setEditingEffectiveness(true)}>
                  {finding.effectivenessResult ? "Edit Effectiveness Review" : "Record Effectiveness Review"}
                </Button>
              ) : null}
            </div>
            {finding.effectivenessResult ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[140px_1fr] sm:gap-y-2.5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted sm:pt-0.5">Result</dt>
                <dd className="mb-1.5 sm:mb-0">
                  <StatusBadge
                    label={effectivenessLabel(finding.effectivenessResult)}
                    tone={effectivenessTone(finding.effectivenessResult)}
                  />
                </dd>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted sm:pt-0.5">Notes</dt>
                <dd className="mb-1.5 whitespace-pre-wrap sm:mb-0">{finding.effectivenessNotes ?? "—"}</dd>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted sm:pt-0.5">Reviewed By</dt>
                <dd className="mb-1.5 sm:mb-0">
                  {finding.effectivenessResult ? (finding.effectivenessReviewerName ?? "Unknown user") : "—"}
                </dd>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted sm:pt-0.5">Reviewed At</dt>
                <dd>{finding.effectivenessReviewedAt ? formatDateTime(finding.effectivenessReviewedAt) : "—"}</dd>
              </dl>
            ) : (
              <p className="px-4 py-3 text-sm text-muted">Not reviewed yet.</p>
            )}
          </section>
        ) : null}

        <EvidenceSection
          projectId={finding.projectId}
          parent={{ kind: "finding", id: finding.id }}
          items={finding.evidence}
          editable={!isClosed}
          lockedReason={isClosed ? "This finding is closed. Reopen it to change its evidence." : null}
          onChanged={refreshWith}
        />

        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Origin</h2>
          </div>
          <div className="divide-y divide-border">
            <TextField label="Origin" value={origin} />
            {fromVerification ? (
              <>
                <TextField label="Verification" value={finding.verificationQuestion} />
                <div className="px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">Activity</div>
                  <p className="mt-1 text-sm">
                    {finding.activityId ? (
                      <Link
                        href={`/projects/${finding.projectId}/activities/${finding.activityId}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {finding.activityStartDate ? `${formatDate(finding.activityStartDate)} · ` : ""}
                        {finding.activityName}
                      </Link>
                    ) : (
                      <span className="text-muted">Not set.</span>
                    )}
                  </p>
                </div>
                <TextField label="Site" value={finding.siteName ?? "Project-wide"} />
                <TextField
                  label="Framework Requirement"
                  value={
                    finding.frameworkIdentity
                      ? `${finding.frameworkIdentity} · ${finding.frameworkItemLabel}`
                      : "No framework requirement"
                  }
                />
              </>
            ) : null}
            <TextField
              label="Recorded"
              value={`${formatDateTime(finding.createdAt)}${finding.createdByName ? ` · ${finding.createdByName}` : ""}`}
            />
            {isClosed && finding.closedAt ? (
              <TextField
                label="Closed"
                value={`${formatDateTime(finding.closedAt)}${finding.closedByName ? ` · ${finding.closedByName}` : ""}`}
              />
            ) : null}
          </div>
        </section>
      </div>

      {editingEffectiveness ? (
        <EffectivenessDrawer
          projectId={finding.projectId}
          findingId={finding.id}
          result={finding.effectivenessResult}
          notes={finding.effectivenessNotes}
          onClose={() => setEditingEffectiveness(false)}
          onSaved={refreshWith}
        />
      ) : null}
      {editingResponse ? (
        <NcResponseDrawer
          projectId={finding.projectId}
          findingId={finding.id}
          correction={finding.correction}
          rootCause={finding.rootCause}
          onClose={() => setEditingResponse(false)}
          onSaved={refreshWith}
        />
      ) : null}
      {actionDrawer ? (
        <ActionFormDrawer
          mode={actionDrawer.mode}
          projectId={finding.projectId}
          catalog={catalog}
          finding={
            actionDrawer.mode === "create"
              ? { id: finding.id, title: finding.title, isNonconformity: isNc, activityId: finding.activityId, siteId: finding.siteId }
              : undefined
          }
          action={actionDrawer.mode === "edit" ? actionDrawer.action : undefined}
          onClose={() => setActionDrawer(null)}
          onSaved={refreshWith}
        />
      ) : null}
      {editing ? (
        <FindingFormDrawer
          mode="edit"
          projectId={finding.projectId}
          catalog={catalog}
          finding={finding}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
        />
      ) : null}
      <Toast message={message} />
    </div>
  );
}
