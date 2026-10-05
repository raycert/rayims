import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { users, makeReporter, http, signIn, dbQuery } from "./common.mjs";
import { createFixtures } from "./p4c1-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p4c1-files");
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);

const noHOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const wait = (l, timeout = 15000) => l.waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
const gone = (l, timeout = 15000) => l.waitFor({ state: "hidden", timeout }).then(() => true).catch(() => false);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const snapshotSql = `select
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.verification_items t where project_id in (select id from public.projects where name not like 'P4C1-ACCEPT-%')) as vi,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.activities t where project_id in (select id from public.projects where name not like 'P4C1-ACCEPT-%')) as act,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.projects t where name not like 'P4C1-ACCEPT-%') as proj,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.clients t where name not like 'P4C1-ACCEPT-%') as cl,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.sites t where client_id in (select id from public.clients where name not like 'P4C1-ACCEPT-%')) as st,
  (select md5(coalesce(string_agg(t::text,'|' order by project_id, framework_id),'')) from public.project_frameworks t where project_id in (select id from public.projects where name not like 'P4C1-ACCEPT-%')) as pf,
  (select count(*) from public.frameworks) as frameworks, (select count(*) from public.framework_items) as items,
  (select count(*) from public.activity_types) as atypes,
  (select count(*) from public.issues where project_id in (select id from public.projects where name not like 'P4C1-ACCEPT-%')) as issues,
  (select count(*) from public.actions where project_id in (select id from public.projects where name not like 'P4C1-ACCEPT-%')) as actions,
  (select count(*) from public.attachments) as attachments, (select count(*) from public.files) as files`;

const before = dbQuery(snapshotSql)[0];
console.log("BEFORE", JSON.stringify(before));
const admin = await signIn("admin");
const consultant = await signIn("consultant");
rec(admin.ok && consultant.ok, "Setup: admin and consultant sign-in");

const f = createFixtures();
writeFileSync(path.join(OUT, "fixture-ids.json"), JSON.stringify(f));
const FIND_A = `${APP}/projects/${f.projectA}/findings`;
const FIND_S = `${APP}/projects/${f.projectS}/findings`;

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function login(page, who = "admin") {
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
}
const dlg = (page) => page.getByRole("dialog");
const finding = (title) => dbQuery(`select * from issues where title='${title}'`)[0];
const t = (s) => `P4C1-ACCEPT-${s}`;

async function openNew(page, url = FIND_A) {
  await page.goto(url);
  await page.getByRole("heading", { name: "Findings", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "+ New Finding" }).first().click();
  await dlg(page).waitFor({ state: "visible" });
}
async function fill(page, { type, title, description, priority, site, activity, framework }) {
  const d = dlg(page);
  if (type) await d.getByRole("button", { name: type, exact: true }).click();
  if (title !== undefined) await d.locator("#fd-title").fill(title);
  if (description) await d.locator("#fd-description").fill(description);
  if (priority) await d.getByRole("button", { name: priority, exact: true }).click();
  if (activity) await d.locator("#fd-activity").selectOption({ label: activity });
  if (site) {
    await d.getByRole("button", { name: "Specific site", exact: true }).click();
    await d.locator("#fd-site").selectOption({ label: site });
  }
  if (framework) await d.locator("#fd-framework").selectOption({ label: framework });
}
async function createOk(page, args) {
  await fill(page, args);
  await dlg(page).getByRole("button", { name: "Create" }).click();
  return gone(dlg(page));
}
/** Rewrites the body of the next Server Action POST(s) — proves SERVER-side validation, not just the UI. */
/** 4F: header "Close Finding" → wait for the server evaluation in the close panel. */
async function openClosePanel(pg) {
  await pg.getByRole("button", { name: "Close Finding" }).first().click();
  const cp = pg.getByTestId("close-panel");
  await cp.waitFor({ state: "visible" });
  await pg.waitForFunction(() => !document.querySelector('[data-testid="close-panel"]')?.textContent?.includes("Checking whether"), null, { timeout: 15000 });
  return cp;
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
const dlgError = (page, re) => dlg(page).getByText(re).first();
const rowsTitles = (page) => page.locator("tbody tr td:nth-child(2) a").allInnerTexts(); // 6A: "No." column first

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await login(page, "admin");

  // ===== MIGRATION / SCHEMA (recorded state) =====
  {
    const cols = dbQuery(`select column_name from information_schema.columns where table_schema='public' and table_name='issues' and column_name in ('finding_type','correction','root_cause','effectiveness_result','effectiveness_notes','effectiveness_reviewed_by','effectiveness_reviewed_at','closed_by')`);
    rec(cols.length === 8, "Schema: the 8 new issues columns exist");
    const chk = dbQuery(`select conname from pg_constraint where conrelid='public.issues'::regclass and conname in ('issues_finding_type_check','issues_effectiveness_result_check')`);
    rec(chk.length === 2, "Schema: 2 new CHECK constraints");
    const fks = dbQuery(`select conname, confdeltype from pg_constraint where conrelid='public.issues'::regclass and conname in ('issues_closed_by_fkey','issues_effectiveness_reviewed_by_fkey')`);
    rec(fks.length === 2 && fks.every((x) => x.confdeltype === "n"), "Schema: 2 profile FKs, ON DELETE SET NULL");
    const idx = dbQuery(`select indexname from pg_indexes where schemaname='public' and tablename='issues' and indexname in ('issues_closed_by_idx','issues_effectiveness_reviewed_by_idx')`);
    rec(idx.length === 2, "Schema: 2 FK indexes");
    const tables = dbQuery(`select count(*) n from information_schema.tables where table_schema='public'`)[0].n;
    rec(tables === 21, "Schema: table count 21 (4C-1 added none; +project_finding_counters in 6A)"); // 6A: approved internal counter table
  }
  // DB-level closed-set enforcement
  {
    const bad1 = await http("POST", "/rest/v1/issues", { token: admin.token, body: { project_id: f.projectA, title: t("bad type"), finding_type: "bogus" } });
    rec(bad1.status >= 400, `DB: invalid finding_type rejected (HTTP ${bad1.status})`);
    const bad2 = await http("POST", "/rest/v1/issues", { token: admin.token, body: { project_id: f.projectA, title: t("bad eff"), effectiveness_result: "partially_effective" } });
    rec(bad2.status >= 400, `DB: invalid effectiveness_result rejected (HTTP ${bad2.status})`);
    rec(dbQuery(`select count(*) c from issues where title in ('${t("bad type")}','${t("bad eff")}')`)[0].c === 0, "DB: rejected inserts left no rows");
  }

  // ===== NAVIGATION =====
  await page.goto(`${APP}/projects/${f.projectA}`);
  await page.getByRole("link", { name: "Findings & Actions" }).waitFor({ timeout: 20000 });
  rec(true, "Project tab reads 'Findings & Actions' (linked, active)");
  for (const [name, url] of [["Overview", `${APP}/projects/${f.projectA}`], ["Plan", `${APP}/projects/${f.projectA}/plan`], ["Verification", `${APP}/projects/${f.projectA}/verification`]]) {
    await page.goto(url);
    await page.getByRole("link", { name: "Findings & Actions" }).waitFor({ timeout: 20000 });
    rec(!(await page.locator("body").innerText()).includes("Issues & Actions"), `${name}: no 'Issues & Actions' label remains`);
  }
  await page.getByRole("link", { name: "Findings & Actions" }).click();
  await page.waitForURL(`**/projects/${f.projectA}/findings`, { timeout: 15000 });
  rec(await wait(page.getByRole("heading", { name: "Findings", exact: true })), "Tab routes to /projects/[id]/findings");
  rec(await wait(page.getByText("No findings yet")), "Empty state shown for a project with no findings");
  rec((await page.getByRole("link", { name: "Actions", exact: true }).count()) === 1, "Actions sub-tab present (added in 4D-1; expectation updated in 4F)");
  rec(await wait(page.getByRole("button", { name: "+ New Finding" }).first()), "+ New Finding visible");

  // ===== CREATE FORM: type required, no preselection =====
  await page.getByRole("button", { name: "+ New Finding" }).first().click();
  await dlg(page).waitFor({ state: "visible" });
  {
    const pressed = await dlg(page).locator('#fd-type-label + div button[aria-pressed="true"], [role="group"] button[aria-pressed="true"]').count();
    // the only pressed buttons allowed are Priority's (Medium): none of the three type buttons may be pressed
    const typePressed = await Promise.all(["Nonconformity", "Observation", "Opportunity for Improvement"].map((n) => dlg(page).getByRole("button", { name: n, exact: true }).getAttribute("aria-pressed")));
    rec(typePressed.every((v) => v === "false"), `Finding Type has NO preselection (${typePressed.join(",")})`);
    rec(pressed >= 0, "form rendered");
    rec((await dlg(page).getByRole("button", { name: "Medium", exact: true }).getAttribute("aria-pressed")) === "true", "Priority defaults to Medium");
    const labels = await dlg(page).locator("label, span.text-sm.font-medium").allInnerTexts();
    const text = (await dlg(page).innerText());
    const noOptions = text.split(/\r?\n/).filter((l) => !/^\d+(\.\d+)*\s+—/.test(l)).join(" ");
    rec(!/Verification|Correction|Root Cause|Corrective|Effectiveness|Evidence|Status/i.test(noOptions.replace(/Framework Requirement/g, "")), "Create form exposes no Verification picker / Correction / RCA / Actions / Effectiveness / Evidence / Status");
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await wait(dlg(page).getByText("Select a Finding Type.")) && await wait(dlg(page).getByText("Title is required.")), "Submit with nothing: Type and Title errors");
    await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
    await dlg(page).locator("#fd-title").fill("   ");
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await wait(dlg(page).getByText("Title is required.")), "Whitespace-only Title rejected");
    rec((await dlg(page).getByText("Select a Finding Type.").count()) === 0, "Type error clears once chosen");
    rec(await noHOverflow(page), "Create drawer: no horizontal overflow (1280)");
    const box = await dlg(page).boundingBox();
    rec(box.width <= 401, `Desktop drawer width ${Math.round(box.width)}px (<= 400)`);
    await page.screenshot({ path: path.join(OUT, "desktop-create.png") });
    await dlg(page).getByRole("button", { name: "Cancel" }).click();
    await gone(dlg(page));
    rec((await dbQuery(`select count(*) c from issues where project_id='${f.projectA}'`)[0].c) === 0, "Validation failures created nothing");
  }

  // ===== CREATE: Observation, project-wide, nothing else =====
  await openNew(page);
  rec(await createOk(page, { type: "Observation", title: t("Obs project-wide"), description: "Seen during walk-through" }), "Create Observation (project-wide): drawer closes");
  rec(await wait(page.getByText(/^Finding F-\d{3,} created\.$/) /* 6A: toast names the number */), "Toast: Finding created");
  {
    const r = finding(t("Obs project-wide"));
    rec(r.finding_type === "observation" && r.site_id === null && r.activity_id === null && r.framework_item_id === null && r.status === "open", "DB: observation, site/activity/framework NULL, status open");
    rec(r.priority === "medium" && r.description === "Seen during walk-through", "DB: priority medium, description saved");
    rec(r.verification_item_id === null && r.document_review_id === null && r.correction === null && r.root_cause === null && r.effectiveness_result === null && r.effectiveness_notes === null && r.effectiveness_reviewed_by === null && r.effectiveness_reviewed_at === null && r.closed_at === null && r.closed_by === null, "DB: origin, response, effectiveness and closure fields all NULL on manual create");
    rec(r.created_by === admin.userId && r.project_id === f.projectA, "DB: created_by = session user, project = route project");
    rec(await wait(page.getByRole("link", { name: t("Obs project-wide") })), "New finding appears in the list");
  }

  // ===== CREATE: Nonconformity, site-specific + framework + high =====
  await openNew(page);
  {
    // Framework picker only offers ASSIGNED frameworks for a new selection
    const groups = await dlg(page).locator("#fd-framework optgroup").evaluateAll((els) => els.map((e) => e.getAttribute("label")));
    rec(groups.length === 1 && groups[0] === "ISO 14001:2015", `Framework picker: only the assigned framework (${groups.join("; ")}), no unassigned framework offered`);
    rec(await createOk(page, { type: "Nonconformity", title: t("NC site + framework"), priority: "High", site: "Viet Long", framework: "8.1 — Operational planning and control" }), "Create Nonconformity (site + framework + High)");
    const r = finding(t("NC site + framework"));
    rec(r.finding_type === "nonconformity" && r.site_id === f.vietLong && r.framework_item_id === f.item14001_81 && r.priority === "high" && r.status === "open", "DB: NC stored with site, ISO 14001:2015 8.1 item, high, open");
  }

  // ===== CREATE: OFI with a site-specific Activity (site auto-filled + locked) =====
  await openNew(page);
  {
    await dlg(page).locator("#fd-activity").selectOption(await dlg(page).locator("#fd-activity option", { hasText: "Site Assessment" }).first().getAttribute("value"));
    rec((await dlg(page).locator("#fd-site").count()) === 0, "Site-specific Activity: interactive Site select removed");
    const lockedText = await dlg(page).getByTestId("finding-site-locked").innerText();
    rec(lockedText.trim() === "Viet Long", `Site-specific Activity: Site auto-filled and locked ("${lockedText.trim()}")`);
    rec((await dlg(page).getByText("Locked because the Activity is site-specific.").count()) === 1, "Lock state explained");
    rec((await dlg(page).getByRole("button", { name: "Specific site", exact: true }).count()) === 0, "Scope toggle hidden while locked");
    await dlg(page).getByRole("button", { name: "Opportunity for Improvement", exact: true }).click();
    await dlg(page).locator("#fd-title").fill(t("OFI with activity"));
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await gone(dlg(page)), "Create OFI on a site-specific Activity");
    const r = finding(t("OFI with activity"));
    rec(r.finding_type === "opportunity_for_improvement" && r.site_id === f.vietLong && r.activity_id === f.act1, "DB: OFI stored with inherited site and activity");
  }

  // ===== CREATE: project-wide Activity: Site stays free =====
  await openNew(page);
  {
    await dlg(page).locator("#fd-activity").selectOption(await dlg(page).locator("#fd-activity option", { hasText: "Online Review" }).first().getAttribute("value"));
    rec((await dlg(page).getByTestId("finding-site-locked").count()) === 0 && (await dlg(page).getByRole("button", { name: "Project-wide", exact: true }).count()) === 1, "Project-wide Activity: Site not locked (scope toggle available)");
    await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
    await dlg(page).locator("#fd-title").fill(t("PW activity project-wide"));
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await gone(dlg(page)), "Create with project-wide Activity + Project-wide scope");
    const a = finding(t("PW activity project-wide"));
    rec(a.activity_id === f.act2 && a.site_id === null, "DB: project-wide Activity, site NULL");
  }
  await openNew(page);
  {
    await dlg(page).locator("#fd-activity").selectOption(await dlg(page).locator("#fd-activity option", { hasText: "Online Review" }).first().getAttribute("value"));
    await fill(page, { type: "Observation", title: t("PW activity + site"), site: "Long An" });
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await gone(dlg(page)), "Create with project-wide Activity + a chosen Site");
    const b = finding(t("PW activity + site"));
    rec(b.activity_id === f.act2 && b.site_id === f.longAn, "DB: project-wide Activity + Long An site");
  }

  // ===== SERVER-SIDE TAMPERING (proves the server enforces, not just the UI) =====
  {
    // a) site/activity mismatch
    await openNew(page);
    await dlg(page).locator("#fd-activity").selectOption(await dlg(page).locator("#fd-activity option", { hasText: "Site Assessment" }).first().getAttribute("value"));
    await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
    await dlg(page).locator("#fd-title").fill(t("TAMPER mismatch"));
    await tamper(page, [[f.vietLong, f.longAn]]);
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await wait(dlgError(page, /Site must match the Activity's site/)), "Server rejects a Site that differs from a site-specific Activity");
    await untamper(page);
    rec(dbQuery(`select count(*) c from issues where title='${t("TAMPER mismatch")}'`)[0].c === 0, "  ...and nothing was created");
    await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page));

    // b) cross-project site
    await openNew(page);
    await fill(page, { type: "Observation", title: t("TAMPER site"), site: "Viet Long" });
    await tamper(page, [[f.vietLong, f.betaSite]]);
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await wait(dlgError(page, /not in this project's scope/)), "Server rejects a Site from another project");
    await untamper(page);
    rec(dbQuery(`select count(*) c from issues where title='${t("TAMPER site")}'`)[0].c === 0, "  ...and nothing was created");
    await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page));

    // c) cross-project activity
    await openNew(page);
    await fill(page, { type: "Observation", title: t("TAMPER activity") });
    await tamper(page, [['"activityId":""', `"activityId":"${f.actB}"`]]);
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await wait(dlgError(page, /Activity could not be found/)), "Server rejects an Activity from another project");
    await untamper(page);
    rec(dbQuery(`select count(*) c from issues where title='${t("TAMPER activity")}'`)[0].c === 0, "  ...and nothing was created");
    await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page));

    // d) unassigned framework item
    await openNew(page);
    await fill(page, { type: "Observation", title: t("TAMPER framework") });
    await tamper(page, [['"frameworkItemId":""', `"frameworkItemId":"${f.item45001_81}"`]]);
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await wait(dlgError(page, /not assigned to this project/)), "Server rejects a Framework Item from an unassigned Framework");
    await untamper(page);
    rec(dbQuery(`select count(*) c from issues where title='${t("TAMPER framework")}'`)[0].c === 0, "  ...and nothing was created");
    await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page));

    // e) invalid finding type
    await openNew(page);
    await fill(page, { type: "Observation", title: t("TAMPER type") });
    await tamper(page, [['"findingType":"observation"', '"findingType":"bogus"']]);
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await wait(dlgError(page, /Select a Finding Type\./)), "Server rejects an invalid Finding Type");
    await untamper(page);
    rec(dbQuery(`select count(*) c from issues where title='${t("TAMPER type")}'`)[0].c === 0, "  ...and nothing was created");
    await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page));

    // f) smuggled status / closure / origin fields are ignored
    await openNew(page);
    await fill(page, { type: "Observation", title: t("TAMPER smuggle") });
    await tamper(page, [['"findingType":"observation"', `"status":"closed","closed_by":"${admin.userId}","verification_item_id":"${f.vItem}","correction":"x","findingType":"observation"`]]);
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await gone(dlg(page)), "Create with smuggled status/origin/response keys still succeeds (extras ignored)");
    await untamper(page);
    const s = finding(t("TAMPER smuggle"));
    rec(s && s.status === "open" && s.closed_at === null && s.closed_by === null && s.verification_item_id === null && s.correction === null, "DB: smuggled status/closed_by/verification_item_id/correction NOT persisted");
  }

  // ===== FINDING DETAIL (Nonconformity, 4C-1) =====
  const nc = finding(t("NC site + framework"));
  await page.goto(`${FIND_A}/${nc.id}`);
  await page.getByRole("heading", { name: t("NC site + framework"), level: 1 }).waitFor({ timeout: 20000 });
  {
    const body = flat(await page.locator("body").innerText());
    rec(/Nonconformity/.test(body) && /High/.test(body) && /Open/.test(body) && /Viet Long/.test(body) && /ISO 14001:2015 · 8\.1/.test(body) && /No activity/.test(body), "Detail header: type, priority, status, site, framework, activity");
    rec(/Recorded manually/.test(body), "Detail: origin reads 'Recorded manually'");
    rec(!/Coming soon/i.test(body) && /NC Response/.test(body) && /Effectiveness Review/.test(body), "Detail: no placeholders; NC Response / Effectiveness sections (added 4D-1/4D-2; expectation updated in 4F)");
    rec((await page.getByRole("button", { name: /Close Finding/ }).count()) === 1, "Nonconformity: Close Finding available (NC closure added 4D-2; expectation updated in 4F)");
    rec((await page.getByRole("button", { name: "Edit Finding" }).count()) === 1, "Edit Finding available while Open");
    rec((await page.getByRole("button", { name: "More actions" }).count()) === 1, "Finding Detail … menu present for controlled delete (added in 4F; expectation updated)");
    rec(!UUID.test(body), "Detail shows no UUIDs");
    rec(await noHOverflow(page), "Detail 1280: no horizontal overflow");
    await page.screenshot({ path: path.join(OUT, "desktop-detail.png") });
  }

  // ===== EDIT: core fields only; response fields untouched =====
  dbQuery(`update issues set correction='c-keep', root_cause='r-keep', effectiveness_notes='n-keep' where id='${nc.id}'`);
  await page.reload();
  await page.getByRole("button", { name: "Edit Finding" }).click();
  await dlg(page).waitFor({ state: "visible" });
  {
    rec((await dlg(page).getByRole("button", { name: "Nonconformity", exact: true }).getAttribute("aria-pressed")) === "true", "Edit preloads the current Finding Type");
    await dlg(page).locator("#fd-title").fill(t("NC edited"));
    await dlg(page).getByRole("button", { name: "Low", exact: true }).click();
    await dlg(page).getByRole("button", { name: "Save" }).click();
    rec(await gone(dlg(page)), "Edit saves");
    const r = dbQuery(`select * from issues where id='${nc.id}'`)[0];
    rec(r.title === t("NC edited") && r.priority === "low" && r.finding_type === "nonconformity", "DB: core fields updated");
    rec(r.correction === "c-keep" && r.root_cause === "r-keep" && r.effectiveness_notes === "n-keep" && r.effectiveness_result === null && r.closed_at === null, "DB: correction/root_cause/effectiveness_notes preserved, nothing else touched");
    rec(r.verification_item_id === null && r.document_review_id === null && r.created_by === admin.userId, "DB: origin fields and created_by unchanged");
  }

  // ===== HISTORICAL FRAMEWORK =====
  dbQuery(`delete from project_frameworks where project_id='${f.projectA}' and framework_id=(select id from frameworks where code='ISO 14001' and edition='2015')`);
  await page.reload();
  await page.getByRole("button", { name: "Edit Finding" }).click();
  await dlg(page).waitFor({ state: "visible" });
  {
    const groups = await dlg(page).locator("#fd-framework optgroup").evaluateAll((els) => els.map((e) => ({ label: e.getAttribute("label"), n: e.querySelectorAll("option").length })));
    rec(groups.length === 1 && groups[0].label === "ISO 14001:2015 (not currently assigned)" && groups[0].n === 1, `Historical item stays visible, marked not-assigned, and is the ONLY unassigned item offered (${JSON.stringify(groups)})`);
    rec((await dlg(page).locator("#fd-framework").inputValue()) === f.item14001_81, "Historical item stays selected");
    await dlg(page).locator("#fd-title").fill(t("NC edited 2"));
    await dlg(page).getByRole("button", { name: "Save" }).click();
    rec(await gone(dlg(page)), "Saving with the unchanged unassigned item succeeds");
    rec(dbQuery(`select framework_item_id from issues where id='${nc.id}'`)[0].framework_item_id === f.item14001_81, "DB: historical framework item preserved");
    // newly selecting a different unassigned item must be rejected server-side
    await page.getByRole("button", { name: "Edit Finding" }).click();
    await dlg(page).waitFor({ state: "visible" });
    await tamper(page, [[f.item14001_81, f.item14001_41]]);
    await dlg(page).getByRole("button", { name: "Save" }).click();
    rec(await wait(dlgError(page, /not assigned to this project/)), "Server rejects NEW selection of an item from an unassigned Framework");
    await untamper(page);
    rec(dbQuery(`select framework_item_id from issues where id='${nc.id}'`)[0].framework_item_id === f.item14001_81, "  ...and the stored value is unchanged");
    await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page));
  }
  dbQuery(`insert into project_frameworks (project_id, framework_id) select '${f.projectA}', id from frameworks where code='ISO 14001' and edition='2015'`);

  // ===== OBSERVATION CLOSE =====
  const obs = finding(t("Obs project-wide"));
  await page.goto(`${FIND_A}/${obs.id}`);
  await page.getByRole("heading", { name: t("Obs project-wide"), level: 1 }).waitFor({ timeout: 20000 });
  {
    await (await openClosePanel(page)).getByRole("button", { name: "Close Finding" }).click();
    rec(await wait(page.getByText("Finding closed")), "Observation: Close Finding (toast)");
    const r = finding(t("Obs project-wide"));
    rec(r.status === "closed" && r.closed_by === admin.userId && r.closed_at !== null && Math.abs(Date.now() - new Date(r.closed_at).getTime()) < 5 * 60 * 1000, "DB: status closed, closed_by = user, closed_at = fresh server timestamp");
    rec(await wait(page.getByRole("button", { name: "Reopen Finding" })), "Closed: Reopen offered");
    rec((await page.getByRole("button", { name: "Edit Finding" }).count()) === 0 && (await page.getByRole("button", { name: "Close Finding" }).count()) === 0, "Closed: core fields read-only (no Edit / Close)");
    rec(/closed and read-only/.test(await page.locator("body").innerText()) && (await wait(page.getByText("Closed", { exact: true }).first())), "Closed: read-only message and Closed record shown");
  }

  // ===== OFI CLOSE + stale-form server guard =====
  const ofi = finding(t("OFI with activity"));
  await page.goto(`${FIND_A}/${ofi.id}`);
  await page.getByRole("heading", { name: t("OFI with activity"), level: 1 }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Edit Finding" }).click();
  await dlg(page).waitFor({ state: "visible" });
  dbQuery(`update issues set status='closed', closed_at=now(), closed_by='${admin.userId}' where id='${ofi.id}'`);
  await dlg(page).locator("#fd-title").fill(t("OFI stale edit"));
  await dlg(page).getByRole("button", { name: "Save" }).click();
  rec(await wait(dlgError(page, /closed\. Reopen it to edit/)), "Server refuses to edit a closed Finding (stale form)");
  rec(finding(t("OFI with activity")) !== undefined && dbQuery(`select title from issues where id='${ofi.id}'`)[0].title === t("OFI with activity"), "  ...and the title was not changed");
  dbQuery(`update issues set status='open', closed_at=null, closed_by=null where id='${ofi.id}'`);
  await page.goto(`${FIND_A}/${ofi.id}`);
  await (await openClosePanel(page)).getByRole("button", { name: "Close Finding" }).click();
  rec(await wait(page.getByText("Finding closed")), "OFI: Close Finding");
  {
    const r = dbQuery(`select status, closed_at, closed_by from issues where id='${ofi.id}'`)[0];
    rec(r.status === "closed" && r.closed_by === admin.userId && r.closed_at !== null, "DB: OFI closed with closed_at/closed_by set server-side");
  }

  // ===== NC CLOSE REFUSED SERVER-SIDE =====
  {
    const open = finding(t("PW activity project-wide"));
    await page.goto(`${FIND_A}/${open.id}`);
    const panelEl = await openClosePanel(page);
    await tamper(page, [[open.id, nc.id]]);
    await panelEl.getByRole("button", { name: "Close Finding" }).click();
    rec(await wait(panelEl.getByRole("button", { name: "Close Anyway" })), "Server refuses to close a Nonconformity without confirmed warnings (tampered id; 4D-2 rule, updated in 4F)");
    await untamper(page);
    rec(dbQuery(`select status from issues where id='${nc.id}'`)[0].status === "open", "  ...Nonconformity stays open");
  }

  // ===== REOPEN =====
  {
    dbQuery(`update issues set effectiveness_result='effective', effectiveness_reviewed_by='${admin.userId}', effectiveness_reviewed_at=now(), effectiveness_notes='keep me', correction='c1', root_cause='r1' where id='${obs.id}'`);
    await page.goto(`${FIND_A}/${obs.id}`);
    await page.getByRole("button", { name: "Reopen Finding" }).click();
    const banner = page.locator("div.bg-warning-soft");
    await banner.waitFor({ state: "visible" });
    rec(/Reopen this finding\? It returns to Open and can be edited again\./.test(flat(await banner.innerText())), "Reopen confirm (Observation wording since 4D-2; updated in 4F)");
    await banner.getByRole("button", { name: "Reopen Finding" }).click();
    rec(await wait(page.getByText("Finding reopened")), "Reopen Finding (toast)");
    const r = dbQuery(`select * from issues where id='${obs.id}'`)[0];
    rec(r.status === "open" && r.closed_at === null && r.closed_by === null, "DB: reopened -> open, closed_at/closed_by NULL");
    rec(r.effectiveness_result === null && r.effectiveness_reviewed_by === null && r.effectiveness_reviewed_at === null, "DB: effectiveness_result/reviewed_by/reviewed_at reset to NULL");
    rec(r.effectiveness_notes === "keep me" && r.correction === "c1" && r.root_cause === "r1", "DB: effectiveness_notes, correction and root_cause preserved");
    rec(await wait(page.getByRole("button", { name: "Edit Finding" })), "Reopened: editable again");
  }

  // ===== LINKED ACTION SAFETY (direct fixture; no Actions UI) =====
  {
    const target = finding(t("PW activity + site"));
    dbQuery(`insert into actions (project_id, issue_id, description, status) values ('${f.projectA}', '${target.id}', '${t("linked open action")}', 'open')`);
    await page.goto(`${FIND_A}/${target.id}`);
    const banner = await openClosePanel(page);
    rec(/1 action is still open\./.test(flat(await banner.innerText())) && (await banner.getByRole("button", { name: /^Close (Finding|Anyway)$/ }).count()) === 0, "Open linked Action blocks closing an Observation");
    rec(dbQuery(`select status from issues where id='${target.id}'`)[0].status === "open", "  ...Finding stays open");
    await banner.getByRole("button", { name: "Back" }).click();
    dbQuery(`update actions set status='closed', completed_at=now() where issue_id='${target.id}'`);
    await (await openClosePanel(page)).getByRole("button", { name: "Close Finding" }).click();
    rec(await wait(page.getByText("Finding closed")), "Once the linked Action is closed, the Finding can close");
    rec(dbQuery(`select status from issues where id='${target.id}'`)[0].status === "closed", "DB: closed");
    // reopening keeps the action
    await page.getByRole("button", { name: "Reopen Finding" }).click();
    await page.locator("div.bg-warning-soft").getByRole("button", { name: "Reopen Finding" }).click();
    await wait(page.getByText("Finding reopened"));
    rec(dbQuery(`select count(*) c from actions where issue_id='${target.id}'`)[0].c === 1, "Reopen preserves linked actions");
  }

  // ===== LIST: sort / columns / search / filters (project S) =====
  await page.goto(FIND_S);
  await page.getByRole("heading", { name: "Findings", exact: true }).waitFor({ timeout: 20000 });
  await page.locator("tbody tr").first().waitFor({ timeout: 15000 });
  {
    const heads = flat(await page.locator("thead").innerText());
    rec(/FINDING TYPE SITE FRAMEWORK PRIORITY STATUS/i.test(heads), `Table columns: ${heads}`);
    rec(!/Correction|Root Cause|Actions|Effectiveness/i.test(heads), "Table has no response/actions/effectiveness columns");
    const titles = await rowsTitles(page);
    const expected = ["Alpha high newer", "Beta tie", "Zeta high older", "Medium one", "Low one", "Closed high"].map(t);
    rec(JSON.stringify(titles) === JSON.stringify(expected), `Default order: Open first -> priority -> newest -> title (${titles.map((x) => x.replace("P4C1-ACCEPT-", "")).join(" | ")})`);
    rec(await noHOverflow(page), "List 1280: no horizontal overflow");
    await page.screenshot({ path: path.join(OUT, "desktop-list.png") });

    const search = page.getByLabel("Search findings");
    await search.fill("Long An");
    rec(JSON.stringify(await rowsTitles(page)) === JSON.stringify([t("Low one")]), "Search matches Site name");
    await search.fill("operational");
    rec(JSON.stringify(await rowsTitles(page)) === JSON.stringify([t("Zeta high older")]), "Search matches Framework requirement text");
    await search.fill("quarterly");
    rec(JSON.stringify(await rowsTitles(page)) === JSON.stringify([t("Alpha high newer")]), "Search matches Description");
    await search.fill("beta tie");
    rec(JSON.stringify(await rowsTitles(page)) === JSON.stringify([t("Beta tie")]), "Search matches Title");
    await search.fill("");
    await page.getByLabel("Filter by Type").selectOption("nonconformity");
    rec(JSON.stringify(await rowsTitles(page)) === JSON.stringify([t("Beta tie"), t("Zeta high older")]), "Filter: Type = Nonconformity");
    await page.getByLabel("Filter by Type").selectOption("all");
    await page.getByLabel("Filter by Status").selectOption("closed");
    rec(JSON.stringify(await rowsTitles(page)) === JSON.stringify([t("Closed high")]), "Filter: Status = Closed");
    await page.getByLabel("Filter by Status").selectOption("all");
    await page.getByLabel("Filter by Site").selectOption("Viet Long");
    rec(JSON.stringify(await rowsTitles(page)) === JSON.stringify([t("Zeta high older")]), "Filter: Site = Viet Long");
    await page.getByLabel("Filter by Site").selectOption("all");
    await page.getByLabel("Filter by Priority").selectOption("low");
    rec(JSON.stringify(await rowsTitles(page)) === JSON.stringify([t("Low one")]), "Filter: Priority = Low");
    await search.fill("zzz-no-match");
    rec(await wait(page.getByText("No findings match the current search or filters.")), "No-match empty state");
    await page.getByRole("button", { name: "Clear search and filters" }).click();
    rec((await rowsTitles(page)).length === 6, "Clear search and filters restores all rows");
    await page.locator("tbody tr", { hasText: t("Beta tie") }).click();
    await page.waitForURL("**/findings/*", { timeout: 15000 });
    rec(await wait(page.getByRole("heading", { name: t("Beta tie"), level: 1 })), "Row click opens Finding Detail");
  }

  // ===== PROJECT SCOPE PROTECTION =====
  {
    await page.goto(`${APP}/projects/${f.projectA}/findings/${f.findingB}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    let body = await page.locator("body").innerText();
    rec(!body.includes(t("B finding")) && /Page not found|doesn.t exist/i.test(body), "Project B finding via Project A URL: not found, title never revealed");
    await page.goto(`${APP}/projects/${f.projectB}/findings/${nc.id}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    body = await page.locator("body").innerText();
    rec(!body.includes("NC edited") && /Page not found|doesn.t exist/i.test(body), "Project A finding via Project B URL: not found");
    await page.goto(`${APP}/projects/${f.projectA}/findings`);
    await page.getByRole("heading", { name: "Findings", exact: true }).waitFor();
    rec(!(await page.locator("body").innerText()).includes(t("B finding")), "Project A list never includes Project B findings");
  }

  // ===== REGRESSION: Verification / Activity Detail / Import / Plan / Overview / Frameworks =====
  {
    await page.goto(`${APP}/projects/${f.projectA}/verification`);
    rec(await wait(page.getByRole("heading", { name: "Verification", exact: true })) && await wait(page.getByRole("button", { name: "+ New Verification Item" }).first()) && await wait(page.getByRole("link", { name: "Import Excel" })), "Regression: Verification workspace (+ New Verification Item, Import Excel)");
    rec(await wait(page.getByText(t("Check chemical storage")).first()), "Regression: verification item listed");
    await page.goto(`${APP}/projects/${f.projectA}/verification/import`);
    rec(await wait(page.getByRole("heading", { name: "Import Verification Items" })), "Regression: Excel import page");
    const tpl = await ctx.request.get(`${APP}/projects/${f.projectA}/verification/template`);
    rec(tpl.status() === 200, "Regression: Excel template download");
    await page.goto(`${APP}/projects/${f.projectA}/plan`);
    rec(await wait(page.getByText(t("Site Assessment")).first()), "Regression: Master Plan lists activities");
    await page.goto(`${APP}/projects/${f.projectA}`);
    rec(await wait(page.getByRole("heading", { name: t("Project-A").replace("P4C1-ACCEPT-", "P4C1-ACCEPT-"), level: 1 })), "Regression: Project Overview");
    await page.goto(`${APP}/frameworks`);
    rec(await wait(page.getByText("ISO 14001").first()), "Regression: Framework Library");
    const issuesBefore = dbQuery(`select count(*) c from issues where project_id='${f.projectA}'`)[0].c;
    await page.goto(`${APP}/projects/${f.projectA}/activities/${f.act1}`);
    await page.getByText(t("Check chemical storage")).first().waitFor({ timeout: 20000 });
    const card = page.locator("div.rounded-lg", { hasText: t("Check chemical storage") }).last();
    await card.getByRole("button", { name: "Verify" }).click();
    await dlg(page).waitFor({ state: "visible" });
    await dlg(page).getByRole("button", { name: "Issue Identified", exact: true }).click();
    await dlg(page).locator("#ve-notes").fill("Containers without secondary containment");
    await dlg(page).getByRole("button", { name: "Save" }).click();
    rec(await gone(dlg(page)), "Regression: Phase 4B execution saves 'Issue Identified'");
    const v = dbQuery(`select result, notes from verification_items where id='${f.vItem}'`)[0];
    rec(v.result === "issue_identified" && v.notes === "Containers without secondary containment", "Regression: result and Observation persisted");
    const issuesAfter = dbQuery(`select count(*) c from issues where project_id='${f.projectA}'`)[0].c;
    rec(issuesBefore === issuesAfter, `Issue Identified created NO Finding (issues ${issuesBefore} -> ${issuesAfter})`);
    const actText = await page.locator("body").innerText();
    rec(/Create Finding/.test(actText) && !/View Findings?/.test(actText), "Activity Detail: Create Finding offered after Issue Identified, no Finding yet (4C-2 behaviour; expectation updated in 4F)");
    rec(dbQuery(`select count(*) c from issues where verification_item_id is not null`)[0].c === 0, "No issue anywhere has a verification link");
  }

  // ===== AUTHORIZATION =====
  {
    const cctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const cp = await cctx.newPage();
    await login(cp, "consultant");
    await openNew(cp);
    rec(await createOk(cp, { type: "Observation", title: t("Consultant finding") }), "Consultant: creates a Finding");
    const row = finding(t("Consultant finding"));
    rec(row && row.created_by === consultant.userId, "Consultant: created_by = the consultant");
    await cp.goto(`${FIND_A}/${row.id}`);
    await (await openClosePanel(cp)).getByRole("button", { name: "Close Finding" }).click();
    rec(await wait(cp.getByText("Finding closed")), "Consultant: closes an Observation");
    rec(dbQuery(`select closed_by from issues where id='${row.id}'`)[0].closed_by === consultant.userId, "Consultant: closed_by = the consultant");
    await cctx.close();
    const anonPage = await fetch(FIND_A, { redirect: "manual" });
    rec(anonPage.status >= 300 && anonPage.status < 400 && /login/.test(anonPage.headers.get("location") ?? ""), `Anon: Findings page redirects to /login (HTTP ${anonPage.status})`);
    const anonDetail = await fetch(`${FIND_A}/${nc.id}`, { redirect: "manual" });
    rec(anonDetail.status >= 300 && anonDetail.status < 400, `Anon: Finding Detail redirects (HTTP ${anonDetail.status})`);
    const anonIns = await http("POST", "/rest/v1/issues", { body: { project_id: f.projectA, title: t("ANON"), finding_type: "observation" } });
    const anonSel = await http("GET", "/rest/v1/issues?select=id");
    rec(anonIns.status >= 400 && anonSel.status >= 400 && dbQuery(`select count(*) c from issues where title='${t("ANON")}'`)[0].c === 0, `Anon: direct issues insert/select denied (HTTP ${anonIns.status}/${anonSel.status})`);
  }

  // ===== MOBILE (390 / 412) =====
  for (const width of [390, 412]) {
    const mctx = await browser.newContext({ viewport: { width, height: 844 } });
    const mp = await mctx.newPage();
    await login(mp, "admin");
    await mp.goto(FIND_S);
    await mp.getByRole("heading", { name: "Findings", exact: true }).waitFor({ timeout: 20000 });
    await mp.locator('a[href*="/findings/"]:visible').first().waitFor({ timeout: 15000 });
    rec(!(await mp.locator("table").first().isVisible().catch(() => false)), `Mobile ${width}: list uses cards (table hidden)`);
    rec((await mp.locator('a[href*="/findings/"]:visible').count()) === 6, `Mobile ${width}: all 6 finding cards rendered`);
    rec(await noHOverflow(mp), `Mobile ${width}: list has no horizontal overflow`);
    await mp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await mp.waitForTimeout(300);
    const clear = await mp.evaluate(() => {
      const cards = [...document.querySelectorAll('a[href*="/findings/"]')].filter((a) => a.getBoundingClientRect().height > 20);
      const last = cards[cards.length - 1].getBoundingClientRect();
      const nav = document.querySelector('nav[class*="fixed"]');
      return { lastBottom: last.bottom, navTop: nav ? nav.getBoundingClientRect().top : window.innerHeight };
    });
    rec(clear.lastBottom <= clear.navTop + 1, `Mobile ${width}: bottom navigation does not cover the last finding (last bottom ${Math.round(clear.lastBottom)} <= nav top ${Math.round(clear.navTop)})`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-list.png`) });

    await mp.evaluate(() => window.scrollTo(0, 0));
    await mp.getByRole("button", { name: "+ New Finding" }).first().click();
    await dlg(mp).waitFor({ state: "visible" });
    const box = await dlg(mp).boundingBox();
    rec(box.width >= width - 2, `Mobile ${width}: New Finding is a full-width sheet (${Math.round(box.width)}px)`);
    const tapOk = await dlg(mp).getByRole("button", { name: /^(Nonconformity|Observation|Opportunity for Improvement)$/ }).evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 40));
    rec(tapOk, `Mobile ${width}: Finding Type buttons have comfortable tap targets`);
    rec(await noHOverflow(mp), `Mobile ${width}: New Finding sheet has no horizontal overflow`);
    const createVisible = await dlg(mp).getByRole("button", { name: "Create" }).evaluate((e) => { const r = e.getBoundingClientRect(); return r.bottom <= window.innerHeight && r.right <= window.innerWidth && r.left >= 0; });
    rec(createVisible, `Mobile ${width}: Create button inside the viewport`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-create.png`) });
    await dlg(mp).getByRole("button", { name: "Cancel" }).click();
    await gone(dlg(mp));

    // site lock state (project A has the site-specific activity)
    await mp.goto(FIND_A);
    await mp.getByRole("heading", { name: "Findings", exact: true }).waitFor({ timeout: 20000 });
    await mp.getByRole("button", { name: "+ New Finding" }).first().click();
    await dlg(mp).waitFor({ state: "visible" });
    await dlg(mp).locator("#fd-activity").selectOption(await dlg(mp).locator("#fd-activity option", { hasText: "Site Assessment" }).first().getAttribute("value"));
    rec(/Viet Long/.test(await dlg(mp).getByTestId("finding-site-locked").innerText()) && (await dlg(mp).getByText("Locked because the Activity is site-specific.").isVisible()), `Mobile ${width}: Site lock state is clear`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-locked.png`) });
    await mp.keyboard.press("Escape");
    await gone(dlg(mp));

    await mp.goto(`${FIND_A}/${nc.id}`);
    await mp.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
    rec(await noHOverflow(mp), `Mobile ${width}: Finding Detail has no horizontal overflow`);
    const btnsIn = await mp.getByRole("button", { name: /Edit Finding|Close Finding|Reopen Finding/ }).evaluateAll((els) => els.every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
    rec(btnsIn, `Mobile ${width}: Finding Detail actions are not clipped`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-detail.png`) });
    await mctx.close();
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
