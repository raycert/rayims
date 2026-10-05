import { chromium } from "playwright-core";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { users, makeReporter, signIn, dbQuery, http } from "./common.mjs";
import { createFixtures, cleanupP6a, PFX } from "./p6a-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p6a-shots");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const info = (m) => console.log(`INFO  ${m}`);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 15000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });
async function waitDb(fn, ms = 30000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 800)); } return false; }
const T = (s) => `${PFX}${s}`;
const findings = (p) => dbQuery(`select id, finding_no, title, finding_type, verification_item_id, document_review_id from issues where project_id='${p}' order by finding_no`);
const byTitle = (p, t) => findings(p).find((f) => f.title === t);
const counter = (p) => dbQuery(`select last_finding_no n from project_finding_counters where project_id='${p}'`)[0]?.n ?? null;

const admin = await signIn("admin");
const consultant = await signIn("consultant");
const t0 = Date.now();
const f = await createFixtures(admin.token);
info(`fixtures ${Math.round((Date.now() - t0) / 1000)} s`);
const P = (p) => `${APP}/projects/${p}`;
const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function open(width, height, who = "admin") {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
  return { ctx, page };
}
const dlg = (p) => p.getByRole("dialog");
async function fillFinding(page, type, title) {
  await dlg(page).getByRole("button", { name: type, exact: true }).click();
  await dlg(page).locator("#fd-title").fill(title);
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
}
async function newFinding(page, projectId, type, title) {
  await page.goto(`${P(projectId)}/findings`);
  await page.getByRole("button", { name: "+ New Finding" }).first().click();
  await fillFinding(page, type, title);
}
async function deleteFinding(page, projectId, id) {
  await page.goto(`${P(projectId)}/findings/${id}`);
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Delete Finding" }).click();
  await page.getByTestId("delete-dialog").getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  await page.getByTestId("delete-dialog").getByRole("button", { name: "Delete", exact: true }).click();
  return waitDb(() => dbQuery(`select count(*)::int n from issues where id='${id}'`)[0].n === 0);
}
const rest = (method, p, token, body, headers = {}) => http(method, `/rest/v1/${p}`, { token, body, headers: { prefer: "return=representation", ...headers } });

try {
  const { ctx, page } = await open(1280, 800);

  // ===== A. Manual → F-001 =====
  await newFinding(page, f.P.a, "Nonconformity", T("Retention period not defined"));
  rec(await wait(page.getByText("Finding F-001 created.").first()), "Manual Finding: toast 'Finding F-001 created.'");
  const f1 = await (async () => { await waitDb(() => !!byTitle(f.P.a, T("Retention period not defined"))); return byTitle(f.P.a, T("Retention period not defined")); })();
  rec(f1?.finding_no === 1 && !f1.verification_item_id && !f1.document_review_id, "  ...stored finding_no = 1, manual origin (no verification / review link)");

  // ===== B. Verification → next number =====
  await page.goto(`${P(f.P.a)}/activities/${f.act}`);
  const card = page.locator("div.rounded-lg", { hasText: T("Are records retained for 3 years?") }).last();
  await card.getByRole("button", { name: "Create Finding" }).click();
  await fillFinding(page, "Observation", T("Records kept for 1 year"));
  rec(await wait(page.getByText("Finding F-002 created.").first()), "Verification → Finding: toast 'Finding F-002 created.'");
  await waitDb(() => !!byTitle(f.P.a, T("Records kept for 1 year")));
  const f2 = byTitle(f.P.a, T("Records kept for 1 year"));
  rec(f2?.finding_no === 2 && f2.verification_item_id === f.vi, "  ...finding_no = 2, verification origin kept");
  await page.waitForTimeout(1200);
  await page.goto(`${P(f.P.a)}/activities/${f.act}`);
  const viewLink = page.locator("div.rounded-lg", { hasText: T("Are records retained for 3 years?") }).last().getByRole("link", { name: "View F-002" });
  rec(await wait(viewLink) && (await viewLink.getAttribute("title")) === `F-002 · ${T("Records kept for 1 year")}`, "Verification card: 'View F-002' link (title 'F-002 · …'), no UUID");

  // ===== C. Gap Assessment → next number =====
  await page.goto(`${P(f.P.a)}/documents/${f.doc}`);
  const fu = page.getByTestId("gap-assessment").getByTestId("review-follow-up");
  await fu.getByRole("button", { name: "Create Finding" }).click();
  await fillFinding(page, "Observation", T("Approval matrix missing"));
  rec(await wait(page.getByText("Finding F-003 created.").first()), "Gap Assessment → Finding: toast 'Finding F-003 created.'");
  await waitDb(() => !!byTitle(f.P.a, T("Approval matrix missing")));
  const f3 = byTitle(f.P.a, T("Approval matrix missing"));
  rec(f3?.finding_no === 3 && f3.document_review_id === f.review, "  ...finding_no = 3, review origin kept");
  await page.goto(`${P(f.P.a)}/documents/${f.doc}`);
  await page.getByTestId("follow-up-summary").first().getByRole("button").click();
  rec(/F-003 · P6A-ACCEPT-Approval matrix missing/.test(flat(await page.getByTestId("follow-up-list").first().innerText())), "Gap Assessment follow-up list: 'F-003 · title' with type and status");

  // ===== List / detail =====
  await page.goto(`${P(f.P.a)}/findings`);
  await page.locator("tbody tr").first().waitFor({ timeout: 20000 });
  const firstCells = await page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => tr.children[0].textContent.trim()));
  rec(JSON.stringify([...firstCells].sort()) === JSON.stringify(["F-001", "F-002", "F-003"]) && /NO\./i.test(await page.locator("thead").innerText()), `Findings list: number column (${firstCells.join(", ")})`);
  await shot(page, "d-findings-list");
  await page.goto(`${P(f.P.a)}/findings/${f1.id}`);
  const h1 = flat(await page.getByRole("heading", { level: 1 }).innerText());
  rec(h1 === `F-001 · ${T("Retention period not defined")}` && !/[0-9a-f]{8}-[0-9a-f]{4}/.test(await page.locator("main").innerText()), `Finding Detail header '${h1}', no UUID on the page`);
  await shot(page, "d-finding-detail");

  // ===== Type change keeps the number =====
  await page.getByRole("button", { name: "Edit Finding" }).click();
  await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
  await dlg(page).locator("#fd-title").fill(T("Retention period not defined (edited)"));
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  await gone(dlg(page));
  rec(await waitDb(() => dbQuery(`select finding_type, finding_no from issues where id='${f1.id}'`)[0].finding_type === "observation") && dbQuery(`select finding_no from issues where id='${f1.id}'`)[0].finding_no === 1, "Type Nonconformity → Observation and new title: still F-001");

  // ===== Action on F-001 =====
  await page.getByRole("button", { name: /^\+ Add (Corrective )?Action$/ }).click();
  const ctxText = flat(await page.getByTestId("action-finding-context").innerText());
  rec(ctxText === `Finding: F-001 · ${T("Retention period not defined (edited)")}`, `Action form: '${ctxText}'`);
  await dlg(page).locator("#ac-description").fill(T("Define retention periods in the procedure"));
  await dlg(page).locator("#ac-owner").fill("QA Manager");
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  await gone(dlg(page));
  await page.goto(`${P(f.P.a)}/actions`);
  await page.getByText(T("Define retention periods in the procedure")).first().waitFor({ timeout: 20000 });
  const actRow = flat(await page.locator("tbody tr", { hasText: T("Define retention periods") }).innerText());
  rec(actRow.includes(`F-001 · ${T("Retention period not defined (edited)")}`), "Actions workspace: related Finding 'F-001 · title'");
  await page.getByLabel("Search actions").fill("F-001");
  rec((await page.locator("tbody tr").count()) === 1, "Actions search 'F-001' → the action of Finding 1");

  // ===== Search =====
  await page.goto(`${P(f.P.a)}/findings`);
  await page.locator("tbody tr").first().waitFor();
  const visibleNos = async () => (await page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => tr.children[0].textContent.trim())));
  const searches = {};
  for (const q of ["F-001", "001", "1", "f-2", "Retention"]) {
    await page.getByLabel("Search findings").fill(q);
    await page.waitForTimeout(300);
    searches[q] = (await visibleNos()).join(",");
  }
  // "F-…" is unambiguous → only that Finding; bare digits also keep the normal text search (e.g. "001" in "ISO 9001"), so Finding 1 must be among the results.
  const has = (q, no) => searches[q].split(",").includes(no);
  rec(searches["F-001"] === "F-001" && has("001", "F-001") && has("1", "F-001") && searches["f-2"] === "F-002" && searches["Retention"] === "F-001", `Search: F-001 → ${searches["F-001"]}, 001 → ${searches["001"]}, 1 → ${searches["1"]}, f-2 → ${searches["f-2"]}, Retention → ${searches["Retention"]}`);

  // ===== Delete / recreate: no reuse =====
  rec(await deleteFinding(page, f.P.a, f3.id), "Delete F-003 (Phase 4F rule: open, no actions / evidence)");
  await newFinding(page, f.P.a, "Observation", T("After deleting three"));
  rec(await wait(page.getByText("Finding F-004 created.").first()), "Next Finding after deleting F-003: F-004 (not F-003)");
  rec(await deleteFinding(page, f.P.a, f2.id), "Delete F-002");
  await newFinding(page, f.P.a, "Opportunity for Improvement", T("After deleting two"));
  rec(await wait(page.getByText("Finding F-005 created.").first()) && counter(f.P.a) === 5, "Next Finding after deleting F-002: F-005; counter 5 (never decremented)");
  rec(JSON.stringify(findings(f.P.a).map((x) => x.finding_no)) === "[1,4,5]", "Project A numbers now 1, 4, 5 — gaps kept");

  // ===== Tamper over the Data API (consultant token) =====
  const patch = await rest("PATCH", `issues?id=eq.${f1.id}`, consultant.token, { finding_no: 99, title: T("Retention period not defined (edited)") });
  rec(patch.status < 300 && dbQuery(`select finding_no from issues where id='${f1.id}'`)[0].finding_no === 1, `Direct UPDATE finding_no = 99 (HTTP ${patch.status}): still 1`);
  const post = await rest("POST", "issues", consultant.token, { project_id: f.P.a, title: T("Forced number"), finding_no: 999 });
  rec(post.status === 201 && post.json?.[0]?.finding_no === 6, `Direct INSERT with finding_no 999: assigned ${post.json?.[0]?.finding_no} instead`);
  const ctr = await Promise.all([
    rest("GET", `project_finding_counters?select=*`, consultant.token),
    rest("POST", "project_finding_counters", consultant.token, { project_id: f.P.b, last_finding_no: 0 }),
    rest("PATCH", `project_finding_counters?project_id=eq.${f.P.a}`, consultant.token, { last_finding_no: 0 }),
    rest("DELETE", `project_finding_counters?project_id=eq.${f.P.a}`, consultant.token),
    rest("GET", `project_finding_counters?select=*`, null),
  ]);
  rec(ctr.every((r) => r.status >= 400) && counter(f.P.a) === 6, `Counter over the API: SELECT / INSERT / UPDATE / DELETE refused (${ctr.map((r) => r.status).join(" / ")}), counter intact`);
  const rpc = await http("POST", "/rest/v1/rpc/assign_finding_no", { token: consultant.token, body: {} });
  rec(rpc.status >= 400, `assign_finding_no() not callable over the API (HTTP ${rpc.status})`);
  await ctx.close();

  // ===== Consultant creates + sees + searches =====
  const c = await open(1280, 800, "consultant");
  await newFinding(c.page, f.P.a, "Observation", T("Consultant observation"));
  rec(await wait(c.page.getByText("Finding F-007 created.").first()), "Consultant creates a Finding: 'Finding F-007 created.' (trigger numbers it without any grant on the counter)");
  await c.page.goto(`${P(f.P.a)}/findings`);
  await c.page.getByLabel("Search findings").fill("7");
  await c.page.waitForTimeout(300);
  rec(flat(await c.page.locator("tbody tr").first().innerText()).startsWith("F-007"), "Consultant searches '7' → F-007");
  await c.ctx.close();

  // ===== Isolation =====
  const bPost = await rest("POST", "issues", admin.token, { project_id: f.P.b, title: T("Project B finding") });
  rec(bPost.json?.[0]?.finding_no === 1, "Project B's first Finding is also F-001 (numbers are per project)");
  const iso = await open(1280, 800);
  await iso.page.goto(`${P(f.P.a)}/findings/${bPost.json?.[0]?.id}`);
  await iso.page.getByText("Page not found").waitFor({ timeout: 20000 }).catch(() => {});
  const isoBody = await iso.page.locator("body").innerText();
  rec(/Page not found/.test(isoBody) && !isoBody.includes("Project B finding"), "Project B Finding through a Project A URL: 'Page not found', nothing leaked");
  await iso.ctx.close();

  // ===== Concurrency =====
  const ins = (p, i, tok) => rest("POST", "issues", tok, { project_id: p, title: T(`Concurrent ${i}`) });
  let res = await Promise.all(Array.from({ length: 10 }, (_, i) => ins(f.P.c1, i, i % 2 ? consultant.token : admin.token)));
  const nos = res.map((r) => r.json?.[0]?.finding_no).sort((a, b) => a - b);
  rec(res.every((r) => r.status === 201) && JSON.stringify(nos) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), `10 simultaneous inserts in one project (admin + consultant): all 201, numbers ${nos.join(",")}`);
  res = await Promise.all([...Array.from({ length: 10 }, (_, i) => ins(f.P.c2, i, admin.token)), ...Array.from({ length: 10 }, (_, i) => ins(f.P.c3, i, consultant.token))]);
  const n2 = res.slice(0, 10).map((r) => r.json?.[0]?.finding_no).sort((a, b) => a - b), n3 = res.slice(10).map((r) => r.json?.[0]?.finding_no).sort((a, b) => a - b);
  rec(res.every((r) => r.status === 201) && n2.join() === "1,2,3,4,5,6,7,8,9,10" && n3.join() === "1,2,3,4,5,6,7,8,9,10", "2 × 10 simultaneous inserts in two projects: each 1..10, independent");
  res = await Promise.all(Array.from({ length: 20 }, (_, i) => ins(f.P.c1, `b${i}`, i % 2 ? consultant.token : admin.token)));
  const n4 = res.map((r) => r.json?.[0]?.finding_no).sort((a, b) => a - b);
  rec(res.every((r) => r.status === 201) && n4[0] === 11 && n4[19] === 30 && new Set(n4).size === 20 && counter(f.P.c1) === 30, "Another 20 simultaneous inserts: 11..30, no duplicates, counter 30");

  // ===== Performance =====
  const ts = Date.now();
  let okSeq = true;
  for (let i = 0; i < 100; i++) {
    const r = await ins(f.P.perf, `p${i}`, admin.token);
    if (r.status !== 201 || r.json?.[0]?.finding_no !== i + 1) okSeq = false;
  }
  const seqMs = Date.now() - ts;
  rec(okSeq, `100 sequential inserts: numbers 1..100 in order, ${seqMs} ms total (${(seqMs / 100).toFixed(0)} ms each, over the network)`);
  const pf = await open(1280, 800);
  const tl = Date.now();
  await pf.page.goto(`${P(f.P.perf)}/findings`);
  await pf.page.locator("tbody tr").first().waitFor({ timeout: 30000 });
  const rows = await pf.page.locator("tbody tr").count();
  rec(rows === 100, `Findings list with 100 numbered Findings: ${Date.now() - tl} ms`);
  await pf.page.getByLabel("Search findings").fill("F-100");
  await pf.page.waitForTimeout(300);
  rec((await pf.page.locator("tbody tr").count()) === 1 && flat(await pf.page.locator("tbody tr").first().innerText()).startsWith("F-100"), "Search 'F-100' among 100 → exactly F-100");
  await pf.ctx.close();

  // ===== Report readiness =====
  const ready = await rest("GET", `issues?select=finding_no,title&activity_id=eq.${f.act}`, admin.token);
  rec(ready.status === 200 && Array.isArray(ready.json), `finding_no is directly queryable (activity-scoped select, HTTP ${ready.status})`);

  // ===== Mobile =====
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    await m.page.goto(`${P(f.P.a)}/findings`);
    await m.page.getByText(T("Consultant observation")).last().waitFor({ timeout: 20000 }); // mobile card (the desktop table copy is hidden)
    const cardText = flat(await m.page.locator("a", { hasText: T("Consultant observation") }).last().innerText());
    rec(cardText.startsWith("F-007") && await noHOverflow(m.page), `${w}px Findings card: '${cardText.slice(0, 40)}…', no overflow`);
    await m.page.goto(`${P(f.P.a)}/findings/${f1.id}`);
    rec(/^F-001 ·/.test(flat(await m.page.getByRole("heading", { level: 1 }).innerText())) && await noHOverflow(m.page), `${w}px Finding Detail header with F-001, no overflow`);
    await m.page.goto(`${P(f.P.a)}/actions`);
    await m.page.getByText(T("Define retention periods in the procedure")).last().waitFor({ timeout: 20000 });
    rec(/Finding: F-001 · /.test(flat(await m.page.locator("main").innerText())) && await noHOverflow(m.page), `${w}px Action card: 'Finding: F-001 · …', no overflow`);
    await shot(m.page, `m${w}-actions`);
    await m.ctx.close();
  }
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0] + " " + String(e.stderr ?? "").replace(/\s+/g, " ").slice(0, 300));
} finally {
  await browser.close();
  const fixtureProjects = dbQuery(`select id from projects where client_id in (select id from clients where name like '${PFX}%')`).map((r) => r.id);
  const removed = await cleanupP6a(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like '${PFX}%')::int c, (select count(*) from issues)::int i, (select count(*) from actions)::int a, (select count(*) from project_finding_counters)::int ctr, (select count(*) from project_finding_counters where project_id in ('${fixtureProjects.join("','") || "00000000-0000-0000-0000-000000000000"}'))::int fctr`)[0];
  rec(left.c === 0 && left.i === 0 && left.a === 0 && left.fctr === 0, `Cleanup: fixtures removed (+${removed} objects); fixture projects' counters gone through the project cascade (remaining counters ${left.ctr})`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
