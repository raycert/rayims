/**
 * Activity Report — the single source of report rules (Phase 6C).
 *
 * This module turns the raw, project-scoped rows loaded by `getActivityReportData`
 * (lib/queries/activity-report.ts) into the Activity Report model. EVERY inclusion, de-duplication
 * and ordering rule lives here, so the Activity Detail summary (6C) and the exported report (6D) can
 * never disagree. It is pure and has no runtime imports (only types) — it never touches the database
 * and can be tested directly.
 *
 * Rules (BR-150 – BR-153):
 * - Verification — EXECUTED here: verified_activity_id = A with a result (counted by result,
 *   whatever the planned Activity was). PLANNED, NOT COMPLETED: target_activity_id = A with no result.
 *   COMPLETED IN ANOTHER ACTIVITY: target_activity_id = A, result set, verified elsewhere — a count
 *   only, never listed or counted as a result here. Listed individually: only executed-here checks
 *   with Issue Identified / Follow-up Required.
 * - Findings: issues.activity_id = A, nothing else (a Finding created from a Verification already
 *   carries the Activity where the check was executed — no second path, no double count). Ordered by
 *   Finding number.
 * - Actions: actions.activity_id = A  UNION  actions.issue_id ∈ the report's Findings, de-duplicated by
 *   Action id.
 * - Evidence: attachments of the Activity itself, of the report's Verification checks (executed here or
 *   planned here and pending), of the report's Findings and of the report's Actions. Each attachment has
 *   exactly one parent, so nothing is counted twice. Metadata only — no images, no URLs.
 * - Every row must belong to the report's project (rows of another project are dropped).
 * - Current state: the model reflects today's data; there is no snapshot, status or approval.
 */

// ----- Raw rows (shape returned by the loader's queries) -----

export type RawReportEvidence = {
  id: string;
  project_id: string;
  caption: string | null;
  created_at: string;
  files: { original_name: string; mime_type: string | null; size_bytes: number | null } | null;
};
type RawFramework = { code: string | null; title: string; frameworks: { code: string; edition: string } | null } | null;
export type RawReportActivity = {
  id: string;
  project_id: string;
  name: string;
  status: string;
  mode: string;
  site_id: string | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  objectives: string | null;
  planned_work: string | null;
  work_performed: string | null;
  summary: string | null;
  next_steps: string | null;
  client_participants: string | null;
  activity_types: { label: string } | null;
  consultant: { display_name: string | null; email: string | null } | null;
  projects: { name: string; clients: { name: string } | null } | null;
  attachments: RawReportEvidence[] | null;
};
export type RawReportVerification = {
  id: string;
  project_id: string;
  question: string;
  result: string | null;
  notes: string | null;
  target_activity_id: string | null;
  verified_activity_id: string | null;
  framework_items: RawFramework;
  issues: { id: string; project_id: string; finding_no: number; title: string }[] | null;
  attachments: RawReportEvidence[] | null;
};
export type RawReportAction = {
  id: string;
  project_id: string;
  description: string;
  owner_name: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  completion_notes: string | null;
  issue_id: string | null;
  activity_id: string | null;
  attachments: RawReportEvidence[] | null;
};
export type RawReportFinding = {
  id: string;
  project_id: string;
  finding_no: number;
  finding_type: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  site_id: string | null;
  activity_id: string | null;
  verification_item_id: string | null;
  document_review_id: string | null;
  framework_items: RawFramework;
  actions: RawReportAction[] | null;
  attachments: RawReportEvidence[] | null;
};
/** Activity-linked actions carry their own (possibly other-Activity) Finding reference. */
export type RawReportActivityAction = RawReportAction & {
  issues: { id: string; project_id: string; finding_no: number; title: string } | null;
};

export type RawActivityReportInput = {
  projectId: string;
  activity: RawReportActivity;
  /** Site names of the project's scope (id → name). */
  siteNames: Map<string, string>;
  /** project_id = P AND (verified_activity_id = A OR target_activity_id = A) */
  verifications: RawReportVerification[];
  /** project_id = P AND activity_id = A, with their linked Actions */
  findings: RawReportFinding[];
  /** project_id = P AND activity_id = A */
  activityActions: RawReportActivityAction[];
};

// ----- Report model -----

export type ReportFindingRef = { id: string; findingNo: number; title: string };
export type ReportEvidenceItem = {
  id: string;
  caption: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** What the file is attached to, in words (check question, "F-001 · title", action description); null for the Activity itself. */
  attachedTo: string | null;
};
export type ReportEvidenceGroupKey = "activity" | "verification" | "finding" | "action";
export type ActivityReport = {
  activity: {
    id: string;
    projectId: string;
    name: string;
    typeLabel: string;
    status: string;
    mode: string;
    siteName: string | null;
    startDate: string | null;
    startTime: string | null;
    endDate: string | null;
    endTime: string | null;
    /** display name → email → "Unknown user"; null when no consultant is assigned. */
    consultantName: string | null;
    projectName: string;
    clientName: string | null;
  };
  narrative: {
    objectives: string | null;
    plannedWork: string | null;
    workPerformed: string | null;
    summary: string | null;
    nextSteps: string | null;
    clientParticipants: string | null;
  };
  verification: {
    executed: { total: number; verifiedOk: number; issueIdentified: number; followUpRequired: number };
    plannedNotCompleted: number;
    completedElsewhere: number;
    /** Executed here with Issue Identified / Follow-up Required, in a stable order. */
    issues: {
      id: string;
      question: string;
      result: string;
      notes: string | null;
      frameworkIdentity: string | null;
      frameworkItemLabel: string | null;
      findings: ReportFindingRef[];
    }[];
  };
  findings: {
    id: string;
    findingNo: number;
    findingType: string;
    title: string;
    description: string | null;
    frameworkIdentity: string | null;
    frameworkItemLabel: string | null;
    siteName: string | null;
    priority: string;
    status: string;
    origin: "manual" | "verification" | "document_review";
  }[];
  actions: {
    id: string;
    description: string;
    finding: ReportFindingRef | null;
    ownerName: string | null;
    dueDate: string | null;
    priority: string;
    status: string;
    completionNotes: string | null;
  }[];
  evidence: {
    total: number;
    /** Only non-empty groups, in the order Activity → Verification → Finding → Action. */
    groups: { key: ReportEvidenceGroupKey; label: string; items: ReportEvidenceItem[] }[];
  };
};

// ----- Assembly -----

const RESULT_ORDER: Record<string, number> = { issue_identified: 0, follow_up_required: 1 };
const OPEN_ACTION = new Set(["open", "in_progress", "pending_review"]);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const textCmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function framework(f: RawFramework) {
  if (!f) return { frameworkIdentity: null, frameworkItemLabel: null };
  return {
    frameworkIdentity: f.frameworks ? `${f.frameworks.code}:${f.frameworks.edition}` : null,
    frameworkItemLabel: [f.code, f.title].filter(Boolean).join(" — ") || null,
  };
}

function evidenceItems(rows: RawReportEvidence[] | null, projectId: string, attachedTo: string | null): ReportEvidenceItem[] {
  return (rows ?? [])
    .filter((e) => e.project_id === projectId && e.files)
    .sort((a, b) => cmp(a.created_at, b.created_at) || cmp(a.id, b.id))
    .map((e) => ({
      id: e.id,
      caption: e.caption,
      fileName: e.files!.original_name,
      mimeType: e.files!.mime_type,
      sizeBytes: e.files!.size_bytes,
      attachedTo,
    }));
}

const findingRefLabel = (r: ReportFindingRef) => `F-${String(r.findingNo).padStart(3, "0")} · ${r.title}`;

export function assembleActivityReport(input: RawActivityReportInput): ActivityReport {
  const { projectId, activity: a } = input;
  const A = a.id;

  // --- Verification ---
  const verifications = input.verifications.filter((v) => v.project_id === projectId);
  const executedHere = verifications.filter((v) => v.verified_activity_id === A && v.result);
  const plannedPending = verifications.filter((v) => v.target_activity_id === A && !v.result);
  const completedElsewhere = verifications.filter((v) => v.target_activity_id === A && v.result && v.verified_activity_id !== A);
  const countResult = (r: string) => executedHere.filter((v) => v.result === r).length;
  const verificationIssues = executedHere
    .filter((v) => v.result === "issue_identified" || v.result === "follow_up_required")
    .sort((x, y) => (RESULT_ORDER[x.result!] ?? 9) - (RESULT_ORDER[y.result!] ?? 9) || textCmp(x.question, y.question) || cmp(x.id, y.id))
    .map((v) => ({
      id: v.id,
      question: v.question,
      result: v.result!,
      notes: v.notes,
      ...framework(v.framework_items),
      findings: (v.issues ?? [])
        .filter((i) => i.project_id === projectId)
        .sort((x, y) => x.finding_no - y.finding_no)
        .map((i) => ({ id: i.id, findingNo: i.finding_no, title: i.title })),
    }));

  // --- Findings: issues.activity_id = A only ---
  const findingRows = input.findings
    .filter((f) => f.project_id === projectId && f.activity_id === A)
    .sort((x, y) => x.finding_no - y.finding_no);
  const findings = findingRows.map((f) => ({
    id: f.id,
    findingNo: f.finding_no,
    findingType: f.finding_type,
    title: f.title,
    description: f.description,
    ...framework(f.framework_items),
    siteName: f.site_id ? (input.siteNames.get(f.site_id) ?? null) : null,
    priority: f.priority,
    status: f.status,
    origin: (f.verification_item_id ? "verification" : f.document_review_id ? "document_review" : "manual") as
      | "manual"
      | "verification"
      | "document_review",
  }));
  const findingRefById = new Map(findingRows.map((f) => [f.id, { id: f.id, findingNo: f.finding_no, title: f.title }]));

  // --- Actions: activity_id = A  ∪  issue_id ∈ report Findings, de-duplicated by id ---
  const actionById = new Map<string, { row: RawReportAction; finding: ReportFindingRef | null }>();
  for (const f of findingRows) {
    for (const act of f.actions ?? []) {
      if (act.project_id !== projectId) continue;
      actionById.set(act.id, { row: act, finding: findingRefById.get(f.id)! });
    }
  }
  for (const act of input.activityActions) {
    if (act.project_id !== projectId || act.activity_id !== A || actionById.has(act.id)) continue;
    const ref = act.issues && act.issues.project_id === projectId ? { id: act.issues.id, findingNo: act.issues.finding_no, title: act.issues.title } : null;
    actionById.set(act.id, { row: act, finding: ref });
  }
  const actionEntries = [...actionById.values()].sort(
    (x, y) =>
      Number(!OPEN_ACTION.has(x.row.status)) - Number(!OPEN_ACTION.has(y.row.status)) ||
      Number(x.row.due_date === null) - Number(y.row.due_date === null) ||
      cmp(x.row.due_date ?? "", y.row.due_date ?? "") ||
      textCmp(x.row.description, y.row.description) ||
      cmp(x.row.id, y.row.id),
  );
  const actions = actionEntries.map(({ row, finding }) => ({
    id: row.id,
    description: row.description,
    finding,
    ownerName: row.owner_name,
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    completionNotes: row.completion_notes,
  }));

  // --- Evidence: one parent per attachment, report-scoped parents only ---
  // Executed here (result set) and planned here, pending (no result) never overlap.
  const reportChecks = [...executedHere, ...plannedPending];
  const groups: ActivityReport["evidence"]["groups"] = [
    { key: "activity" as const, label: "General Activity Evidence", items: evidenceItems(a.attachments, projectId, null) },
    {
      key: "verification" as const,
      label: "Verification Evidence",
      items: reportChecks.flatMap((v) => evidenceItems(v.attachments, projectId, v.question)),
    },
    {
      key: "finding" as const,
      label: "Finding Evidence",
      items: findingRows.flatMap((f) => evidenceItems(f.attachments, projectId, findingRefLabel(findingRefById.get(f.id)!))),
    },
    {
      key: "action" as const,
      label: "Action Evidence",
      items: actionEntries.flatMap(({ row }) => evidenceItems(row.attachments, projectId, row.description)),
    },
  ].filter((g) => g.items.length > 0);

  return {
    activity: {
      id: a.id,
      projectId: a.project_id,
      name: a.name,
      typeLabel: a.activity_types?.label ?? "",
      status: a.status,
      mode: a.mode,
      siteName: a.site_id ? (input.siteNames.get(a.site_id) ?? null) : null,
      startDate: a.start_date,
      startTime: a.start_time,
      endDate: a.end_date,
      endTime: a.end_time,
      consultantName: a.consultant ? a.consultant.display_name || a.consultant.email || "Unknown user" : null,
      projectName: a.projects?.name ?? "",
      clientName: a.projects?.clients?.name ?? null,
    },
    narrative: {
      objectives: a.objectives,
      plannedWork: a.planned_work,
      workPerformed: a.work_performed,
      summary: a.summary,
      nextSteps: a.next_steps,
      clientParticipants: a.client_participants,
    },
    verification: {
      executed: {
        total: executedHere.length,
        verifiedOk: countResult("verified_ok"),
        issueIdentified: countResult("issue_identified"),
        followUpRequired: countResult("follow_up_required"),
      },
      plannedNotCompleted: plannedPending.length,
      completedElsewhere: completedElsewhere.length,
      issues: verificationIssues,
    },
    findings,
    actions,
    evidence: { total: groups.reduce((n, g) => n + g.items.length, 0), groups },
  };
}
