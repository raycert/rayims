// Unit test of the report rules (lib/reports/activity-report.ts), run directly by Node (type stripping).
const { assembleActivityReport } = await import(new URL("../../lib/reports/activity-report.ts", import.meta.url).href);

let pass = 0, fail = 0;
const rec = (ok, m) => { console.log(`${ok ? "PASS" : "FAIL"}  ${m}`); ok ? pass++ : fail++; };
const P = "proj-A", PB = "proj-B", A = "act-A", B = "act-B";
const ev = (id, project = P, at = "2026-10-01T00:00:0" + id.slice(-1) + "Z") => ({ id, project_id: project, caption: `cap ${id}`, created_at: at, files: { original_name: `${id}.jpg`, mime_type: "image/jpeg", size_bytes: 10 } });
const fw = { code: "8.1", title: "Operational planning and control", frameworks: { code: "ISO 14001", edition: "2015" } };
const act = (o) => ({ id: "x", project_id: P, description: "d", owner_name: null, due_date: null, priority: "medium", status: "open", completion_notes: null, issue_id: null, activity_id: null, attachments: [], ...o });

const input = {
  projectId: P,
  siteNames: new Map([["site-1", "Viet Long"], ["site-2", "Long An"]]),
  activity: {
    id: A, project_id: P, name: "Site Assessment", status: "completed", mode: "on_site", site_id: "site-1",
    start_date: "2026-10-01", start_time: "08:00:00", end_date: null, end_time: null,
    objectives: "obj", planned_work: "pw", work_performed: "wp", summary: "sum", next_steps: "ns", client_participants: "cp",
    activity_types: { label: "Site Assessment" }, consultant: { display_name: null, email: "c@example.com" },
    projects: { name: "ISO Implementation", clients: { name: "Chinh Long" } },
    attachments: [ev("ev-act1")],
  },
  verifications: [
    // A. executed here (planned here too) — Issue Identified, with a Finding
    { id: "v1", project_id: P, question: "Q issue", result: "issue_identified", notes: "n1", target_activity_id: A, verified_activity_id: A, framework_items: fw, issues: [{ id: "f2", project_id: P, finding_no: 2, title: "From check" }], attachments: [ev("ev-v1")] },
    // executed here though planned for B — counted here
    { id: "v2", project_id: P, question: "Q ok", result: "verified_ok", notes: null, target_activity_id: B, verified_activity_id: A, framework_items: null, issues: [], attachments: [] },
    { id: "v3", project_id: P, question: "A follow", result: "follow_up_required", notes: null, target_activity_id: null, verified_activity_id: A, framework_items: null, issues: [], attachments: [] },
    // B. planned here, pending
    { id: "v4", project_id: P, question: "Q pending", result: null, notes: null, target_activity_id: A, verified_activity_id: null, framework_items: null, issues: [], attachments: [ev("ev-v4")] },
    // C. planned here, executed elsewhere
    { id: "v5", project_id: P, question: "Q elsewhere", result: "issue_identified", notes: null, target_activity_id: A, verified_activity_id: B, framework_items: null, issues: [], attachments: [ev("ev-v5")] },
    // foreign project row (must be ignored)
    { id: "v6", project_id: PB, question: "Q foreign", result: "issue_identified", notes: null, target_activity_id: A, verified_activity_id: A, framework_items: null, issues: [], attachments: [] },
  ],
  findings: [
    // D. Verification-origin (activity_id = A)
    { id: "f2", project_id: P, finding_no: 2, finding_type: "nonconformity", title: "From check", description: "desc", priority: "high", status: "open", site_id: "site-1", activity_id: A, verification_item_id: "v1", document_review_id: null, framework_items: fw,
      actions: [act({ id: "a-both", description: "Both paths", activity_id: A, issue_id: "f2", due_date: "2026-10-10", attachments: [ev("ev-a1")] }), act({ id: "a-fonly", description: "Finding only", issue_id: "f2", due_date: "2026-10-05" })],
      attachments: [ev("ev-f2")] },
    // E. manual
    { id: "f1", project_id: P, finding_no: 1, finding_type: "observation", title: "Manual", description: null, priority: "low", status: "closed", site_id: "site-2", activity_id: A, verification_item_id: null, document_review_id: null, framework_items: null, actions: [], attachments: [] },
    // F. Gap Assessment origin
    { id: "f7", project_id: P, finding_no: 7, finding_type: "observation", title: "From review", description: null, priority: "medium", status: "open", site_id: null, activity_id: A, verification_item_id: null, document_review_id: "r1", framework_items: null, actions: [], attachments: [] },
    // G. no Activity (would not be returned by the query; must be dropped anyway)
    { id: "f9", project_id: P, finding_no: 9, finding_type: "observation", title: "No activity", description: null, priority: "medium", status: "open", site_id: null, activity_id: null, verification_item_id: null, document_review_id: null, framework_items: null, actions: [], attachments: [] },
  ],
  activityActions: [
    // H. standalone activity action (closed)
    { ...act({ id: "a-standalone", description: "Standalone", activity_id: A, status: "closed" }), issues: null },
    // J. both paths (again)
    { ...act({ id: "a-both", description: "Both paths", activity_id: A, issue_id: "f2", due_date: "2026-10-10", attachments: [ev("ev-a1")] }), issues: { id: "f2", project_id: P, finding_no: 2, title: "From check" } },
    // activity action linked to a Finding of another Activity
    { ...act({ id: "a-other", description: "Other finding", activity_id: A, issue_id: "f30" }), issues: { id: "f30", project_id: P, finding_no: 30, title: "Other activity finding" } },
  ],
};

const r = assembleActivityReport(input);
const r2 = assembleActivityReport(structuredClone({ ...input, siteNames: undefined }) && { ...input });
rec(JSON.stringify(r) === JSON.stringify(r2), "Deterministic: same input → identical model");

const v = r.verification;
rec(v.executed.total === 3 && v.executed.verifiedOk === 1 && v.executed.issueIdentified === 1 && v.executed.followUpRequired === 1, `A: executed here = 3 (incl. one planned for another activity), by result 1/1/1`);
rec(v.plannedNotCompleted === 1, "B: planned here, pending = 1 (not mixed into results)");
rec(v.completedElsewhere === 1, "C: planned here, executed elsewhere = 1 (count only)");
rec(JSON.stringify(v.issues.map((i) => i.id)) === JSON.stringify(["v1", "v3"]) && !v.issues.some((i) => i.id === "v5" || i.id === "v6"), "Issue list: only executed-here Issue Identified / Follow-up Required (v1, v3); not the elsewhere / foreign checks");
rec(v.issues[0].frameworkIdentity === "ISO 14001:2015" && v.issues[0].frameworkItemLabel === "8.1 — Operational planning and control" && v.issues[0].findings[0].findingNo === 2, "Issue row: requirement 'ISO 14001:2015 · 8.1 — …', Finding ref F-002");

rec(JSON.stringify(r.findings.map((f) => f.findingNo)) === "[1,2,7]", "Findings: activity_id = A only, ordered by number (1, 2, 7); no-Activity F-009 dropped");
rec(r.findings.map((f) => f.origin).join() === "manual,verification,document_review", "D/E/F origins: manual, verification, document_review");
rec(r.findings[0].siteName === "Long An" && r.findings[2].siteName === null, "Finding site names resolved (project-wide = null)");
rec(!JSON.stringify(r).includes("correction") && !JSON.stringify(r).includes("root_cause"), "No NC response / effectiveness data in the model");

const ids = r.actions.map((a) => a.id);
rec(ids.length === new Set(ids).size && ids.filter((x) => x === "a-both").length === 1, "J: an Action on both paths appears once");
rec(ids.includes("a-fonly") && r.actions.find((a) => a.id === "a-fonly").finding.findingNo === 2, "I: Action of an Activity Finding without activity_id is included (F-002)");
rec(ids.includes("a-standalone") && r.actions.find((a) => a.id === "a-standalone").finding === null, "H: standalone Activity Action included");
rec(r.actions.find((a) => a.id === "a-other").finding.findingNo === 30, "Activity Action linked to another Activity's Finding keeps its F-030 reference");
rec(JSON.stringify(ids) === JSON.stringify(["a-fonly", "a-both", "a-other", "a-standalone"]), `Action order: open first, due date ascending, undated last, closed last (${ids.join(", ")})`);

const g = Object.fromEntries(r.evidence.groups.map((x) => [x.key, x.items.map((i) => i.id)]));
rec(r.evidence.total === 5 && JSON.stringify(g.activity) === '["ev-act1"]' && JSON.stringify(g.verification) === '["ev-v1","ev-v4"]' && JSON.stringify(g.finding) === '["ev-f2"]' && JSON.stringify(g.action) === '["ev-a1"]', `K: Evidence 5 = Activity 1 + Verification 2 (executed + pending here) + Finding 1 + Action 1; elsewhere check's file excluded; the both-paths Action's file once`);
rec(r.evidence.groups.find((x) => x.key === "finding").items[0].attachedTo === "F-002 · From check", "Finding Evidence names its Finding 'F-002 · From check'");

rec(r.activity.consultantName === "c@example.com" && r.activity.siteName === "Viet Long" && r.activity.clientName === "Chinh Long" && r.activity.typeLabel === "Site Assessment", "Metadata: consultant falls back to email; site / client / type resolved");
rec(r.narrative.summary === "sum" && r.narrative.clientParticipants === "cp" && r.narrative.objectives === "obj", "Narrative passed through unchanged (never generated)");

// L. empty activity
const e = assembleActivityReport({ ...input, activity: { ...input.activity, attachments: [], consultant: null }, verifications: [], findings: [], activityActions: [] });
rec(e.verification.executed.total === 0 && e.findings.length === 0 && e.actions.length === 0 && e.evidence.total === 0 && e.evidence.groups.length === 0 && e.activity.consultantName === null, "L: empty Activity → zero counts, empty lists, no Evidence groups");
// foreign-project evidence on a report parent is dropped
const f = assembleActivityReport({ ...input, activity: { ...input.activity, attachments: [ev("ev-x", PB)] }, verifications: [], findings: [], activityActions: [] });
rec(f.evidence.total === 0, "Evidence row of another project is never included");

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
