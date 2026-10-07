import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO, users, makeReporter, signIn, dbQuery, http } from "./common.mjs";
import { createFixtures, cleanupP5e } from "./p5e-fixtures.mjs";

const require = createRequire(REPO + "/package.json");
const ExcelJS = require("exceljs");
const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p5e-shots");
const DIR = path.join(OUT, "files");
mkdirSync(DIR, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 15000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
async function waitDb(fn, ms = 30000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 800)); } return false; }
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });

// Phase 7D: the template gained the optional "Expected Records" column (last).
const HEAD = ["Framework", "Framework Requirement", "Required Document", "Document Code", "Document Type", "Owner", "Site", "Applicable", "Expected Records"];
/** rows: arrays in HEAD order (or objects for custom headers). */
async function xlsx(name, rows, { headers = HEAD, sheet = "Required Documents", cellHook = null } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(headers);
  rows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    r.forEach((v, c) => {
      if (v !== "" && v !== undefined && v !== null) row.getCell(c + 1).value = v;
    });
    row.commit();
  });
  if (cellHook) cellHook(ws);
  const p = path.join(DIR, name);
  await wb.xlsx.writeFile(p);
  return p;
}
const T = (s) => `P5E-ACCEPT-${s}`;

const admin = await signIn("admin");
const consultant = await signIn("consultant");
const f = await createFixtures(admin.token);
const DOCS = `${APP}/projects/${f.p}/documents`;
const IMPORT = `${DOCS}/import`;
const docs = () => dbQuery(`select d.*, (select status from document_register r where r.document_id=d.id) status from documents d where d.project_id='${f.p}' order by title`);
const byTitle = (t) => docs().find((d) => d.title === t);
const maps = (id) => dbQuery(`select fi.code, f.code fw from document_framework_items m join framework_items fi on fi.id=m.framework_item_id join frameworks f on f.id=fi.framework_id where m.document_id='${id}' order by f.code, fi.code`).map((r) => `${r.fw} ${r.code}`);
const count = (sql) => dbQuery(sql)[0].n;
const docCount = () => count(`select count(*)::int n from documents where project_id='${f.p}'`);
const existingHash = () => dbQuery(`select md5(t::text) h from documents t where id='${f.existingDoc}'`)[0].h;

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function open(width, height, who = "admin") {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
  return { ctx, page };
}
const preview = (p) => p.getByTestId("import-preview");
async function choose(page, file) {
  await page.goto(IMPORT);
  await page.getByRole("heading", { name: "Import Required Documents" }).waitFor({ timeout: 20000 });
  await page.getByLabel("Choose an Excel workbook").setInputFiles(file);
}
async function waitPreview(page, t = 60000) {
  return preview(page).waitFor({ timeout: t }).then(() => true).catch(() => false);
}
const importBtn = (p) => p.getByRole("button", { name: /^(Import \d+ Documents?|Importing…)$/ });
const rowMsg = async (p, rowNumber) => flat(await p.locator("tr[data-testid=import-row]", { has: p.locator(`td:first-child:text-is("${rowNumber}")`) }).innerText());

try {
  const { ctx, page } = await open(1280, 800);
  const existing0 = existingHash();

  // ===== Entry point + template =====
  await page.goto(DOCS);
  await page.getByRole("heading", { name: "Documents", level: 2 }).waitFor({ timeout: 20000 });
  const newBtn = await page.getByRole("button", { name: "+ New Document" }).first().getAttribute("class");
  const impLink = page.getByRole("link", { name: "Import Excel" });
  rec(await wait(impLink) && /bg-primary/.test(newBtn) && !/bg-primary /.test((await impLink.getAttribute("class")) + " "), "Documents: 'Import Excel' secondary next to '+ New Document'");
  await impLink.click();
  await page.getByRole("heading", { name: "Import Required Documents" }).waitFor({ timeout: 20000 });
  rec(/Import the list of documents required for this project\. Files and assessment results are added later\./.test(await page.locator("body").innerText()), "Import page explains: required list only; files / assessments later");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download Template" }).click()]);
  const tplPath = path.join(DIR, "template.xlsx");
  await dl.saveAs(tplPath);
  const twb = new ExcelJS.Workbook();
  await twb.xlsx.readFile(tplPath);
  const first = twb.worksheets[0];
  const headers = first.getRow(1).values.slice(1);
  rec(first.name === "Required Documents" && JSON.stringify(headers) === JSON.stringify(HEAD), `Template: first sheet "Required Documents" with canonical headers (${headers.join(" | ")})`);
  const guide = twb.getWorksheet("Instructions");
  const guideText = [];
  guide.eachRow((r) => guideText.push(r.values.slice(1).join(" ")));
  const g = guideText.join("\n");
  rec(/ISO 9001:2015/.test(g) && /ISO 45001:2018/.test(g) && /Viet Long/.test(g) && /EXAMPLE:/.test(g) && first.rowCount === 1, "Template: frameworks, sites, clearly marked examples on the Instructions sheet; data sheet empty");
  rec(!HEAD.some((h) => /Version|Revision|Status|Review|Finding|Evidence/i.test(h)), "Template has no version / status / review / finding columns");

  // ===== Basic import (N/A, no framework, multi-code, merge, duplicate code, existing) =====
  const W1 = await xlsx("basic.xlsx", [
    ["ISO 9001:2015", "7.5", T("Document Control Procedure"), "PR-QMS-01", "Procedure", "Quality Manager", "", "Yes"],
    ["ISO 14001:2015", "8.1", T("Environmental Operational Control Procedure"), "EMS-08", "Procedure", "HSE Manager", "Viet Long", "Yes"],
    ["", "", T("Waste Contractor List"), "", "Register", "", "", "No"],
    ["", "", T("Quality Manual"), "QM-01", "Manual", "", "", ""],
    ["ISO 14001:2015", "8.2", T("Emergency Response Plan"), "ERP-01", "Plan", "HSE Manager", "Viet Long", ""],
    ["ISO 45001:2018", "8.2", `  ${T("Emergency  Response Plan")}  `, "", "", "", "viet long", ""],
    ["ISO 9001:2015", "6.1; 4.1", T("Risk Register"), "PR-QMS-01", "Register", "", "Long An", "yes"],
    ["", "", T("Existing Legal Register"), "", "", "", "", ""],
  ]);
  const before = docCount();
  const t0 = Date.now();
  await choose(page, W1);
  rec(await waitPreview(page), `Preview shown (${Date.now() - t0} ms)`);
  rec(docCount() === before, "Preview writes nothing");
  const summary = flat(await preview(page).innerText());
  rec(/8 rows/.test(summary) && /4 Ready/.test(summary) && /4 Warnings/.test(summary) && /0 Errors/.test(summary), `Summary: 8 rows · 4 Ready · 4 Warnings · 0 Errors`);
  rec(/Same document as row 6/.test(await rowMsg(page, 7)), "Row 7 (same title+site, other framework) merges into row 6 — warning");
  rec(/Document Code "PR-QMS-01" is also used by row 8/.test(await rowMsg(page, 2)) && /also used by row 2/.test(await rowMsg(page, 8)), "Duplicate code: warning only on both rows");
  rec(/Document already exists in this project/.test(await rowMsg(page, 9)) && /Skipped \(already exists\)/.test(await rowMsg(page, 9)), "Existing document: skip warning");
  {
    const [m8, m5, m4] = [await rowMsg(page, 8), await rowMsg(page, 5), await rowMsg(page, 4)];
    const ok = [/ISO 9001:2015 · 6\.1, 4\.1/.test(m8), /Yes \(default\)/.test(m5), /\bNo\b/.test(m4)];
    rec(ok.every(Boolean), "Preview columns: several requirements, Applicable default / No", ok.every(Boolean) ? "" : `${JSON.stringify(ok)} row8="${m8}" row5="${m5}" row4="${m4}"`);
  }
  rec(/6 documents will be created/.test(summary) && /1 existing document is skipped/.test(summary), "Preview states 6 documents to create, 1 existing skipped");
  rec(await importBtn(page).isDisabled(), "Import disabled until the warnings are confirmed");
  await shot(page, "d-preview", true);
  await page.getByRole("checkbox").check();
  const t1 = Date.now();
  await importBtn(page).click();
  rec(await page.waitForURL(`**/projects/${f.p}/documents**`, { timeout: 60000 }).then(() => true).catch(() => false), `Import redirects to the register (${Date.now() - t1} ms)`);
  rec(await wait(page.getByText("Imported: 6 Documents · Skipped existing: 1 · Warnings: 4").first()), "Result: Imported 6 · Skipped existing 1 · Warnings 4");
  await page.waitForTimeout(1000);
  rec(!/imported=/.test(page.url()), "Result shown once (query removed)");
  const all = docs();
  const erp = all.filter((d) => d.title === T("Emergency Response Plan"));
  rec(docCount() === before + 6 && erp.length === 1, "6 documents created; the Emergency Response Plan exists once (merged)");
  rec(JSON.stringify(maps(erp[0].id)) === JSON.stringify(["ISO 14001 8.2", "ISO 45001 8.2"]) && erp[0].site_id === f.vl && erp[0].doc_code === "ERP-01" && erp[0].owner_name === "HSE Manager", "Merged document: both frameworks mapped, site Viet Long, values from the rows");
  const dcp = byTitle(T("Document Control Procedure"));
  rec(dcp.doc_code === "PR-QMS-01" && dcp.document_type === "Procedure" && dcp.owner_name === "Quality Manager" && dcp.site_id === null && dcp.is_applicable === true && dcp.created_by === admin.userId, "Row values stored (code, type, owner, project-wide, applicable, created_by)");
  rec(JSON.stringify(maps(dcp.id)) === JSON.stringify(["ISO 9001 7.5"]) && JSON.stringify(maps(byTitle(T("Environmental Operational Control Procedure")).id)) === JSON.stringify(["ISO 14001 8.1"]), "Mappings: ISO 9001 7.5, ISO 14001 8.1");
  rec(JSON.stringify(maps(byTitle(T("Risk Register")).id)) === JSON.stringify(["ISO 9001 4.1", "ISO 9001 6.1"]), "Several codes of one framework → several mappings");
  rec(maps(byTitle(T("Quality Manual")).id).length === 0 && byTitle(T("Quality Manual")).status === "not_received", "No framework → zero mappings, Not Received");
  rec(byTitle(T("Waste Contractor List")).is_applicable === false && byTitle(T("Waste Contractor List")).status === "n_a", "Applicable = No → Not Applicable");
  rec(all.filter((d) => d.id !== f.existingDoc && d.title.startsWith("P5E-ACCEPT-") && d.is_applicable).every((d) => d.status === "not_received"), "Every applicable imported document is Not Received");
  rec(count(`select count(*)::int n from document_versions v join documents d on d.id=v.document_id where d.project_id='${f.p}'`) === 0 && count(`select count(*)::int n from files where project_id='${f.p}'`) === 0, "No versions, reviews or files created");
  rec(existingHash() === existing0, "Existing document untouched (byte-identical)");
  await page.goto(DOCS);
  await page.locator("tbody tr").first().waitFor();
  rec(/Not Applicable/.test(flat(await page.locator("tbody tr", { hasText: "Waste Contractor List" }).innerText())) && /ISO 14001 8\.2/.test(flat(await page.locator("tbody tr", { hasText: "Emergency Response Plan" }).innerText())), "Register: statuses and mappings visible");

  // ===== Register filters / search on imported data =====
  await page.getByLabel("Filter by Status").selectOption("n_a");
  rec((await page.locator("tbody tr").count()) === 1, "Status filter: Not Applicable");
  await page.getByLabel("Filter by Status").selectOption("all");
  await page.getByLabel("Filter by Site").selectOption("Viet Long");
  rec((await page.locator("tbody tr").count()) === 2, "Site filter: Viet Long (2)");
  await page.getByLabel("Filter by Site").selectOption("all");
  await page.getByLabel("Filter by Framework").selectOption("ISO 45001:2018");
  rec((await page.locator("tbody tr").count()) === 1, "Framework filter: ISO 45001 (merged document)");
  await page.getByLabel("Filter by Framework").selectOption("all");
  for (const q of ["EMS-08", "hse manager", "quality manual"]) {
    await page.getByLabel("Search documents").fill(q);
    rec((await page.locator("tbody tr").count()) >= 1, `Search "${q}"`);
  }
  await page.getByLabel("Search documents").fill("");

  // ===== Errors: invalid framework / clause / site / pairs / applicable / blank title =====
  const W2 = await xlsx("errors.xlsx", [
    ["ISO 50001:2018", "4.1", T("Energy Review"), "", "", "", "", ""],
    ["ISO 9001:2015", "7.5.2", T("Creating and Updating Procedure"), "", "", "", "", ""],
    ["", "", T("Site Plan"), "", "", "", "Hanoi", ""],
    ["", "", T("Site Plan B"), "", "", "", "B Site", ""],
    ["ISO 9001:2015", "", T("Pair Missing Requirement"), "", "", "", "", ""],
    ["", "7.5", T("Pair Missing Framework"), "", "", "", "", ""],
    ["", "", T("Bad Applicable"), "", "", "", "", "Maybe"],
    ["ISO 9001", "7.5", T("Framework Without Edition"), "", "", "", "", ""],
    ["", "", "", "CODE-ONLY", "", "", "", ""],
    ["ISO 9001:2015", "7.5", T("Valid Row"), "", "", "", "", ""],
  ]);
  const beforeErr = docCount();
  await choose(page, W2);
  await waitPreview(page);
  const expectMsg = [
    [2, /Framework "ISO 50001:2018" isn't assigned to this project\./],
    [3, /Requirement "7\.5\.2" wasn't found in ISO 9001:2015/],
    [4, /Unknown Site "Hanoi"/],
    [5, /Unknown Site "B Site"/],
    [6, /Framework Requirement is required when Framework is provided/],
    [7, /Framework is required when Framework Requirement is provided/],
    [8, /Applicable "Maybe" isn't recognized/],
    [9, /Unknown Framework "ISO 9001"/],
    [10, /Required Document is required/],
  ];
  for (const [rowNo, re] of expectMsg) {
    const t = await rowMsg(page, rowNo);
    rec(re.test(t) && /Error/.test(t), `Row ${rowNo} error: ${re.source.slice(0, 60)}`);
  }
  rec(/9 Errors/.test(flat(await preview(page).innerText())) && await importBtn(page).isDisabled(), "Mixed file (9 invalid + 1 valid): import blocked");
  rec(docCount() === beforeErr, "Zero writes");

  // Fix and re-upload → all valid, imports
  const W2b = await xlsx("fixed.xlsx", Array.from({ length: 10 }, (_, i) => ["ISO 9001:2015", "7.5", T(`Fixed Row ${i + 1}`), "", "", "", "", ""]));
  await choose(page, W2b);
  await waitPreview(page);
  await importBtn(page).click();
  rec(await waitDb(() => docCount() === beforeErr + 10), "Fixed file: all 10 rows imported");

  // ===== Wrong files / header / limits =====
  for (const [name, content] of [["list.csv", "Required Document\nX"], ["old.xls", "\xD0\xCF\x11\xE0 fake"], ["notes.txt", "hello"]]) {
    const p = path.join(DIR, name);
    writeFileSync(p, content);
    await choose(page, p);
    rec(await wait(page.getByText("Only .xlsx workbooks are supported.").first()), `Rejected: ${name.split(".").pop().toUpperCase()}`);
  }
  const renamed = path.join(DIR, "renamed.xlsx");
  writeFileSync(renamed, "Required Document\nNot really xlsx");
  await choose(page, renamed);
  rec(await wait(page.getByText(/Could not read this file/).first()), "CSV renamed to .xlsx rejected by the server");
  await choose(page, await xlsx("noheader.xlsx", [["x", "y"]], { headers: ["Document", "Remark"] }));
  rec(await wait(page.getByText(/No "Required Document" column was found in the first 10 rows/).first() /* 5G: header searched in rows 1-10 */), "Missing Required Document header: file-level error");
  await choose(page, await xlsx("dupheader.xlsx", [["7.5", "7.5", "X"]], { headers: ["Clause", "Framework Requirement", "Required Document"] }));
  rec(await wait(page.getByText(/More than one column is read as "Framework Requirement"/).first()), "Duplicate recognized headers (Clause + Framework Requirement): file-level error");
  await choose(page, await xlsx("empty.xlsx", []));
  rec(await wait(page.getByText(/No data rows found/).first()), "No data rows: friendly error");
  const at500 = await xlsx("limit500.xlsx", Array.from({ length: 500 }, (_, i) => ["", "", T(`Limit ${String(i + 1).padStart(3, "0")}`), "", "", "", "", ""]));
  await choose(page, at500);
  rec(await waitPreview(page, 90000) && /500 rows/.test(flat(await preview(page).innerText())), "500 rows (limit): accepted in preview");
  const over = await xlsx("limit501.xlsx", Array.from({ length: 501 }, (_, i) => ["", "", T(`Over ${i}`), "", "", "", "", ""]));
  await choose(page, over);
  rec(await wait(page.getByText("This workbook has more than 500 rows. Split it into smaller files.").first(), 60000), "501 rows: friendly file-level error");

  // ===== Aliases, numeric clause, extra columns, formula, first sheet =====
  const W3 = await xlsx(
    "real-workbook.xlsx",
    [
      ["ISO 14001:2015", 7.5, T("Aliased Control Procedure"), "Doc-7", "Existing doc name", "Reviewed", "EHS Lead", "OK"],
      ["", "", "", "", "", "", "", ""],
      ["ISO 9001:2015", "4.1", "FORMULA", "", "", "", "", ""],
    ],
    {
      sheet: "Gap Assessment",
      headers: ["Framework", "Clause", "Required Documents", "Current Document / No.Doc", "Records", "Status", "PIC", "Remark"],
      cellHook: (ws) => {
        ws.getCell("C4").value = { formula: 'A1&"x"' };
      },
    },
  );
  await choose(page, W3);
  await waitPreview(page);
  const r2 = await rowMsg(page, 2);
  rec(/Aliased Control Procedure/.test(r2) && /ISO 14001:2015 · 7\.5/.test(r2) && /Ready/.test(r2), "Aliases Clause / Required Documents / PIC on a non-template sheet; numeric clause 7.5 read as \"7.5\"; extra columns ignored");
  rec(/formula without a stored value/.test(await rowMsg(page, 4)), "Formula cell without a stored value: row error (never evaluated)");
  rec((await page.locator("tr[data-testid=import-row]").count()) === 2, "Fully blank rows ignored");

  // ===== Stale preview: framework unassigned =====
  const W4 = await xlsx("stale.xlsx", [
    ["ISO 14001:2015", "8.1", T("Stale A"), "", "", "", "", ""],
    ["", "", T("Stale B"), "", "", "", "", ""],
  ]);
  await choose(page, W4);
  await waitPreview(page);
  rec(/2 Ready/.test(flat(await preview(page).innerText())), "Stale test: preview valid");
  dbQuery(`delete from project_frameworks where project_id='${f.p}' and framework_id=(select id from frameworks where code='ISO 14001')`);
  const beforeStale = docCount();
  await importBtn(page).click();
  rec(await wait(page.getByText(/no longer passes validation/).first(), 30000) && /isn't assigned to this project/.test(await rowMsg(page, 2)), "Framework unassigned after preview: import re-validates, shows the error");
  rec(docCount() === beforeStale, "  ...nothing written");
  dbQuery(`insert into project_frameworks (project_id, framework_id) select '${f.p}', id from frameworks where code='ISO 14001'`);
  // Stale preview: matching document created meanwhile
  await choose(page, W4);
  await waitPreview(page);
  dbQuery(`insert into documents (project_id, title, created_by) values ('${f.p}', '${T("Stale B")}', (select id from profiles where role='admin' order by created_at limit 1))`);
  const beforeStale2 = docCount();
  await importBtn(page).click();
  rec(await wait(page.getByText(/The warnings changed since your review/).first(), 30000) && /Document already exists/.test(await rowMsg(page, 3)), "Document created after preview: import stops and shows the new warning");
  rec(docCount() === beforeStale2, "  ...nothing written");
  await page.getByRole("checkbox").check();
  await importBtn(page).click();
  await page.waitForURL(`**/documents**`, { timeout: 60000 });
  rec(await waitDb(() => docCount() === beforeStale2 + 1) && docs().filter((d) => d.title === T("Stale B")).length === 1, "After confirming: Stale A created, Stale B skipped (no duplicate)");

  // ===== Large import (250 rows) =====
  const big = await xlsx("large.xlsx", Array.from({ length: 250 }, (_, i) => [i % 2 ? "ISO 9001:2015" : "", i % 2 ? "7.5" : "", T(`Bulk Document ${String(i + 1).padStart(3, "0")}`), `BULK-${i + 1}`, "Record", "", i % 3 === 0 ? "Long An" : "", ""]));
  const beforeBig = docCount();
  const tp = Date.now();
  await choose(page, big);
  await waitPreview(page, 90000);
  const previewMs = Date.now() - tp;
  const ti = Date.now();
  await importBtn(page).click();
  await page.waitForURL(`**/documents**`, { timeout: 90000 });
  const importMs = Date.now() - ti;
  rec(await waitDb(() => docCount() === beforeBig + 250) && count(`select count(*)::int n from document_framework_items m join documents d on d.id=m.document_id where d.project_id='${f.p}' and d.title like '${T("Bulk Document")}%'`) === 125, `250 rows: preview ${previewMs} ms, import ${importMs} ms, 250 documents + 125 mappings`);
  const tr = Date.now();
  await page.goto(DOCS);
  await page.locator("tbody tr").first().waitFor({ timeout: 30000 });
  rec((await page.locator("tbody tr").count()) >= 269,`Register loads ${await page.locator("tbody tr").count()} documents (${Date.now() - tr} ms)`);

  // ===== Imported document through the normal lifecycle =====
  await page.goto(`${DOCS}/${dcp.id}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  rec(/Not Received/.test(await page.locator("body").innerText()), "Imported document: Not Received");
  const pdf = path.join(DIR, "procedure.pdf");
  writeFileSync(pdf, Buffer.from("%PDF-1.4\n" + " ".repeat(15000) + "\n%%EOF"));
  await page.getByRole("button", { name: "Upload New Version" }).click();
  await page.getByRole("dialog").getByLabel("File *").setInputFiles(pdf);
  await page.getByRole("dialog").getByRole("button", { name: "Upload", exact: true }).click();
  await page.getByText("Version uploaded.").first().waitFor({ timeout: 120000 }).catch(() => {});
  rec(await waitDb(() => dbQuery(`select status from document_register where document_id='${dcp.id}'`)[0].status === "received"), "Upload V1 → Received");
  await page.getByTestId("gap-assessment").filter({ hasText: "Not started" }).waitFor({ timeout: 15000 }).catch(() => {});
  await page.getByTestId("gap-assessment").getByRole("button", { name: "Start Gap Assessment" }).click();
  await page.getByTestId("gap-assessment").getByRole("button", { name: "Complete Assessment" }).waitFor({ timeout: 15000 });
  await page.getByTestId("gap-assessment").getByRole("button", { name: "Complete Assessment" }).click();
  await page.getByRole("dialog").locator("#ga-comments").fill("Retention period missing.");
  await page.getByRole("dialog").getByRole("button", { name: "Revision Required", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Complete", exact: true }).click();
  rec(await waitDb(() => dbQuery(`select status from document_register where document_id='${dcp.id}'`)[0].status === "revision_required"), "Gap Assessment → Revision Required (normal 5C behaviour)");
  const fu = page.getByTestId("review-follow-up");
  await fu.getByRole("button", { name: "Create Finding" }).waitFor({ timeout: 15000 });
  await fu.getByRole("button", { name: "Create Finding" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Observation", exact: true }).click();
  await page.getByRole("dialog").locator("#fd-title").fill(T("Retention period missing"));
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  const reviewId = () => dbQuery(`select r.id from document_reviews r join document_versions v on v.id=r.document_version_id where v.document_id='${dcp.id}'`)[0].id;
  rec(await waitDb(() => count(`select count(*)::int n from issues where document_review_id='${reviewId()}'`) === 1), "Create Finding from the imported document's assessment (normal 5D)");
  await page.waitForTimeout(1200);
  await fu.getByRole("button", { name: "Add to Verification" }).click();
  await page.getByRole("dialog").locator("#vi-question").fill(T("Check retention records"));
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  rec(await waitDb(() => count(`select count(*)::int n from verification_items where document_review_id='${reviewId()}'`) === 1), "Add to Verification from it (normal 5D)");
  await ctx.close();

  // ===== Mobile =====
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    await m.page.goto(DOCS);
    await m.page.getByRole("heading", { name: "Documents", level: 2 }).waitFor({ timeout: 30000 });
    rec(await wait(m.page.getByRole("link", { name: "Import Excel" })) && await noHOverflow(m.page), `${w}px: register header with Import Excel, no overflow`);
    await choose(m.page, W1);
    await waitPreview(m.page);
    rec((await m.page.getByTestId("import-card").count()) === 8 && await noHOverflow(m.page), `${w}px: preview as cards, no overflow`);
    await shot(m.page, `m${w}-preview`, true);
    await m.ctx.close();
  }

  // ===== Consultant =====
  const c = await open(1280, 800, "consultant");
  await choose(c.page, await xlsx("consultant.xlsx", [["ISO 45001:2018", "8.2", T("Consultant Emergency Drill Record"), "", "Record", "", "Viet Long", ""]]));
  await waitPreview(c.page);
  await importBtn(c.page).click();
  rec(await waitDb(() => byTitle(T("Consultant Emergency Drill Record"))?.created_by === consultant.userId), "Consultant imports (created_by = consultant)");
  await c.ctx.close();

  // ===== Signed out =====
  const anonTpl = await fetch(`${DOCS}/template`, { redirect: "manual" });
  rec(anonTpl.status >= 300 && anonTpl.status < 400, `Anon: template download redirected (HTTP ${anonTpl.status})`);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(IMPORT);
  rec(/\/login/.test(anon.url()), "Anon: import page redirects to login");
  rec(count(`select count(*)::int n from documents where project_id='${f.pB}'`) === 0, "Project B untouched (no documents)");
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const removed = await cleanupP5e(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like 'P5E-ACCEPT-%')::int c, (select count(*) from documents)::int d, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o`)[0];
  rec(left.c === 0 && left.d === 0 && left.f === 0 && left.o === 0, `Cleanup: fixtures (+${removed} objects) removed`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
