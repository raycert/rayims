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
  priorityLabel,
  priorityTone,
} from "@/lib/ui/status-tones";
import { formatDate } from "@/lib/ui/format";
import { closeFinding, reopenFinding } from "@/lib/mutations/findings";
import { FindingFormDrawer } from "./finding-form-drawer";
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
  const { message, show } = useToast();

  const isClosed = finding.status === "closed";
  // Nonconformity closure needs the response/effectiveness workflow (Phase 4D): no Close action yet.
  const canClose = !isClosed && finding.findingType !== "nonconformity";

  const origin = finding.verificationItemId
    ? `From verification check${finding.verificationQuestion ? `: ${finding.verificationQuestion}` : ""}`
    : finding.documentReviewId
      ? "From a document review"
      : "Recorded manually";

  function handleSaved(msg: string) {
    setEditing(false);
    router.refresh();
    show(msg);
  }

  function runClose() {
    startTransition(async () => {
      const result = await closeFinding(finding.projectId, finding.id);
      if (!result.ok) {
        setBlocked(result.error);
        return;
      }
      setConfirm(null);
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
            <Button type="button" variant="secondary" onClick={() => setConfirm("close")}>
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
                Close this finding? It becomes read-only until reopened.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={cancelConfirm} disabled={pending} className="text-sm font-semibold text-muted">
                  Keep open
                </button>
                <button
                  type="button"
                  onClick={runClose}
                  disabled={pending}
                  aria-busy={pending}
                  className="rounded-md bg-warning px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending ? "Closing…" : "Close Finding"}
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
                Reopen this finding? It returns to Open and can be edited again. Any recorded effectiveness result is
                cleared, so it must be reviewed again.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={cancelConfirm} disabled={pending} className="text-sm font-semibold text-muted">
                  Keep closed
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
            <TextField label="Title" value={finding.title} />
            <TextField label="Description" value={finding.description} />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Origin</h2>
          </div>
          <div className="divide-y divide-border">
            <TextField label="Origin" value={origin} />
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
