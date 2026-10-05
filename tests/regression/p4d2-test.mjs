import { chromium } from "playwright-core";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { REPO, users, makeReporter, http, signIn, dbQuery } from "./common.mjs";
import { createFixtures } from "./p4d2-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p4d2-files");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const noHOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const wait = (l, timeout = 15000) => l.waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
const gone = (l, timeout = 15000) => l.waitFor({ state: "hidden", timeout }).then(() => true).catch(() => false);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const t = (s) => `P4D2-ACCEPT-${s}`;

const snapshotSql = `select
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.verification_items t where project_id in (select id from public.projects where name not like 'P4D2-ACCEPT-%')) as vi,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.activities t where project_id in (select id from public.projects where name not like 'P4D2-ACCEPT-%')) as act,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.projects t where name not like 'P4D2-ACCEPT-%') as proj,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.clients t where name not like 'P4D2-ACCEPT-%') as cl,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.sites t where client_id in (select id from public.clients where name not like 'P4D2-ACCEPT-%')) as st,
  (select md5(coalesce(string_agg(t::text,'|' order by project_id, framework_id),'')) from public.project_frameworks t where project_id in (select id from public.projects where name not like 'P4D2-ACCEPT-%')) as pf,
  (select count(*) from public.frameworks) as frameworks, (select count(*) from public.framework_items) as items,
  (select count(*) from public.activity_types) as atypes,
  (select count(*) from public.issues where project_id in (select id from public.projects where name not like 'P4D2-ACCEPT-%')) as issues,
  (select count(*) from public.actions where project_id in (select id from public.projects where name not like 'P4D2-ACCEPT-%')) as actions,
  (select count(*) from public.attachments) as attachments, (select count(*) from public.files) as files`;

const before = dbQuery(snapshotSql)[0];
console.log("BEFORE", JSON.stringify(before));
rec(before.issues === 0 && before.actions === 0 && before.attachments === 0 && before.files === 0, "Pre-flight: issues/actions/attachments/files all 0");
const admin = await signIn("admin");
const consultant = await signIn("consultant");
rec(admin.ok && consultant.ok, "Setup: admin and consultant sign-in");
const ADMIN_NAME = dbQuery(`select coalesce(display_name, email) n from profiles where id='${admin.userId}'`)[0].n;

const f = createFixtures();
const F = f.F;
writeFileSync(path.join(OUT, "fixture-ids.json"), JSON.stringify(f));
const FIND = `${APP}/projects/${f.projectA}/findings`;
const issue = (id) => dbQuery(`select * from issues where id='${id}'`)[0];

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function login(page, who = "admin") {
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
}
const dlg = (page) => page.getByRole("dialog");
const panel = (page) => page.getByTestId("close-panel");
async function openF(page, id) {
  await page.goto(`${FIND}/${id}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
}
/** Click header "Close Finding" and wait for the server evaluation to render. */
async function startClose(page) {
  await page.getByRole("button", { name: "Close Finding" }).first().click();
  await panel(page).waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector('[data-testid="close-panel"]')?.textContent?.includes("Checking whether"), null, { timeout: 15000 });
  return flat(await panel(page).innerText());
}
async function tamper(page, replacements) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      let body = req.postData() ?? "";
      for (const [a, b] of replacements) body = body.split(a).join(b);
      return route.continue({ postData: body });
    }
    return route.continue();
  });
}
const untamper = (page) => page.unroute("**/*");
async function waitDb(fn, ms = 12000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 600)); } return false; }
async function recordEff(page, result, notes) {
  await page.getByRole("button", { name: /(Record|Edit) Effectiveness Review/ }).click();
  const d = dlg(page);
  await d.waitFor({ state: "visible" });
  await d.getByRole("button", { name: result, exact: true }).click();
  if (notes !== undefined) await d.locator("#eff-notes").fill(notes);
  await d.getByRole("button", { name: "Save" }).click();
  return gone(d);
}
async function closeActionOnCard(page, desc) {
  const c = page.locator('[data-testid="action-card"]', { hasText: desc }).first();
  await c.getByLabel("Action status").selectOption("closed");
  await c.getByRole("button", { name: "Close Action" }).click();
}
const hasCloseAnyway = async (page) => (await panel(page).getByRole("button", { name: "Close Anyway" }).count()) === 1;

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await login(page, "admin");

  // ===== FULL NC END-TO-END (real UI) =====
  let e2e;
  {
    await page.goto(FIND);
    await page.getByRole("button", { name: "+ New Finding" }).first().click();
    await dlg(page).getByRole("button", { name: "Nonconformity", exact: true }).click();
    await dlg(page).locator("#fd-title").fill(t("Chemical containers stored without secondary containment"));
    await dlg(page).getByRole("button", { name: "Create" }).click();
    await gone(dlg(page));
    e2e = dbQuery(`select * from issues where title='${t("Chemical containers stored without secondary containment")}'`)[0];
    await openF(page, e2e.id);
    const order = await page.locator("section h2").allInnerTexts();
    // Updated in 4F: Evidence section added in 4E; "Not reviewed yet." empty state from 4E.6.
    rec(JSON.stringify(order) === JSON.stringify(["Finding", "Progress", "NC Response", "Corrective Actions", "Effectiveness Review", "Evidence", "Origin"]), `NC order: ${order.join(" → ")}`);
    const eff = flat(await page.getByTestId("effectiveness").innerText());
    rec(/Not reviewed yet\./.test(eff) && !/Reviewed By/i.test(eff), `Effectiveness before review: "Not reviewed yet." ("${eff.slice(0, 120)}")`);
    rec(/Effectiveness Review Not Reviewed/.test(flat(await page.getByTestId("nc-progress").innerText())), "Progress includes 'Effectiveness Review Not Reviewed'");
    await page.getByRole("button", { name: "Edit NC Response" }).click();
    await dlg(page).locator("#nc-correction").fill(f.C);
    await dlg(page).locator("#nc-root-cause").fill(f.R);
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    for (const desc of ["Update procedure", "Update checklist", "Train staff"]) {
      await page.getByRole("button", { name: "+ Add Corrective Action" }).click();
      await dlg(page).locator("#ac-description").fill(t(desc));
      await dlg(page).getByRole("button", { name: "Create" }).click();
      await gone(dlg(page));
      await page.locator('[data-testid="action-card"]', { hasText: t(desc) }).waitFor();
    }
    for (const desc of ["Update procedure", "Update checklist", "Train staff"]) {
      await closeActionOnCard(page, t(desc));
      await waitDb(() => dbQuery(`select status from actions where description='${t(desc)}'`)[0].status === "closed");
    }
    await page.getByTestId("nc-progress").getByText("3 of 3 Closed").waitFor({ timeout: 10000 });
    // Record Effectiveness: blank submit rejected
    await page.getByRole("button", { name: "Record Effectiveness Review" }).click();
    await dlg(page).waitFor({ state: "visible" });
    rec((await dlg(page).getByRole("heading").first().innerText()) === "Record Effectiveness Review", "Drawer: Record Effectiveness Review");
    rec((await dlg(page).getByRole("button", { name: /Partially|Pending/ }).count()) === 0 && (await dlg(page).getByRole("button", { name: "Effective", exact: true }).count()) === 1 && (await dlg(page).getByRole("button", { name: "Not Effective", exact: true }).count()) === 1, "Result options: Effective / Not Effective only");
    await dlg(page).getByRole("button", { name: "Save" }).click();
    rec(await wait(dlg(page).getByText("Select a result.")), "No blank submit");
    await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page));
    rec(await recordEff(page, "Effective", "  Follow-up inspection found no recurrence.  "), "Record Effective with notes");
    const r = issue(e2e.id);
    rec(r.effectiveness_result === "effective" && r.effectiveness_notes === "Follow-up inspection found no recurrence." && r.effectiveness_reviewed_by === admin.userId && Math.abs(Date.now() - new Date(r.effectiveness_reviewed_at).getTime()) < 5 * 60000, "DB: effective, notes trimmed, reviewed_by = user, reviewed_at = server time");
    rec(r.correction === f.C && r.root_cause === f.R && r.status === "open", "DB: correction/root cause/status untouched by the review");
    await page.getByTestId("effectiveness").getByText("Effective", { exact: true }).waitFor({ timeout: 10000 });
    const effT = flat(await page.getByTestId("effectiveness").innerText());
    rec(effT.includes("Follow-up inspection found no recurrence.") && effT.includes(ADMIN_NAME) && !UUID.test(effT) && /Reviewed At \w{3} \d{1,2}, \d{4}/i.test(effT), `Effectiveness shows result, notes, reviewer name, formatted date ("${effT.slice(0, 160)}")`);
    rec(/Correction Complete Root Cause Analysis Complete Corrective Actions 3 of 3 Closed Effectiveness Review Effective/.test(flat(await page.getByTestId("nc-progress").innerText())), "Progress: Complete / Complete / 3 of 3 Closed / Effective");
    rec((await page.getByRole("button", { name: "Edit Effectiveness Review" }).count()) === 1, "Button becomes 'Edit Effectiveness Review'");
    const txt = await startClose(page);
    rec(/Close Finding\?/.test(txt) && /All recorded Corrective Actions are closed and the current response has no closure warnings\./.test(txt) && !(await hasCloseAnyway(page)), "Clean close confirmation (no warnings, no Close Anyway)");
    await panel(page).getByRole("button", { name: "Close Finding" }).click();
    rec(await wait(page.getByText("Finding closed")), "NC closed");
    const c = issue(e2e.id);
    rec(c.status === "closed" && c.closed_by === admin.userId && Math.abs(Date.now() - new Date(c.closed_at).getTime()) < 5 * 60000, "DB: status closed, closed_at server time, closed_by = user");
    rec(c.effectiveness_result === "effective" && c.correction === f.C, "DB: closing did not modify response/effectiveness");
    await page.getByRole("button", { name: "Reopen Finding" }).waitFor();
    const ro = ["Edit Finding", "Edit NC Response", "+ Add Corrective Action", "Edit Effectiveness Review", "Record Effectiveness Review", "Close Finding"];
    let none = true;
    for (const n of ro) if ((await page.getByRole("button", { name: n }).count()) > 0) none = false;
    rec(none && (await page.getByLabel("Action status").count()) === 0 && (await page.getByRole("button", { name: "Edit", exact: true }).count()) === 0, "Closed NC: everything read-only; only Reopen");
    await page.screenshot({ path: path.join(OUT, "desktop-nc-closed.png"), fullPage: true });
    rec(await noHOverflow(page), "Desktop: closed NC detail no overflow");
    // Actions workspace keeps the closed finding's actions
    await page.goto(`${APP}/projects/${f.projectA}/actions`);
    await page.locator("tbody tr").first().waitFor({ timeout: 15000 });
    const row = page.locator("tbody tr", { hasText: t("Update procedure") });
    rec(/Closed · finding closed/.test(flat(await row.innerText())) && await wait(row.getByRole("link", { name: t("Chemical containers stored without secondary containment") })), "Actions workspace: linked actions still visible (Closed, frozen) with Finding link");
    await page.goto(FIND);
    const lrow = page.locator("tbody tr", { hasText: t("Chemical containers stored without secondary containment") });
    rec(/Closed/.test(await lrow.innerText()), "Findings list: closed NC still listed as Closed");
  }

  // ===== REOPEN NC =====
  {
    await openF(page, e2e.id);
    await page.getByRole("button", { name: "Reopen Finding" }).click();
    const b = page.locator("div.bg-warning-soft");
    // Updated in 4F to the approved 4E.6 wording.
    rec(/Reopening this Finding clears the current Effectiveness Result and its reviewer and timestamp\. The effectiveness notes, Correction, Root Cause Analysis and Corrective Actions are kept\./.test(flat(await b.innerText())), "NC reopen confirmation text");
    await b.getByRole("button", { name: "Reopen Finding" }).click();
    rec(await wait(page.getByText("Finding reopened")), "NC reopened");
    const r = issue(e2e.id);
    rec(r.status === "open" && r.closed_at === null && r.closed_by === null && r.effectiveness_result === null && r.effectiveness_reviewed_by === null && r.effectiveness_reviewed_at === null, "DB: open; closed_*, effectiveness result/reviewer/time cleared");
    rec(r.effectiveness_notes === "Follow-up inspection found no recurrence." && r.correction === f.C && r.root_cause === f.R && dbQuery(`select count(*) c from actions where issue_id='${e2e.id}'`)[0].c === 3, "DB: effectiveness notes, correction, root cause, actions preserved");
    const txt = await startClose(page);
    rec(/Effectiveness Review has not been completed\./.test(txt) && await hasCloseAnyway(page), "Re-close after reopen: old Effective NOT reused — 'not completed' warning, Close Anyway");
    await panel(page).getByRole("button", { name: "Cancel" }).click();
  }

  // ===== BLOCKERS / WARNINGS MATRIX =====
  {
    await openF(page, F.openAction);
    let txt = await startClose(page);
    rec(/Cannot close this Finding/.test(txt) && /1 Corrective Action is still open\./.test(txt) && !(await hasCloseAnyway(page)) && (await panel(page).getByRole("button", { name: "Close Finding" }).count()) === 0, "Open action: hard blocked, no Close Anyway / Close");
    await panel(page).getByRole("button", { name: "Back" }).click();
    await closeActionOnCard(page, t("NC open action action 1"));
    await waitDb(() => dbQuery(`select status from actions where issue_id='${F.openAction}'`)[0].status === "closed");
    await page.getByTestId("nc-progress").getByText("1 of 1 Closed").waitFor({ timeout: 10000 });
    txt = await startClose(page);
    rec(/Close Finding\?/.test(txt) && !(await hasCloseAnyway(page)), "After closing the action: proceeds (clean — no remaining warnings)");
    await panel(page).getByRole("button", { name: "Close Finding" }).click();
    rec(await waitDb(() => issue(F.openAction).status === "closed"), "  ...closed");

    await openF(page, F.notEffective);
    txt = await startClose(page);
    rec(/Cannot close this Finding/.test(txt) && /Effectiveness Review result is Not Effective\./.test(txt) && !(await hasCloseAnyway(page)), "Not Effective: hard blocked, no Close Anyway");
    await panel(page).getByRole("button", { name: "Back" }).click();

    for (const [id, re, label] of [
      [F.noCorrection, /Correction has not been recorded\./, "Missing Correction"],
      [F.noRca, /Root Cause Analysis has not been recorded\./, "Missing RCA"],
      [F.noEff, /Effectiveness Review has not been completed\./, "Missing Effectiveness"],
    ]) {
      await openF(page, id);
      txt = await startClose(page);
      const w = (await panel(page).locator("li").allInnerTexts()).length;
      rec(re.test(txt) && w === 1 && /You can still close this Finding\./.test(txt) && await hasCloseAnyway(page), `${label}: exactly one warning, Close Anyway available`);
      await panel(page).getByRole("button", { name: "Close Anyway" }).click();
      rec(await waitDb(() => issue(id).status === "closed") && issue(id).closed_by === admin.userId, `${label}: Close Anyway closes`);
    }

    await openF(page, F.all3);
    txt = await startClose(page);
    rec(/Correction has not been recorded\./.test(txt) && /Root Cause Analysis has not been recorded\./.test(txt) && /Effectiveness Review has not been completed\./.test(txt) && !/Cannot close/.test(txt), "All 3 warnings, no hard blocker");
    rec(/No corrective actions are recorded\./.test(txt), "Zero actions shown as information, not a blocker");
    await page.screenshot({ path: path.join(OUT, "desktop-warning.png") });
    // server re-evaluates: tampered confirmWarnings=false must not close
    await tamper(page, [['"confirmWarnings":true', '"confirmWarnings":false']]);
    await panel(page).getByRole("button", { name: "Close Anyway" }).click();
    await page.waitForTimeout(2500);
    await untamper(page);
    rec(issue(F.all3).status === "open" && await wait(panel(page).getByRole("button", { name: "Close Anyway" })), "Server refuses to close with warnings unless confirmWarnings=true");
    await panel(page).getByRole("button", { name: "Close Anyway" }).click();
    rec(await waitDb(() => issue(F.all3).status === "closed"), "All 3 warnings: Close Anyway closes (intentional)");

    await openF(page, F.zeroEff);
    txt = await startClose(page);
    rec(/Close Finding\?/.test(txt) && !(await hasCloseAnyway(page)) && /No corrective actions are recorded\./.test(txt), "Zero actions + Effective: normal close (no action required)");
    await panel(page).getByRole("button", { name: "Close Finding" }).click();
    rec(await waitDb(() => issue(F.zeroEff).status === "closed"), "  ...closed");

    await openF(page, F.zeroNotEff);
    txt = await startClose(page);
    rec(/Cannot close/.test(txt) && /Not Effective/.test(txt) && !(await hasCloseAnyway(page)), "Zero actions + Not Effective: hard blocked");
    await panel(page).getByRole("button", { name: "Back" }).click();
  }

  // ===== NOT EFFECTIVE → RE-REVIEW =====
  {
    await openF(page, F.notEffective);
    await page.getByRole("button", { name: "Edit Effectiveness Review" }).click();
    await dlg(page).waitFor({ state: "visible" });
    rec((await dlg(page).getByRole("button", { name: "Not Effective", exact: true }).getAttribute("aria-pressed")) === "true", "Re-review preloads the current result");
    await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page));
    const before2 = issue(F.notEffective);
    rec(before2.status === "open" && dbQuery(`select count(*) c from actions where issue_id='${F.notEffective}'`)[0].c === 1 && dbQuery(`select count(*) c from issues where title like '${t("NC not effective")}%'`)[0].c === 1, "Not Effective: nothing auto-created or cleared; Finding stays Open");
    await page.getByRole("button", { name: "+ Add Corrective Action" }).click();
    await dlg(page).locator("#ac-description").fill(t("Rework action"));
    await dlg(page).getByRole("button", { name: "Create" }).click();
    await gone(dlg(page));
    rec(await wait(page.locator('[data-testid="action-card"]', { hasText: t("Rework action") })), "User can add another Corrective Action after Not Effective");
    await closeActionOnCard(page, t("Rework action"));
    await waitDb(() => dbQuery(`select status from actions where description='${t("Rework action")}'`)[0].status === "closed");
    rec(await recordEff(page, "Effective", "Second follow-up confirmed."), "Re-review to Effective");
    const r = issue(F.notEffective);
    rec(r.effectiveness_result === "effective" && r.effectiveness_notes === "Second follow-up confirmed." && new Date(r.effectiveness_reviewed_at) > new Date(before2.effectiveness_reviewed_at), "DB: result, notes and reviewed_at replaced (no history)");
    await page.getByTestId("effectiveness").getByText("Effective", { exact: true }).waitFor();
    const txt = await startClose(page);
    rec(!/Cannot close/.test(txt), "After re-review, closure is no longer blocked");
    await panel(page).getByRole("button", { name: /Close (Finding|Anyway)/ }).click();
    rec(await waitDb(() => issue(F.notEffective).status === "closed"), "  ...closed");
  }

  // ===== UNKNOWN REVIEWER FALLBACK =====
  {
    await openF(page, F.unknownReviewer);
    const e = flat(await page.getByTestId("effectiveness").innerText());
    rec(/Reviewed By Unknown user/i.test(e), "Reviewer profile missing: 'Unknown user', no crash");
  }

  // ===== SERVER TAMPERING / ISOLATION =====
  {
    // effectiveness: smuggled server-derived / other fields ignored
    await openF(page, F.noEff);
    rec((await page.getByRole("button", { name: /Effectiveness Review/ }).count()) === 0, "Closed NC: no effectiveness button");
    await openF(page, F.clean);
    await page.getByRole("button", { name: "Edit Effectiveness Review" }).click();
    await dlg(page).getByRole("button", { name: "Effective", exact: true }).click();
    await tamper(page, [['"result":', `"effectiveness_reviewed_by":"${consultant.userId}","effectiveness_reviewed_at":"2020-01-01T00:00:00Z","status":"closed","closed_by":"${consultant.userId}","correction":"HACK","title":"HACK","result":`]]);
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    await untamper(page);
    let r = issue(F.clean);
    rec(r.effectiveness_reviewed_by === admin.userId && new Date(r.effectiveness_reviewed_at).getFullYear() >= 2026 && r.status === "open" && r.closed_by === null && r.correction === f.C && !r.title.includes("HACK"), "Effectiveness: smuggled reviewer/time/status/closed_by/correction/title ignored");
    const tries = [
      ["invalid result", [['"result":"effective"', '"result":"partially_effective"']], /Select a result/],
      ["a closed Finding", [[F.clean, F.noEff]], /closed\. Reopen it to edit/],
      ["an Observation", [[F.clean, F.obsSmuggle]], /only recorded for a Nonconformity/],
      ["another project's Finding", [[F.clean, F.projB]], /finding could not be found/],
    ];
    for (const [label, rep, re] of tries) {
      await page.getByRole("button", { name: "Edit Effectiveness Review" }).click();
      await dlg(page).getByRole("button", { name: "Effective", exact: true }).click();
      await tamper(page, rep);
      await dlg(page).getByRole("button", { name: "Save" }).click();
      rec(await wait(dlg(page).getByText(re).first()), `Effectiveness rejected: ${label}`);
      await untamper(page);
      await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page));
    }
    rec(issue(F.obsSmuggle).effectiveness_result === null && issue(F.projB).effectiveness_result === null && issue(F.noEff).effectiveness_result === null, "  ...no effectiveness written to Observation / Project B / closed NC");
    // close: tampered id to a blocked NC / another project
    await tamper(page, [[F.clean, F.zeroNotEff]]);
    await startClose(page);
    rec(/Cannot close/.test(flat(await panel(page).innerText())), "Close state for a tampered id is evaluated from that Finding's real data");
    await untamper(page);
    await panel(page).getByRole("button", { name: "Back" }).click();
    await startClose(page);
    await tamper(page, [[F.clean, F.zeroNotEff]]);
    await panel(page).getByRole("button", { name: "Close Finding" }).click();
    await page.waitForTimeout(2500);
    await untamper(page);
    rec(issue(F.zeroNotEff).status === "open", "Server refuses to close a hard-blocked NC even when asked directly");
    await page.reload();
    await startClose(page);
    await tamper(page, [[F.clean, F.projB]]);
    await panel(page).getByRole("button", { name: "Close Finding" }).click();
    rec(await wait(panel(page).getByText(/finding could not be found/)), "Close via wrong project rejected (not found)");
    await untamper(page);
    rec(issue(F.projB).status === "open", "  ...Project B finding untouched");
    const body = await page.locator("body").innerText();
    rec(!body.includes("B secret NC") && !body.includes("B secret notes") && !body.includes("B secret NC action"), "No Project B title/notes/action text leaked");
    await page.reload();
    await startClose(page);
    await panel(page).getByRole("button", { name: "Close Finding" }).click();
    await waitDb(() => issue(F.clean).status === "closed");
    await page.getByRole("button", { name: "Reopen Finding" }).click();
    await tamper(page, [[F.clean, F.projB]]);
    await page.locator("div.bg-warning-soft").getByRole("button", { name: "Reopen Finding" }).click();
    rec(await wait(page.getByText(/finding could not be found/).first()), "Reopen via wrong project rejected");
    await untamper(page);
    await page.goto(`${FIND}/${F.projB}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const b2 = await page.locator("body").innerText();
    rec(/Page not found/.test(b2) && !b2.includes("B secret"), "Project B NC through Project A URL: not found, nothing leaked");
    // closed finding freezes actions (server)
    const frozenAction = dbQuery(`select id from actions where issue_id='${F.noCorrection}'`)[0].id;
    const openA = dbQuery(`select id, status from actions where issue_id='${F.typeChange}'`)[0];
    await openF(page, F.typeChange);
    await tamper(page, [[openA.id, frozenAction]]);
    await page.locator('[data-testid="action-card"]').first().getByLabel("Action status").selectOption("in_progress");
    await page.waitForTimeout(2500);
    await untamper(page);
    rec(dbQuery(`select status from actions where id='${frozenAction}'`)[0].status === "closed", "Server rejects a status change on an action of a closed NC");
    await page.reload();
    const cur = dbQuery(`select status from actions where id='${openA.id}'`)[0].status;
    if (cur !== "closed") { await closeActionOnCard(page, t("NC type change action 1")); await waitDb(() => dbQuery(`select status from actions where id='${openA.id}'`)[0].status === "closed"); }
  }

  // ===== TYPE CHANGE SAFETY =====
  {
    await openF(page, F.typeChange);
    await page.getByRole("button", { name: "Edit Finding" }).click();
    await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    await page.getByRole("heading", { name: "Actions", exact: true }).waitFor({ timeout: 10000 });
    const r = issue(F.typeChange);
    rec((await page.getByTestId("effectiveness").count()) === 0 && (await page.getByTestId("nc-response").count()) === 0 && r.effectiveness_result === "effective" && r.effectiveness_notes === "Kept notes" && r.correction === f.C, "NC → Observation: Effectiveness/NC Response hidden, values preserved");
    const txt = await startClose(page);
    rec(/Close Finding\?/.test(txt) && !/Effectiveness|Correction|Root Cause/.test(txt), "Observation closure ignores hidden NC fields");
    await panel(page).getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Edit Finding" }).click();
    await dlg(page).getByRole("button", { name: "Nonconformity", exact: true }).click();
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    await page.getByTestId("effectiveness").waitFor({ timeout: 25000 });
    rec(/Kept notes/.test(await page.getByTestId("effectiveness").innerText()) && /Effective/.test(await page.getByTestId("effectiveness").innerText()), "Back to NC: Effectiveness reappears");
    await startClose(page);
    await panel(page).getByRole("button", { name: "Close Finding" }).click();
    await waitDb(() => issue(F.typeChange).status === "closed");
    rec((await page.getByRole("button", { name: "Edit Finding" }).count()) === 0, "Closed: type cannot be changed without Reopen");
  }

  // ===== OBSERVATION / OFI REGRESSION =====
  {
    await openF(page, F.obsNone);
    rec((await page.getByTestId("effectiveness").count()) === 0, "Observation: no Effectiveness section");
    let txt = await startClose(page);
    rec(/Close Finding\?/.test(txt) && !(await hasCloseAnyway(page)), "Observation, no actions: Close allowed");
    await panel(page).getByRole("button", { name: "Close Finding" }).click();
    rec(await waitDb(() => issue(F.obsNone).status === "closed"), "  ...closed");
    for (const [id, desc, label] of [[F.obsOpen, t("Obs open action action 1"), "Observation"], [F.ofiOpen, t("OFI open action action 1"), "OFI"]]) {
      await openF(page, id);
      rec((await page.getByTestId("effectiveness").count()) === 0, `${label}: no Effectiveness section`);
      txt = await startClose(page);
      rec(/Cannot close/.test(txt) && /1 action is still open\./.test(txt), `${label}: blocked by an open action`);
      await panel(page).getByRole("button", { name: "Back" }).click();
      await closeActionOnCard(page, desc);
      await waitDb(() => dbQuery(`select status from actions where issue_id='${id}'`)[0].status === "closed");
      await page.reload();
      txt = await startClose(page);
      rec(/Close Finding\?/.test(txt), `${label}: allowed once the action is closed`);
      await panel(page).getByRole("button", { name: "Close Finding" }).click();
      rec(await waitDb(() => issue(id).status === "closed"), `  ...${label} closed`);
    }
  }

  // ===== VERIFICATION REGRESSION =====
  {
    await openF(page, F.linked);
    await startClose(page);
    await panel(page).getByRole("button", { name: "Close Finding" }).click();
    await waitDb(() => issue(F.linked).status === "closed");
    await page.goto(`${APP}/projects/${f.projectA}/activities/${f.actVL}`);
    await page.getByText("Verification", { exact: true }).first().waitFor({ timeout: 20000 });
    const card = page.locator("div.rounded-lg", { hasText: t("Q-issue") }).last();
    rec(/1 Finding/.test(await card.innerText()) && (await card.getByRole("link", { name: /^View F-\d{3,}$/ }) /* 6A: link names the number */.getAttribute("href")).endsWith(F.linked), "Closed linked Finding still counted; View Finding works");
    rec(dbQuery(`select result from verification_items where id='${f.vIssue}'`)[0].result === "issue_identified", "Verification result unchanged");
    const n0 = dbQuery(`select count(*) c from issues where project_id='${f.projectA}'`)[0].c;
    const ex = page.locator("div.rounded-lg", { hasText: t("Q-exec") }).last();
    await ex.getByRole("button", { name: "Verify" }).click();
    await dlg(page).getByRole("button", { name: "Issue Identified", exact: true }).click();
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    rec(await wait(ex.getByRole("button", { name: "Create Finding" })) && dbQuery(`select count(*) c from issues where project_id='${f.projectA}'`)[0].c === n0, "Issue Identified alone: 0 Findings auto-created");
  }

  // ===== QUERY APPROACH =====
  {
    const m = readFileSync(REPO + "/lib/mutations/findings.ts", "utf8");
    const lc = m.slice(m.indexOf("async function loadClosure"), m.indexOf("export async function getFindingClosureState"));
    rec((lc.match(/\.from\(/g) ?? []).length === 1 && /actions\(status\)/.test(lc), "Closure evaluation: ONE query (Finding + embedded action statuses)");
    const cf = m.slice(m.indexOf("export async function closeFinding"), m.indexOf("export async function recordEffectivenessReview"));
    rec(/loadClosure\(/.test(cf) && /evaluateFindingClosure|loadClosure/.test(cf) && !/hardBlockers:/.test(cf.replace(/evaluation/g, "")), "Close mutation re-evaluates server-side via the shared evaluator");
    const q = readFileSync(REPO + "/lib/queries/findings.ts", "utf8");
    rec(/effectiveness_result, effectiveness_notes, effectiveness_reviewed_by, effectiveness_reviewed_at, effectiveness_reviewer:profiles/.test(q), "Finding Detail loads effectiveness + reviewer in the same query");
  }

  // ===== AUTHORIZATION =====
  {
    const cctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const cp = await cctx.newPage();
    await login(cp, "consultant");
    await openF(cp, F.cons);
    rec(await recordEff(cp, "Effective", "Consultant review"), "Consultant records the effectiveness review");
    await startClose(cp);
    await panel(cp).getByRole("button", { name: "Close Finding" }).click();
    rec(await waitDb(() => issue(F.cons).status === "closed"), "Consultant closes the NC");
    const r = issue(F.cons);
    rec(r.effectiveness_reviewed_by === consultant.userId && r.closed_by === consultant.userId, "effectiveness_reviewed_by and closed_by = the consultant");
    const shown = flat(await cp.getByTestId("effectiveness").innerText());
    rec(/Reviewed By \S+@\S+/i.test(shown), `Reviewer without display name falls back to email ("${shown.match(/Reviewed By \S+/i)?.[0]}")`);
    await cctx.close();
    const anon = await fetch(`${FIND}/${F.cons}`, { redirect: "manual" });
    rec(anon.status >= 300 && anon.status < 400, `Anon: Finding Detail redirects (HTTP ${anon.status})`);
    const anonUpd = await http("PATCH", `/rest/v1/issues?id=eq.${F.all3}`, { body: { status: "open", effectiveness_result: "effective" } });
    rec(anonUpd.status >= 400 && issue(F.all3).status === "closed", `Anon: direct issues update denied (HTTP ${anonUpd.status})`);
  }

  // ===== MOBILE =====
  for (const width of [390, 412]) {
    const id = width === 390 ? F.m390 : F.m412;
    const mctx = await browser.newContext({ viewport: { width, height: 844 } });
    const mp = await mctx.newPage();
    await login(mp, "admin");
    await openF(mp, id);
    rec(await noHOverflow(mp), `Mobile ${width}: NC detail no overflow`);
    await mp.getByRole("button", { name: "Record Effectiveness Review" }).scrollIntoViewIfNeeded();
    await mp.getByRole("button", { name: "Record Effectiveness Review" }).click();
    const d = dlg(mp);
    await d.waitFor({ state: "visible" });
    const bh = await d.getByRole("button", { name: /^(Effective|Not Effective)$/ }).evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 40));
    rec((await d.boundingBox()).width >= width - 2 && bh && await d.locator("#eff-notes").isVisible(), `Mobile ${width}: full-width sheet, result buttons >= 40px, notes usable`);
    await d.getByRole("button", { name: "Effective", exact: true }).click();
    await d.locator("#eff-notes").fill("Mobile review");
    const saveOk = await d.getByRole("button", { name: "Save" }).evaluate((e) => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= window.innerHeight && !!top && (top === e || e.contains(top)); });
    rec(saveOk, `Mobile ${width}: Save reachable, not covered`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-eff-sheet.png`) });
    await d.getByRole("button", { name: "Save" }).click();
    await gone(d);
    await mp.getByTestId("effectiveness").getByText("Mobile review").waitFor({ timeout: 10000 });
    const effBox = await mp.getByTestId("effectiveness").boundingBox();
    rec(effBox.width <= width && /Reviewed By/i.test(await mp.getByTestId("effectiveness").innerText()), `Mobile ${width}: effectiveness section readable (reviewer/date)`);
    await mp.getByTestId("effectiveness").scrollIntoViewIfNeeded();
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-eff.png`) });
    await mp.evaluate(() => window.scrollTo(0, 0));
    const txt = await startClose(mp);
    rec(/Close Finding\?/.test(txt), `Mobile ${width}: Close Finding reachable, confirmation shown`);
    await panel(mp).getByRole("button", { name: "Close Finding" }).click();
    rec(await waitDb(() => issue(id).status === "closed"), `Mobile ${width}: closed`);
    await mp.getByRole("button", { name: "Reopen Finding" }).click();
    const rb = mp.locator("div.bg-warning-soft");
    rec(await rb.getByRole("button", { name: "Reopen Finding" }).isVisible() && await noHOverflow(mp), `Mobile ${width}: reopen confirmation usable`);
    await rb.getByRole("button", { name: "Reopen Finding" }).click();
    rec(await waitDb(() => issue(id).status === "open" && issue(id).effectiveness_result === null), `Mobile ${width}: reopened (effectiveness result cleared)`);
    await mp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const clear = await mp.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /Effectiveness Review/.test(x.textContent));
      const r = b.getBoundingClientRect(); const nav = document.querySelector('nav[class*="fixed"]');
      return { vis: r.bottom <= (nav ? nav.getBoundingClientRect().top : innerHeight) || r.top > 0 };
    });
    rec(clear.vis, `Mobile ${width}: controls not covered by bottom navigation`);
    if (width === 390) {
      await openF(mp, F.all3m);
      const w = await startClose(mp);
      const lis = await panel(mp).locator("li").allInnerTexts();
      const fits = await panel(mp).evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
      const btns = await panel(mp).getByRole("button", { name: /^(Cancel|Close Anyway)$/ }).evaluateAll((els) => els.length === 2 && els.every((e) => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; }));
      rec(lis.length === 3 && /You can still close/.test(w) && fits && btns && await noHOverflow(mp), `Mobile 390: warning dialog shows all 3 warnings, Cancel and Close Anyway, not clipped`);
      await mp.screenshot({ path: path.join(OUT, "mobile-390-warnings.png") });
      await panel(mp).getByRole("button", { name: "Close Anyway" }).click();
      rec(await waitDb(() => issue(F.all3m).status === "closed"), "Mobile 390: Close Anyway closes");
    }
    await mctx.close();
  }

  // ===== REGRESSION =====
  {
    await page.goto(FIND);
    rec(await wait(page.getByRole("link", { name: t("NC all warnings"), exact: true })), "Regression: Findings list");
    await page.getByLabel("Filter by Status").selectOption("closed");
    rec((await page.locator("tbody tr").count()) >= 10, "Regression: Findings status filter shows closed NCs");
    await page.goto(`${APP}/projects/${f.projectA}/actions`);
    rec(await wait(page.getByRole("button", { name: "+ New Action" })), "Regression: Actions workspace");
    await page.goto(`${APP}/projects/${f.projectA}/verification`);
    rec(await wait(page.getByRole("link", { name: "Import Excel" })), "Regression: Verification workspace");
    await page.goto(`${APP}/projects/${f.projectA}/verification/import`);
    rec(await wait(page.getByRole("heading", { name: "Import Verification Items" })), "Regression: Excel import");
    await page.goto(`${APP}/projects/${f.projectA}/plan`);
    rec(await wait(page.getByText(t("Site Assessment")).first()), "Regression: Master Plan");
    await page.goto(`${APP}/projects/${f.projectA}`);
    rec(await wait(page.getByRole("heading", { name: t("Project-A"), level: 1 })), "Regression: Project Overview");
    await page.goto(`${APP}/frameworks`);
    rec(await wait(page.getByText("ISO 14001").first()), "Regression: Framework Library");
  }

  await ctx.close();
} catch (e) {
  console.error("SCRIPT ERROR", e);
  rec(false, "script crashed: " + String(e).slice(0, 400));
} finally {
  await browser.close();
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
