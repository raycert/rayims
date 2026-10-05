import { chromium } from "playwright-core";
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { REPO, users, makeReporter, http, signIn, dbQuery, URL_ } from "./common.mjs";
import { createFixtures } from "./p4b5-fixtures.mjs";
import { ExcelJS, makeXlsx, writeRaw, sizeOf, ID, DIR, HEADERS, EN } from "./p4b5-helpers.mjs";

const APP = "http://127.0.0.1:3105";
const R = makeReporter();
const rec = R.rec.bind(R);

const noHOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const wait = (l, timeout = 15000) => l.waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
const gone = (l, timeout = 15000) => l.waitFor({ state: "hidden", timeout }).then(() => true).catch(() => false);

const snapshotSql = `select
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.verification_items t where project_id in (select id from public.projects where name not like 'P4B5-ACCEPT-%')) as vi,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.activities t where project_id in (select id from public.projects where name not like 'P4B5-ACCEPT-%')) as act,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.projects t where name not like 'P4B5-ACCEPT-%') as proj,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.clients t where name not like 'P4B5-ACCEPT-%') as cl,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.sites t where client_id in (select id from public.clients where name not like 'P4B5-ACCEPT-%')) as st,
  (select md5(coalesce(string_agg(t::text,'|' order by project_id, framework_id),'')) from public.project_frameworks t where project_id in (select id from public.projects where name not like 'P4B5-ACCEPT-%')) as pf,
  (select count(*) from public.frameworks) as frameworks,
  (select count(*) from public.framework_items) as items,
  (select count(*) from public.activity_types) as atypes,
  (select count(*) from public.issues) as issues,
  (select count(*) from public.actions) as actions,
  (select count(*) from public.attachments) as attachments,
  (select count(*) from public.files) as files`;

const before = dbQuery(snapshotSql)[0];
console.log("BEFORE", JSON.stringify(before));
const admin = await signIn("admin");
const consultant = await signIn("consultant");
rec(admin.ok && consultant.ok, "Setup: admin and consultant sign-in");

const f = createFixtures();
const IMPORT_URL = `${APP}/projects/${f.projectA}/verification/import`;
const VERIF_URL = `${APP}/projects/${f.projectA}/verification`;

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function login(page, who = "admin") {
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
}

const alertLoc = (pg) => pg.locator('div[role="alert"].text-danger');
const rowLoc = (page, n) =>
  page.locator("tbody tr").filter({ has: page.locator("td:first-child").filter({ hasText: new RegExp(`^${n}$`) }) });
const rowText = async (page, n) => (await rowLoc(page, n).innerText()).replace(/\s+/g, " ");
async function counts(page) {
  const t = (await page.getByText(/^\d+ rows$/).locator("..").innerText()).replace(/\s+/g, " ");
  const m = t.match(/(\d+) rows (\d+) Ready (\d+) Warnings (\d+) Errors/);
  return m ? { rows: +m[1], ready: +m[2], warn: +m[3], err: +m[4] } : null;
}
const importBtn = (page) => page.getByRole("button", { name: /^Import \d+ Verification Items?$/ });
async function upload(page, file, { fresh = true } = {}) {
  if (fresh) {
    await page.goto(IMPORT_URL);
    await page.getByRole("heading", { name: "Import Verification Items" }).waitFor({ timeout: 20000 });
  }
  await page.locator('input[type="file"]').setInputFiles(file);
  await Promise.race([wait(page.getByText(/^\d+ rows$/), 40000), wait(alertLoc(page), 40000)]);
}
const q = (s) => `P4B5-ACCEPT-${s}`;
const dbItems = (like) =>
  dbQuery(`select question, priority, site_id, target_activity_id, framework_item_id, result, notes, verified_activity_id, verified_by, verified_at, created_by, project_id from public.verification_items where question like '${like}' order by question`);

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await login(page, "admin");

  // ===== ENTRY POINT (desktop) =====
  await page.goto(VERIF_URL);
  await page.getByRole("heading", { name: "Verification", exact: true }).waitFor({ timeout: 20000 });
  rec(await wait(page.getByRole("button", { name: "+ New Verification Item" }).first()), "Desktop: + New Verification Item visible");
  rec(await wait(page.getByRole("link", { name: "Import Excel" })), "Desktop: Import Excel visible");
  await page.getByRole("link", { name: "Import Excel" }).click();
  await page.waitForURL("**/verification/import", { timeout: 15000 });
  rec(await wait(page.getByRole("heading", { name: "Import Verification Items" })), "Import page opens at /verification/import");
  rec(await wait(page.getByRole("link", { name: /Back to Verification/ })), "Import page: Back to Verification link");
  rec(await wait(page.getByRole("link", { name: "Download Template" })), "Import page: Download Template visible");
  rec(await wait(page.getByRole("button", { name: "Choose .xlsx file" })), "Import page: file picker button visible");
  rec(await noHOverflow(page), "Desktop 1280: import page has no horizontal overflow");

  // ===== TEMPLATE DOWNLOAD =====
  const tplRes = await ctx.request.get(`${APP}/projects/${f.projectA}/verification/template`);
  rec(tplRes.status() === 200, "Template: 200 for signed-in user");
  const h = tplRes.headers();
  rec(/spreadsheetml\.sheet/.test(h["content-type"] ?? ""), "Template: xlsx content-type");
  rec(/attachment/.test(h["content-disposition"] ?? "") && /\.xlsx/.test(h["content-disposition"] ?? ""), "Template: attachment .xlsx filename");
  const tplBytes = await tplRes.body();
  const tplFile = writeRaw("template.xlsx", tplBytes);
  const twb = new ExcelJS.Workbook();
  await twb.xlsx.load(tplBytes);
  const names = twb.worksheets.map((s) => s.name);
  rec(names[0] === "Verification Items" && names[1] === "Instructions" && names.length === 2, `Template: sheets = ${names.join(", ")}`);
  const hdr = [];
  twb.getWorksheet("Verification Items").getRow(1).eachCell((c) => hdr.push(c.text));
  rec(JSON.stringify(hdr) === JSON.stringify(HEADERS), "Template: exactly the six approved headers");
  rec(twb.getWorksheet("Verification Items").actualRowCount === 1, "Template: data sheet has header only (untouched template imports nothing)");
  const guideText = [];
  twb.getWorksheet("Instructions").eachRow((r) => r.eachCell((c) => guideText.push(c.text)));
  const gt = guideText.join("\n");
  rec(gt.includes(ID.act1) && gt.includes(ID.act2) && gt.includes(ID.act3) && gt.includes(ID.act4) && gt.includes(ID.act5), "Template: Instructions list every project activity in the approved identity format");
  rec(gt.includes(ID.amb), "Template: ambiguous twin activities listed (both share one identity)");
  rec(!gt.includes(ID.beta) && !gt.includes("Beta Site"), "Template: other project's activity/site not included");
  rec(gt.includes("ISO 14001:2015") && gt.includes("ISO 9001:2015") && !gt.includes("ISO 45001:2018"), "Template: Frameworks use canonical identity; only assigned ones");
  rec(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(gt) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(hdr.join()), "Template: no UUIDs anywhere");
  rec(!/Result|Observation|Verified|Issue|Action|Evidence|Created/.test(hdr.join()), "Template: no Result/Observation/etc. columns");
  rec(!tplBytes.toString("latin1").includes("vbaProject"), "Template: no macros");
  rec(/only the Verification Items sheet is imported/i.test(gt), "Template: Instructions say only the data sheet is imported");
  rec(/EXAMPLE/.test(gt) && !/EXAMPLE/.test(twb.getWorksheet("Verification Items").getRow(2).getCell(1).text), "Template: examples are on the Instructions sheet and clearly labelled");

  // untouched template upload -> no data rows
  await upload(page, tplFile);
  const untouchedAlert = await alertLoc(page).innerText().catch(() => "");
  rec(/No data rows/i.test(untouchedAlert), `Untouched template rejected: "${untouchedAlert.slice(0, 80)}"`);

  // filled copy of the downloaded template
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(tplBytes);
    const ws = wb.getWorksheet("Verification Items");
    ws.addRow([q("Filled template row"), "High", "Long An", "", "ISO 9001:2015", "7.5"]);
    const file = path.join(DIR, "filled-template.xlsx");
    await wb.xlsx.writeFile(file);
    await upload(page, file);
    const c = await counts(page);
    rec(c && c.rows === 1 && c.ready === 1 && c.err === 0, `Filled copy of generated template: valid preview ${JSON.stringify(c)}`);
  }

  // ===== MAIN VALID WORKBOOK =====
  const MAIN = [
    [q("Project-wide check"), "", "", "", "", ""], // row 2
    [q("Site inferred"), "high", "", ID.act1, "", ""], // 3
    [q("Framework pair 14001"), "MEDIUM", "", "", "ISO 14001:2015", "8.1"], // 4
    [q("Framework pair 9001"), "", "", "", "ISO 9001:2015", "8.1"], // 5
    [q("PW activity + site"), "Low", "Long An", ID.act3, "", ""], // 6
    [q("PW activity no site"), "", "", ID.act3, "", ""], // 7
    [q("Undated site-specific"), "", "", ID.act4, "", ""], // 8
    [q("Undated project-wide"), "", "", ID.act5, "", ""], // 9
    [q("Explicit matching site"), "High", "viet long", ID.act2, "", ""], // 10
  ];
  const mainFile = await makeXlsx("main.xlsx", MAIN, { extraSheets: ["Notes"] });
  await upload(page, mainFile);
  {
    const c = await counts(page);
    rec(c && c.rows === 9 && c.ready === 9 && c.warn === 0 && c.err === 0, `Valid workbook preview: ${JSON.stringify(c)} (extra worksheet ignored)`);
    rec((await page.getByRole("checkbox").count()) === 0, "No duplicate warnings -> no confirmation checkbox");
    rec(/Project-wide/.test(await rowText(page, 2)) && /Medium/.test(await rowText(page, 2)), "Preview: blank Site -> Project-wide, blank Priority -> Medium (resolved values shown)");
    const r3 = await rowText(page, 3);
    rec(/Viet Long/.test(r3) && /\(inferred\)/.test(r3) && /High/.test(r3), `Preview: Site inferred shown "(inferred)", 'high' normalized to High`);
    rec(/ISO 14001:2015 · 8\.1/.test(await rowText(page, 4)) && /Medium/.test(await rowText(page, 4)), "Preview: framework shown as 'ISO 14001:2015 · 8.1', 'MEDIUM' -> Medium");
    rec(/Long An/.test(await rowText(page, 6)) && !/inferred/.test(await rowText(page, 6)), "Preview: project-wide Activity + explicit Site keeps the Site (not inferred)");
    rec(/Project-wide/.test(await rowText(page, 7)) && !/inferred/.test(await rowText(page, 7)), "Preview: project-wide Activity + blank Site stays Project-wide");
    rec(/Long An/.test(await rowText(page, 8)) && /inferred/.test(await rowText(page, 8)), "Preview: undated site-specific Activity infers its Site");
    rec(/Viet Long/.test(await rowText(page, 10)) && !/inferred/.test(await rowText(page, 10)), "Preview: explicit case-insensitive matching Site accepted");
    const uuidInPage = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(await page.locator("body").innerText());
    rec(!uuidInPage, "Preview: no UUIDs shown");
    rec(/You are about to create 9 Verification Items/.test(await page.locator("body").innerText()) && /can.t\s+currently be undone/.test(await page.locator("body").innerText()), "Preview: 'about to create N' + 'cannot be undone as a batch' text");
    rec(await noHOverflow(page), "Desktop 1280: preview has no horizontal page overflow");
    await page.screenshot({ path: path.join(DIR, "preview-valid.png") });
    const pre = await dbItems("P4B5-ACCEPT-%");
    rec(pre.length === 1 && pre[0].question === "P4B5-ACCEPT-Existing check", "Preview writes nothing (only the fixture's own existing item exists)");
  }

  // ===== IMPORT (atomic) =====
  await importBtn(page).click();
  rec(await wait(page.getByText("9 Verification Items imported"), 40000), "After import: toast '9 Verification Items imported'");
  rec(/\/verification$/.test(page.url().split("?")[0]) && !/\/import/.test(page.url()), `After import: returned to Verification workspace (${page.url().replace(APP, "")})`);
  await page.waitForTimeout(500);
  rec(!/imported=/.test(page.url()), "After import: ?imported= stripped from URL after the toast");
  rec(await wait(page.getByText(q("Site inferred")).first()), "Imported items appear in the normal Verification workspace");
  {
    const rows = await dbItems("P4B5-ACCEPT-%");
    const by = Object.fromEntries(rows.map((r) => [r.question, r]));
    rec(rows.length === 10, `DB: 9 imported + fixture existing check = ${rows.length}`);
    const imported = rows.filter((r) => r.question !== "P4B5-ACCEPT-Existing check");
    rec(imported.length === 9, "DB: exactly 9 imported rows");
    rec(imported.every((r) => r.result === null && r.notes === null && r.verified_activity_id === null && r.verified_by === null && r.verified_at === null), "DB: result/notes/verified_* all NULL (planning-only)");
    rec(imported.every((r) => r.created_by === admin.userId && r.project_id === f.projectA), "DB: created_by = importing user; project = fixture project");
    rec(by[q("Project-wide check")].priority === "medium" && by[q("Project-wide check")].site_id === null && by[q("Project-wide check")].target_activity_id === null && by[q("Project-wide check")].framework_item_id === null, "DB: project-wide row (medium, no site/activity/framework)");
    rec(by[q("Site inferred")].site_id === f.vietLong && by[q("Site inferred")].target_activity_id === f.act1 && by[q("Site inferred")].priority === "high", "DB: site inferred from site-specific Target Activity");
    rec(by[q("Framework pair 14001")].priority === "medium", "DB: 'MEDIUM' stored as medium");
    const fi = dbQuery(`select fi.id, f.code from framework_items fi join frameworks f on f.id=fi.framework_id where fi.code='8.1' and f.code in ('ISO 14001','ISO 9001')`);
    const id14 = fi.find((x) => x.code === "ISO 14001").id;
    const id9 = fi.find((x) => x.code === "ISO 9001").id;
    rec(by[q("Framework pair 14001")].framework_item_id === id14 && by[q("Framework pair 9001")].framework_item_id === id9, "DB: '8.1' resolved within the named Framework (14001 vs 9001 differ)");
    rec(by[q("PW activity + site")].site_id === f.longAn && by[q("PW activity + site")].target_activity_id === f.act3, "DB: project-wide Activity + specific Site preserved");
    rec(by[q("PW activity no site")].site_id === null && by[q("PW activity no site")].target_activity_id === f.act3, "DB: project-wide Activity + blank Site stays project-wide (not inferred)");
    rec(by[q("Undated site-specific")].site_id === f.longAn && by[q("Undated site-specific")].target_activity_id === f.act4, "DB: undated site-specific Activity resolved + site inferred");
    rec(by[q("Undated project-wide")].site_id === null && by[q("Undated project-wide")].target_activity_id === f.act5, "DB: undated project-wide Activity resolved");
    rec(by[q("Explicit matching site")].site_id === f.vietLong && by[q("Explicit matching site")].target_activity_id === f.act2, "DB: dated-no-time Activity + explicit Site resolved");
    const mid = dbQuery(`select count(*) c from files`)[0].c + "/" + dbQuery(`select count(*) c from attachments`)[0].c;
    rec(mid === `${before.files}/${before.attachments}`, "Import created no files/attachments rows (workbook not stored)");
  }

  // ===== PHASE 4B REGRESSION on an imported, targeted item =====
  await page.goto(`${APP}/projects/${f.projectA}/activities/${f.act1}`);
  await page.getByText(q("Site inferred")).first().waitFor({ timeout: 20000 });
  rec(true, "Activity Detail shows the imported check for its Target Activity");
  {
    const card = page.locator("div.rounded-lg", { hasText: q("Site inferred") }).last();
    await card.getByRole("button", { name: "Verify" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.waitFor({ state: "visible" });
    await dlg.getByRole("button", { name: "Verified OK", exact: true }).click();
    await dlg.locator("#ve-notes").fill("P4B5 execution regression");
    await dlg.getByRole("button", { name: "Save" }).click();
    rec(await gone(dlg), "Phase 4B: execution drawer saves an imported item");
    const row = dbQuery(`select result, notes, verified_activity_id, verified_by from verification_items where question='${q("Site inferred")}'`)[0];
    rec(row.result === "verified_ok" && row.notes === "P4B5 execution regression" && row.verified_activity_id === f.act1 && row.verified_by === admin.userId, "Phase 4B: result/notes/verified_* recorded normally");
  }

  // Project Verification list shows Site + framework for imported rows
  await page.goto(VERIF_URL);
  await page.getByText(q("Framework pair 14001")).first().waitFor({ timeout: 20000 });
  {
    const tr = page.locator("tbody tr", { hasText: q("Framework pair 14001") });
    const txt = (await tr.innerText()).replace(/\s+/g, " ");
    rec(/ISO 14001:2015/.test(txt) && /8\.1/.test(txt), "Verification list: imported framework item shows ISO 14001:2015 / 8.1");
    const tr2 = page.locator("tbody tr", { hasText: q("Site inferred") });
    rec(/Viet Long/.test((await tr2.innerText()).replace(/\s+/g, " ")), "Verification list: inferred Site shown");
  }

  // ===== MANUAL CREATE REGRESSION =====
  {
    await page.getByRole("button", { name: "+ New Verification Item" }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.waitFor({ state: "visible" });
    await dlg.locator("#vi-question").fill(q("Manual regression"));
    await dlg.getByRole("button", { name: "Create" }).click();
    rec(await gone(dlg), "Manual create still works");
    rec(dbItems(q("Manual regression")).length === 1, "Manual create: row persisted");
    // Site inheritance still works: choose site-specific target -> site select removed
    await page.getByRole("button", { name: "+ New Verification Item" }).first().click();
    await dlg.waitFor({ state: "visible" });
    const opt = await dlg.locator("#vi-target-activity option", { hasText: "Site Assessment" }).first().getAttribute("value");
    await dlg.locator("#vi-target-activity").selectOption(opt);
    rec((await dlg.locator("#vi-site").count()) === 0, "Manual create: Site select removed for a site-specific Target Activity (4A inheritance intact)");
    rec((await dlg.locator("#vi-framework").count()) === 1, "Manual create: Framework picker present");
    await dlg.getByRole("button", { name: "Close" }).click();
    await gone(dlg);
    // Planning edit of an executed imported item must not touch execution fields
    await page.locator("tbody tr", { hasText: q("Site inferred") }).click();
    await dlg.waitFor({ state: "visible" });
    await dlg.locator("#vi-question").fill(q("Site inferred") + " edited");
    await dlg.getByRole("button", { name: "Save" }).click();
    await gone(dlg);
    const row = dbQuery(`select result, notes, verified_activity_id from verification_items where question='${q("Site inferred")} edited'`)[0];
    rec(row && row.result === "verified_ok" && row.notes === "P4B5 execution regression" && row.verified_activity_id === f.act1, "Planning edit of an imported executed item leaves execution fields untouched");
    dbQuery(`update verification_items set question='${q("Site inferred")}' where question='${q("Site inferred")} edited'`);
  }

  // ===== ERROR WORKBOOK =====
  const ERR = [
    ["", "", "Viet Long", "", "", ""], // 2 blank question
    [q("bad priority"), "Urgent", "", "", "", ""], // 3
    [q("unknown site"), "", "Vietlong", "", "", ""], // 4
    [q("ambiguous site"), "", "Dup Site", "", "", ""], // 5
    [q("old-format activity"), "", "", `2026-10-27 | 09:00 | Site Assessment ${EN} Viet Long`, "", ""], // 6
    [q("ambiguous activity"), "", "", ID.amb, "", ""], // 7
    [q("site mismatch"), "", "Long An", ID.act1, "", ""], // 8
    [q("unknown framework"), "", "", "", "ISO 99999:2020", "1.1"], // 9
    [q("unassigned framework"), "", "", "", "ISO 45001:2018", "8.1"], // 10
    [q("framework no item"), "", "", "", "ISO 14001:2015", ""], // 11
    [q("item no framework"), "", "", "", "", "8.1"], // 12
    [q("unknown item"), "", "", "", "ISO 14001:2015", "99.99"], // 13
    [q("other project activity"), "", "", ID.beta, "", ""], // 14
    [q("out-of-project site"), "", "Beta Site", "", "", ""], // 15
    [q("valid among errors"), "", "", "", "", ""], // 16
  ];
  await upload(page, await makeXlsx("err.xlsx", ERR));
  {
    const c = await counts(page);
    rec(c && c.rows === 15 && c.ready === 1 && c.err === 14 && c.warn === 0, `Error workbook counts ${JSON.stringify(c)}`);
    const expect = [
      [2, /Check \/ Question is required/],
      [3, /Priority "Urgent" isn.t recognized/],
      [4, /Unknown Site "Vietlong"/],
      [5, /Ambiguous Site "Dup Site"/],
      [6, /Unknown Target Activity/],
      [7, /Ambiguous Target Activity/],
      [8, /doesn.t match the Target Activity.s site/],
      [9, /Unknown Framework "ISO 99999:2020"/],
      [10, /isn.t assigned to this project/],
      [11, /Framework Item is required when Framework is provided\./],
      [12, /Framework is required when Framework Item is provided\./],
      [13, /Framework Item "99\.99" wasn.t found in ISO 14001:2015/],
      [14, /Unknown Target Activity/],
      [15, /Unknown Site "Beta Site"/],
    ];
    for (const [n, re] of expect) rec(re.test(await rowText(page, n)) && /Error/.test(await rowText(page, n)), `Row ${n}: ${re}`);
    rec(/Ready/.test(await rowText(page, 16)), "Row 16: valid row still shown Ready");
    rec((await rowLoc(page, 3).locator("td").nth(2).innerText()).trim() === "Urgent", "Row 3: invalid Priority shown as typed (not disguised as Medium)");
    rec((await importBtn(page).count()) === 1 && (await importBtn(page).isDisabled()), "Any Error -> Import button disabled");
    const bodyText = await page.locator("body").innerText();
    rec(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(bodyText) && !/violates|constraint|PGRST|SQLSTATE/i.test(bodyText), "Error preview: no UUIDs or database terminology");
    rec(await noHOverflow(page), "Desktop 1280: error preview no horizontal page overflow");
    await page.screenshot({ path: path.join(DIR, "preview-errors.png") });
    rec(dbItems(q("%")).filter((r) => /bad priority|unknown|ambiguous|mismatch|valid among/.test(r.question)).length === 0, "Error workbook: 0 rows inserted");
  }

  // ===== DUPLICATES =====
  await upload(page, await makeXlsx("dup1.xlsx", [
    [q("Dup A"), "Low", "", "", "", ""],
    [q("Dup A"), "High", "", "", "", ""], // same key, different priority -> still a duplicate
    [q("Dup B"), "", "", "", "", ""],
  ]));
  {
    const c = await counts(page);
    rec(c && c.rows === 3 && c.warn === 1 && c.ready === 2 && c.err === 0, `Within-file duplicate is a Warning, not an Error ${JSON.stringify(c)}`);
    rec(/Possible duplicate of row 2 in this file/.test(await rowText(page, 3)), "Within-file duplicate message names the first row");
    const cb = page.getByRole("checkbox");
    rec(await wait(cb), "Duplicate warning -> confirmation checkbox shown");
    rec(/I reviewed the duplicate warnings and want to import them\./.test(await page.locator("body").innerText()), "Confirmation label text exact");
    rec(await importBtn(page).isDisabled(), "Import disabled until duplicate confirmation checked");
    await cb.check();
    rec(await importBtn(page).isEnabled(), "Import enabled after confirmation");
    await cb.uncheck();
    rec(await importBtn(page).isDisabled(), "Unchecking confirmation disables Import again");
    await cb.check();
    await importBtn(page).click();
    rec(await wait(page.getByText("3 Verification Items imported"), 40000), "Confirmed duplicates imported (3 items, toast)");
    const rows = dbItems(q("Dup %"));
    rec(rows.length === 3 && rows.filter((r) => r.question === q("Dup A")).length === 2, "DB: both duplicate rows were created (no skip/merge)");
  }
  // duplicate vs existing
  await upload(page, await makeXlsx("dup2.xlsx", [[q("Existing check"), "", "", "", "", ""]]));
  {
    const c = await counts(page);
    rec(c && c.warn === 1 && c.err === 0 && /existing verification item/.test(await rowText(page, 2)), `Duplicate vs existing item is a Warning ${JSON.stringify(c)}`);
    rec((await page.getByRole("checkbox").count()) === 1 && (await importBtn(page).isDisabled()), "Existing-item duplicate requires confirmation");
  }
  // confirmation does not override an Error
  await upload(page, await makeXlsx("dup3.xlsx", [
    [q("Dup A"), "", "", "", "", ""],
    [q("bad"), "Urgent", "", "", "", ""],
  ]));
  {
    await page.getByRole("checkbox").check();
    rec(await importBtn(page).isDisabled(), "Checkbox checked but an Error exists -> Import stays disabled");
  }
  // same file twice
  await upload(page, mainFile);
  {
    const c = await counts(page);
    rec(c && c.rows === 9 && c.warn === 9 && c.err === 0, `Same file uploaded twice: every row warns as existing ${JSON.stringify(c)}`);
    const cb = page.getByRole("checkbox");
    rec(await importBtn(page).isDisabled(), "Same file twice: Import needs confirmation");
    await cb.check();
    await importBtn(page).click();
    await wait(page.getByText("9 Verification Items imported"), 40000);
    const n = dbItems(q("Project-wide check")).length;
    rec(n === 2, `Same file twice: second import allowed after confirmation (2 copies exist: ${n})`);
  }

  // ===== PRIORITY / HEADER FLEXIBILITY / SHEET RULES =====
  await upload(page, await makeXlsx("reorder.xlsx", [[q("Reordered"), "high", "Viet Long", "", "", ""]], { order: [2, 0, 5, 4, 3, 1], headers: HEADERS }));
  {
    const c = await counts(page);
    rec(c && c.rows === 1 && c.ready === 1 && /Viet Long/.test(await rowText(page, 2)) && /High/.test(await rowText(page, 2)), `Reordered columns still parse ${JSON.stringify(c)}`);
  }
  await upload(page, await makeXlsx("hdrcase.xlsx", [[q("Header case"), "", "", "", "", ""]], { headers: [" check / question ", "PRIORITY", "site", "Target  Activity", "framework", "FRAMEWORK ITEM"] }));
  {
    const c = await counts(page);
    rec(c && c.ready === 1, `Header text matching is case-insensitive and trimmed ${JSON.stringify(c)}`);
  }
  await upload(page, await makeXlsx("nosheet.xlsx", [[q("x"), "", "", "", "", ""]], { sheetName: "Data" }));
  rec(/Verification Items/.test(await alertLoc(page).innerText()), "Missing 'Verification Items' sheet rejected with a clear message");
  await upload(page, await makeXlsx("nohdr.xlsx", [[q("x"), "", "", "", "", ""]], { headers: ["Check / Question", "Priority", "Site", "Target Activity", "Framework", "Notes"] }));
  rec(/Framework Item/.test(await alertLoc(page).innerText()), "Missing required header ('Framework Item') rejected, named in the message");
  await upload(page, await makeXlsx("onlyq.xlsx", [[q("x")]], { headers: ["Check / Question"] }));
  rec(/Missing required columns/.test(await alertLoc(page).innerText()), "A spreadsheet with only a Question column is rejected (all six headers required)");

  // ===== ROW LIMITS =====
  const many = (n, prefix = "R") => Array.from({ length: n }, (_, i) => [q(`${prefix}${i + 1}`), "", "", "", "", ""]);
  await upload(page, await makeXlsx("rows300.xlsx", many(300)));
  {
    const c = await counts(page);
    rec(c && c.rows === 300 && c.ready === 300, `300 rows accepted ${JSON.stringify(c)}`);
    rec(await noHOverflow(page), "300-row preview: no horizontal page overflow");
  }
  await upload(page, await makeXlsx("rows301.xlsx", many(301)));
  rec(/more than 300 rows/.test(await alertLoc(page).innerText()) && (await importBtn(page).count()) === 0, "301 rows rejected at workbook level, no Import button");
  await upload(page, await makeXlsx("rows300gap.xlsx", many(300), { blankGapAfter: 150, blankGap: 60 }));
  {
    const c = await counts(page);
    rec(c && c.rows === 300 && c.ready === 300, `Fully blank rows are skipped and not counted toward 300 ${JSON.stringify(c)}`);
    rec((await rowLoc(page, 152).count()) === 0, "Original Excel row numbers preserved across a blank gap (row 152 absent)");
    rec((await rowLoc(page, 212).count()) === 1, "Original Excel row number preserved after gap (row 212 present)");
  }

  // ===== FILE SIZE / TYPE =====
  {
    let rows = 90;
    let file;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const data = Array.from({ length: rows }, (_, i) => [q(`BIG${i}`) + randomBytes(9000).toString("base64").slice(0, 12000), "", "", "", "", ""]);
      file = await makeXlsx("big-under.xlsx", data);
      const s = sizeOf(file);
      if (s > 1.5 * 1024 * 1024 && s <= 1.98 * 1024 * 1024) break;
      rows = Math.max(10, Math.round(rows * (1.8 * 1024 * 1024) / s));
    }
    const s = sizeOf(file);
    rec(s > 1.4 * 1024 * 1024 && s <= 2 * 1024 * 1024, `Legit large workbook prepared: ${(s / 1048576).toFixed(2)} MB (<=2 MB, >1 MB default action limit)`);
    await upload(page, file);
    const c = await counts(page);
    rec(c && c.rows === rows, `Workbook >1 MB and <=2 MB reaches validation (Next body limit not the blocker) ${JSON.stringify(c)}`);
  }
  {
    let n = 180;
    let file;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const data = Array.from({ length: n }, (_, i) => [q(`HUGE${i}`) + randomBytes(15000).toString("base64").slice(0, 20000), "", "", "", "", ""]);
      file = await makeXlsx("big-over.xlsx", data);
      if (sizeOf(file) > 2.3 * 1024 * 1024) break;
      n = Math.ceil((n * 2.4 * 1024 * 1024) / sizeOf(file));
    }
    const s = sizeOf(file);
    rec(s > 2 * 1024 * 1024, `Oversize workbook prepared: ${(s / 1048576).toFixed(2)} MB`);
    await upload(page, file);
    rec(/larger than 2 MB/.test(await alertLoc(page).innerText()), "Workbook >2 MB rejected with a friendly message (before any upload)");
  }
  for (const name of ["x.xls", "x.xlsm", "x.csv", "x.ods"]) {
    const file = writeRaw(name, readFileSync(mainFile));
    await upload(page, file);
    rec(/Only \.xlsx workbooks are supported/.test(await alertLoc(page).innerText()), `Unsupported type rejected: ${name}`);
  }
  await upload(page, writeRaw("fake.xlsx", "Check / Question,Priority\nhello,High\n"));
  {
    const t = await alertLoc(page).innerText();
    rec(/Could not read this file/.test(t) && !/\bat\s+\S+\.(js|ts)|Error:|stack/i.test(t), `CSV renamed .xlsx: friendly error, no stack trace ("${t.slice(0, 60)}...")`);
  }
  await upload(page, writeRaw("corrupt.xlsx", Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), randomBytes(4000)])));
  {
    const t = await alertLoc(page).innerText();
    rec(/Could not read this file/.test(t) && !/\bat\s+\S+\.(js|ts)|Error:|stack/i.test(t), "Corrupt XLSX: friendly error, no stack trace");
  }
  rec(!(await page.locator("body").innerText()).includes("Cannot read"), "No internal exception text leaked");

  // ===== FILE REPLACE (no multi-file; new result replaces old) =====
  await upload(page, mainFile);
  await upload(page, await makeXlsx("one.xlsx", [[q("Replace me"), "", "", "", "", ""]]), { fresh: false });
  {
    await wait(page.getByText(/^1 rows$/));
    const c = await counts(page);
    rec(c && c.rows === 1 && (await page.locator("tbody tr").count()) === 1, "Replacing the file replaces the preview");
    rec((await page.locator('input[type="file"]').getAttribute("multiple")) === null, "Single-file picker (no multiple)");
    rec(/one\.xlsx/.test(await page.locator("body").innerText()), "Selected filename and size shown");
  }

  // ===== STALE PREVIEW =====
  await upload(page, await makeXlsx("stale.xlsx", [[q("Stale"), "", "", "", "ISO 14001:2015", "8.1"]]));
  {
    const c = await counts(page);
    rec(c && c.ready === 1, "Stale test: preview valid before the project changes");
    dbQuery(`delete from project_frameworks where project_id='${f.projectA}' and framework_id=(select id from frameworks where code='ISO 14001' and edition='2015')`);
    await importBtn(page).click();
    rec(await wait(page.getByText(/Nothing was imported/)), "Stale preview: Import revalidates and reports nothing was imported");
    rec(dbItems(q("Stale")).length === 0, "Stale preview: 0 rows inserted");
    const c2 = await counts(page);
    rec(c2 && c2.err === 1 && /isn.t assigned to this project/.test(await rowText(page, 2)), "Stale preview: refreshed results show the framework error");
    dbQuery(`insert into project_frameworks (project_id, framework_id) select '${f.projectA}', id from frameworks where code='ISO 14001' and edition='2015'`);
  }

  // ===== ATOMICITY (PostgREST single-statement bulk insert) =====
  {
    const token = admin.token;
    const bad = await http("POST", "/rest/v1/verification_items", { token, body: [
      { project_id: f.projectA, question: q("ATOMIC-1"), priority: "high", created_by: admin.userId },
      { project_id: f.projectA, question: q("ATOMIC-2"), priority: "bogus", created_by: admin.userId },
    ] });
    const n1 = dbItems(q("ATOMIC-%")).length;
    rec(bad.status >= 400 && n1 === 0, `Bulk insert with one CHECK-violating row: HTTP ${bad.status}, ${n1} rows persisted (all-or-nothing)`);
    const bad2 = await http("POST", "/rest/v1/verification_items", { token, body: [
      { project_id: f.projectA, question: q("ATOMIC-3"), created_by: admin.userId },
      { project_id: f.projectA, question: q("ATOMIC-4"), site_id: f.betaSite, created_by: admin.userId },
    ] });
    const n2 = dbItems(q("ATOMIC-%")).length;
    rec(bad2.status >= 400 && n2 === 0, `Bulk insert with one out-of-scope site (deferred FK): HTTP ${bad2.status}, ${n2} rows persisted`);
    const good = await http("POST", "/rest/v1/verification_items", { token, body: [
      { project_id: f.projectA, question: q("ATOMIC-5"), created_by: admin.userId },
      { project_id: f.projectA, question: q("ATOMIC-6"), created_by: admin.userId },
    ] });
    rec(good.status === 201 && dbItems(q("ATOMIC-%")).length === 2, "Valid multi-row bulk insert persists every row");
    const src = readFileSync(REPO + "/lib/mutations/verification-import.ts", "utf8");
    rec((src.match(/\.insert\(/g) ?? []).length === 1 && !/for \(.*\) \{[^}]*\.insert\(/s.test(src), "Code: exactly ONE .insert( call in the import mutation, not inside a loop");
  }

  // ===== MOBILE REGRESSION =====
  for (const width of [390, 412]) {
    const mctx = await browser.newContext({ viewport: { width, height: 844 } });
    const mp = await mctx.newPage();
    await login(mp, "admin");
    await mp.goto(VERIF_URL);
    await mp.getByRole("heading", { name: "Verification", exact: true }).waitFor({ timeout: 20000 });
    rec(!(await mp.getByRole("link", { name: "Import Excel" }).isVisible()), `Mobile ${width}: Import Excel hidden`);
    rec(await wait(mp.getByRole("button", { name: "+ New Verification Item" }).first()), `Mobile ${width}: + New Verification Item visible`);
    await mp.getByRole("button", { name: "+ New Verification Item" }).first().click();
    rec(await wait(mp.getByRole("dialog")), `Mobile ${width}: manual Add still opens`);
    rec(await noHOverflow(mp), `Mobile ${width}: no horizontal overflow`);
    await mctx.close();
  }

  // ===== AUTHORIZATION =====
  {
    const cctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const cp = await cctx.newPage();
    await login(cp, "consultant");
    const t = await cctx.request.get(`${APP}/projects/${f.projectA}/verification/template`);
    rec(t.status() === 200, "Consultant: template download allowed (requireUser, not requireAdmin)");
    await upload(cp, await makeXlsx("consultant.xlsx", [[q("Consultant import"), "", "", "", "", ""]]));
    await importBtn(cp).click();
    await wait(cp.getByText("1 Verification Item imported"), 40000);
    const row = dbItems(q("Consultant import"))[0];
    rec(row && row.created_by === consultant.userId, "Consultant: import allowed; created_by = the consultant");
    await cctx.close();
  }
  {
    const anonT = await fetch(`${APP}/projects/${f.projectA}/verification/template`, { redirect: "manual" });
    rec(anonT.status >= 300 && anonT.status < 400 && /login/.test(anonT.headers.get("location") ?? ""), `Anon: template redirects to /login (HTTP ${anonT.status})`);
    const anonP = await fetch(IMPORT_URL, { redirect: "manual" });
    rec(anonP.status >= 300 && anonP.status < 400 && /login/.test(anonP.headers.get("location") ?? ""), `Anon: import page redirects to /login (HTTP ${anonP.status})`);
    const anonRest = await http("POST", "/rest/v1/verification_items", { body: [{ project_id: f.projectA, question: q("ANON") }] });
    rec(anonRest.status >= 400 && dbItems(q("ANON")).length === 0, `Anon: direct bulk insert denied (HTTP ${anonRest.status})`);
  }

  // ===== SITE-AMBIGUITY sanity (fixture really has two same-name sites in scope) =====
  {
    const n = dbQuery(`select count(*) c from project_sites ps join sites s on s.id=ps.site_id where ps.project_id='${f.projectA}' and s.name='Dup Site'`)[0].c;
    rec(n === 2, "Fixture: two same-name sites are both in the project's scope (ambiguity was genuinely tested)");
  }

  await ctx.close();
} catch (e) {
  console.error("SCRIPT ERROR", e);
  rec(false, "script crashed: " + String(e).slice(0, 300));
} finally {
  await browser.close();
  writeFileSync(path.join(DIR, "fixture-ids.json"), JSON.stringify(f));
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
