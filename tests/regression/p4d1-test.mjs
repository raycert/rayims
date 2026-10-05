import { chromium } from "playwright-core";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { REPO, users, makeReporter, http, signIn, dbQuery } from "./common.mjs";
import { createFixtures, DAYS } from "./p4d1-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p4d1-files");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);

const noHOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const wait = (l, timeout = 15000) => l.waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
const gone = (l, timeout = 15000) => l.waitFor({ state: "hidden", timeout }).then(() => true).catch(() => false);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const t = (s) => `P4D1-ACCEPT-${s}`;

const snapshotSql = `select
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.verification_items t where project_id in (select id from public.projects where name not like 'P4D1-ACCEPT-%')) as vi,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.activities t where project_id in (select id from public.projects where name not like 'P4D1-ACCEPT-%')) as act,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.projects t where name not like 'P4D1-ACCEPT-%') as proj,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.clients t where name not like 'P4D1-ACCEPT-%') as cl,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.sites t where client_id in (select id from public.clients where name not like 'P4D1-ACCEPT-%')) as st,
  (select md5(coalesce(string_agg(t::text,'|' order by project_id, framework_id),'')) from public.project_frameworks t where project_id in (select id from public.projects where name not like 'P4D1-ACCEPT-%')) as pf,
  (select count(*) from public.frameworks) as frameworks, (select count(*) from public.framework_items) as items,
  (select count(*) from public.activity_types) as atypes,
  (select count(*) from public.issues where project_id in (select id from public.projects where name not like 'P4D1-ACCEPT-%')) as issues,
  (select count(*) from public.actions where project_id in (select id from public.projects where name not like 'P4D1-ACCEPT-%')) as actions,
  (select count(*) from public.attachments) as attachments, (select count(*) from public.files) as files`;

const before = dbQuery(snapshotSql)[0];
console.log("BEFORE", JSON.stringify(before));
rec(before.issues === 0 && before.actions === 0 && before.attachments === 0 && before.files === 0, "Pre-flight: issues/actions/attachments/files all 0");
const admin = await signIn("admin");
const consultant = await signIn("consultant");
rec(admin.ok && consultant.ok, "Setup: admin and consultant sign-in");

const f = createFixtures();
writeFileSync(path.join(OUT, "fixture-ids.json"), JSON.stringify(f));
const FIND = (p = f.projectA) => `${APP}/projects/${p}/findings`;
const ACTIONS = (p = f.projectA) => `${APP}/projects/${p}/actions`;
const finding = (title) => dbQuery(`select * from issues where title='${title}'`)[0];
const actionRow = (desc) => dbQuery(`select * from actions where description='${desc}'`)[0];

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function login(page, who = "admin") {
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
}
const dlg = (page) => page.getByRole("dialog");
const acard = (page, desc) => page.locator('[data-testid="action-card"]', { hasText: desc }).first();
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
async function cancel(page) { await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page)); }
async function newFinding(page, { type, title, activityLabel }) {
  await page.goto(FIND());
  await page.getByRole("heading", { name: "Findings", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "+ New Finding" }).first().click();
  await dlg(page).waitFor({ state: "visible" });
  await dlg(page).getByRole("button", { name: type, exact: true }).click();
  await dlg(page).locator("#fd-title").fill(title);
  if (activityLabel) await dlg(page).locator("#fd-activity").selectOption(await dlg(page).locator("#fd-activity option", { hasText: activityLabel }).first().getAttribute("value"));
  await dlg(page).getByRole("button", { name: "Create" }).click();
  await gone(dlg(page));
  const row = finding(title);
  await page.goto(`${FIND()}/${row.id}`);
  await page.getByRole("heading", { name: title, level: 1 }).waitFor({ timeout: 20000 });
  return row;
}
async function addAction(page, btn, { desc, owner, due, priority, activityLabel, projectWideActivity, site }) {
  await page.getByRole("button", { name: btn }).click();
  const d = dlg(page);
  await d.waitFor({ state: "visible" });
  await d.locator("#ac-description").fill(desc);
  if (owner) await d.locator("#ac-owner").fill(owner);
  if (due) await d.locator("#ac-due").fill(due);
  if (priority) await d.getByRole("button", { name: priority, exact: true }).click();
  if (projectWideActivity !== undefined) await d.locator("#ac-activity").selectOption(projectWideActivity);
  if (activityLabel) await d.locator("#ac-activity").selectOption(await d.locator("#ac-activity option", { hasText: activityLabel }).first().getAttribute("value"));
  if (site === "project_wide") await d.getByRole("button", { name: "Project-wide", exact: true }).click();
  else if (site) { await d.getByRole("button", { name: "Specific site", exact: true }).click(); await d.locator("#ac-site").selectOption({ label: site }); }
  await d.getByRole("button", { name: "Create" }).click();
  return gone(d);
}
async function setStatus(page, desc, status, notes) {
  const c = acard(page, desc);
  await c.getByLabel("Action status").selectOption(status);
  if (status === "closed") {
    if (notes !== undefined) await c.locator("textarea").fill(notes);
    await c.getByRole("button", { name: "Close Action" }).click();
  }
  await page.waitForTimeout(300);
  await page.waitForLoadState("networkidle").catch(() => {});
}
const progress = async (page) => flat(await page.getByTestId("nc-progress").innerText());
async function waitDb(fn, ms = 10000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 600)); } return false; }

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await login(page, "admin");

  // ===== 4C-2 REGRESSION: result alone creates no Finding; explicit Create Finding works =====
  {
    await page.goto(`${APP}/projects/${f.projectA}/activities/${f.actVL}`);
    await page.getByText("Verification", { exact: true }).first().waitFor({ timeout: 20000 });
    const vcard = page.locator("div.rounded-lg", { hasText: t("Q-exec") }).last();
    await vcard.getByRole("button", { name: "Verify" }).click();
    await dlg(page).waitFor({ state: "visible" });
    await dlg(page).getByRole("button", { name: "Issue Identified", exact: true }).click();
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    rec(await wait(vcard.getByRole("button", { name: "Create Finding" })) && dbQuery(`select count(*) c from issues where project_id='${f.projectA}'`)[0].c === 0, "4C-2 regression: Issue Identified alone creates 0 Findings; Create Finding offered");
    const icard = page.locator("div.rounded-lg", { hasText: t("Q-issue") }).last();
    await icard.getByRole("button", { name: "Create Finding" }).click();
    await dlg(page).waitFor({ state: "visible" });
    await dlg(page).getByRole("button", { name: "Nonconformity", exact: true }).click();
    await dlg(page).locator("#fd-title").fill(t("From verification NC"));
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await gone(dlg(page)) && finding(t("From verification NC")).verification_item_id === f.vIssue, "4C-2 regression: explicit Create Finding from Verification works");
  }

  // ===== NC: detail structure =====
  const nc = await newFinding(page, { type: "Nonconformity", title: t("Chemical containment NC"), activityLabel: "Site Assessment" });
  {
    const body = flat(await page.locator("body").innerText());
    rec(await wait(page.getByTestId("nc-progress")) && /Correction Pending Root Cause Analysis Pending Corrective Actions None recorded/.test(await progress(page)), `NC Progress: Correction/RCA Pending, Corrective Actions None recorded ("${await progress(page)}")`);
    rec(await wait(page.getByTestId("nc-response")) && /Immediate action taken to address the detected problem/.test(body) && /The identified cause or causes behind the nonconformity/.test(body), "NC Response section with helper text");
    rec(/Corrective Actions/.test(await page.getByTestId("finding-actions").innerText()) && /No corrective actions recorded/.test(body), "Corrective Actions section: 'No corrective actions recorded'");
    rec(/Effectiveness Review/.test(body), "Effectiveness Review section shown (added in 4D-2; expectation updated in 4F)");
    rec((await page.getByRole("button", { name: /Close Finding/ }).count()) === 1, "NC: Close Finding available (NC closure added in 4D-2; expectation updated in 4F)");
    const order = await page.locator("section h2").allInnerTexts();
    rec(JSON.stringify(order) === JSON.stringify(["Finding", "Progress", "NC Response", "Corrective Actions", "Effectiveness Review", "Evidence", "Origin"]), `NC section order: ${order.join(" → ")}`);
  }

  // ===== EDIT NC RESPONSE =====
  {
    await page.getByRole("button", { name: "Edit NC Response" }).click();
    await dlg(page).waitFor({ state: "visible" });
    await dlg(page).locator("#nc-correction").fill("   Moved affected chemical containers to spill trays.   ");
    await dlg(page).locator("#nc-root-cause").fill("  Chemical containment requirement was missing from the warehouse inspection checklist.  ");
    await dlg(page).getByRole("button", { name: "Save" }).click();
    rec(await gone(dlg(page)) && await wait(page.getByText("NC response saved")), "Edit NC Response saves");
    let r = dbQuery(`select * from issues where id='${nc.id}'`)[0];
    rec(r.correction === "Moved affected chemical containers to spill trays." && r.root_cause === "Chemical containment requirement was missing from the warehouse inspection checklist.", "DB: correction and root_cause stored trimmed");
    await page.getByTestId("nc-progress").getByText("Complete").first().waitFor({ timeout: 10000 });
    rec(/Correction Complete Root Cause Analysis Complete/.test(await progress(page)), "Progress: Correction Complete, RCA Complete");
    // blank -> NULL, not required
    await page.getByRole("button", { name: "Edit NC Response" }).click();
    await dlg(page).locator("#nc-root-cause").fill("   ");
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    rec(await waitDb(() => dbQuery(`select root_cause from issues where id='${nc.id}'`)[0].root_cause === null), "Blank Root Cause saved as NULL (not required, no 'N/A')");
    // smuggled fields ignored
    await page.getByRole("button", { name: "Edit NC Response" }).click();
    await dlg(page).locator("#nc-root-cause").fill("Chemical containment requirement was missing from the warehouse inspection checklist.");
    await tamper(page, [['"correction":', `"title":"HACKED","status":"closed","effectiveness_result":"effective","priority":"low","correction":`]]);
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    await untamper(page);
    r = dbQuery(`select * from issues where id='${nc.id}'`)[0];
    rec(r.title === t("Chemical containment NC") && r.status === "open" && r.effectiveness_result === null && r.priority === "medium" && r.root_cause !== null, "NC response mutation updates ONLY correction/root_cause (smuggled title/status/effectiveness/priority ignored)");
  }

  // ===== ADD CORRECTIVE ACTION =====
  {
    await page.getByRole("button", { name: "+ Add Corrective Action" }).click();
    const d = dlg(page);
    await d.waitFor({ state: "visible" });
    rec((await d.getByRole("heading").first().innerText()) === "New Corrective Action", "Drawer title: New Corrective Action");
    rec((await d.getByTestId("action-finding-context").innerText()).includes(t("Chemical containment NC")), "Drawer shows the Finding context");
    rec((await d.locator("#ac-activity").inputValue()) === f.actVL && /Viet Long/.test(await d.getByTestId("action-site-locked").innerText()), "Defaults Activity and Site from the Finding (site locked by the site-specific Activity)");
    rec(!/Status|Completion/i.test(await d.innerText()), "No Status / Completion fields on create");
    await d.getByRole("button", { name: "Create" }).click();
    rec(await wait(d.getByText("Action is required.")), "Description required");
    await d.locator("#ac-description").fill("   ");
    await d.getByRole("button", { name: "Create" }).click();
    rec(await wait(d.getByText("Action is required.")), "Whitespace-only description rejected");
    await cancel(page);
    rec(await addAction(page, "+ Add Corrective Action", { desc: t("Update warehouse inspection checklist"), owner: "Warehouse Manager", due: DAYS.future, priority: "High" }), "Add Corrective Action saves");
    const a = actionRow(t("Update warehouse inspection checklist"));
    rec(a.issue_id === nc.id && a.project_id === f.projectA && a.status === "open" && a.created_by === admin.userId && a.completed_at === null && a.completion_notes === null, "DB: issue_id, project_id, status open, created_by, no completion data");
    rec(a.owner_name === "Warehouse Manager" && a.due_date === DAYS.future && a.priority === "high" && a.site_id === f.vietLong && a.activity_id === f.actVL, "DB: owner, due date, High, site and activity");
    await page.getByTestId("nc-progress").getByText("0 of 1 Closed").waitFor({ timeout: 10000 });
    rec(true, "Progress: Corrective Actions 0 of 1 Closed");
    rec(dbQuery(`select priority from issues where id='${nc.id}'`)[0].priority === "medium", "Finding priority independent of action priority");
    rec(await addAction(page, "+ Add Corrective Action", { desc: t("Revise chemical storage procedure"), owner: "EHS Team", projectWideActivity: f.actPW, site: "Long An" }), "Second action: different (project-wide) Activity + Long An");
    rec(await addAction(page, "+ Add Corrective Action", { desc: t("Train warehouse personnel"), owner: "Nguyen Van A", projectWideActivity: "", site: "project_wide" }), "Third action: no Activity, project-wide");
    const a2 = actionRow(t("Revise chemical storage procedure")), a3 = actionRow(t("Train warehouse personnel"));
    rec(a2.activity_id === f.actPW && a2.site_id === f.longAn && a3.activity_id === null && a3.site_id === null, "DB: action context may differ from the Finding's");
    await page.getByTestId("nc-progress").getByText("0 of 3 Closed").waitFor({ timeout: 10000 });
    rec(/0 of 3 Closed/.test(await page.getByTestId("finding-actions").innerText()), "Finding shows 0 of 3 Closed");
    rec(!UUID.test(await page.locator("body").innerText()), "No UUIDs on Finding Detail");
  }

  // ===== SERVER TAMPERING: createAction / updateAction =====
  {
    const cases = [
      ["Site differing from a site-specific Activity", [[`"siteId":"${f.vietLong}"`, `"siteId":"${f.longAn}"`]], /Site must match/],
      ["a Site of another project", [[`"activityId":"${f.actVL}"`, `"activityId":""`], [`"siteId":"${f.vietLong}"`, `"siteId":"${f.betaSite}"`]], /not in this project's scope/],
      ["an Activity of another project", [[`"activityId":"${f.actVL}"`, `"activityId":"${f.actB}"`]], /Activity could not be found/],
      ["a Finding of another project", [[nc.id, f.findingB]], /finding could not be found/],
    ];
    for (const [label, rep, re] of cases) {
      await page.getByRole("button", { name: "+ Add Corrective Action" }).click();
      await dlg(page).locator("#ac-description").fill(t("TAMPER " + label));
      await tamper(page, rep);
      await dlg(page).getByRole("button", { name: "Create" }).click();
      rec(await wait(dlg(page).getByText(re).first()), `Server rejects action with ${label}`);
      await untamper(page);
      await cancel(page);
    }
    rec(dbQuery(`select count(*) c from actions where description like '${t("TAMPER")}%'`)[0].c === 0, "Rejected action attempts created nothing");
    await page.getByRole("button", { name: "+ Add Corrective Action" }).click();
    await dlg(page).locator("#ac-description").fill(t("Smuggled action"));
    await tamper(page, [['"description":', `"status":"closed","completed_at":"2020-01-01T00:00:00Z","completion_notes":"x","created_by":"${consultant.userId}","issue_id":"${f.findingB}","project_id":"${f.projectB}","description":`]]);
    await dlg(page).getByRole("button", { name: "Create" }).click();
    await gone(dlg(page));
    await untamper(page);
    const s = actionRow(t("Smuggled action"));
    rec(s && s.status === "open" && s.completed_at === null && s.completion_notes === null && s.created_by === admin.userId && s.issue_id === nc.id && s.project_id === f.projectA, "Smuggled status/completion/created_by/issue_id/project_id ignored on create");
    // edit: relink attempt ignored
    await page.reload();
    await acard(page, t("Smuggled action")).getByRole("button", { name: "Edit" }).click();
    await dlg(page).waitFor({ state: "visible" });
    rec((await dlg(page).getByRole("heading").first().innerText()) === "Edit Corrective Action" && (await dlg(page).getByTestId("action-finding-context").innerText()).includes(t("Chemical containment NC")), "Edit shows the linked Finding read-only");
    await dlg(page).locator("#ac-owner").fill("Edited Owner");
    await tamper(page, [['"description":', `"issue_id":null,"issueId":"${f.findingB}","status":"closed","description":`]]);
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    await untamper(page);
    const s2 = actionRow(t("Smuggled action"));
    rec(s2.owner_name === "Edited Owner" && s2.issue_id === nc.id && s2.status === "open", "Edit saves core fields; smuggled issue_id/status ignored (link immutable)");
    // cross-project action id on update
    await page.reload();
    await acard(page, t("Smuggled action")).getByRole("button", { name: "Edit" }).click();
    await dlg(page).waitFor({ state: "visible" });
    await tamper(page, [[s2.id, f.actionB]]);
    await dlg(page).getByRole("button", { name: "Save" }).click();
    rec(await wait(dlg(page).getByText(/action could not be found/).first()), "Server rejects editing another project's action");
    await untamper(page);
    await cancel(page);
    rec(actionRow(t("B secret action")).owner_name === "B Owner", "  ...Project B action untouched");
    dbQuery(`delete from actions where description='${t("Smuggled action")}'`);
    await page.reload();
  }

  // ===== STATUS TRANSITIONS / COMPLETION =====
  const A1 = t("Update warehouse inspection checklist");
  {
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await setStatus(page, A1, "in_progress");
    rec(await waitDb(() => actionRow(A1).status === "in_progress"), "Open → In Progress");
    await setStatus(page, A1, "pending_review");
    rec(await waitDb(() => actionRow(A1).status === "pending_review"), "In Progress → Pending Review");
    await acard(page, A1).getByLabel("Action status").selectOption("closed");
    rec(await wait(acard(page, A1).getByText("Completion Notes (optional)")), "Choosing Closed asks for optional Completion Notes");
    await acard(page, A1).locator("textarea").fill("Implemented updated checklist and trained warehouse team.");
    await acard(page, A1).getByRole("button", { name: "Close Action" }).click();
    rec(await waitDb(() => actionRow(A1).status === "closed"), "Pending Review → Closed");
    let a = actionRow(A1);
    rec(a.completed_at !== null && Math.abs(Date.now() - new Date(a.completed_at).getTime()) < 5 * 60000 && a.completion_notes === "Implemented updated checklist and trained warehouse team.", "DB: completed_at = server time, completion_notes stored");
    await page.getByTestId("nc-progress").getByText("1 of 3 Closed").waitFor({ timeout: 10000 });
    rec(true, "Progress: 1 of 3 Closed");
    rec((await acard(page, A1).getByRole("button", { name: "Edit" }).count()) === 0 && /Completion: Implemented/.test(await acard(page, A1).innerText()), "Closed action: no Edit, completion notes shown");
    await setStatus(page, A1, "in_progress");
    rec(await waitDb(() => actionRow(A1).status === "in_progress"), "Closed → In Progress (reopen)");
    a = actionRow(A1);
    rec(a.completed_at === null && a.completion_notes === "Implemented updated checklist and trained warehouse team.", "Reopen: completed_at NULL, completion_notes preserved");
    await acard(page, A1).getByLabel("Action status").selectOption("closed");
    rec((await acard(page, A1).locator("textarea").inputValue()) === "Implemented updated checklist and trained warehouse team.", "Re-closing prefills the existing notes");
    await acard(page, A1).getByRole("button", { name: "Close Action" }).click();
    await waitDb(() => actionRow(A1).status === "closed");
    // closed action stale edit -> rejected
    await page.reload();
    const A2 = t("Revise chemical storage procedure");
    await acard(page, A2).getByRole("button", { name: "Edit" }).click();
    await dlg(page).waitFor({ state: "visible" });
    await tamper(page, [[actionRow(A2).id, actionRow(A1).id]]);
    await dlg(page).getByRole("button", { name: "Save" }).click();
    rec(await wait(dlg(page).getByText(/closed\. Reopen it to edit/).first()), "Server rejects a stale edit of a Closed action");
    await untamper(page);
    await cancel(page);
    rec(actionRow(A1).description === A1 && actionRow(A1).status === "closed", "  ...closed action unchanged");
    await setStatus(page, A2, "closed", "");
    await setStatus(page, t("Train warehouse personnel"), "closed");
    await page.getByTestId("nc-progress").getByText("3 of 3 Closed").waitFor({ timeout: 10000 });
    rec(true, "All closed: 3 of 3 Closed");
    rec(actionRow(A2).completion_notes === null, "Closing without notes is allowed (notes optional)");
    rec((await page.getByRole("button", { name: /Close Finding/ }).count()) === 1 && /Effectiveness Review/.test(await page.locator("body").innerText()), "NC shows Close Finding and the Effectiveness section (added in 4D-2; expectation updated in 4F)");
    await page.screenshot({ path: path.join(OUT, "desktop-nc-detail.png"), fullPage: true });
    rec(await noHOverflow(page), "Desktop: NC Finding Detail no horizontal overflow");
  }

  // ===== TYPE CHANGE: no data loss =====
  {
    await page.getByRole("button", { name: "Edit Finding" }).click();
    await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    await page.getByRole("heading", { name: "Actions", exact: true }).waitFor({ timeout: 10000 });
    const r = dbQuery(`select * from issues where id='${nc.id}'`)[0];
    rec((await page.getByTestId("nc-response").count()) === 0 && (await page.getByTestId("nc-progress").count()) === 0 && r.correction !== null && r.root_cause !== null, "NC → Observation: NC Response hidden, correction/root cause preserved in DB");
    rec((await page.locator('[data-testid="action-card"]').count()) === 3 && /3 of 3 Closed/.test(await page.getByTestId("finding-actions").innerText()), "  ...actions still shown, labelled 'Actions'");
    await page.getByRole("button", { name: "Edit Finding" }).click();
    await dlg(page).getByRole("button", { name: "Nonconformity", exact: true }).click();
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    await page.getByTestId("nc-response").waitFor({ timeout: 10000 });
    rec((await page.getByTestId("nc-response").innerText()).includes("Moved affected chemical containers to spill trays."), "Back to Nonconformity: correction reappears");
  }

  // ===== OBSERVATION / OFI WORKFLOW (real UI) =====
  for (const type of ["Observation", "Opportunity for Improvement"]) {
    const title = t(`${type} with action`);
    const obs = await newFinding(page, { type, title });
    const body = flat(await page.locator("body").innerText());
    rec((await page.getByTestId("nc-response").count()) === 0 && (await page.getByTestId("nc-progress").count()) === 0 && !/Root Cause|Correction/.test(body), `${type}: no Correction / RCA / Progress`);
    rec(/No actions recorded/.test(body) && (await page.getByRole("heading", { name: "Actions", exact: true }).count()) === 1, `${type}: 'Actions' section ('No actions recorded')`);
    const desc = t(`${type} follow-up`);
    rec(await addAction(page, "+ Add Action", { desc }), `${type}: + Add Action`);
    await acard(page, desc).waitFor();
    // 4F: ported to the 4D-2 close panel (server evaluation; hard blocker, no confirm button).
    const cp = page.getByTestId("close-panel");
    await page.getByRole("button", { name: "Close Finding" }).first().click();
    await cp.waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector('[data-testid="close-panel"]')?.textContent?.includes("Checking whether"), null, { timeout: 15000 });
    rec(/1 action is still open./.test(flat(await cp.innerText())) && (await cp.getByRole("button", { name: /^Close (Finding|Anyway)$/ }).count()) === 0, `${type}: Close Finding blocked while the action is open`);
    await cp.getByRole("button", { name: "Back" }).click();
    await setStatus(page, desc, "closed", "Done");
    await waitDb(() => actionRow(desc).status === "closed");
    await page.getByRole("button", { name: "Close Finding" }).first().click();
    await cp.waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector('[data-testid="close-panel"]')?.textContent?.includes("Checking whether"), null, { timeout: 15000 });
    await cp.getByRole("button", { name: "Close Finding" }).click();
    rec(await wait(page.getByText("Finding closed")), `${type}: Close Finding allowed once the action is closed`);
    if (type === "Observation") {
      // closed Finding freezes its actions
      await page.getByRole("button", { name: "Reopen Finding" }).waitFor();
      rec((await page.getByRole("button", { name: "+ Add Action" }).count()) === 0 && /The finding is closed/.test(await acard(page, desc).innerText()) && (await acard(page, desc).getByLabel("Action status").count()) === 0, "Closed Finding: no Add Action; linked action read-only");
      await page.goto(`${FIND()}/${nc.id}`);
      await page.getByRole("button", { name: "+ Add Corrective Action" }).click();
      await dlg(page).locator("#ac-description").fill(t("TAMPER closed finding"));
      await tamper(page, [[nc.id, obs.id]]);
      await dlg(page).getByRole("button", { name: "Create" }).click();
      rec(await wait(dlg(page).getByText(/finding is closed\. Reopen it to add an action/).first()), "Server rejects adding an action to a Closed Finding");
      await untamper(page);
      await cancel(page);
      const frozenId = actionRow(desc).id;
      await tamper(page, [[actionRow(A1).id, frozenId]]);
      await acard(page, A1).getByLabel("Action status").selectOption("open");
      await page.waitForTimeout(1500);
      await untamper(page);
      rec(actionRow(desc).status === "closed", "Server rejects a status change on an action of a Closed Finding");
      rec(actionRow(A1).status === "closed", "  ...and the action whose control was used is unchanged");
      await page.goto(`${FIND()}/${obs.id}`);
      await page.getByRole("button", { name: "Reopen Finding" }).click();
      await page.locator("div.bg-warning-soft").getByRole("button", { name: "Reopen Finding" }).click();
      await wait(page.getByText("Finding reopened"));
      rec(await wait(acard(page, desc).getByLabel("Action status")) && await wait(page.getByRole("button", { name: "+ Add Action" })), "Reopened Finding: actions editable again");
    }
  }

  // ===== PROJECT ACTIONS WORKSPACE (A) =====
  await page.goto(ACTIONS());
  await page.getByRole("heading", { name: "Actions", exact: true }).waitFor({ timeout: 20000 });
  {
    rec(await wait(page.getByRole("navigation", { name: "Findings and Actions" })) && (await page.getByRole("link", { name: "Actions", exact: true }).getAttribute("aria-current")) === "page", "Sub-navigation Findings | Actions (Actions active)");
    const heads = flat(await page.locator("thead").innerText());
    rec(/ACTION FINDING SITE OWNER DUE PRIORITY STATUS/i.test(heads), `Actions table columns: ${heads}`);
    const linkedRow = page.locator("tbody tr", { hasText: A1 });
    const link = linkedRow.getByRole("link", { name: t("Chemical containment NC") });
    rec(await wait(link), "Linked action shows its Finding title as a link");
    rec(!(await page.locator("body").innerText()).includes(t("B secret action")), "Project A Actions never show Project B actions");
    await page.getByRole("button", { name: "+ New Action" }).click();
    const d = dlg(page);
    await d.waitFor({ state: "visible" });
    rec((await d.getByRole("heading").first().innerText()) === "New Action" && /Standalone action/.test(await d.getByTestId("action-finding-context").innerText()), "+ New Action: standalone context");
    await d.locator("#ac-description").fill(t("Send updated legal register to client"));
    await d.locator("#ac-owner").fill("Consultant");
    await d.locator("#ac-due").fill(DAYS.later);
    await d.getByRole("button", { name: "Low", exact: true }).click();
    await d.locator("#ac-activity").selectOption(f.actVL);
    const issues0 = dbQuery(`select count(*) c from issues`)[0].c;
    await d.getByRole("button", { name: "Create" }).click();
    rec(await gone(d), "Standalone action created");
    const s = actionRow(t("Send updated legal register to client"));
    rec(s.issue_id === null && s.project_id === f.projectA && s.site_id === f.vietLong && s.activity_id === f.actVL && s.owner_name === "Consultant" && s.priority === "low" && s.status === "open", "DB: issue_id NULL, site/activity/owner/priority, open");
    rec(dbQuery(`select count(*) c from issues`)[0].c === issues0, "No Finding created for a standalone action");
    const srow = page.locator("tbody tr", { hasText: t("Send updated legal register to client") });
    await srow.waitFor({ timeout: 10000 });
    rec(/Standalone/.test(await srow.innerText()), "Finding column says 'Standalone'");
    await srow.getByRole("button", { name: t("Send updated legal register to client") }).click();
    await dlg(page).waitFor({ state: "visible" });
    rec((await dlg(page).getByRole("heading").first().innerText()) === "Edit Action", "Standalone action opens the same form for edit");
    await tamper(page, [['"description":', `"issue_id":"${nc.id}","description":`]]);
    await dlg(page).locator("#ac-owner").fill("Consultant B");
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    await untamper(page);
    rec(actionRow(t("Send updated legal register to client")).issue_id === null && actionRow(t("Send updated legal register to client")).owner_name === "Consultant B", "Standalone stays standalone (smuggled issue_id ignored)");
    await page.screenshot({ path: path.join(OUT, "desktop-actions.png") });
    rec(await noHOverflow(page), "Desktop: Actions workspace no horizontal overflow");
    await link.click();
    await page.waitForURL(`**/findings/${nc.id}`, { timeout: 15000 });
    rec(true, "Finding link opens the correct Finding");
  }

  // ===== SORT / OVERDUE / SEARCH / FILTERS (project S) =====
  await page.goto(ACTIONS(f.projectS));
  await page.locator("tbody tr").first().waitFor({ timeout: 20000 });
  {
    const rows = await page.locator("tbody tr td:first-child").allInnerTexts();
    const got = rows.map((x) => x.split("\n")[0].replace("P4D1-ACCEPT-", ""));
    const expected = ["S overdue review", "S overdue open", "S due today", "S due tomorrow high", "S due tomorrow low", "S no due", "S closed yesterday"];
    rec(JSON.stringify(got) === JSON.stringify(expected), `Default order: overdue → open → due asc → priority → newest (${got.join(" | ")})`);
    const od = async (n) => /Overdue/.test(await page.locator("tbody tr", { hasText: t(n) }).innerText());
    rec(await od("S overdue open"), "Overdue: yesterday + Open");
    rec(await od("S overdue review"), "Overdue: yesterday + Pending Review");
    rec(!(await od("S closed yesterday")), "Not overdue: yesterday + Closed");
    rec(!(await od("S due today")), "Not overdue: due today");
    rec(dbQuery(`select count(*) c from information_schema.columns where table_name='actions' and column_name ilike '%overdue%'`)[0].c === 0, "No stored overdue column");
    const sfilter = async (fn, exp, label) => { await fn(); const g = (await page.locator("tbody tr td:first-child").allInnerTexts()).map((x) => x.split("\n")[0].replace("P4D1-ACCEPT-", "")); rec(JSON.stringify(g) === JSON.stringify(exp), `${label} (${g.join(" | ")})`); };
    const search = page.getByLabel("Search actions");
    await sfilter(() => search.fill("nguyen van"), ["S overdue open"], "Search: owner");
    await sfilter(() => search.fill("sort finding"), ["S overdue review"], "Search: Finding title");
    await sfilter(() => search.fill("long an"), ["S due tomorrow high"], "Search: site");
    await sfilter(() => search.fill("sort visit"), ["S due tomorrow high"], "Search: activity");
    await sfilter(() => search.fill("tomorrow low"), ["S due tomorrow low"], "Search: description");
    await search.fill("");
    await sfilter(() => page.getByLabel("Filter by Status").selectOption("overdue"), ["S overdue review", "S overdue open"], "Filter: Overdue");
    await sfilter(() => page.getByLabel("Filter by Status").selectOption("closed"), ["S closed yesterday"], "Filter: Status Closed");
    await page.getByLabel("Filter by Status").selectOption("all");
    await sfilter(() => page.getByLabel("Filter by Site").selectOption("Viet Long"), ["S due today"], "Filter: Site");
    await page.getByLabel("Filter by Site").selectOption("all");
    await sfilter(() => page.getByLabel("Filter by Priority").selectOption("low"), ["S overdue open", "S due tomorrow low"], "Filter: Priority Low");
    await page.getByLabel("Filter by Priority").selectOption("all");
    await sfilter(() => page.getByLabel("Filter by Finding link").selectOption("linked"), ["S overdue review"], "Filter: Linked to Finding");
    await sfilter(() => page.getByLabel("Filter by Finding link").selectOption("standalone"), ["S overdue open", "S due today", "S due tomorrow high", "S due tomorrow low", "S no due", "S closed yesterday"], "Filter: Standalone");
  }

  // ===== QUERY APPROACH =====
  {
    const fsrc = readFileSync(REPO + "/lib/queries/findings.ts", "utf8");
    const asrc = readFileSync(REPO + "/lib/queries/actions.ts", "utf8");
    // 4F: 4D-2 added effectiveness columns before the actions embed; still one embedded query.
    rec(/DETAIL_COLUMNS = `\$\{FINDING_COLUMNS\}, correction, root_cause,[^`]*\bactions\(/.test(fsrc) &&!/from\("actions"\)/.test(fsrc), "Finding Detail loads its actions via one embedded relationship (no per-action query)");
    const listBody = asrc.slice(asrc.indexOf("export async function listProjectActions"));
    rec((listBody.match(/\.from\(/g) ?? []).length === 1 && /issues\(id, finding_no, title, finding_type, status\)/.test(asrc) /* 6A: embed also carries finding_no */ && /activities\(id, name, start_date\)/.test(asrc), "Actions workspace: one actions query embedding Finding + Activity (+ one site-name lookup)");
  }

  // ===== AUTHORIZATION / ISOLATION =====
  {
    const cctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const cp = await cctx.newPage();
    await login(cp, "consultant");
    await cp.goto(`${FIND()}/${nc.id}`);
    await cp.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
    rec(await addAction(cp, "+ Add Corrective Action", { desc: t("Consultant action") }), "Consultant: adds a Corrective Action");
    rec(actionRow(t("Consultant action")).created_by === consultant.userId, "Consultant: created_by = consultant");
    await setStatus(cp, t("Consultant action"), "in_progress");
    rec(await waitDb(() => actionRow(t("Consultant action")).status === "in_progress"), "Consultant: changes action status");
    await cp.getByRole("button", { name: "Edit NC Response" }).click();
    await dlg(cp).locator("#nc-correction").fill("Consultant correction");
    await dlg(cp).getByRole("button", { name: "Save" }).click();
    rec(await gone(dlg(cp)) && await waitDb(() => dbQuery(`select correction from issues where id='${nc.id}'`)[0].correction === "Consultant correction"), "Consultant: edits NC Response");
    await cctx.close();
    const anon = await fetch(ACTIONS(), { redirect: "manual" });
    rec(anon.status >= 300 && anon.status < 400 && /login/.test(anon.headers.get("location") ?? ""), `Anon: Actions page redirects to /login (HTTP ${anon.status})`);
    const anonSel = await http("GET", "/rest/v1/actions?select=id,description");
    const anonIns = await http("POST", "/rest/v1/actions", { body: { project_id: f.projectA, description: t("ANON") } });
    rec(anonSel.status >= 400 && anonIns.status >= 400, `Anon: direct actions select/insert denied (HTTP ${anonSel.status}/${anonIns.status})`);
    await page.goto(`${FIND()}/${f.findingB}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const body = await page.locator("body").innerText();
    rec(/Page not found/.test(body) && !body.includes("B secret action") && !body.includes("B Owner"), "Project B Finding via Project A URL: not found, its action/owner not leaked");
  }

  // ===== MOBILE =====
  for (const width of [390, 412]) {
    const mctx = await browser.newContext({ viewport: { width, height: 844 } });
    const mp = await mctx.newPage();
    await login(mp, "admin");
    await mp.goto(`${FIND()}/${nc.id}`);
    await mp.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
    rec(await noHOverflow(mp), `Mobile ${width}: NC Finding Detail no horizontal overflow`);
    const order = await mp.locator("section h2").allInnerTexts();
    rec(JSON.stringify(order) === JSON.stringify(["Finding", "Progress", "NC Response", "Corrective Actions", "Effectiveness Review", "Evidence", "Origin"]), `Mobile ${width}: vertical order Finding → Progress → NC Response → Corrective Actions → Effectiveness Review → Evidence → Origin`);
    await mp.getByRole("button", { name: "Edit NC Response" }).click();
    const box = await dlg(mp).boundingBox();
    rec(box.width >= width - 2 && await dlg(mp).getByRole("button", { name: "Save" }).isVisible(), `Mobile ${width}: Edit NC Response full-width sheet, Save visible`);
    await mp.keyboard.press("Escape"); await gone(dlg(mp));
    await mp.getByRole("button", { name: "+ Add Corrective Action" }).click();
    const d = dlg(mp);
    await d.waitFor({ state: "visible" });
    rec((await d.boundingBox()).width >= width - 2 && await d.locator("#ac-owner").isVisible() && await d.locator("#ac-due").isVisible(), `Mobile ${width}: Add Corrective Action sheet with owner and due date`);
    const createOk = await d.getByRole("button", { name: "Create" }).evaluate((e) => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= window.innerHeight && !!top && (top === e || e.contains(top)); });
    rec(createOk && await noHOverflow(mp), `Mobile ${width}: Create reachable, no overflow`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-action-sheet.png`) });
    await mp.keyboard.press("Escape"); await gone(dlg(mp));
    const cards = mp.locator('[data-testid="action-card"]');
    const last = cards.last();
    await last.scrollIntoViewIfNeeded();
    await mp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const clear = await mp.evaluate(() => {
      const cs = [...document.querySelectorAll('[data-testid="action-card"]')];
      const sel = cs[cs.length - 1].querySelector("select");
      const r = sel.getBoundingClientRect();
      const nav = document.querySelector('nav[class*="fixed"]');
      return { bottom: r.bottom, navTop: nav ? nav.getBoundingClientRect().top : window.innerHeight };
    });
    rec(clear.bottom <= clear.navTop, `Mobile ${width}: last action's status control not covered by bottom navigation (${Math.round(clear.bottom)} <= ${Math.round(clear.navTop)})`);
    const editVisible = await cards.filter({ has: mp.getByRole("button", { name: "Edit" }) }).first().getByRole("button", { name: "Edit" }).isVisible();
    rec(editVisible, `Mobile ${width}: action Edit reachable`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-nc.png`), fullPage: true });

    await mp.goto(ACTIONS(f.projectS));
    await mp.getByRole("heading", { name: "Actions", exact: true }).waitFor({ timeout: 20000 });
    await mp.locator('[data-testid="action-card"]').first().waitFor({ timeout: 15000 });
    rec(!(await mp.locator("table").first().isVisible().catch(() => false)) && (await mp.locator('[data-testid="action-card"]').count()) === 7, `Mobile ${width}: Actions workspace uses cards (7)`);
    const c1 = flat(await mp.locator('[data-testid="action-card"]').first().innerText());
    rec(/Overdue/.test(c1) && /Finding: .*Sort finding/.test(c1) && /Due/.test(c1), `Mobile ${width}: card shows Overdue, Finding, Due ("${c1.slice(0, 90)}…")`);
    rec(/Standalone/.test(flat(await mp.locator('[data-testid="action-card"]').nth(1).innerText())) && /Nguyen Van A/.test(flat(await mp.locator('[data-testid="action-card"]').nth(1).innerText())), `Mobile ${width}: standalone card shows 'Standalone' and owner`);
    rec(await mp.getByRole("button", { name: "+ New Action" }).first().isVisible() && await noHOverflow(mp), `Mobile ${width}: + New Action reachable, no overflow`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-actions.png`) });
    await mctx.close();
  }

  // ===== DESKTOP DRAWER / REGRESSION =====
  {
    await page.goto(`${FIND()}/${nc.id}`);
    await page.getByRole("button", { name: "+ Add Corrective Action" }).click();
    rec((await dlg(page).boundingBox()).width <= 401, "Desktop: Action drawer keeps the established width");
    await page.screenshot({ path: path.join(OUT, "desktop-action-drawer.png") });
    await cancel(page);
    rec((await page.getByRole("button", { name: /Close Finding/ }).count()) === 1, "Regression: NC Close Finding available (added in 4D-2; expectation updated in 4F)");
    await page.goto(FIND());
    rec(await wait(page.getByRole("link", { name: t("Chemical containment NC") })) && (await page.getByRole("link", { name: "Findings", exact: true }).getAttribute("aria-current")) === "page", "Regression: Findings list (Findings sub-tab active)");
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
    await page.goto(`${APP}/projects/${f.projectA}/activities/${f.actVL}`);
    rec(await wait(page.getByText(/1 Finding/).first()), "Regression: Activity Detail verification card shows its Finding");
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
