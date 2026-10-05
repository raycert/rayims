import { chromium } from "playwright-core";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { REPO, users, makeReporter, http, signIn, dbQuery } from "./common.mjs";
import { createFixtures, q, NOTE } from "./p4c2-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p4c2-files");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);

const noHOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const wait = (l, timeout = 15000) => l.waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
const gone = (l, timeout = 15000) => l.waitFor({ state: "hidden", timeout }).then(() => true).catch(() => false);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const snapshotSql = `select
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.verification_items t where project_id in (select id from public.projects where name not like 'P4C2-ACCEPT-%')) as vi,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.activities t where project_id in (select id from public.projects where name not like 'P4C2-ACCEPT-%')) as act,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.projects t where name not like 'P4C2-ACCEPT-%') as proj,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.clients t where name not like 'P4C2-ACCEPT-%') as cl,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.sites t where client_id in (select id from public.clients where name not like 'P4C2-ACCEPT-%')) as st,
  (select md5(coalesce(string_agg(t::text,'|' order by project_id, framework_id),'')) from public.project_frameworks t where project_id in (select id from public.projects where name not like 'P4C2-ACCEPT-%')) as pf,
  (select count(*) from public.frameworks) as frameworks, (select count(*) from public.framework_items) as items,
  (select count(*) from public.activity_types) as atypes,
  (select count(*) from public.issues where project_id in (select id from public.projects where name not like 'P4C2-ACCEPT-%')) as issues,
  (select count(*) from public.actions where project_id in (select id from public.projects where name not like 'P4C2-ACCEPT-%')) as actions,
  (select count(*) from public.attachments) as attachments, (select count(*) from public.files) as files`;

const before = dbQuery(snapshotSql)[0];
console.log("BEFORE", JSON.stringify(before));
rec(before.issues === 0 && before.actions === 0 && before.attachments === 0 && before.files === 0, "Pre-flight: issues/actions/attachments/files all 0");
rec(dbQuery(`select count(*) c from clients where name = 'Chinh Long'`)[0].c === 1 && dbQuery(`select count(*) c from verification_items where project_id in (select id from projects where name not like 'P4C2-ACCEPT-%')`)[0].c === 3, "Pre-flight: genuine Chinh Long data present (3 verification items)");
const admin = await signIn("admin");
const consultant = await signIn("consultant");
rec(admin.ok && consultant.ok, "Setup: admin and consultant sign-in");

const f = createFixtures();
const v = f.v;
writeFileSync(path.join(OUT, "fixture-ids.json"), JSON.stringify(f));
const ACT = (id, p = f.projectA) => `${APP}/projects/${p}/activities/${id}`;
const rowHash = (id) => dbQuery(`select md5(t::text) h from verification_items t where id='${id}'`)[0].h;
const issueCount = (p = f.projectA) => dbQuery(`select count(*) c from issues where project_id='${p}'`)[0].c;
const finding = (title) => dbQuery(`select * from issues where title='${title}'`)[0];
const findingsFor = (vid) => dbQuery(`select * from issues where verification_item_id='${vid}' order by created_at`);
const t = (s) => `P4C2-ACCEPT-${s}`;

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function login(page, who = "admin") {
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
}
const dlg = (page) => page.getByRole("dialog");
const card = (page, name) => page.locator("div.rounded-lg", { hasText: q(name) }).last();
async function openActivity(page, id, p = f.projectA) {
  await page.goto(ACT(id, p));
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  await page.getByText("Verification", { exact: true }).first().waitFor({ timeout: 20000 });
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
const dlgErr = (page, re) => dlg(page).getByText(re).first();
async function pickType(page, name) { await dlg(page).getByRole("button", { name, exact: true }).click(); }
async function openCreate(page, cardName, btn = "Create Finding") {
  await card(page, cardName).getByRole("button", { name: btn }).click();
  await dlg(page).waitFor({ state: "visible" });
}
async function cancel(page) { await dlg(page).getByRole("button", { name: "Cancel" }).click(); await gone(dlg(page)); }

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await login(page, "admin");

  // ===== ELIGIBILITY =====
  await openActivity(page, f.actVL);
  {
    const issueBtn = card(page, "Q-issue").getByRole("button", { name: "Create Finding" });
    const followBtn = card(page, "Q-follow").getByRole("button", { name: "Create Finding" });
    rec(await wait(issueBtn), "Issue Identified card: Create Finding shown");
    rec(await wait(followBtn), "Follow-up Required card: Create Finding shown");
    const ic = await issueBtn.getAttribute("class"), fc = await followBtn.getAttribute("class");
    rec(/bg-primary/.test(ic) && !/bg-primary/.test(fc), "Issue Identified action is prominent (primary); Follow-up Required is secondary");
    rec((await card(page, "Q-ok").getByRole("button", { name: /Finding/ }).count()) === 0, "Verified OK card: no Create Finding");
    rec((await card(page, "Q-pending").getByRole("button", { name: /Finding/ }).count()) === 0, "Pending card: no Create Finding");
    rec((await card(page, "Q-cross").getByRole("button", { name: /Finding/ }).count()) === 0 && /Completed in another activity/.test(await card(page, "Q-cross").innerText()), "Completed in another Activity: no Create Finding here (still 'Completed in another activity')");
    rec((await page.getByTestId("finding-summary").count()) === 0, "No linked findings yet: no finding summary shown");
    rec(issueCount() === 0, "Seeded Issue Identified / Follow-up Required results created ZERO findings");
  }

  // ===== SERVER-SIDE ELIGIBILITY / ISOLATION (real Server Action, body rewritten) =====
  {
    const cases = [
      ["Verified OK item", [[v.issue, v.ok]], /Issue Identified or Follow-up Required/],
      ["Pending item", [[v.issue, v.pending]], /activity where this check was verified|Issue Identified or Follow-up Required/],
      ["item verified in another Activity", [[v.issue, v.cross]], /activity where this check was verified/],
      ["verification item of another project", [[v.issue, v.b]], /verification item could not be found/],
      ["a different (valid) Activity", [[f.actVL, f.actPW]], /activity where this check was verified/],
      ["an Activity of another project", [[f.actVL, f.actB]], /This activity could not be found/],
      ["Site Long An on a site-specific Activity", [[f.vietLong, f.longAn]], /Site must match the Activity's site/],
      ["a Site of another project", [[f.vietLong, f.betaSite]], /Site must match the Activity's site/],
      ["a Framework Item of an unassigned Framework", [[`"frameworkItemId":"${f.item81}"`, `"frameworkItemId":"${f.item45001_81}"`]], /not assigned to this project/],
      ["an invalid Finding Type", [['"findingType":"nonconformity"', '"findingType":"bogus"']], /Select a Finding Type\./],
    ];
    for (const [label, rep, re] of cases) {
      await openActivity(page, f.actVL);
      await openCreate(page, "Q-issue");
      await pickType(page, "Nonconformity");
      await dlg(page).locator("#fd-title").fill(t("TAMPER " + label));
      await tamper(page, rep);
      await dlg(page).getByRole("button", { name: "Create" }).click();
      rec(await wait(dlgErr(page, re)), `Server rejects: ${label}`);
      await untamper(page);
      await cancel(page);
    }
    rec(issueCount() === 0 && issueCount(f.projectB) === 0, "All rejected attempts created NOTHING (either project)");
  }

  // ===== CREATE FINDING FROM ISSUE IDENTIFIED (prefill + origin) =====
  const hashBefore = rowHash(v.issue);
  await openActivity(page, f.actVL);
  await openCreate(page, "Q-issue");
  {
    const d = dlg(page);
    const originText = flat(await d.getByTestId("finding-origin").innerText());
    rec(/Verification:\s*P4C2-ACCEPT-Q-issue/.test(originText) && /Activity:.*Site Assessment/.test(originText), `Origin box shows the check and the Activity ("${originText.slice(0, 90)}")`);
    rec(!UUID.test(await d.innerText()), "Drawer shows no UUIDs");
    const pressed = await Promise.all(["Nonconformity", "Observation", "Opportunity for Improvement"].map((n) => d.getByRole("button", { name: n, exact: true }).getAttribute("aria-pressed")));
    rec(pressed.every((x) => x === "false"), `Finding Type BLANK (no mapping from Issue Identified): ${pressed.join(",")}`);
    rec((await d.locator("#fd-title").inputValue()) === "", "Title BLANK (the check question is not used)");
    rec((await d.locator("#fd-description").inputValue()) === NOTE, "Description prefilled EXACTLY with the Observation");
    rec((await d.getByRole("button", { name: "High", exact: true }).getAttribute("aria-pressed")) === "true", "Priority prefilled from the check (High)");
    rec((await d.locator("#fd-framework").inputValue()) === f.item81, "Framework Requirement prefilled (ISO 14001:2015 · 8.1)");
    rec((await d.locator("#fd-activity").count()) === 0 && (await d.getByTestId("finding-activity-fixed").count()) === 1, "Activity is fixed (no picker)");
    rec((await d.locator("#fd-site").count()) === 0 && (await d.getByTestId("finding-site-locked").innerText()).trim() === "Viet Long", "Site-specific Activity: Site inferred and locked (Viet Long)");
    rec(!/Correction|Root Cause|Corrective|Effectiveness|Evidence|Status/i.test((await d.innerText()).split(/\r?\n/).filter((l) => !/^\d+(\.\d+)*\s+—/.test(l)).join(" ").replace(/Framework Requirement/g, "")), "No response/effectiveness/evidence fields in the form");
    await d.getByRole("button", { name: "Create" }).click();
    rec(await wait(d.getByText("Select a Finding Type.")) && await wait(d.getByText("Title is required.")), "Type and Title are required");
    await pickType(page, "Nonconformity");
    await d.locator("#fd-title").fill(t("No secondary containment"));
    await d.getByRole("button", { name: "Medium", exact: true }).click();
    await d.locator("#fd-framework").selectOption({ label: "8.2 — Emergency preparedness and response" });
    await d.getByRole("button", { name: "Create" }).click();
    rec(await gone(d), "Create Finding saves and closes the drawer");
    rec(await wait(page.getByText(/^Finding F-\d{3,} created\.$/) /* 6A: toast names the number */), "Toast: Finding created");
    rec(page.url().includes(`/activities/${f.actVL}`), "Consultant stays on Activity Detail");
    const r = finding(t("No secondary containment"));
    rec(r.verification_item_id === v.issue && r.activity_id === f.actVL && r.site_id === f.vietLong && r.created_by === admin.userId && r.status === "open" && r.project_id === f.projectA, "DB: verification link, activity context, site, created_by, status open, project");
    rec(r.finding_type === "nonconformity" && r.description === NOTE && r.priority === "medium" && r.framework_item_id === f.item82, "DB: chosen type; description = Observation; priority changed to Medium; framework changed to 8.2");
    rec(r.correction === null && r.root_cause === null && r.effectiveness_result === null && r.closed_at === null && r.closed_by === null, "DB: response/effectiveness/closure fields NULL");
    rec(rowHash(v.issue) === hashBefore, "Verification item byte-identical (priority High, framework 8.1, result and notes unchanged)");
    const sum = card(page, "Q-issue").getByTestId("finding-summary");
    rec(await wait(sum) && /^1 Finding\b/.test(flat(await sum.innerText())), "Verification card now shows '1 Finding'");
    const link = card(page, "Q-issue").getByRole("link", { name: /^View F-\d{3,}$/ }) /* 6A: link names the number */;
    rec((await link.getAttribute("href")) === `/projects/${f.projectA}/findings/${r.id}`, "View Finding links straight to the Finding");
    rec(await wait(card(page, "Q-issue").getByRole("button", { name: "Add another Finding" })) && (await card(page, "Q-issue").getByRole("button", { name: "Create Finding" }).count()) === 0, "Button becomes 'Add another Finding'");
  }

  // ===== MULTIPLE FINDINGS PER VERIFICATION =====
  await openCreate(page, "Q-issue", "Add another Finding");
  {
    const d = dlg(page);
    rec((await d.locator("#fd-framework").inputValue()) === f.item81, "Second Finding: Framework prefilled from the (unchanged) check");
    await pickType(page, "Observation");
    await d.locator("#fd-title").fill(t("Faded labels"));
    await d.getByRole("button", { name: "Create" }).click();
    rec(await gone(d), "Second Finding created");
    const rows = findingsFor(v.issue);
    rec(rows.length === 2 && rows.every((x) => x.activity_id === f.actVL), "DB: 2 findings share verification_item_id and activity_id (no uniqueness constraint)");
    const sum = card(page, "Q-issue").getByTestId("finding-summary");
    await sum.getByText(/^2 Findings/).waitFor({ timeout: 15000 });
    rec(true, "Card shows '2 Findings'");
    await card(page, "Q-issue").getByRole("button", { name: "View Findings" }).click();
    const items = card(page, "Q-issue").locator("ul li");
    rec((await items.count()) === 2, "View Findings expands an inline compact list of 2");
    const li0 = flat(await items.nth(0).innerText()), li1 = flat(await items.nth(1).innerText());
    rec(/Nonconformity/.test(li0) && /No secondary containment/.test(li0) && /Open/.test(li0) && /Observation/.test(li1) && /Faded labels/.test(li1), `List entries show Type, Title, Status ("${li0}" | "${li1}")`);
    rec((await items.nth(1).getByRole("link").getAttribute("href")).includes("/findings/"), "Each entry links to its Finding Detail");
    await card(page, "Q-issue").getByRole("button", { name: "Hide Findings" }).click();
    rec((await card(page, "Q-issue").locator("ul li").count()) === 0, "List collapses");
  }

  // ===== FOLLOW-UP REQUIRED (+ smuggled keys ignored) =====
  await openCreate(page, "Q-follow");
  {
    const d = dlg(page);
    rec((await d.locator("#fd-description").inputValue()) === "Latest SDS could not be confirmed." && (await d.locator("#fd-framework").inputValue()) === "", "Follow-up: Observation prefilled, no framework");
    await pickType(page, "Observation");
    await d.locator("#fd-title").fill(t("SDS not confirmed"));
    await tamper(page, [['"findingType":"observation"', `"status":"closed","closed_by":"${admin.userId}","verification_item_id":"${v.ok}","activity_id":"${f.actPW}","created_by":"${consultant.userId}","findingType":"observation"`]]);
    await d.getByRole("button", { name: "Create" }).click();
    rec(await gone(d), "Follow-up Required: Create Finding works (secondary action)");
    await untamper(page);
    const r = finding(t("SDS not confirmed"));
    rec(r.verification_item_id === v.follow && r.activity_id === f.actVL && r.status === "open" && r.closed_at === null && r.closed_by === null && r.created_by === admin.userId, "DB: smuggled status/closed_by/verification_item_id/activity_id/created_by ignored");
  }

  // ===== BLANK OBSERVATION / LOW PRIORITY / NO FRAMEWORK =====
  await openCreate(page, "Q-nonotes");
  {
    const d = dlg(page);
    rec((await d.locator("#fd-description").inputValue()) === "", "Blank Observation: Description stays blank (question NOT substituted)");
    rec((await d.getByRole("button", { name: "Low", exact: true }).getAttribute("aria-pressed")) === "true" && (await d.locator("#fd-framework").inputValue()) === "", "Priority Low prefilled; no framework");
    await pickType(page, "Opportunity for Improvement");
    await d.locator("#fd-title").fill(t("No-notes finding"));
    await d.getByRole("button", { name: "Create" }).click();
    rec(await gone(d), "Created");
    const r = finding(t("No-notes finding"));
    rec(r.description === null && r.priority === "low" && r.framework_item_id === null && r.finding_type === "opportunity_for_improvement", "DB: description NULL, low, no framework, OFI");
  }

  // ===== HISTORICAL (inherited) FRAMEWORK =====
  {
    await openCreate(page, "Q-hist");
    const d = dlg(page);
    const groups = await d.locator("#fd-framework optgroup").evaluateAll((els) => els.map((e) => e.getAttribute("label")));
    rec(groups.includes("ISO 45001:2018 (not currently assigned)") && (await d.locator("#fd-framework").inputValue()) === f.item45001_81, "Check's unassigned Framework item is inherited, visible and marked not-assigned");
    await pickType(page, "Observation");
    await d.locator("#fd-title").fill(t("Hist framework rejected"));
    await tamper(page, [[f.item45001_81, f.item45001_41]]);
    await d.getByRole("button", { name: "Create" }).click();
    rec(await wait(dlgErr(page, /not assigned to this project/)), "Server rejects choosing a DIFFERENT unassigned item");
    await untamper(page);
    await d.locator("#fd-title").fill(t("Hist framework"));
    await d.getByRole("button", { name: "Create" }).click();
    rec(await gone(d), "Inheriting the check's own item unchanged is allowed");
    rec(finding(t("Hist framework")).framework_item_id === f.item45001_81, "DB: inherited historical framework item stored");
  }

  // ===== PROJECT-WIDE ACTIVITY: Site prefilled from the check, editable =====
  await openActivity(page, f.actPW);
  {
    await openCreate(page, "Q-pw");
    const d = dlg(page);
    rec((await d.locator("#fd-site").inputValue()) === f.vietLong && (await d.getByTestId("finding-site-locked").count()) === 0, "Project-wide Activity: Site prefilled from the check (Viet Long) and NOT locked");
    await pickType(page, "Observation");
    await d.locator("#fd-title").fill(t("PW rejected site"));
    await tamper(page, [[f.vietLong, f.betaSite]]);
    await d.getByRole("button", { name: "Create" }).click();
    rec(await wait(dlgErr(page, /not in this project's scope/)), "Server rejects a Site from another project");
    await untamper(page);
    await d.getByRole("button", { name: "Project-wide", exact: true }).click();
    await d.locator("#fd-title").fill(t("PW project-wide"));
    await d.getByRole("button", { name: "Create" }).click();
    rec(await gone(d), "Change Site to Project-wide and create");
    let r = finding(t("PW project-wide"));
    rec(r.site_id === null && r.activity_id === f.actPW && r.verification_item_id === v.pw, "DB: project-wide site, activity = the project-wide Activity, verification linked");
    await openCreate(page, "Q-pw", "Add another Finding");
    await pickType(page, "Observation");
    await dlg(page).locator("#fd-site").selectOption({ label: "Long An" });
    await dlg(page).locator("#fd-title").fill(t("PW long an"));
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await gone(dlg(page)), "Or pick another Project Site");
    r = finding(t("PW long an"));
    rec(r.site_id === f.longAn && r.activity_id === f.actPW, "DB: Long An site stored");
  }

  // ===== CROSS-ACTIVITY =====
  await openActivity(page, f.actB2);
  {
    rec(/Planned for another activity/.test(await card(page, "Q-cross").innerText()), "Activity B: check shows 'Planned for another activity'");
    await openCreate(page, "Q-cross");
    await pickType(page, "Observation");
    await dlg(page).locator("#fd-title").fill(t("Cross activity finding"));
    await dlg(page).getByRole("button", { name: "Create" }).click();
    rec(await gone(dlg(page)), "Create Finding in the Activity where it was verified");
    const r = finding(t("Cross activity finding"));
    rec(r.activity_id === f.actB2 && r.verification_item_id === v.cross && r.site_id === f.vietLong, "DB: Finding.activity_id = Activity B (the executing Activity), not the planned Activity A");
    await openActivity(page, f.actVL);
    rec((await card(page, "Q-cross").getByRole("button", { name: /Finding/ }).count()) === 0 && /1 Finding/.test(await card(page, "Q-cross").innerText()), "Activity A: still no Create Finding, but the linked Finding is counted");
  }

  // ===== FINDING DETAIL ORIGIN + EDIT TRACEABILITY =====
  const nc = finding(t("No secondary containment"));
  await page.goto(`${APP}/projects/${f.projectA}/findings/${nc.id}`);
  await page.getByRole("heading", { name: t("No secondary containment"), level: 1 }).waitFor({ timeout: 20000 });
  {
    const body = flat(await page.locator("body").innerText());
    rec(/Created from Verification/.test(body) && !/Recorded manually/.test(body), "Detail Origin: 'Created from Verification'");
    rec(body.includes(q("Q-issue")) && /Site Assessment/.test(body) && /Viet Long/.test(body) && /ISO 14001:2015 · 8\.2/.test(body), "Detail Origin shows the check, Activity, Site and Framework");
    rec(!UUID.test(body), "No UUIDs on the detail");
    const link = page.getByRole("link", { name: /Site Assessment/ }).last();
    rec((await link.getAttribute("href")) === `/projects/${f.projectA}/activities/${f.actVL}`, "Activity link points back to Activity Detail");
    await page.screenshot({ path: path.join(OUT, "desktop-detail-origin.png") });
    await link.click();
    await page.waitForURL(`**/activities/${f.actVL}`, { timeout: 15000 });
    rec(true, "Activity link works");
  }
  await page.goto(`${APP}/projects/${f.projectA}/findings/${nc.id}`);
  await page.getByRole("button", { name: "Edit Finding" }).click();
  await dlg(page).waitFor({ state: "visible" });
  {
    const d = dlg(page);
    rec((await d.locator("#fd-activity").count()) === 0 && (await d.getByTestId("finding-activity-fixed").count()) === 1, "Edit (verification-linked): Activity is read-only");
    rec(/Site Assessment/.test(await d.getByTestId("finding-activity-fixed").innerText()), "  ...and shows the observation Activity");
    await d.locator("#fd-framework").selectOption({ label: "8.1 — Operational planning and control" });
    await d.locator("#fd-title").fill(t("No secondary containment v2"));
    await d.getByRole("button", { name: "Save" }).click();
    rec(await gone(d), "Framework Requirement and title editable while Open");
    const r = dbQuery(`select * from issues where id='${nc.id}'`)[0];
    rec(r.framework_item_id === f.item81 && r.title === t("No secondary containment v2") && r.verification_item_id === v.issue && r.activity_id === f.actVL, "DB: framework/title changed; verification link and Activity unchanged");
    rec(rowHash(v.issue) === hashBefore, "Verification item still byte-identical after editing the Finding");
    await page.getByRole("button", { name: "Edit Finding" }).click();
    await d.waitFor({ state: "visible" });
    await tamper(page, [[`"activityId":"${f.actVL}"`, `"activityId":"${f.actPW}"`]]);
    await d.getByRole("button", { name: "Save" }).click();
    rec(await wait(dlgErr(page, /can't be changed/)), "Server refuses to change a verification-linked Finding's Activity");
    await untamper(page);
    rec(dbQuery(`select activity_id from issues where id='${nc.id}'`)[0].activity_id === f.actVL, "  ...Activity unchanged");
    await cancel(page);
  }
  // manual Finding keeps the free Activity picker
  await page.goto(`${APP}/projects/${f.projectA}/findings`);
  await page.getByRole("button", { name: "+ New Finding" }).first().click();
  await dlg(page).waitFor({ state: "visible" });
  await pickType(page, "Observation");
  await dlg(page).locator("#fd-title").fill(t("Manual finding"));
  await dlg(page).getByRole("button", { name: "Create" }).click();
  rec(await gone(dlg(page)), "Manual Finding create still works");
  {
    const man = finding(t("Manual finding"));
    rec(man.verification_item_id === null, "Manual Finding has no verification link");
    await page.goto(`${APP}/projects/${f.projectA}/findings/${man.id}`);
    rec(await wait(page.getByText("Recorded manually")) && !(await page.locator("body").innerText()).includes("Created from Verification"), "Manual Finding still says 'Recorded manually'");
    await page.getByRole("button", { name: "Edit Finding" }).click();
    await dlg(page).waitFor({ state: "visible" });
    rec((await dlg(page).locator("#fd-activity").count()) === 1, "Manual Finding: Activity picker still available while Open");
    await dlg(page).locator("#fd-activity").selectOption(f.actPW);
    await dlg(page).getByRole("button", { name: "Save" }).click();
    rec(await gone(dlg(page)) && dbQuery(`select activity_id from issues where id='${man.id}'`)[0].activity_id === f.actPW, "Manual Finding: Activity can still be changed (4C-1 behaviour)");
  }

  // ===== CLOSED FINDINGS REMAIN COUNTED =====
  {
    const faded = finding(t("Faded labels"));
    await page.goto(`${APP}/projects/${f.projectA}/findings/${faded.id}`);
    await page.getByRole("button", { name: "Close Finding" }).click();
    await page.locator("div.bg-warning-soft").getByRole("button", { name: "Close Finding" }).click();
    rec(await wait(page.getByText("Finding closed")), "Close the Observation created from a Verification");
    rec(await gone(page.getByRole("button", { name: "Edit Finding" })) && await wait(page.getByRole("button", { name: "Reopen Finding" })), "Closed: no core edit without Reopen");
    await openActivity(page, f.actVL);
    const sum = card(page, "Q-issue").getByTestId("finding-summary");
    rec(/^2 Findings/.test(flat(await sum.innerText())), "Closed Finding still counted ('2 Findings')");
    await card(page, "Q-issue").getByRole("button", { name: "View Findings" }).click();
    const li = flat(await card(page, "Q-issue").locator("ul li").nth(1).innerText());
    rec(/Faded labels/.test(li) && /Closed/.test(li), `List shows the closed Finding as Closed ("${li}")`);
    rec((await card(page, "Q-issue").locator("ul li").nth(1).getByRole("link").getAttribute("href")).endsWith(`/findings/${faded.id}`), "Closed Finding's link still works");
    // reopen (4C-1 regression)
    await page.goto(`${APP}/projects/${f.projectA}/findings/${faded.id}`);
    await page.getByRole("button", { name: "Reopen Finding" }).click();
    await page.locator("div.bg-warning-soft").getByRole("button", { name: "Reopen Finding" }).click();
    rec(await wait(page.getByText("Finding reopened")), "Reopen still works");
    await page.goto(`${APP}/projects/${f.projectA}/findings/${nc.id}`);
    // 6E: wait for the Finding page to render before counting (the single read right after goto was timing-sensitive)
    await page.getByRole("button", { name: /Close Finding/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
    rec((await page.getByRole("button", { name: /Close Finding/ }).count()) === 1, "Nonconformity: Close Finding available (NC closure added in 4D-2; expectation updated in 4F)");
  }

  // ===== RECORDING A RESULT ALONE CREATES ZERO FINDINGS =====
  await openActivity(page, f.actVL);
  {
    const total = () => dbQuery(`select count(*) c from issues`)[0].c;
    for (const [name, res, btnRe] of [["Q-exec1", "Issue Identified", "primary"], ["Q-exec2", "Follow-up Required", "secondary"]]) {
      const n0 = total();
      await card(page, name).getByRole("button", { name: "Verify" }).click();
      await dlg(page).waitFor({ state: "visible" });
      await dlg(page).getByRole("button", { name: res, exact: true }).click();
      await dlg(page).locator("#ve-notes").fill("Recorded onsite");
      await dlg(page).getByRole("button", { name: "Save" }).click();
      rec(await gone(dlg(page)), `Execute '${res}'`);
      const btn = card(page, name).getByRole("button", { name: "Create Finding" });
      rec(await wait(btn), `  ...after saving, Create Finding is OFFERED (not auto-created)`);
      rec(total() === n0, `  ...and '${res}' alone created ZERO Findings (issues ${n0} -> ${total()})`);
      rec(btnRe === "primary" ? /bg-primary/.test(await btn.getAttribute("class")) : !/bg-primary/.test(await btn.getAttribute("class")), `  ...action prominence is ${btnRe}`);
      rec((await card(page, name).getByTestId("finding-summary").count()) === 0, "  ...no finding summary yet");
    }
  }

  // ===== DESKTOP DENSITY =====
  {
    await page.goto(ACT(f.actVL));
    await page.getByText("Verification", { exact: true }).first().waitFor({ timeout: 20000 });
    const h = async (n) => (await card(page, n).boundingBox()).height;
    const withFindings = await h("Q-issue");
    const plain = await h("Q-ok");
    rec(withFindings - plain < 90, `Desktop: card with finding summary + actions is compact (${Math.round(withFindings)}px vs ${Math.round(plain)}px plain, +${Math.round(withFindings - plain)})`);
    rec(await noHOverflow(page), "Desktop 1280: Activity Detail has no horizontal overflow");
    await page.screenshot({ path: path.join(OUT, "desktop-activity.png"), fullPage: false });
    await openCreate(page, "Q-follow", "Add another Finding");
    const box = await dlg(page).boundingBox();
    rec(box.width <= 401, `Desktop: Finding drawer keeps the established width (${Math.round(box.width)}px)`);
    await page.screenshot({ path: path.join(OUT, "desktop-drawer.png") });
    await cancel(page);
  }

  // ===== SINGLE-QUERY EMBED (no N+1) =====
  {
    const r = await http("GET", `/rest/v1/verification_items?select=id,question,issues(id,title,finding_type,status)&project_id=eq.${f.projectA}&target_activity_id=eq.${f.actVL}`, { token: admin.token });
    const row = (r.json ?? []).find((x) => x.question === q("Q-issue"));
    rec(r.status === 200 && row && row.issues.length === 2, "One PostgREST request returns the items WITH their linked findings (embedded relationship)");
    const src = readFileSync(REPO + "/lib/queries/verification-items.ts", "utf8");
    const fnBody = src.slice(src.indexOf("export async function listActivityVerificationItems"), src.indexOf("export type VerificationSiteOption"));
    rec((fnBody.match(/\.from\("verification_items"\)/g) ?? []).length === 2 && !/\.from\("issues"\)/.test(fnBody) && /issues\(id, finding_no, title, finding_type, status, created_at\)/.test(fnBody) /* 6A: embed also carries finding_no */, "Code: still exactly 2 queries (target + verified), finding summary is an embed — no per-item query");
  }

  // ===== MOBILE ONSITE FLOW (390 / 412) =====
  for (const width of [390, 412]) {
    const name = `Q-m${width}`;
    const mctx = await browser.newContext({ viewport: { width, height: 844 } });
    const mp = await mctx.newPage();
    await login(mp, "admin");
    await openActivity(mp, f.actVL);
    const c = card(mp, name);
    await c.scrollIntoViewIfNeeded();
    await c.getByRole("button", { name: "Verify" }).click();
    await dlg(mp).waitFor({ state: "visible" });
    await dlg(mp).getByRole("button", { name: "Issue Identified", exact: true }).click();
    await dlg(mp).locator("#ve-notes").fill(`Mobile observation ${width}`);
    await dlg(mp).getByRole("button", { name: "Save" }).click();
    rec(await gone(dlg(mp)), `Mobile ${width}: record Issue Identified onsite`);
    rec(dbQuery(`select count(*) c from issues where description = 'Mobile observation ${width}'`)[0].c === 0, `Mobile ${width}: nothing auto-created`);
    const createBtn = card(mp, name).getByRole("button", { name: "Create Finding" });
    await createBtn.scrollIntoViewIfNeeded();
    rec(await wait(createBtn), `Mobile ${width}: Create Finding reachable`);
    await createBtn.click();
    await dlg(mp).waitFor({ state: "visible" });
    const d = dlg(mp);
    const box = await d.boundingBox();
    rec(box.width >= width - 2, `Mobile ${width}: full-width sheet (${Math.round(box.width)}px)`);
    rec(await d.getByTestId("finding-origin").isVisible() && flat(await d.getByTestId("finding-origin").innerText()).includes(name), `Mobile ${width}: compact origin context visible`);
    const tapOk = await d.getByRole("button", { name: /^(Nonconformity|Observation|Opportunity for Improvement)$/ }).evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 40));
    rec(tapOk, `Mobile ${width}: Type control usable (tap targets >= 40px)`);
    rec((await d.locator("#fd-description").inputValue()) === `Mobile observation ${width}` && (await d.getByRole("button", { name: "High", exact: true }).getAttribute("aria-pressed")) === "true", `Mobile ${width}: description and priority prefilled`);
    rec(/Viet Long/.test(await d.getByTestId("finding-site-locked").innerText()) && await d.getByText("Locked because the Activity is site-specific.").isVisible(), `Mobile ${width}: Site lock state clear`);
    rec(await noHOverflow(mp), `Mobile ${width}: no horizontal overflow with the sheet open`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-sheet-top.png`) });
    await pickType(mp, "Nonconformity");
    await d.locator("#fd-title").fill(t(`Mobile finding ${width}`));
    await d.locator("#fd-framework").scrollIntoViewIfNeeded();
    rec(await d.locator("#fd-framework").isVisible(), `Mobile ${width}: Framework control usable`);
    const createOk = await d.getByRole("button", { name: "Create" }).evaluate((e) => {
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.bottom <= window.innerHeight && r.right <= window.innerWidth && !!top && (top === e || e.contains(top));
    });
    rec(createOk, `Mobile ${width}: Save button reachable and not covered (bottom navigation is behind the sheet)`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-sheet.png`) });
    await d.getByRole("button", { name: "Create" }).click();
    rec(await gone(d), `Mobile ${width}: Save closes the sheet`);
    rec(mp.url().includes(`/activities/${f.actVL}`), `Mobile ${width}: remains on Activity Detail`);
    const s = card(mp, name).getByTestId("finding-summary");
    rec(await wait(s) && /^1 Finding\b/.test(flat(await s.innerText())), `Mobile ${width}: card shows '1 Finding'`);
    rec(await noHOverflow(mp), `Mobile ${width}: Activity Detail no horizontal overflow after`);
    await card(mp, name).scrollIntoViewIfNeeded();
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-after.png`) });
    const r = finding(t(`Mobile finding ${width}`));
    rec(r && r.verification_item_id === v[`m${width}`] && r.activity_id === f.actVL && r.finding_type === "nonconformity", `Mobile ${width}: DB verification + activity link stored`);
    await mctx.close();
  }

  // ===== AUTHORIZATION / ISOLATION =====
  {
    const cctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const cp = await cctx.newPage();
    await login(cp, "consultant");
    await openActivity(cp, f.actVL);
    await openCreate(cp, "Q-cons");
    await pickType(cp, "Observation");
    await dlg(cp).locator("#fd-title").fill(t("Consultant finding"));
    await dlg(cp).getByRole("button", { name: "Create" }).click();
    rec(await gone(dlg(cp)), "Consultant: creates a Finding from a Verification");
    const r = finding(t("Consultant finding"));
    rec(r.created_by === consultant.userId && r.verification_item_id === v.cons, "Consultant: created_by = the consultant, verification linked");
    await cctx.close();
    const anon = await fetch(ACT(f.actVL), { redirect: "manual" });
    rec(anon.status >= 300 && anon.status < 400 && /login/.test(anon.headers.get("location") ?? ""), `Anon: Activity Detail redirects to /login (HTTP ${anon.status})`);
    const anonIns = await http("POST", "/rest/v1/issues", { body: { project_id: f.projectA, title: t("ANON"), finding_type: "observation", verification_item_id: v.issue } });
    rec(anonIns.status >= 400 && dbQuery(`select count(*) c from issues where title='${t("ANON")}'`)[0].c === 0, `Anon: direct insert denied (HTTP ${anonIns.status})`);
    await page.goto(ACT(f.actB));
    await page.waitForLoadState("networkidle").catch(() => {});
    const body = await page.locator("body").innerText();
    rec(/Page not found|doesn.t exist/i.test(body) && !body.includes("Beta Activity") && !body.includes("Q-projB"), "Project A URL + Project B Activity: not found, nothing from Project B leaks");
  }

  // ===== REGRESSION =====
  {
    await page.goto(`${APP}/projects/${f.projectA}/verification`);
    rec(await wait(page.getByRole("heading", { name: "Verification", exact: true })) && await wait(page.getByRole("link", { name: "Import Excel" })), "Regression: Project Verification workspace");
    rec(!/Create Finding/i.test(await page.locator("body").innerText()), "Project Verification workspace has NO Create Finding (integration is Activity-only)");
    await page.goto(`${APP}/projects/${f.projectA}/findings`);
    rec(await wait(page.getByRole("link", { name: t("Manual finding") })) && await wait(page.getByRole("link", { name: t("Mobile finding 390") })), "Regression: Findings workspace lists manual and verification-linked findings");
    await page.goto(`${APP}/projects/${f.projectA}/verification/import`);
    rec(await wait(page.getByRole("heading", { name: "Import Verification Items" })), "Regression: Excel import page");
    await page.goto(`${APP}/projects/${f.projectA}/plan`);
    rec(await wait(page.getByText(t("Site Assessment")).first()), "Regression: Master Plan");
    await page.goto(`${APP}/projects/${f.projectA}`);
    rec(await wait(page.getByRole("heading", { name: "P4C2-ACCEPT-Project-A", level: 1 })), "Regression: Project Overview");
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
