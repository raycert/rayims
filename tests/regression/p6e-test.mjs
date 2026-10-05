import { chromium } from "playwright-core";
import path from "node:path";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { REPO, users, makeReporter, signIn, dbQuery, http } from "./common.mjs";
import { createBase, seedVerification, seedActions, seedEvidence, cleanupP6e, createPerformanceData } from "./p6e-scenario.mjs";

const require = createRequire(REPO + "/package.json");
const JSZip = require("jszip");
const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p6e-shots");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const info = (m) => console.log(`INFO  ${m}`);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 15000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
async function waitDb(fn, ms = 30000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 800)); } return false; }
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });
const T = (s) => `P6E-ACCEPT-${s}`;
const UUIDRE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const one = (sql) => dbQuery(sql)[0];
const state = (p) =>
  one(`select
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from activities t where project_id='${p}') a,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from verification_items t where project_id='${p}') v,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from issues t where project_id='${p}') i,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from actions t where project_id='${p}') ac,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from attachments t where project_id='${p}') at,
    (select count(*)::int from files where project_id='${p}') f,
    (select count(*)::int from storage.objects where bucket_id='rayims-files') o`);

async function readDocx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml").async("string");
  const footers = await Promise.all(Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f)).map((f) => zip.file(f).async("string")));
  const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const paraText = (frag) => (frag.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => unesc((p.match(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  const tables = (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).map((tbl) =>
    (tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map((tr) => (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((tc) => paraText(tc).join("\n"))),
  );
  return { files: Object.keys(zip.files), xml, footer: footers.join("\n"), text: paraText(xml).join("\n"), paragraphs: paraText(xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, "")), tables };
}
const findTable = (d, first) => d.tables.find((t) => t[0]?.[0] === first);
const tzDate = (tz) => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const g = (k) => p.find((x) => x.type === k).value; return `${g("year")}${g("month")}${g("day")}`; };

const admin = await signIn("admin");
const consultant = await signIn("consultant");
const t0 = Date.now();
const f = await createBase(admin.token);
info(`base fixtures ${Math.round((Date.now() - t0) / 1000)} s`);
const P = `${APP}/projects/${f.p}`;
const ACT = (id, p = f.p) => `${APP}/projects/${p}/activities/${id}`;
const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function open(width, height, who = "admin") {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, timezoneId: "Asia/Ho_Chi_Minh", locale: "en-US" });
  const page = await ctx.newPage();
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
  return { ctx, page };
}
const dlg = (p) => p.getByRole("dialog");
const rs = (p) => p.getByTestId("activity-report-summary");
async function openAct(page, id, p = f.p) { await page.goto(ACT(id, p)); await rs(page).waitFor({ timeout: 30000 }); }
async function exportVia(page, id, name) {
  await openAct(page, id);
  const t = Date.now();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), rs(page).getByRole("button", { name: "Export Report" }).click()]);
  const file = path.join(OUT, name);
  await dl.saveAs(file);
  const buf = readFileSync(file);
  return { ms: Date.now() - t, buf, name: dl.suggestedFilename(), d: await readDocx(buf) };
}
async function createFinding(page, type, title, { activity = null } = {}) {
  await dlg(page).getByRole("button", { name: type, exact: true }).click();
  await dlg(page).locator("#fd-title").fill(title);
  if (activity) await dlg(page).locator("#fd-activity").selectOption(activity);
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  const toast = page.getByText(/^Finding F-\d{3,} created\.$/).first();
  const ok = await wait(toast, 20000);
  const text = ok ? await toast.innerText() : "";
  await gone(dlg(page));
  return text;
}
async function addAction(page, findingId, { description, owner, due = "", activity = undefined }) {
  await page.goto(`${P}/findings/${findingId}`);
  await page.getByRole("button", { name: /^\+ Add (Corrective )?Action$/ }).click();
  await dlg(page).locator("#ac-description").fill(description);
  await dlg(page).locator("#ac-owner").fill(owner);
  if (due) await dlg(page).locator("#ac-due").fill(due);
  // The form prefills the Finding's Activity; "" explicitly chooses "No activity".
  if (activity !== undefined) await dlg(page).locator("#ac-activity").selectOption(activity);
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  await gone(dlg(page), 20000);
}
const issueByTitle = (title) => one(`select * from issues where project_id='${f.p}' and title='${title.replace(/'/g, "''")}'`);

let A, V, F1, F2, F3, F4, ACT_A, ACT_C, ACT_E, SEED, EV;
const captured = {};
try {
  const before = state(f.p);
  // ================= Phase 3 regression + scenario setup (consultant, UI) =================
  const { ctx, page } = await open(1280, 800, "consultant");
  page.on("request", (req) => {
    if (req.method() === "POST" && req.headers()["next-action"]) captured.last = { url: req.url(), headers: req.headers(), body: req.postData() ?? "" };
  });
  await page.goto(`${P}/plan`);
  await page.getByRole("button", { name: "+ New Activity" }).first().click();
  const d0 = dlg(page);
  await d0.locator("#act-type").selectOption({ label: "Site Assessment" });
  await d0.locator("#act-name").fill(T("IMS Site Assessment"));
  await d0.getByRole("button", { name: "Specific site" }).click();
  await d0.locator("#act-site").selectOption({ label: T("Viet-Long") });
  await d0.getByRole("button", { name: "On-site" }).click();
  await d0.locator("#act-consultant").selectOption(consultant.userId);
  await d0.locator("#act-start-date").fill("2026-10-27");
  await d0.locator("#act-start-time").fill("08:30");
  await d0.locator("#act-end-time").fill("16:00");
  await d0.locator("#act-objectives").fill("Đánh giá việc kiểm soát vận hành theo ISO 14001.");
  await d0.locator("#act-planned-work").fill("Walk-through of the drum store.\nInterview with the HSE Manager.");
  await d0.getByRole("button", { name: "Create", exact: true }).click();
  await gone(d0, 20000);
  await waitDb(() => !!one(`select id from activities where project_id='${f.p}' and name='${T("IMS Site Assessment")}'`));
  const a0 = one(`select a.*, t.key from activities a join activity_types t on t.id = a.activity_type_id where a.project_id='${f.p}' and a.name='${T("IMS Site Assessment")}'`);
  A = a0.id;
  rec(a0.key === "site_assessment" && a0.site_id === f.vl && a0.mode === "on_site" && a0.consultant_id === consultant.userId && a0.start_date === "2026-10-27" && a0.start_time === "08:30:00" && a0.end_time === "16:00:00" && a0.status === "planned", "Phase 3: consultant creates the Activity in the Master Plan (type, site, mode, consultant, date, times; status Planned)");
  rec(await wait(page.getByText(T("IMS Site Assessment")).first()), "Phase 3: Activity listed in the Master Plan");
  await openAct(page, A);
  await page.getByRole("button", { name: "Edit Activity", exact: true }).click();
  await dlg(page).locator("#act-end-time").fill("16:30");
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  await gone(dlg(page), 20000);
  await page.locator("#activity-status").selectOption("in_progress");
  rec(await waitDb(() => { const r = one(`select end_time, status from activities where id='${A}'`); return r.end_time === "16:30:00" && r.status === "in_progress"; }), "Phase 3: edit (end time 16:30) and status → In Progress");

  V = seedVerification(f.p, A, f.B, f.vl, f.e81);
  // A. Verification-origin Finding (consultant, Activity Detail card)
  await openAct(page, A);
  await page.locator("div.rounded-lg", { hasText: T("Is secondary containment provided?") }).last().getByRole("button", { name: "Create Finding" }).click();
  const t1 = await createFinding(page, "Nonconformity", T("Chưa có bờ bao tại kho chứa thùng phuy"));
  F1 = issueByTitle(T("Chưa có bờ bao tại kho chứa thùng phuy"));
  // B. Manual Finding with Activity A
  await page.goto(`${P}/findings`);
  await page.getByRole("button", { name: "+ New Finding" }).first().click();
  const t2 = await createFinding(page, "Observation", T("Housekeeping in the drum store"), { activity: A });
  F2 = issueByTitle(T("Housekeeping in the drum store"));
  // C. Gap Assessment-origin Finding with Activity A selected
  await page.goto(`${P}/documents/${f.doc}`);
  await page.getByTestId("gap-assessment").getByTestId("review-follow-up").getByRole("button", { name: "Create Finding" }).click();
  const t3 = await createFinding(page, "Observation", T("Chưa kiểm soát đầy đủ hồ sơ theo yêu cầu."), { activity: A });
  F3 = issueByTitle(T("Chưa kiểm soát đầy đủ hồ sơ theo yêu cầu."));
  // Finding from the check planned in A but executed in B (on B)
  await openAct(page, f.B);
  await page.locator("div.rounded-lg", { hasText: T("Are permits displayed at the gate?") }).last().getByRole("button", { name: "Create Finding" }).click();
  await createFinding(page, "Observation", T("Gate permit expired"));
  F4 = issueByTitle(T("Gate permit expired"));
  rec(t1 === "Finding F-001 created." && t2 === "Finding F-002 created." && t3 === "Finding F-003 created." && F1.finding_no === 1 && F2.finding_no === 2 && F3.finding_no === 3 && F4.finding_no === 4, `Consultant creates Findings through all three paths: ${t1} / ${t2} / ${t3} — one project sequence`);
  rec(F1.verification_item_id === V.issue1 && F1.activity_id === A && !F2.verification_item_id && !F2.document_review_id && F2.activity_id === A && F3.document_review_id === f.review && F3.activity_id === A && F4.activity_id === f.B, "Origins: verification (activity A), manual (A), Gap Assessment (A selected); the elsewhere check's Finding belongs to B");

  // Actions (consultant, Finding Detail): A linked no activity, C linked + activity A, E overdue
  const past = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  await addAction(page, F1.id, { description: T("Install bunding at the drum store"), owner: "Plant Manager", due: "2026-12-15", activity: "" });
  await addAction(page, F1.id, { description: T("Train storekeepers on containment"), owner: "HSE Manager", activity: A });
  await addAction(page, F2.id, { description: T("Clear the walkways in the drum store"), owner: "Warehouse Lead", due: past });
  await waitDb(() => one(`select count(*)::int n from actions where project_id='${f.p}'`).n === 3);
  ACT_A = one(`select * from actions where description='${T("Install bunding at the drum store")}'`);
  ACT_C = one(`select * from actions where description='${T("Train storekeepers on containment")}'`);
  ACT_E = one(`select * from actions where description='${T("Clear the walkways in the drum store")}'`);
  rec(ACT_A.issue_id === F1.id && !ACT_A.activity_id && ACT_C.issue_id === F1.id && ACT_C.activity_id === A && ACT_E.issue_id === F2.id && ACT_E.due_date === past, "Consultant creates Actions: linked without Activity, linked + Activity A, overdue");
  SEED = seedActions(f.p, A);
  EV = seedEvidence(f.p, { A, viIssue: V.issue1, finding: F1.id, action: ACT_C.id, viElsewhere: V.elsewhere });

  // Narrative (consultant): blank → NULL first, then the real text
  await openAct(page, A);
  await page.getByTestId("activity-summary").getByRole("button", { name: /^(Add|Edit) Activity Summary$/ }).click();
  await dlg(page).locator("#sum-summary").fill("   ");
  await dlg(page).locator("#sum-work-performed").fill("Đã đánh giá hiện trạng tài liệu và kiểm tra điều kiện tại hiện trường.\n\nReviewed operational controls with the site team.");
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  await gone(dlg(page), 20000);
  rec(await waitDb(() => one(`select summary from activities where id='${A}'`).summary === null), "Narrative: whitespace-only Consultant Summary stored as NULL");
  await page.getByTestId("activity-summary").getByRole("button", { name: "Edit Activity Summary" }).click();
  await dlg(page).locator("#sum-summary").fill("Controls are generally implemented.\n\nSecondary containment and record retention need improvement before the follow-up visit.");
  await dlg(page).locator("#sum-next-steps").fill("Install bunding.\nDefine record retention periods.");
  await dlg(page).locator("#sum-client-participants").fill("Nguyễn Văn A — Trưởng phòng Chất lượng\nTran Thi B — QA Supervisor");
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  await gone(dlg(page), 20000);
  captured.narrative = { ...captured.last };
  const a1 = one(`select * from activities where id='${A}'`);
  rec(a1.summary.startsWith("Controls are generally implemented.\n\nSecondary") && a1.client_participants === "Nguyễn Văn A — Trưởng phòng Chất lượng\nTran Thi B — QA Supervisor" && a1.work_performed.startsWith("Đã đánh giá") && a1.objectives === "Đánh giá việc kiểm soát vận hành theo ISO 14001." && a1.planned_work === "Walk-through of the drum store.\nInterview with the HSE Manager." && a1.status === "in_progress", "Narrative saved (Vietnamese, paragraph breaks); Plan and status unchanged");

  // ================= Activity Detail =================
  await openAct(page, A);
  const order = await page.locator("section h2").allInnerTexts();
  rec(JSON.stringify(order) === JSON.stringify(["Plan", "Verification", "General Activity Evidence", "Outcome / Activity Summary", "Activity Report Summary"]), `Activity Detail sections: ${order.join(" → ")}`);
  const heads = await page.locator("main h1, main h2, main h3").allInnerTexts();
  const dupes = heads.map((h) => flat(h).toLowerCase()).filter((h, i, a) => a.indexOf(h) !== i);
  rec(dupes.length === 0, `Accessibility: all ${heads.length} headings unique${dupes.length ? " — duplicates: " + dupes.join(", ") : ""}`);
  const unnamed = await page.locator("main button").evaluateAll((bs) => bs.filter((b) => !(b.getAttribute("aria-label") || b.textContent || "").trim()).length);
  rec(unnamed === 0, "Accessibility: every button on Activity Detail has a name");
  rec((await page.getByRole("button", { name: /^(Finalize|Approve|Submit|Sign off|Mark as final)/i }).count()) === 0 && (await rs(page).getByRole("button", { name: "Export Report" }).count()) === 1, "Export Report present; no approval / finalize controls");
  await shot(page, "d-activity", true);

  // Report summary vs database truth
  const truth = one(`select
    (select count(*)::int from verification_items where project_id='${f.p}' and verified_activity_id='${A}' and result is not null) ex,
    (select count(*)::int from verification_items where project_id='${f.p}' and verified_activity_id='${A}' and result='verified_ok') ok,
    (select count(*)::int from verification_items where project_id='${f.p}' and verified_activity_id='${A}' and result='issue_identified') iss,
    (select count(*)::int from verification_items where project_id='${f.p}' and verified_activity_id='${A}' and result='follow_up_required') fu,
    (select count(*)::int from verification_items where project_id='${f.p}' and target_activity_id='${A}' and result is null) pend,
    (select count(*)::int from verification_items where project_id='${f.p}' and target_activity_id='${A}' and result is not null and verified_activity_id <> '${A}') elsew,
    (select string_agg('F-' || lpad(finding_no::text, 3, '0'), ',' order by finding_no) from issues where project_id='${f.p}' and activity_id='${A}') fnos,
    (select count(distinct id)::int from actions where project_id='${f.p}' and (activity_id='${A}' or issue_id in (select id from issues where project_id='${f.p}' and activity_id='${A}'))) acts`);
  const evTruth = one(`select count(*)::int n from attachments at where at.project_id='${f.p}' and (at.activity_id='${A}'
    or at.verification_item_id in (select id from verification_items where project_id='${f.p}' and ((verified_activity_id='${A}' and result is not null) or (target_activity_id='${A}' and result is null)))
    or at.issue_id in (select id from issues where project_id='${f.p}' and activity_id='${A}')
    or at.action_id in (select id from actions where project_id='${f.p}' and (activity_id='${A}' or issue_id in (select id from issues where project_id='${f.p}' and activity_id='${A}'))))`).n;
  const m = flat(await page.getByTestId("report-verification-metrics").innerText());
  const sm = (k) => Number(new RegExp(`(\\d+) ${k}`).exec(m)?.[1] ?? 0);
  const screenF = await rs(page).getByTestId("report-finding").evaluateAll((els) => els.map((e) => e.querySelector("span")?.textContent?.trim()));
  const screenA = await rs(page).getByTestId("report-action").count();
  const screenE = await rs(page).getByTestId("report-evidence-item").count();
  rec(truth.ex === 7 && truth.ok === 4 && truth.iss === 2 && truth.fu === 1 && truth.pend === 1 && truth.elsew === 1, `Scenario: 7 executed (4 OK / 2 Issue / 1 Follow-up), 1 pending, 1 completed elsewhere`);
  rec(sm("executed") === truth.ex && sm("Verified OK") === truth.ok && sm("Issue Identified") === truth.iss && sm("Follow-up Required") === truth.fu && sm("planned, not completed") === truth.pend && sm("completed in another activity") === truth.elsew, `Report counts = database ("${m}")`);
  rec((await rs(page).getByTestId("report-verification-issue").count()) === 3, "Only the 2 Issue + 1 Follow-up checks are listed");
  rec(screenF.join(",") === truth.fnos && truth.fnos === "F-001,F-002,F-003", `Findings = database (${screenF.join(", ")}); F-004 (Activity B) absent`);
  rec(screenA === truth.acts && truth.acts === 5 && (await rs(page).getByTestId("report-action").filter({ hasText: T("Train storekeepers on containment") }).count()) === 1, `Actions = database union (${screenA}): linked / both-paths (once) / overdue / standalone / closed`);
  const overdueRow = flat(await rs(page).getByTestId("report-action").filter({ hasText: T("Clear the walkways") }).innerText());
  rec(/Overdue/.test(overdueRow) && /F-002/.test(overdueRow), "Overdue Action shows Overdue (existing rule) and F-002");
  rec(screenE === evTruth && evTruth === 4 && !(await rs(page).innerText()).includes("permits.jpg"), `Evidence = database (${screenE}); the elsewhere check's file excluded`);

  // ================= Finding numbers across surfaces =================
  await page.goto(`${P}/findings`);
  await page.locator("tbody tr").first().waitFor({ timeout: 20000 });
  const nos = await page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => tr.children[0].textContent.trim()));
  rec(JSON.stringify([...nos].sort()) === JSON.stringify(["F-001", "F-002", "F-003", "F-004"]), `Findings list: ${nos.join(", ")}`);
  await page.goto(`${P}/findings/${F1.id}`);
  const h1 = flat(await page.getByRole("heading", { level: 1 }).innerText());
  rec(h1 === `F-001 · ${T("Chưa có bờ bao tại kho chứa thùng phuy")}` && !UUIDRE.test(await page.locator("main").innerText()), `Finding Detail H1 copies as '${h1}', no UUID`);
  await page.goto(`${P}/actions`);
  await page.locator("tbody tr").first().waitFor({ timeout: 20000 });
  rec(flat(await page.locator("tbody tr", { hasText: T("Install bunding") }).innerText()).includes(`F-001 · ${T("Chưa có bờ bao tại kho chứa thùng phuy")}`), "Actions workspace: 'F-001 · title'");
  await openAct(page, A);
  rec(await wait(page.locator("div.rounded-lg", { hasText: T("Is secondary containment provided?") }).last().getByRole("link", { name: "View F-001" })), "Verification card: 'View F-001'");
  await page.goto(`${P}/documents/${f.doc}`);
  await page.getByTestId("follow-up-summary").first().getByRole("button").click();
  rec(flat(await page.getByTestId("follow-up-list").first().innerText()).includes(`F-003 · ${T("Chưa kiểm soát đầy đủ hồ sơ theo yêu cầu.")}`), "Gap Assessment follow-up: 'F-003 · title'");

  // Immutability + gaps
  await page.goto(`${P}/findings/${F2.id}`);
  await page.getByRole("button", { name: "Edit Finding" }).click();
  await dlg(page).getByRole("button", { name: "Opportunity for Improvement", exact: true }).click();
  await dlg(page).locator("#fd-title").fill(T("Housekeeping in the drum store (edited)"));
  await dlg(page).getByRole("button", { name: "High", exact: true }).click().catch(() => {});
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  await gone(dlg(page), 20000);
  const pat = await http("PATCH", `/rest/v1/issues?id=eq.${F2.id}`, { token: consultant.token, body: { finding_no: 99, status: "closed" }, headers: { prefer: "return=representation" } });
  const f2b = one(`select finding_no, finding_type, title, status from issues where id='${F2.id}'`);
  rec(f2b.finding_no === 2 && f2b.finding_type === "opportunity_for_improvement" && f2b.title.endsWith("(edited)") && f2b.status === "closed" && pat.status < 300, "Title / type / status changed (and finding_no 99 forced over the API): still F-002");
  dbQuery(`update issues set status='open', title='${T("Housekeeping in the drum store")}' where id='${F2.id}'`);
  const mk = async (t) => (await http("POST", "/rest/v1/issues", { token: consultant.token, body: { project_id: f.p, title: t }, headers: { prefer: "return=representation" } })).json?.[0];
  const x = await mk(T("Disposable X")), y = await mk(T("Disposable Y"));
  await http("DELETE", `/rest/v1/issues?id=eq.${y.id}`, { token: consultant.token });
  const z = await mk(T("Disposable Z"));
  rec(x.finding_no === 5 && y.finding_no === 6 && z.finding_no === 7, `Delete F-006, next is F-007 (numbers ${x.finding_no}, ${y.finding_no} deleted, ${z.finding_no}) — never reused`);

  // ================= DOCX =================
  const s1 = state(f.p);
  const E1 = await exportVia(page, A, "a-1.docx");
  const d = E1.d;
  info(`DOCX A ${E1.ms} ms, ${E1.buf.length} bytes`);
  rec(E1.name === "RayIMS-Site-Assessment-Report-P6E-ACCEPT-IMS-Implementation-20261027-P6E-ACCEPT-Viet-Long.docx", `Filename: ${E1.name}`);
  const wf = await page.evaluate((xx) => !new DOMParser().parseFromString(xx, "application/xml").getElementsByTagName("parsererror").length, d.xml);
  rec(E1.buf.subarray(0, 2).toString() === "PK" && d.files.includes("[Content_Types].xml") && wf, "Valid DOCX zip; document.xml well-formed");
  rec(/<w:pgSz w:w="11906" w:h="16838"/.test(d.xml) && /PAGE/.test(d.footer) && /<w:tblHeader\/>/.test(d.xml) && (d.xml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/g) ?? []).every((g) => (g.match(/w:w="(\d+)"/g) ?? []).reduce((n, mm) => n + Number(mm.match(/\d+/)[0]), 0) <= 9638), "A4 portrait, page numbers in the footer, repeated table headers, no table wider than the page");
  rec(!d.files.some((x2) => x2.startsWith("word/media")) && !/https?:\/\/|token=|\/storage\/v1/.test(d.text) && !UUIDRE.test(d.text + E1.name), "No embedded media, no signed URL, no UUID in content or filename");
  const H = ["1. Project / Activity Information", "2. Objectives & Scope", "3. Work Performed", "4. Verification Summary", "5. Findings", "6. Actions / Follow-up", "7. Evidence", "8. Consultant Summary", "9. Recommendations / Next Steps"];
  const hi = H.map((h) => d.paragraphs.indexOf(h));
  rec(hi.every((v2, i) => v2 >= 0 && (i === 0 || v2 > hi[i - 1])) && H.every((h) => d.paragraphs.filter((p2) => p2 === h).length === 1), "9 sections in order, each once");
  const inf = Object.fromEntries(d.tables[0].map((r) => [r[0], r[1]]));
  rec(inf["Date / Period"] === "27/10/2026 08:30 – 16:30" && inf.Site === T("Viet-Long") && inf["Client Participants"] === "Nguyễn Văn A — Trưởng phòng Chất lượng\nTran Thi B — QA Supervisor" && inf["Activity Status"] === "In Progress", "Information: '27/10/2026 08:30 – 16:30' (no date drift), site, participants with line break, status");
  const wpi = d.paragraphs.indexOf("Đã đánh giá hiện trạng tài liệu và kiểm tra điều kiện tại hiện trường.");
  rec(wpi > 0 && d.paragraphs[wpi + 1] === "" && d.paragraphs.includes("Secondary containment and record retention need improvement before the follow-up visit."), "Vietnamese text and paragraph breaks intact");
  const c = Object.fromEntries(findTable(d, "Executed").map((r) => [r[0], Number(r[1])]));
  rec(c.Executed === sm("executed") && c["Verified OK"] === sm("Verified OK") && c["Issue Identified"] === sm("Issue Identified") && c["Follow-up Required"] === sm("Follow-up Required") && c["Planned, not completed"] === sm("planned, not completed") && c["Completed in another Activity"] === sm("completed in another activity"), "Screen / DOCX parity: Verification counts");
  const dF = findTable(d, "No.").slice(1);
  rec(dF.map((r) => r[0]).join(",") === screenF.join(",") && dF.find((r) => r[0] === "F-002")[6] === "Open", "Screen / DOCX parity: Finding numbers and statuses");
  const dA = findTable(d, "Action").slice(1);
  rec(dA.length === screenA && dA.filter((r) => r[0] === T("Train storekeepers on containment")).length === 1 && dA.find((r) => r[0] === T("Clear the walkways in the drum store"))[5] === "Open — Overdue" && dA.find((r) => r[0] === T("Clear the walkways in the drum store"))[3] === `${past.slice(8, 10)}/${past.slice(5, 7)}/${past.slice(0, 4)}` && dA.find((r) => r[0] === T("Confirm the next visit date"))[5] === "Closed", "Screen / DOCX parity: Actions (count, once, Overdue, due date, Closed)");
  rec(findTable(d, "Origin").slice(1).length === screenE, "Screen / DOCX parity: Evidence count");
  rec(!/Correction|Root Cause|Effectiveness/.test(d.text) && !/F-004/.test(d.text), "No NC response data; F-004 (Activity B) not in A's report");
  // current state + no mutation
  dbQuery(`update issues set status='closed', closed_at=now() where id='${F1.id}'`);
  const E2 = await exportVia(page, A, "a-2.docx");
  rec(findTable(E2.d, "No.").find((r) => r[0] === "F-001")[6] === "Closed" && dF.find((r) => r[0] === "F-001")[6] === "Open", "F-001 closed after the first export: new file Closed, earlier file still Open");
  dbQuery(`update issues set status='open', closed_at=null where id='${F1.id}'`);
  const s2 = state(f.p);
  await exportVia(page, A, "a-3.docx");
  await exportVia(page, A, "a-4.docx");
  rec(JSON.stringify(state(f.p)) === JSON.stringify(s2) && s1.o === s2.o, "Repeated exports changed no Activity / check / Finding / Action / attachment / file / Storage object");
  // cross-activity
  const rB = await page.request.get(`${ACT(f.B)}/report`);
  const dB = await readDocx(await rB.body());
  rec(Number(findTable(dB, "Executed").find((r) => r[0] === "Issue Identified")[1]) === 1 && findTable(dB, "No.").slice(1).map((r) => r[0]).join() === "F-004" && c["Completed in another Activity"] === 1, "Cross-activity: B counts the executed check and owns F-004; A only 'Completed in another Activity'");
  // empty + timezone fallback
  for (const tz of ["Asia/Ho_Chi_Minh", "Pacific/Kiritimati"]) {
    const res = await page.request.get(`${ACT(f.E)}/report?tz=${encodeURIComponent(tz)}`);
    const name = /filename="([^"]+)"/.exec(res.headers()["content-disposition"])[1];
    const dE = await readDocx(await res.body());
    rec(res.headers()["content-type"] === DOCX_MIME && name.endsWith(`-${tzDate(tz)}-Project-wide.docx`) && dE.footer.includes(`(${tz})`) && dE.tables.length === 1 && dE.paragraphs.includes("No Findings recorded."), `Undated empty Activity, viewer zone ${tz}: filename date ${tzDate(tz)}, footer time in that zone, valid compact DOCX`);
  }
  await openAct(page, f.E);
  rec(/No checks executed\./.test(await rs(page).innerText()) && /No Activity Summary has been recorded yet\./.test(await page.getByTestId("activity-summary").innerText()), "Empty Activity Detail renders compact empty states");
  await ctx.close();

  // ================= Isolation / signed out =================
  const iso = await open(1280, 800);
  await iso.page.goto(ACT(f.XB));
  await iso.page.getByText("Page not found").waitFor({ timeout: 20000 }).catch(() => {});
  const isoBody = await iso.page.locator("body").innerText();
  const isoExp = await iso.page.request.get(`${ACT(f.XB)}/report`);
  await iso.page.goto(`${P}/findings/${f.fB}`);
  await iso.page.getByText("Page not found").waitFor({ timeout: 20000 }).catch(() => {});
  const isoF = await iso.page.locator("body").innerText();
  rec(/Page not found/.test(isoBody) && !/BMARKER/.test(isoBody) && isoExp.status() === 404 && /Page not found/.test(isoF) && !/BMARKER/.test(isoF), "Project A route + Project B Activity / export / Finding: not found, nothing leaked");
  await iso.ctx.close();
  const sOut = state(f.p);
  const replay = async (cap, from, to) => fetch(cap.url, { method: "POST", headers: { "next-action": cap.headers["next-action"], "content-type": cap.headers["content-type"] ?? "text/plain;charset=UTF-8", accept: "text/x-component" }, body: cap.body.split(from).join(to), redirect: "manual" }).then((r) => r.status);
  const st1 = await replay(captured.narrative, "Controls are generally implemented.", "ANON WRITE");
  const anonPage = await (await browser.newContext()).newPage();
  await anonPage.goto(ACT(A));
  const anonExport = await fetch(`${ACT(A)}/report`, { redirect: "manual" });
  const anonBytes = Buffer.from(await anonExport.arrayBuffer());
  const anonInsert = await http("POST", "/rest/v1/issues", { body: { project_id: f.p, title: "ANON" } });
  rec(/\/login/.test(anonPage.url()) && st1 >= 300 && anonExport.status === 307 && anonBytes.subarray(0, 2).toString() !== "PK" && anonInsert.status >= 400 && JSON.stringify(state(f.p)) === JSON.stringify(sOut), `Signed out: Activity Detail → login; narrative action replay (${st1}) and Finding insert (${anonInsert.status}) refused; export ${anonExport.status}, no bytes; nothing changed`);
  await anonPage.context().close();

  // ================= Mobile =================
  for (const w of [390, 412]) {
    const mo = await open(w, 844, "consultant");
    await openAct(mo.page, A);
    rec(await noHOverflow(mo.page) && (await rs(mo.page).getByTestId("report-finding").first().innerText()).includes("F-001"), `${w}px: report readable, F-001 visible, no overflow`);
    const ev = rs(mo.page).getByTestId("report-evidence-item").first();
    rec(await ev.evaluate((el) => el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1), `${w}px: long Evidence file name wraps`);
    const exp = rs(mo.page).getByRole("button", { name: "Export Report" });
    await exp.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const hit = await exp.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h)); });
    rec(hit, `${w}px: Export Report reachable, not under the bottom nav`);
    const edit = mo.page.getByTestId("activity-summary").getByRole("button", { name: "Edit Activity Summary" });
    await edit.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await edit.click();
    await mo.page.locator("#sum-next-steps").fill("Install bunding.\nDefine record retention periods.");
    const save = dlg(mo.page).getByRole("button", { name: "Save", exact: true });
    const saveOk = await save.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h)) && r.bottom <= innerHeight; });
    rec(saveOk && await noHOverflow(mo.page), `${w}px: Activity Summary editor usable, Save visible while typing`);
    await save.click();
    await gone(dlg(mo.page), 20000);
    await mo.page.screenshot({ path: path.join(OUT, `m${w}-activity.png`), fullPage: true });
    await mo.ctx.close();
  }

  // ================= Desktop / performance =================
  createPerformanceData(f.p, f.PERF, f.vl);
  const L = await open(1280, 800);
  const loads = [];
  for (let i = 0; i < 3; i++) { const t = Date.now(); await openAct(L.page, f.PERF); loads.push(Date.now() - t); }
  const gens = [];
  let big;
  for (let i = 0; i < 3; i++) { const t = Date.now(); big = await (await L.page.request.get(`${ACT(f.PERF)}/report`)).body(); gens.push(Date.now() - t); }
  const dl = await readDocx(big);
  const ok = findTable(dl, "No.").length === 21 && findTable(dl, "Action").length === 31 && findTable(dl, "Origin").length === 41 && (await L.page.getByTestId("report-finding").count()) === 20;
  rec(ok, `Large Activity (50 / 20 / 30 / 40): detail ${loads.join(" / ")} ms; DOCX ${gens.join(" / ")} ms, ${(big.length / 1024).toFixed(0)} KB; all rows present`);
  info(`PERF detail ${loads.join(" / ")} ms; DOCX ${gens.join(" / ")} ms, ${big.length} bytes`);
  const expCls = await L.page.getByRole("button", { name: "Export Report" }).getAttribute("class");
  rec(!/bg-primary\b/.test(expCls ?? ""), "Desktop: Export Report secondary (not dominant)");
  await L.ctx.close();
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0] + " " + String(e.stderr ?? "").replace(/\s+/g, " ").slice(0, 300));
} finally {
  await browser.close();
  const removed = await cleanupP6e(admin.token);
  const left = one(`select (select count(*) from clients where name like 'P6E-ACCEPT-%')::int c, (select count(*) from issues)::int i, (select count(*) from actions)::int a, (select count(*) from attachments)::int at, (select count(*) from files)::int f, (select count(*) from documents)::int d, (select count(*) from project_finding_counters)::int ctr`);
  rec(left.c === 0 && left.i === 0 && left.a === 0 && left.at === 0 && left.f === 0 && left.d === 0 && left.ctr === 0, `Cleanup: fixtures removed (+${removed} objects); issues / actions / attachments / files / documents / counters 0`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
