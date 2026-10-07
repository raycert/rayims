import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO, users, makeReporter, signIn, dbQuery } from "./common.mjs";
import { createFixtures, cleanupP5g, bulk, PFX } from "./p5g-fixtures.mjs";

const require = createRequire(REPO + "/package.json");
const ExcelJS = require("exceljs");
const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p5g-shots");
const DIR = path.join(OUT, "files");
mkdirSync(DIR, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const info = (msg) => console.log(`INFO  ${msg}`);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 15000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
async function waitDb(fn, ms = 30000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 800)); } return false; }
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });
const count = (sql) => dbQuery(sql)[0].n;
const T = (s) => `${PFX}${s}`;
const RAW_ERR = /PGRST|violates|duplicate key|relation "|supabase|stack trace|undefined|null\b|NaN/i;
const status = (docId) => dbQuery(`select status from document_register where document_id='${docId}'`)[0].status;
const docBy = (proj, title, site = null) => dbQuery(`select * from documents where project_id='${proj}' and title='${title.replace(/'/g, "''")}' and site_id ${site ? `= '${site}'` : "is null"}`)[0];
const mapHash = (id) => dbQuery(`select md5(coalesce(string_agg(framework_item_id::text, ',' order by framework_item_id), '')) h from document_framework_items where document_id='${id}'`)[0].h;
const rowHash = (table, id) => dbQuery(`select md5(t::text) h from ${table} t where id='${id}'`)[0]?.h;
const versionsOf = (docId) => dbQuery(`select v.*, f.storage_key, f.original_name from document_versions v join files f on f.id=v.file_id where v.document_id='${docId}' order by version_no`);
const reviewsOf = (versionId) => dbQuery(`select * from document_reviews where document_version_id='${versionId}' order by created_at, id`);
const objectExists = (key) => count(`select count(*)::int n from storage.objects where bucket_id='rayims-files' and name='${key}'`) === 1;
const activityLabel = (name) => `${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · ${name}`;
const LONG = "Procedure defines document approval, but retention periods for EMS records are not specified. Add retention responsibility, retention time and disposal method. Quy trình chưa quy định thời gian lưu trữ hồ sơ (điều 7.5.3) — xem mục 4 & 5 / phụ lục (A).";

const admin = await signIn("admin");
const consultant = await signIn("consultant");
const t0 = Date.now();
const f = await createFixtures(admin.token);
info(`fixtures ${Math.round((Date.now() - t0) / 1000)} s`);
const DOCS = (p) => `${APP}/projects/${p}/documents`;
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
const dlg = (p) => p.getByRole("dialog");
const panel = (p) => p.getByTestId("gap-assessment");
const followUp = (p) => panel(p).getByTestId("review-follow-up");
const vrows = (p) => p.getByTestId("version-row");
const delDlg = (p) => p.getByTestId("delete-dialog");
async function openDoc(page, proj, id) {
  await page.goto(`${DOCS(proj)}/${id}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 30000 });
  await page.getByTestId("document-versions").waitFor({ timeout: 30000 });
}
async function upload(page, file, revision = "") {
  await page.getByRole("button", { name: "Upload New Version" }).click();
  await dlg(page).getByLabel("File *").setInputFiles(file);
  if (revision) await dlg(page).locator("#ver-revision").fill(revision);
  await dlg(page).getByRole("button", { name: "Upload", exact: true }).click();
  const ok = await wait(page.getByText("Version uploaded.").first(), 180000);
  await gone(dlg(page), 20000);
  await page.waitForTimeout(800);
  return ok;
}
async function startAssessment(page) {
  await panel(page).getByRole("button", { name: /^Start (Gap|New) Assessment$/ }).click();
  return panel(page).getByRole("button", { name: "Complete Assessment" }).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
}
async function complete(page, result, comments) {
  await panel(page).getByRole("button", { name: "Complete Assessment" }).click();
  if (comments !== undefined) await dlg(page).locator("#ga-comments").fill(comments);
  await dlg(page).getByRole("button", { name: result, exact: true }).click();
  await dlg(page).getByRole("button", { name: "Complete", exact: true }).click();
  await gone(dlg(page), 20000);
}
/** No horizontal overflow and the element is not covered (e.g. by the mobile bottom nav) at its centre. */
async function reachable(page, locator) {
  // centred, as a user scrolls it into reach (scrollIntoViewIfNeeded leaves it behind the fixed bottom nav)
  await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (el === hit || el.contains(hit)) && r.height >= 32;
  });
}
async function parseXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.getWorksheet("Gap Assessment");
  const head = sheet.getRow(1).values.slice(1);
  const rows = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const o = {};
    head.forEach((h, i) => { const v = row.getCell(i + 1).value; o[h] = v ?? ""; });
    rows.push(o);
  });
  const sum = {};
  wb.getWorksheet("Summary").eachRow((row) => { sum[String(row.getCell(1).value)] = row.getCell(2).value; });
  const all = [];
  wb.eachSheet((s) => s.eachRow((row) => row.eachCell((c) => all.push(String(c.value)))));
  return { wb, sheet, rows, sum, all: all.join("\n") };
}
async function exportVia(page, proj, name) {
  await page.goto(DOCS(proj));
  await page.getByRole("heading", { name: "Documents", level: 2 }).waitFor({ timeout: 60000 });
  const t = Date.now();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.getByRole("button", { name: "Export Excel" }).click()]);
  const file = path.join(DIR, name);
  await dl.saveAs(file);
  const buf = readFileSync(file);
  return { ms: Date.now() - t, bytes: buf.length, name: dl.suggestedFilename(), x: await parseXlsx(buf) };
}
const ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : "");
const totals = () => dbQuery(`select (select count(*) from documents)::int d, (select count(*) from document_versions)::int v, (select count(*) from document_reviews)::int r, (select count(*) from issues)::int i, (select count(*) from verification_items)::int vi, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o, (select count(*) from document_framework_items)::int m`)[0];

const PERF = [];
const captured = {};
try {
  const { ctx, page } = await open(1280, 800);
  page.on("request", (req) => {
    if (req.method() === "POST" && req.headers()["next-action"]) captured.last = { url: req.url(), headers: req.headers(), body: req.postData() ?? "" };
  });
  const existingHash = rowHash("documents", f.existing);

  // ================= §5 / §9 / §10 IMPORT (banner rows, aliases, duplicates) =================
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Document List");
  ws.addRow(["Required Documents"]); // banner that is also an alias of the title column
  ws.addRow(["Project: IMS Implementation – Chinh Long (ISO 9001 / 14001 / 45001)"]);
  ws.addRow(["Framework", "Clause", "Document Required", "Document Code", "Document Type", "PIC", "Site", "Applicable", "Remarks"]);
  const imp = [
    ["ISO 9001:2015", "7.5", T("Documented Information Control Procedure"), "QT-01", "Procedure", "QA Manager", "", "Yes", "core"],
    ["ISO 14001:2015", "7.5", T("Documented Information Control Procedure"), "", "", "", "", "", "same doc, 2nd framework"],
    ["ISO 45001:2018", "8.2", T("Emergency Response Procedure"), "ERP-01", "Procedure", "HSE Officer", "Site A", "", ""],
    ["ISO 45001:2018", "8.2", T("Emergency Response Procedure"), "ERP-01", "Procedure", "HSE Officer", "Site B", "", "same title other site"],
    ["ISO 14001:2015", "8.2", T("Emergency Response Procedure"), "", "", "", "", "", "same title project-wide"],
    ["ISO 9001:2015", "6.1", T("Risk Register"), "QT-01", "Register", "", "", "", "same code other title"],
    ["", "", T("Legal Register"), "", "", "", "", "", "existing"],
    ["", "", T("Radiation Protection Plan"), "", "", "", "", "No", "N/A"],
    ["ISO 9001:2015", "9.1; 9.2", T("Internal Audit Procedure"), "", "Procedure", "Phòng QA – Trưởng phòng", "Site A", "Y", "blank code"],
  ];
  imp.forEach((r) => ws.addRow(r));
  const impFile = path.join(DIR, "register.xlsx");
  await wb.xlsx.writeFile(impFile);
  const before = totals();
  let t = Date.now();
  await page.goto(`${DOCS(f.P.main)}/import`);
  await page.waitForLoadState("networkidle").catch(() => {}); // the file input is server-rendered: a selection made before hydration is lost (Phase 7D)
  await page.getByLabel("Choose an Excel workbook").setInputFiles(impFile);
  rec(await wait(page.getByTestId("import-preview"), 60000), `Import preview of a client workbook with 2 banner rows above the header (${Date.now() - t} ms)`);
  const pv = flat(await page.getByTestId("import-preview").innerText());
  rec(/9 rows/i.test(pv) && /0 Errors/i.test(pv), "Header found on row 3 (aliases Clause / Document Required / PIC, extra column ignored): 9 rows, 0 errors");
  rec(flat(await page.locator("tr[data-testid=import-row]").first().locator("td").first().innerText()) === "4", "Preview row numbers are the sheet's own rows (first data row = 4)");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Import \d+ Documents?$/ }).click();
  await page.waitForURL(/\/documents(\?|$)/, { timeout: 90000 });
  rec(await wait(page.getByText(/Imported: 7 Documents · Skipped existing: 1 · Warnings: \d+/).first()), "Import: 'Imported: 7 Documents · Skipped existing: 1 · Warnings: N'");
  const dic = docBy(f.P.main, T("Documented Information Control Procedure"));
  const erpA = docBy(f.P.main, T("Emergency Response Procedure"), f.sA), erpB = docBy(f.P.main, T("Emergency Response Procedure"), f.sB), erpPw = docBy(f.P.main, T("Emergency Response Procedure"));
  const risk = docBy(f.P.main, T("Risk Register")), na = docBy(f.P.main, T("Radiation Protection Plan")), audit = docBy(f.P.main, T("Internal Audit Procedure"), f.sA);
  rec(!!dic && mapHash(dic.id) !== "" && count(`select count(*)::int n from document_framework_items where document_id='${dic.id}'`) === 2 && dic.doc_code === "QT-01" && dic.owner_name === "QA Manager", "Repeated across frameworks → ONE document with 2 mappings (blank cells inherited)");
  rec(!!erpA && !!erpB && !!erpPw && new Set([erpA.id, erpB.id, erpPw.id]).size === 3, "Same title: Site A / Site B / Project-wide → 3 separate documents (no unintended merge)");
  rec(!!risk && risk.doc_code === "QT-01" && risk.id !== dic.id, "Same code, different title → separate documents (code warning only)");
  rec(!!audit && audit.doc_code === null && audit.owner_name === "Phòng QA – Trưởng phòng" && count(`select count(*)::int n from document_framework_items where document_id='${audit.id}'`) === 2, "Blank code, Vietnamese owner, '9.1; 9.2' → 2 mappings, Site A");
  rec(!!na && na.is_applicable === false && status(na.id) === "n_a", "Applicable = No → Not Applicable");
  rec(rowHash("documents", f.existing) === existingHash && count(`select count(*)::int n from documents where project_id='${f.P.main}'`) === 8, "Existing document skipped, unchanged; 8 documents total (no duplicates)");
  const afterImport = totals();
  rec(afterImport.v === before.v && afterImport.r === before.r && afterImport.f === before.f && afterImport.o === before.o, "Import created no versions, reviews, files or objects");
  for (const d of [dic, erpA, erpB, erpPw, risk, audit]) if (status(d.id) !== "not_received") rec(false, `status ${d.title}`);
  rec([dic, erpA, erpB, erpPw, risk, audit].every((d) => status(d.id) === "not_received"), "Imported applicable documents: Not Received");

  // ================= §7 register answers =================
  await page.goto(DOCS(f.P.main));
  await page.locator("tbody tr").first().waitFor({ timeout: 30000 });
  const regText = flat(await page.locator("table").innerText());
  rec(/Not Received/.test(regText) && /Not Applicable/.test(regText) && /Site A/.test(regText) && /Site B/.test(regText) && /Project-wide/.test(regText) && /ISO 9001 7\.5/.test(regText), "Register answers: status, site, clause visible per document");
  await page.getByLabel("Filter by Status").selectOption({ label: "Not Received" });
  rec((await page.locator("tbody tr").count()) === 7, "Filter 'Not Received' → 7 documents");
  await page.getByLabel("Filter by Status").selectOption({ label: "Not Applicable" });
  rec((await page.locator("tbody tr").count()) === 1, "Filter 'Not Applicable' → 1 document");
  await shot(page, "d-register-imported");

  // ================= §5 full business flow on one imported document =================
  const pdf = path.join(DIR, "procedure.pdf");
  writeFileSync(pdf, Buffer.from("%PDF-1.4\n" + " ".repeat(20000) + "\n%%EOF"));
  const dicMap = mapHash(dic.id);
  await openDoc(page, f.P.main, dic.id);
  const emptyDetail = flat(await page.locator("main").innerText());
  rec(/No versions received yet\./.test(emptyDetail) && !/Coming soon/i.test(emptyDetail), "Not Received document: 'No versions received yet.' (no 'Coming soon')");
  rec(/files received for this document, each assessed separately/.test(emptyDetail), "Mental model: Versions = files received for the document, each assessed separately");
  t = Date.now();
  rec(await upload(page, pdf, "Rev.00"), `Upload client's file as V1 (${Date.now() - t} ms)`);
  rec(await waitDb(() => status(dic.id) === "received"), "Status → Received");
  rec(await startAssessment(page), "Start Gap Assessment on V1");
  rec(status(dic.id) === "under_review", "Status → Under Review");
  // §12: upload blocked while open
  const upBtn = page.getByRole("button", { name: "Upload New Version" });
  rec(await upBtn.isDisabled() && /Complete the current Gap Assessment before uploading a new Version\./.test(await page.getByTestId("document-versions").innerText()), "Open assessment: Upload New Version disabled with 'Complete the current Gap Assessment before uploading a new Version.'");
  await shot(page, "d-upload-blocked");
  // server-side: a forced upload against this document from another document's drawer
  const objsBefore = count(`select count(*)::int n from storage.objects where bucket_id='rayims-files' and split_part(name,'/',1)='${f.P.main}'`);
  await openDoc(page, f.P.main, erpPw.id);
  await page.getByRole("button", { name: "Upload New Version" }).click();
  await dlg(page).getByLabel("File *").setInputFiles(pdf);
  await tamper(page, [[erpPw.id, dic.id]]);
  await dlg(page).getByRole("button", { name: "Upload", exact: true }).click();
  rec(await wait(dlg(page).getByText("Complete the current Gap Assessment before uploading a new Version.")), "Forced upload while an assessment is open: refused by the server");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  rec(versionsOf(dic.id).length === 1 && count(`select count(*)::int n from storage.objects where bucket_id='rayims-files' and split_part(name,'/',1)='${f.P.main}'`) === objsBefore, "  ...no version, no stored object left behind");
  await openDoc(page, f.P.main, dic.id);
  await complete(page, "Revision Required", LONG);
  rec(await waitDb(() => status(dic.id) === "revision_required"), "Complete Revision Required (long consultant comment)");
  const r1 = reviewsOf(versionsOf(dic.id)[0].id)[0];
  rec(r1.notes === LONG, "Comment stored in full");
  rec((await panel(page).textContent()).includes(LONG), "Desktop: full comment shown on Document Detail");
  const r1Hash = rowHash("document_reviews", r1.id), v1Hash = rowHash("document_versions", versionsOf(dic.id)[0].id);
  // Finding + Verification
  await followUp(page).getByRole("button", { name: "Create Finding" }).click();
  await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
  await dlg(page).locator("#fd-title").fill(T("Retention periods not defined"));
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  rec(await waitDb(() => count(`select count(*)::int n from issues where document_review_id='${r1.id}'`) === 1), "Create Finding from the assessment (user-chosen type Observation)");
  const fin = dbQuery(`select * from issues where document_review_id='${r1.id}'`)[0];
  rec(fin.finding_type === "observation" && fin.status === "open", "  ...type as chosen, Open");
  await page.waitForTimeout(1200);
  await followUp(page).getByRole("button", { name: "Add to Verification" }).click();
  await dlg(page).locator("#vi-question").fill(T("Verify EMS record retention onsite"));
  await dlg(page).locator("#vi-target-activity").selectOption({ label: activityLabel("Site Assessment – Site A") });
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  rec(await waitDb(() => count(`select count(*)::int n from verification_items where document_review_id='${r1.id}'`) === 1), "Add to Verification (target Activity: Site Assessment – Site A)");
  const check = dbQuery(`select * from verification_items where document_review_id='${r1.id}'`)[0];
  rec(check.result === null && check.target_activity_id === f.A.mainA, "  ...planning-only (no result), target Activity set");
  rec(rowHash("document_reviews", r1.id) === r1Hash && status(dic.id) === "revision_required", "Follow-up changed neither the assessment nor the Document status");
  // Finding Detail origin
  await page.goto(`${APP}/projects/${f.P.main}/findings/${fin.id}`);
  await page.getByTestId("finding-review-source").waitFor({ timeout: 30000 }).catch(() => {}); // wait for the page itself (7B: the read raced the render)
  rec(/Gap Assessment/.test(await page.locator("main").innerText()) && /Documented Information Control Procedure/.test(await page.locator("main").innerText()), "Finding Detail shows its Gap Assessment origin");
  // V2
  await openDoc(page, f.P.main, dic.id);
  rec(await upload(page, pdf, "Rev.01"), "Upload corrected V2 (same file name)");
  rec(await waitDb(() => status(dic.id) === "received"), "Status resets to Received");
  const vs = versionsOf(dic.id);
  rec(vs.length === 2 && vs[0].original_name === vs[1].original_name && vs[0].storage_key !== vs[1].storage_key && objectExists(vs[0].storage_key) && objectExists(vs[1].storage_key), "Same file name on V1 / V2: distinct private objects, both kept");
  const v1row = vrows(page).nth(1);
  await v1row.getByRole("button", { name: /Assessment history/ }).click();
  const hist = flat(await v1row.innerText());
  rec(/Revision Required/.test(hist) && /1 Finding · 1 Verification Item/.test(hist) && (await v1row.getByRole("button", { name: /Create Finding|Add to Verification/ }).count()) === 0, "V1 history: Revision Required, existing follow-up visible, no new follow-up actions");
  rec(/Not started/.test(await panel(page).first().innerText()) && (await followUp(page).count()) === 0, "V2 current: assessment Not started, no follow-up yet (old result not carried over)");
  rec(await startAssessment(page), "Start Gap Assessment on V2");
  await complete(page, "Accepted", "Updated procedure is acceptable.");
  rec(await waitDb(() => status(dic.id) === "accepted"), "Complete Accepted → status Accepted");
  rec(rowHash("document_reviews", r1.id) === r1Hash && rowHash("document_versions", vs[0].id) === v1Hash && mapHash(dic.id) === dicMap, "V1 version + its concluded assessment immutable; document mappings unchanged");
  rec((await panel(page).locator("button", { hasText: /^Delete/ }).count()) === 0 && (await page.getByTestId("assessment-entry").locator("button", { hasText: /Delete/ }).count()) === 0, "No delete control on assessments");
  await shot(page, "d-detail-accepted", true);
  // §18 execution: Issue Identified → Finding from Verification
  await page.goto(`${APP}/projects/${f.P.main}/activities/${f.A.mainA}`);
  const card = page.locator("div.rounded-lg", { hasText: "Verify EMS record retention onsite" }).last();
  await card.getByRole("button", { name: "Verify" }).click();
  await dlg(page).getByRole("button", { name: "Issue Identified", exact: true }).click();
  await dlg(page).locator("#ve-notes").fill("Retention records missing at Site A.");
  await dlg(page).getByRole("button", { name: "Save" }).click();
  await gone(dlg(page));
  rec(await waitDb(() => dbQuery(`select result from verification_items where id='${check.id}'`)[0].result === "issue_identified"), "Verification executed in the Activity: Issue Identified");
  await page.waitForTimeout(1200);
  await card.getByRole("button", { name: "Create Finding" }).click();
  await dlg(page).getByRole("button", { name: "Nonconformity", exact: true }).click();
  await dlg(page).locator("#fd-title").fill(T("Retention records missing at Site A"));
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  rec(await waitDb(() => count(`select count(*)::int n from issues where verification_item_id='${check.id}'`) === 1), "Finding from that Verification");
  const chain = dbQuery(`select * from issues where verification_item_id='${check.id}'`)[0];
  rec(chain.document_review_id === null && chain.site_id === f.sA, "Traceability Review → Verification → Finding: no direct review link, site Site A");
  rec(status(dic.id) === "accepted" && rowHash("document_reviews", r1.id) === r1Hash, "Execution changed neither the assessment nor the Document status");

  // ================= §21 / §23 Export of the real workflow =================
  const pre = totals();
  const E1 = await exportVia(page, f.P.main, "main.xlsx");
  PERF.push(`Export main project (${E1.x.rows.length} rows): ${E1.ms} ms`);
  const dicRows = E1.x.rows.filter((r) => r["Required Document"] === T("Documented Information Control Procedure"));
  const d0 = dicRows[0] ?? {};
  const v2Reviewed = dbQuery(`select reviewed_at from document_reviews where document_version_id='${vs[1].id}'`)[0].reviewed_at;
  const vnDay = new Date(v2Reviewed).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  rec(dicRows.length === 2 && dicRows.map((r) => r.Framework).join("|") === "ISO 9001:2015|ISO 14001:2015", "Export: the workflow document = 2 rows (ISO 9001:2015 · 7.5, ISO 14001:2015 · 7.5)");
  rec(d0["Current Version"] === "V2" && d0["Current Revision"] === "Rev.01" && d0["Current File"] === "procedure.pdf" && d0["Gap Assessment Status"] === "Accepted" && d0["Review Comments"] === "Updated procedure is acceptable." && d0["Document Code"] === "QT-01" && d0.Owner === "QA Manager" && d0.Site === "Project-wide", "Export: V2 / Rev.01 / procedure.pdf / Accepted / V2 comments / identity fields");
  rec(d0.Findings === 1 && d0["Verification Items"] === 1 && d0["Follow-up Summary"] === "1 Finding (Open) · 1 Verification Item (Completed)", `Export: historical follow-up 1 Finding + 1 Verification Item, Verification-origin Finding not counted ("${d0["Follow-up Summary"]}")`);
  rec(ymd(d0["Last Review"]) === vnDay, `Export Last Review = viewer's local day (${vnDay})`);
  const statuses = new Set(E1.x.rows.map((r) => r["Gap Assessment Status"]));
  rec(statuses.has("Not Received") && statuses.has("Not Applicable") && statuses.has("Accepted"), "Export: Not Received / Not Applicable / Accepted rows present");
  const audRow = E1.x.rows.find((r) => r["Required Document"] === T("Internal Audit Procedure"));
  rec(audRow?.Owner === "Phòng QA – Trưởng phòng" && audRow?.Site === "Site A" && audRow?.["Document Code"] === "" && audRow?.["Gap Assessment Status"] === "Not Received", "Import → Export: identity survives (owner Vietnamese, site, blank code), still Not Received");
  rec(E1.x.rows.filter((r) => r["Required Document"] === T("Emergency Response Procedure")).map((r) => r.Site).sort().join("|") === "Project-wide|Site A|Site B", "Export: same-title documents per site kept apart");
  rec(!E1.x.all.includes("BMARKER") && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(E1.x.all), "Export: no Project B value, no ids");
  rec(JSON.stringify(totals()) === JSON.stringify(pre), "Export wrote nothing");
  await ctx.close();

  // ================= §28 MOBILE =================
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    const P = m.page;
    await P.goto(DOCS(f.P.main));
    await P.getByRole("heading", { name: "Documents", level: 2 }).waitFor({ timeout: 30000 });
    rec(await noHOverflow(P) && await reachable(P, P.getByRole("button", { name: "Export Excel" })) && await reachable(P, P.getByRole("link", { name: "Import Excel" })), `${w}px register: no overflow, Import / Export reachable`);
    const target = w === 390 ? erpA : erpB;
    await openDoc(P, f.P.main, target.id);
    rec(await noHOverflow(P) && await reachable(P, P.getByRole("button", { name: "Upload New Version" })), `${w}px detail: no overflow, Upload reachable`);
    if (w === 390) {
      await P.getByRole("button", { name: "Upload New Version" }).click();
      rec(await noHOverflow(P) && await reachable(P, dlg(P).getByRole("button", { name: "Upload", exact: true })), "390px upload drawer: fits, Upload reachable");
      await dlg(P).getByLabel("File *").setInputFiles(pdf);
      await dlg(P).getByRole("button", { name: "Upload", exact: true }).click();
      rec(await wait(P.getByText("Version uploaded.").first(), 180000), "390px: V1 uploaded");
      await gone(dlg(P), 20000);
      rec(await startAssessment(P), "390px: Start Gap Assessment");
      await panel(P).getByRole("button", { name: "Complete Assessment" }).click();
      rec(await noHOverflow(P) && await reachable(P, dlg(P).getByRole("button", { name: "Complete", exact: true })), "390px complete dialog: fits, Complete reachable");
      await dlg(P).locator("#ga-comments").fill(LONG);
      await dlg(P).getByRole("button", { name: "Revision Required", exact: true }).click();
      await dlg(P).getByRole("button", { name: "Complete", exact: true }).click();
      await gone(dlg(P), 20000);
      rec(await waitDb(() => status(target.id) === "revision_required") && (await panel(P).textContent()).includes(LONG) && await noHOverflow(P), "390px: Revision Required, full comment shown, no overflow");
      rec(await reachable(P, followUp(P).getByRole("button", { name: "Create Finding" })) && await reachable(P, followUp(P).getByRole("button", { name: "Add to Verification" })), "390px: follow-up buttons not covered by the bottom nav");
      await followUp(P).getByRole("button", { name: "Create Finding" }).click();
      const siteText = flat(await dlg(P).innerText());
      rec(/Site A/.test(siteText) && await noHOverflow(P), "390px Create Finding: site locked to the document's Site A");
      await dlg(P).getByRole("button", { name: "Observation", exact: true }).click();
      await dlg(P).locator("#fd-title").fill(T("Mobile finding"));
      await dlg(P).getByRole("button", { name: "Create", exact: true }).click();
      const rA = dbQuery(`select r.id from document_reviews r join document_versions v on v.id=r.document_version_id where v.document_id='${target.id}'`)[0].id;
      rec(await waitDb(() => dbQuery(`select site_id from issues where document_review_id='${rA}'`)[0]?.site_id === f.sA), "390px: Finding saved with site Site A");
      await P.waitForTimeout(1200);
      await followUp(P).getByRole("button", { name: /Add to Verification/ }).click();
      await dlg(P).locator("#vi-question").fill(T("Mobile check"));
      await dlg(P).getByRole("button", { name: "Create", exact: true }).click();
      rec(await waitDb(() => dbQuery(`select site_id from verification_items where document_review_id='${rA}'`)[0]?.site_id === f.sA), "390px: Verification Item saved with site Site A");
      await shot(P, "m390-detail", true);
    }
    await P.goto(`${DOCS(f.P.main)}/import`);
    await P.getByRole("heading", { name: "Import Required Documents" }).waitFor({ timeout: 20000 });
    rec(await noHOverflow(P), `${w}px import page: no overflow`);
    await m.ctx.close();
  }

  // ================= §13 RACE =================
  const c1 = await open(1280, 800, "admin");
  const c2 = await open(1280, 800, "consultant");
  let dupes = 0;
  for (const r of f.E.race) {
    await Promise.all([openDoc(c1.page, f.P.edge, r.d), openDoc(c2.page, f.P.edge, r.d)]);
    await Promise.all([c1.page, c2.page].map((p) => panel(p).getByRole("button", { name: "Start Gap Assessment" }).waitFor({ timeout: 20000 })));
    await Promise.all([c1.page, c2.page].map((p) => panel(p).getByRole("button", { name: "Start Gap Assessment" }).click()));
    await c1.page.waitForTimeout(4000);
    const open = reviewsOf(r.v).filter((x) => x.status === "under_review").length;
    if (open > 1) dupes += 1;
    info(`race attempt: ${open} open assessment(s) on one version`);
    const errs = (await Promise.all([c1.page, c2.page].map((pg) => panel(pg).innerText()))).join(" ");
    if (open !== 1 || /Couldn't start/.test(errs)) dupes += 10;
  }
  rec(dupes === 0, `One-open-assessment race (5G fix): 3 simultaneous two-browser starts → exactly one open assessment each time`);
  await c2.ctx.close();

  // ================= §14 TIE / §27 TIMEZONE / §20 COUNTS / §31 errors / §36 delete =================
  const p = c1.page;
  await p.goto(DOCS(f.P.edge));
  await p.locator("tbody tr").first().waitFor({ timeout: 30000 });
  const regRow = (title) => p.locator("tbody tr", { hasText: title });
  const tieView = status(f.E.tie);
  const tieRegister = flat(await regRow(T("Tie Document")).innerText());
  await openDoc(p, f.P.edge, f.E.tie);
  const tiePanel = flat(await panel(p).first().innerText());
  const xe = await exportVia(p, f.P.edge, "edge.xlsx");
  const tieExport = xe.x.rows.find((r) => r["Required Document"] === T("Tie Document"));
  const label = { accepted: "Accepted", revision_required: "Revision Required" }[tieView];
  rec(tieRegister.includes(label) && tieExport["Gap Assessment Status"] === label && tieExport["Review Comments"] === (tieView === "accepted" ? "TIE accepted" : "TIE revision required"), `Identical created_at: register + export agree with the view (${label}), comments from the same review`);
  const panelLabel = /Accepted/.test(tiePanel) ? "Accepted" : /Revision Required/.test(tiePanel) ? "Revision Required" : "?";
  info(`identical created_at: view=${label}, Document Detail panel=${panelLabel} (${panelLabel === label ? "same" : "DIFFERENT"})`);
  // timezone
  await p.goto(DOCS(f.P.edge));
  await p.locator("tbody tr").first().waitFor({ timeout: 30000 });
  // 7A: timestamps are rendered by <LocalTime>, hidden until the browser has formatted them in its own zone
  await p.waitForFunction(() => document.querySelectorAll("time.invisible").length === 0, null, { timeout: 15000 }).catch(() => {});
  const tzReg = flat(await regRow(T("Timezone Document")).innerText());
  await openDoc(p, f.P.edge, f.E.tz);
  await vrows(p).first().getByRole("button", { name: /Assessment history/ }).click().catch(() => {});
  await p.waitForFunction(() => document.querySelectorAll("time.invisible").length === 0, null, { timeout: 15000 }).catch(() => {});
  const tzDetail = flat(await p.locator("main").innerText());
  const tzExport = xe.x.rows.find((r) => r["Required Document"] === T("Timezone Document"));
  rec(/Sep 30, 2026/.test(tzReg) && /Sep 30, 2026/.test(tzDetail) && ymd(tzExport["Last Review"]) === "2026-09-30", "Review concluded 22:30 UTC (05:30 in Vietnam): register, detail and export all show 30 Sep 2026");
  const utcRes = await p.request.get(`${DOCS(f.P.edge)}/export?tz=UTC`);
  const xu = await parseXlsx(await utcRes.body());
  const badRes = await p.request.get(`${DOCS(f.P.edge)}/export?tz=Mars%2FBase`);
  const xb = await parseXlsx(await badRes.body());
  rec(ymd(xu.rows.find((r) => r["Required Document"] === T("Timezone Document"))["Last Review"]) === "2026-09-29" && /\(UTC\)$/.test(String(xb.sum.Exported)) && ymd(xb.rows.find((r) => r["Required Document"] === T("Timezone Document"))["Last Review"]) === "2026-09-29", "Export day follows the requested zone; unknown zone → UTC");
  // counts
  await openDoc(p, f.P.edge, f.E.counts);
  const v1r = vrows(p).nth(1);
  await v1r.getByRole("button", { name: /Assessment history/ }).click();
  const sums = (await p.getByTestId("follow-up-summary").allInnerTexts()).map(flat);
  let dF = 0, dV = 0;
  for (const s of sums) { dF += Number(/(\d+) Findings?/.exec(s)?.[1] ?? 0); dV += Number(/(\d+) Verification Items?/.exec(s)?.[1] ?? 0); }
  const dbF = count(`select count(*)::int n from issues i join document_reviews r on r.id=i.document_review_id join document_versions v on v.id=r.document_version_id where v.document_id='${f.E.counts}'`);
  const dbV = count(`select count(*)::int n from verification_items i join document_reviews r on r.id=i.document_review_id join document_versions v on v.id=r.document_version_id where v.document_id='${f.E.counts}'`);
  const cx = xe.x.rows.filter((r) => r["Required Document"] === T("Counts Document"));
  rec(dF === 3 && dV === 2 && dbF === 3 && dbV === 2 && cx.length === 2 && cx.every((r) => r.Findings === 3 && r["Verification Items"] === 2 && r["Follow-up Summary"] === "3 Findings (2 Open) · 2 Verification Items (1 Pending)"), `Counts: Detail ${dF}/${dV} = DB ${dbF}/${dbV} = Export 3/2 on both rows ("${cx[0]?.["Follow-up Summary"]}") — closed / completed / historical included, Verification-origin Finding excluded`);
  // storage missing
  await openDoc(p, f.P.edge, f.E.missing);
  await vrows(p).first().getByRole("button", { name: /^View/ }).click();
  rec(await wait(p.getByText("File is unavailable.").first()), "Missing Storage object: 'File is unavailable.'");
  // controlled delete
  await openDoc(p, f.P.edge, f.E.del);
  await p.getByRole("button", { name: "More actions" }).first().click();
  await p.getByRole("menuitem", { name: "Delete Document" }).click();
  await delDlg(p).getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  rec(/This document has versions and cannot be deleted\./.test(await delDlg(p).innerText()), "Delete Document with versions: blocked with reason");
  await delDlg(p).getByRole("button", { name: "Close" }).click();
  await vrows(p).first().getByRole("button", { name: "More actions" }).click();
  await p.getByRole("menuitem", { name: "Delete Version" }).click();
  await delDlg(p).getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  await delDlg(p).getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => versionsOf(f.E.del).length === 1), "Latest unreviewed version: deleted");
  await openDoc(p, f.P.edge, f.E.del);
  await vrows(p).first().getByRole("button", { name: "More actions" }).click();
  await p.getByRole("menuitem", { name: "Delete Version" }).click();
  await delDlg(p).getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  const blockedText = flat(await delDlg(p).innerText());
  rec((await delDlg(p).getByRole("button", { name: "Delete", exact: true }).count()) === 0 && /This version has review history and cannot be deleted./.test(blockedText), `Reviewed version: delete blocked ("${blockedText.slice(0, 90)}…")`);
  await delDlg(p).getByRole("button", { name: "Close" }).click();
  // real object cleanup on version delete
  await openDoc(p, f.P.main, erpPw.id);
  await upload(p, pdf, "Temp");
  const tmp = versionsOf(erpPw.id)[0];
  await vrows(p).first().getByRole("button", { name: "More actions" }).click();
  await p.getByRole("menuitem", { name: "Delete Version" }).click();
  await delDlg(p).getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  await delDlg(p).getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => versionsOf(erpPw.id).length === 0 && !objectExists(tmp.storage_key) && count(`select count(*)::int n from files where id='${tmp.file_id}'`) === 0), "Version delete removes the version, its file row and its stored object");
  // signed URL TTL on a real file
  await openDoc(p, f.P.main, dic.id);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), vrows(p).first().getByRole("button", { name: /^Download/ }).click()]);
  const tok = new URL(dl.url()).searchParams.get("token");
  const claims = tok ? JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()) : {};
  rec(/\/object\/sign\/rayims-files\//.test(dl.url()) && claims.exp - claims.iat === 60 && dl.suggestedFilename() === "procedure.pdf", "Download: private bucket, 60 s signed URL, original file name");
  rec(count(`select count(*)::int n from storage.buckets where id='rayims-files' and public=false`) === 1, "Bucket is private (no public URLs)");
  // §31 import / upload errors
  await p.goto(`${DOCS(f.P.main)}/import`);
  const fake = path.join(DIR, "fake.xlsx");
  writeFileSync(fake, "Framework,Required Document\nISO 9001:2015,X\n");
  await p.waitForLoadState("networkidle").catch(() => {}); // the file input is server-rendered: a selection made before hydration is lost (Phase 7D)
  await p.getByLabel("Choose an Excel workbook").setInputFiles(fake);
  const fakeMsg = p.locator("main").getByText(/Could not read this file\./).first();
  rec(await wait(fakeMsg) && !RAW_ERR.test(await p.locator("main").innerText()), "Invalid Excel (CSV renamed .xlsx): friendly message, no raw error");
  const bad = new ExcelJS.Workbook();
  const bws = bad.addWorksheet("Required Documents");
  bws.addRow(["Framework", "Framework Requirement", "Required Document", "Document Code", "Document Type", "Owner", "Site", "Applicable"]);
  bws.addRow(["ISO 9001:2015", "7.5", T("Bad Site Doc"), "", "", "", "BMARKER Site", ""]);
  bws.addRow(["ISO 50001:2018", "4.1", T("Bad Framework Doc"), "", "", "", "", ""]);
  bws.addRow(["ISO 9001:2015", "7.5.9", T("Bad Clause Doc"), "", "", "", "", ""]);
  const badFile = path.join(DIR, "bad.xlsx");
  await bad.xlsx.writeFile(badFile);
  await p.goto(`${DOCS(f.P.main)}/import`);
  await p.waitForLoadState("networkidle").catch(() => {}); // the file input is server-rendered: a selection made before hydration is lost (Phase 7D)
  await p.getByLabel("Choose an Excel workbook").setInputFiles(badFile);
  await p.getByTestId("import-preview").waitFor({ timeout: 60000 });
  const bp = flat(await p.getByTestId("import-preview").innerText());
  rec(/3 Errors/i.test(bp) && /Unknown Site "BMARKER Site"/.test(bp) && /isn't assigned to this project/.test(bp) && /wasn't found in ISO 9001:2015/.test(bp) && (await p.getByRole("button", { name: /^Import \d+ Documents?$/ }).isDisabled().catch(() => true)), "Bad site (other client's) / unassigned framework / unknown clause: row errors, import blocked");
  await openDoc(p, f.P.main, erpPw.id);
  await p.getByRole("button", { name: "Upload New Version" }).click();
  const exe = path.join(DIR, "tool.exe");
  writeFileSync(exe, "MZ");
  await dlg(p).getByLabel("File *").setInputFiles(exe);
  const typeErr = flat(await dlg(p).innerText());
  const big = path.join(DIR, "big.pdf");
  writeFileSync(big, Buffer.alloc(11 * 1024 * 1024, 32));
  await dlg(p).getByLabel("File *").setInputFiles(big);
  const sizeErr = flat(await dlg(p).innerText());
  rec(/type|PDF|Word|Excel|allowed/i.test(typeErr) && /10 MB/.test(sizeErr) && !RAW_ERR.test(typeErr + sizeErr), "Upload: wrong type and >10 MB refused with friendly messages");
  await dlg(p).getByRole("button", { name: "Cancel" }).click();
  rec(/Versions cannot be uploaded while this document is Not Applicable\./.test(await (async () => { await openDoc(p, f.P.main, na.id); return p.locator("main").innerText(); })()), "N/A document: upload unavailable with reason");
  const cross = await p.goto(`${DOCS(f.P.main)}/${f.bDoc}`);
  await p.getByText("Page not found").waitFor({ timeout: 20000 }).catch(() => {});
  const crossBody = await p.locator("body").innerText();
  rec(/Page not found/.test(crossBody) && !/BMARKER/.test(crossBody), `Cross-project document URL: 'Page not found' (streamed, HTTP ${cross.status()}), nothing leaked`);

  // ================= §32 / §33 tamper + anon =================
  await openDoc(p, f.P.main, dic.id);
  await tamper(p, [[vs[1].id, f.bV]]);
  const dlP = p.waitForEvent("download", { timeout: 8000 }).catch(() => null);
  await vrows(p).first().getByRole("button", { name: /^Download/ }).click();
  const leaked = await dlP;
  const msgs = flat(await p.getByTestId("document-versions").innerText());
  rec(!leaked && /could not be found|unavailable|not found/i.test(msgs), "Signed URL for a Project B version through Project A: refused, nothing downloaded");
  await untamper(p);
  const startBodyCapture = {};
  const listener = (req) => { if (req.method() === "POST" && req.headers()["next-action"]) Object.assign(startBodyCapture, { url: req.url(), headers: req.headers(), body: req.postData() ?? "" }); };
  await openDoc(p, f.P.edge, f.E.missing);
  p.on("request", listener);
  await tamper(p, [[f.E.missingV, f.bV]]);
  await panel(p).getByRole("button", { name: "Start Gap Assessment" }).click();
  await p.waitForTimeout(2500);
  await untamper(p);
  p.off("request", listener);
  rec(reviewsOf(f.bV).length === 1, "Start assessment on a Project B version through Project A: refused (no review created)");
  // anon replay of the captured start action against an unreviewed, current, applicable version
  // (Missing File Document V1 — an authenticated start there WOULD succeed, so a refusal proves the auth check)
  const target = f.E.missingV;
  const before3 = reviewsOf(target).length;
  if (startBodyCapture.body) {
    const body = startBodyCapture.body.split(f.bV).join(target);
    const h = { ...startBodyCapture.headers };
    delete h.cookie;
    const res = await fetch(startBodyCapture.url, { method: "POST", headers: { "next-action": h["next-action"], "content-type": h["content-type"] ?? "text/plain;charset=UTF-8", accept: "text/x-component" }, body, redirect: "manual" });
    const txt = await res.text();
    rec(reviewsOf(target).length === before3 && !/reviewId/.test(txt), `Anon replay of 'start assessment': nothing created (HTTP ${res.status})`);
  } else rec(false, "Anon replay: no action captured");
  const anon = await (await browser.newContext()).newPage();
  const anonPaths = [DOCS(f.P.main), `${DOCS(f.P.main)}/${dic.id}`, `${DOCS(f.P.main)}/import`];
  let anonOk = true;
  for (const u of anonPaths) { await anon.goto(u); if (!/\/login/.test(anon.url())) anonOk = false; }
  const ex = await fetch(`${DOCS(f.P.main)}/export`, { redirect: "manual" });
  const tp = await fetch(`${DOCS(f.P.main)}/template`, { redirect: "manual" });
  rec(anonOk && ex.status === 307 && tp.status === 307, "Anon: register / detail / import → login; export / template → 307, no bytes");
  await anon.context().close();

  // ================= §25 LARGE + §37 PERFORMANCE =================
  bulk(f.P.p10, 9, f.sA, f.sB);
  bulk(f.P.p100, 100, f.sA, f.sB);
  bulk(f.P.p300, 300, f.sA, f.sB);
  for (const [label, proj, n] of [["10", f.P.p10, 10], ["100", f.P.p100, 100], ["300", f.P.p300, 300]]) {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const s = Date.now();
      await p.goto(DOCS(proj));
      await p.locator("tbody tr").first().waitFor({ timeout: 60000 });
      times.push(Date.now() - s);
    }
    const rowsShown = await p.locator("tbody tr").count();
    PERF.push(`Register ${label} documents: ${times.join(" / ")} ms`);
    rec(rowsShown === n, `Register ${label}: all ${n} documents (${times.join(" / ")} ms)`);
  }
  const lastReviewShown = await p.locator("tbody tr").evaluateAll((trs) => trs.filter((tr) => tr.children[5]?.textContent?.trim() !== "—").length);
  const lastReviewDb = count(`select count(*)::int n from document_register r where r.project_id='${f.P.p300}' and exists (select 1 from document_reviews x where x.document_version_id=r.latest_version_id and x.reviewed_at is not null)`);
  rec(lastReviewShown === lastReviewDb, `300 documents: Last Review shown for ${lastReviewShown} = DB ${lastReviewDb}`);
  const xl = await exportVia(p, f.P.p300, "p300.xlsx");
  PERF.push(`Export 300 documents (${xl.x.rows.length} rows, ${(xl.bytes / 1024).toFixed(0)} KB): ${xl.ms} ms`);
  const perDoc = new Map(xl.x.rows.map((r) => [r["Required Document"] + "|" + r.Site, r]));
  const fSum = [...perDoc.values()].reduce((n, r) => n + r.Findings, 0), vSum = [...perDoc.values()].reduce((n, r) => n + r["Verification Items"], 0);
  const fDb = count(`select count(*)::int n from issues where project_id='${f.P.p300}' and document_review_id is not null`), vDb = count(`select count(*)::int n from verification_items where project_id='${f.P.p300}' and document_review_id is not null`);
  const lrX = [...perDoc.values()].filter((r) => r["Last Review"] instanceof Date).length;
  rec(xl.x.rows.length === 1200 && perDoc.size === 300 && fSum === fDb && vSum === vDb && lrX === lastReviewDb, `300 × 4 mappings: 1200 rows (> 1000 cap), Findings ${fSum}=${fDb}, Verification ${vSum}=${vDb}, Last Review ${lrX}=${lastReviewDb} — no truncation`);
  // detail heavy
  const dt = [];
  for (let i = 0; i < 3; i++) { const s = Date.now(); await openDoc(p, f.P.p10, f.E.heavy); await panel(p).first().waitFor(); dt.push(Date.now() - s); }
  PERF.push(`Document Detail (3 versions, 10 assessments, 20 follow-ups): ${dt.join(" / ")} ms`);
  rec((await vrows(p).count()) >= 2, `Detail with 3 versions / 10 assessments / 20 follow-ups renders (${dt.join(" / ")} ms)`);
  // import 250
  const big250 = new ExcelJS.Workbook();
  const b250 = big250.addWorksheet("Required Documents");
  b250.addRow(["Framework", "Framework Requirement", "Required Document", "Document Code", "Document Type", "Owner", "Site", "Applicable"]);
  for (let i = 1; i <= 250; i++) b250.addRow([i % 2 ? "ISO 9001:2015" : "ISO 14001:2015", "7.5", T(`Imported ${String(i).padStart(3, "0")}`), `IM-${i}`, "Record", `Owner ${i % 5}`, i % 3 === 0 ? "Site A" : "", ""]);
  const f250 = path.join(DIR, "import250.xlsx");
  await big250.xlsx.writeFile(f250);
  let s = Date.now();
  await p.goto(`${DOCS(f.P.imp)}/import`);
  await p.waitForLoadState("networkidle").catch(() => {}); // the file input is server-rendered: a selection made before hydration is lost (Phase 7D)
  await p.getByLabel("Choose an Excel workbook").setInputFiles(f250);
  await p.getByTestId("import-preview").waitFor({ timeout: 90000 });
  const prevMs = Date.now() - s;
  s = Date.now();
  await p.getByRole("button", { name: /^Import 250 Documents$/ }).click();
  await p.waitForURL(/\/documents(\?|$)/, { timeout: 120000 });
  const impMs = Date.now() - s;
  PERF.push(`Import 250 rows: preview ${prevMs} ms, import + redirect ${impMs} ms`);
  rec(await waitDb(() => count(`select count(*)::int n from documents where project_id='${f.P.imp}'`) === 250), `Import 250 rows: preview ${prevMs} ms, import ${impMs} ms, 250 documents`);
  await c1.ctx.close();

  // ================= §30 empty project =================
  const e = await open(1280, 800);
  await e.page.goto(DOCS(f.P.empty));
  rec(await wait(e.page.getByText("No documents yet.")) && !/Coming soon/i.test(await e.page.locator("main").innerText()), "Empty project: 'No documents yet.', no 'Coming soon'");
  await e.ctx.close();
  for (const l of PERF) info(`PERF ${l}`);
} catch (err) {
  rec(false, "Unexpected error", err.message.split("\n")[0] + " " + String(err.stderr ?? "").replace(/\s+/g, " ").slice(0, 400));
} finally {
  await browser.close();
  const removed = await cleanupP5g(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like '${PFX}%')::int c, (select count(*) from documents)::int d, (select count(*) from document_versions)::int v, (select count(*) from document_reviews)::int r, (select count(*) from issues)::int i, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o`)[0];
  rec(left.c === 0 && left.d === 0 && left.v === 0 && left.r === 0 && left.i === 0 && left.f === 0 && left.o === 0, `Cleanup: fixtures (+${removed} Storage objects) removed; documents / versions / reviews / findings / files / objects all 0`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
