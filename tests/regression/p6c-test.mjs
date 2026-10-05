import { chromium } from "playwright-core";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { users, makeReporter, signIn, dbQuery } from "./common.mjs";
import { createFixtures, createPerformanceData, cleanupP6c, PFX } from "./p6c-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p6c-shots");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const info = (m) => console.log(`INFO  ${m}`);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });
const T = (s) => `${PFX}${s}`;
const state = (p) =>
  dbQuery(`select
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from activities t where project_id='${p}') a,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from verification_items t where project_id='${p}') v,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from issues t where project_id='${p}') i,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from actions t where project_id='${p}') ac,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from attachments t where project_id='${p}') at,
    (select count(*)::int from files where project_id='${p}') f`)[0];

const admin = await signIn("admin");
const t0 = Date.now();
const f = await createFixtures(admin.token);
info(`fixtures ${Math.round((Date.now() - t0) / 1000)} s`);
const ACT = (id, p = f.p) => `${APP}/projects/${p}/activities/${id}`;
const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function open(width, height, who = "admin") {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: "Asia/Ho_Chi_Minh" });
  const page = await ctx.newPage();
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
  return { ctx, page };
}
const rs = (p) => p.getByTestId("activity-report-summary");
async function openReport(page, id, p = f.p) {
  const t = Date.now();
  await page.goto(ACT(id, p));
  await rs(page).waitFor({ timeout: 30000 });
  return Date.now() - t;
}
const metrics = async (p) => flat(await p.getByTestId("report-verification-metrics").innerText());
const findingNos = async (p) => (await rs(p).getByTestId("report-finding").evaluateAll((els) => els.map((e) => e.querySelector("span")?.textContent?.trim())));
const actionTexts = async (p) => (await rs(p).getByTestId("report-action").allInnerTexts()).map(flat);

try {
  const before = state(f.p);
  const { ctx, page } = await open(1280, 800);

  // ===== Activity A =====
  const msA = await openReport(page, f.A);
  info(`Activity A load ${msA} ms`);
  const order = await page.locator("section h2").allInnerTexts();
  rec(JSON.stringify(order) === JSON.stringify(["Plan", "Verification", "General Activity Evidence", "Outcome / Activity Summary", "Activity Report Summary"]), `Section order: ${order.join(" → ")} (report summary after the consultant narrative)`);
  // 6D: the real Export Report button now exists (enabled); still no disabled / "Coming soon" control.
  rec(!/coming soon/i.test(await rs(page).innerText()) && (await rs(page).getByRole("button", { name: "Export Report" }).count()) === 1 && await rs(page).getByRole("button", { name: "Export Report" }).isEnabled(), "No 'Coming soon' control; one enabled Export Report (6D)");
  const m = await metrics(page);
  rec(/4 executed/.test(m) && /2 Verified OK/.test(m) && /1 Issue Identified/.test(m) && /1 Follow-up Required/.test(m), `A: executed here 4 — incl. a check planned for another activity — 2 OK / 1 Issue / 1 Follow-up ("${m}")`);
  rec(/1 planned, not completed/.test(m) && /1 completed in another activity/.test(m), "B / C: '1 planned, not completed', '1 completed in another activity' kept apart from the results");
  const issues = (await rs(page).getByTestId("report-verification-issue").allInnerTexts()).map(flat);
  rec(issues.length === 2 && issues.some((t) => t.includes(T("Is secondary containment provided?")) && /ISO 14001:2015 · 8\.1 — /.test(t) && t.includes("No bund at drum store.") && t.includes(`F-001 · ${T("No secondary containment at drum store")}`)) && issues.some((t) => t.includes(T("Are waste records complete?"))) && !issues.some((t) => /SDS|spill kit|permits|emergency drill/i.test(t)), "Issue list: only Issue Identified / Follow-up Required checks executed here, with requirement, notes and 'F-001 · title'");
  const nos = await findingNos(page);
  rec(JSON.stringify(nos) === JSON.stringify(["F-001", "F-002", "F-005"]), `Findings: activity_id = A only, by number (${nos.join(", ")}) — D verification-origin, E manual, F Gap Assessment-origin; G project-wide F-004 and B's F-003 absent`);
  const fText = flat(await rs(page).getByTestId("report-finding").first().innerText());
  rec(/F-001/.test(fText) && /Nonconformity/i.test(fText) && /High/i.test(fText) && /Open/i.test(fText) && fText.includes(T("No secondary containment at drum store")) && fText.includes("Drums stored without bunding.") && /ISO 14001:2015 · 8\.1/.test(fText), "Finding row: number, type, priority, status, title, description, requirement");
  const f2 = flat(await rs(page).getByTestId("report-finding").nth(1).innerText());
  rec(/Long An/.test(f2) && !/Viet Long/.test(fText), "Finding site shown only where it differs from the Activity's site (Long An), not repeated otherwise");
  rec(!/Correction|Root Cause|Effectiveness/i.test(await rs(page).innerText()), "No NC response / effectiveness in the summary");
  const acts = await actionTexts(page);
  rec(acts.length === 3, `Actions: 3 (union of activity_id = A and actions of A's Findings) — got ${acts.length}`);
  rec(acts.filter((t) => t.includes(T("Train storekeepers on containment"))).length === 1, "J: Action on both paths appears once");
  rec(acts[0].includes(T("Install bund at drum store")) && /Overdue/i.test(acts[0]) && /F-001/.test(acts[0]) && /Owner: Plant Manager/.test(acts[0]), "I: Finding-linked Action without activity_id included — F-001, owner, Overdue (existing rule), listed first");
  rec(acts[2].includes(T("Send visit notes to client")) && /Standalone/.test(acts[2]) && /Closed/i.test(acts[2]), "H: standalone Activity Action included, Closed last");
  rec(!acts.some((t) => t.includes(T("Display permits at gate"))), "Unrelated Action (Activity B / its Finding) not included");
  const evText = flat(await rs(page).innerText());
  const grp = async (k) => rs(page).getByTestId(`report-evidence-${k}`).getByTestId("report-evidence-item").count();
  rec(/Evidence \(4\)/i.test(evText) && (await grp("activity")) === 1 && (await grp("verification")) === 1 && (await grp("finding")) === 1 && (await grp("action")) === 1, "K: Evidence total 4 — Activity 1 / Verification 1 / Finding 1 / Action 1, no duplicates");
  rec(!/permits\.jpg|BMARKER/.test(evText) && /F-001 · /.test(flat(await rs(page).getByTestId("report-evidence-finding").innerText())), "Evidence of a check completed elsewhere and of Project B absent; Finding Evidence named 'F-001 · …'");
  // on-click signed link (fixture files have no stored object → friendly message, nothing pre-generated)
  rec(!/token=|\/storage\/v1\//.test(await page.content()), "No signed URL in the page before a click");
  await rs(page).getByTestId("report-evidence-action").getByRole("button", { name: "Download" }).click();
  rec(await wait(rs(page).getByText("File is unavailable.")), "Download uses the existing on-click link flow (missing object → 'File is unavailable.')");
  await shot(page, "d-activity-a", true);

  // ===== Activity B (cross-activity) =====
  await openReport(page, f.B);
  const mb = await metrics(page);
  rec(/1 executed/.test(mb) && /1 Issue Identified/.test(mb) && /1 completed in another activity/.test(mb), `B: the check planned for A but done in B counts here (1 Issue Identified); B's own check done in A shows as 'completed in another activity' ("${mb}")`);
  rec(JSON.stringify(await findingNos(page)) === JSON.stringify(["F-003"]) && (await actionTexts(page)).length === 1, "B: its Verification-origin Finding F-003 and its Action only");

  // ===== Empty =====
  await openReport(page, f.E);
  const et = flat(await rs(page).innerText());
  rec(/No checks executed\./.test(et) && /No Findings recorded\./.test(et) && /No Actions recorded\./.test(et) && /No report Evidence recorded\./.test(et) && (await rs(page).getByTestId(/report-evidence-/).count()) === 0, "L: empty Activity — four one-line empty states, no empty boxes");

  // ===== Read-only =====
  rec(JSON.stringify(state(f.p)) === JSON.stringify(before), "Viewing the reports changed nothing (Activities / checks / Findings / Actions / attachments / files)");

  // ===== Isolation / anon =====
  const cross = await page.goto(ACT(f.XB));
  await page.getByText("Page not found").waitFor({ timeout: 20000 }).catch(() => {});
  const body = await page.locator("body").innerText();
  rec(/Page not found/.test(body) && !/BMARKER/.test(body), `N: Project B Activity through a Project A URL → 'Page not found' (HTTP ${cross.status()}), nothing leaked`);
  await ctx.close();
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(ACT(f.A));
  rec(/\/login/.test(anon.url()), "Signed out: Activity Detail redirects to login");
  await anon.context().close();

  // ===== Consultant =====
  const c = await open(1280, 800, "consultant");
  await openReport(c.page, f.A);
  rec(JSON.stringify(await findingNos(c.page)) === JSON.stringify(["F-001", "F-002", "F-005"]) && (await actionTexts(c.page)).length === 3, "Consultant sees the same Report Summary");
  await c.ctx.close();

  // ===== Mobile =====
  for (const w of [390, 412]) {
    const mo = await open(w, 844);
    await openReport(mo.page, f.A);
    const hasF = (await mo.page.getByTestId("report-finding").first().innerText()).includes("F-001");
    const evRow = mo.page.getByTestId("report-evidence-activity").getByTestId("report-evidence-item");
    const evOk = await evRow.evaluate((el) => el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1);
    rec(hasF && evOk && await noHOverflow(mo.page), `M ${w}px: metrics / F-001 / actions / long evidence file name wrap, no horizontal overflow`);
    await rs(mo.page).evaluate((el) => el.scrollIntoView());
    await shot(mo.page, `m${w}-report`, true);
    await mo.ctx.close();
  }

  // ===== Performance =====
  createPerformanceData(f.p, f.PERF, f.vl);
  const pf = await open(1280, 800);
  const times = [];
  for (let i = 0; i < 3; i++) times.push(await openReport(pf.page, f.PERF));
  const pm = await metrics(pf.page);
  const pFind = await pf.page.getByTestId("report-finding").count();
  const pAct = await pf.page.getByTestId("report-action").count();
  const pEv = await pf.page.getByTestId("report-evidence-item").count();
  rec(/50 executed/.test(pm) && pFind === 20 && pAct === 30 && pEv === 40, `Performance fixture: 50 checks / 20 Findings / 30 Actions / 40 Evidence all shown; Activity Detail ${times.join(" / ")} ms`);
  info(`PERF Activity Detail (50 / 20 / 30 / 40): ${times.join(" / ")} ms`);
  await pf.ctx.close();
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0] + " " + String(e.stderr ?? "").replace(/\s+/g, " ").slice(0, 300));
} finally {
  await browser.close();
  const removed = await cleanupP6c(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like '${PFX}%')::int c, (select count(*) from issues)::int i, (select count(*) from actions)::int a, (select count(*) from attachments)::int at, (select count(*) from files)::int f`)[0];
  rec(left.c === 0 && left.i === 0 && left.a === 0 && left.at === 0 && left.f === 0, `Cleanup: fixtures removed (+${removed} objects); issues / actions / attachments / files 0`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
