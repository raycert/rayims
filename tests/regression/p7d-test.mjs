// Phase 7D acceptance: Expected Records / Required Evidence (documents.expected_records): create / edit, Document Detail,
// read-only Gap Assessment context, Excel import (column, aliases, multiline, merge / conflict, old workbooks), Excel export,
// Vietnamese, long text, mobile / desktop, isolation, data integrity. Fixtures: P7D-ACCEPT- only.
// Needs the 7D migration applied and a production build on 127.0.0.1:3105.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { REPO, users, makeReporter, signIn, dbQuery, http } from "./common.mjs";
import { createP7d, cleanupP7d, SHORT_RECORDS, VN_RECORDS, LONG_RECORDS } from "./p7d-fixtures.mjs";

const ExcelJS = createRequire(REPO + "/package.json")("exceljs");
const APP = "http://127.0.0.1:3105";
const R = makeReporter();
const rec = (ok, name, detail = "") => { R.rec(ok, name, detail); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " :: " + detail : ""}`); };
const flat = (s) => s.replace(/\s+/g, " ").trim();
const one = (sql) => dbQuery(sql)[0];
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const DIR = path.join(process.env.TEMP, "p7d-files");
mkdirSync(DIR, { recursive: true });
const MAX = 2000;

const admin = await signIn("admin");
const consultant = await signIn("consultant");
await cleanupP7d(admin.token);
const f = await createP7d(admin.token);
const P = `${APP}/projects/${f.pP}`;
const docByTitle = (t) => one(`select id, expected_records, is_applicable, updated_at::text u from documents where project_id='${f.pP}' and title='${t.replace(/'/g, "''")}'`);
const maps = (id) => one(`select count(*)::int n from document_framework_items where document_id='${id}'`).n;

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const caps = [];
async function open(width, height, who = "admin") {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: "Asia/Ho_Chi_Minh", locale: "en-US", acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("request", (req) => { if (req.method() === "POST" && req.headers()["next-action"]) caps.push({ url: req.url(), headers: req.headers(), body: req.postData() ?? "" }); });
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 25000 }).catch(() => {}), page.click('button[type="submit"]')]);
  return { ctx, page };
}
const dlg = (p) => p.getByRole("dialog");
const cookieOf = async (ctx) => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const replay = async (cap, swaps, cookie) => {
  let body = cap.body;
  for (const [a, b] of swaps) body = body.split(a).join(b);
  const r = await fetch(cap.url, { method: "POST", headers: { "next-action": cap.headers["next-action"], "content-type": cap.headers["content-type"] ?? "text/plain;charset=UTF-8", accept: "text/x-component", ...(cookie ? { cookie } : {}) }, body, redirect: "manual" });
  return { status: r.status, text: await r.text() };
};
const hit = (loc) => loc.evaluate((el) => { const b = el.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!h && (h === el || el.contains(h)); });

// ================= 0. Migration facts (hosted) =================
{
  const c = dbQuery(`select data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='documents' and column_name='expected_records'`);
  rec(c.length === 1 && c[0].data_type === "text" && c[0].is_nullable === "YES" && c[0].column_default === null, "Hosted: documents.expected_records is nullable text with no default");
  rec(one(`select count(*)::int n from documents where expected_records is null and project_id in ('${f.pP}')`).n >= 1, "Documents created without it have NULL (no backfill)");
}

// ================= 1. Create Document (Consultant) =================
{
  const { ctx, page } = await open(1280, 800, "consultant");
  await page.goto(`${P}/documents`);
  const create = async (title, expected) => {
    await page.getByRole("button", { name: "+ New Document" }).click();
    await dlg(page).locator("#doc-title").fill(title);
    if (expected !== undefined) await dlg(page).locator("#doc-expected-records").fill(expected);
    await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  };
  await create("Training Procedure", SHORT_RECORDS);
  await page.getByText("Document created").first().waitFor({ timeout: 20000 });
  const d1 = docByTitle("Training Procedure");
  const reg = one(`select status from document_register where document_id='${d1.id}'`).status;
  rec(d1.expected_records === SHORT_RECORDS && reg === "not_received" && one(`select count(*)::int n from document_versions where document_id='${d1.id}'`).n === 0, "Create with Expected Records: stored exactly with its line breaks; status Not Received; no Version created");
  const lbl = await page.getByRole("button", { name: "+ New Document" }).click().then(() => dlg(page).locator('label[for="doc-expected-records"]').innerText());
  rec(/Expected Records \/ Required Evidence/.test(lbl) && /Records or evidence the consultant expects to review for this Required Document/.test(flat(await dlg(page).innerText())), "The form field is labelled 'Expected Records / Required Evidence' with the helper text");
  rec((await dlg(page).locator("#doc-expected-records").evaluate((e) => e.tagName)) === "TEXTAREA", "The field is a multiline textarea");
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await create("No Records Document");
  await page.getByText("Document created").first().waitFor({ timeout: 20000 });
  rec(docByTitle("No Records Document").expected_records === null, "Create without Expected Records (optional): NULL");
  await create("Whitespace Document", "   \n  \n ");
  await page.waitForFunction(() => document.body.innerText.includes("Whitespace Document"), null, { timeout: 20000 });
  rec(docByTitle("Whitespace Document").expected_records === null, "Whitespace-only is stored as NULL");
  await page.getByRole("button", { name: "+ New Document" }).click();
  await dlg(page).locator("#doc-title").fill("Too Long Document");
  await dlg(page).locator("#doc-expected-records").fill("x".repeat(MAX + 1));
  const counterRed = await dlg(page).locator("p#doc-expected-records-help span.text-danger").count();
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  await dlg(page).getByRole("alert").first().waitFor({ timeout: 15000 });
  rec(/under 2,000 characters/.test(flat(await dlg(page).innerText())) && counterRed === 1 && !docByTitle("Too Long Document"), "More than 2,000 characters: a field error (never truncated), counter turns red, nothing created");
  await ctx.close();
}

// ================= 2. Edit + data integrity =================
let editCap = null;
{
  const { ctx, page } = await open(1280, 800);
  const snap = () => one(`select
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from document_versions t where document_id='${f.dv}') v,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from document_reviews t where document_version_id='${f.vv.v}') r,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from issues t where project_id='${f.pP}') i,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from verification_items t where project_id='${f.pP}') vi,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from actions t where project_id='${f.pP}') a,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from files t where project_id='${f.pP}') fl,
    (select md5(coalesce(string_agg(t::text,'|' order by 1),'')) from document_framework_items t where document_id='${f.dv}') m,
    (select count(*)::int from storage.objects where bucket_id='rayims-files') o,
    (select md5((to_jsonb(d) - 'expected_records' - 'updated_at')::text) from documents d where id='${f.dv}') docrest,
    (select status from document_register where document_id='${f.dv}') status`);
  const before = snap();
  await page.goto(`${P}/documents/${f.dv}`);
  await page.getByTestId("document-expected-records").waitFor({ timeout: 30000 });
  rec(/No Expected Records recorded\./.test(await page.getByTestId("document-expected-records").innerText()), "Document Detail without Expected Records: a compact 'No Expected Records recorded.' line");
  await page.getByTestId("document-expected-records").getByRole("button", { name: "Edit" }).click();
  caps.length = 0;
  await dlg(page).locator("#doc-expected-records").fill(`  ${SHORT_RECORDS}\n\n`);
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Document updated").first().waitFor({ timeout: 20000 });
  editCap = caps[caps.length - 1];
  const after = snap();
  const d = one(`select expected_records from documents where id='${f.dv}'`);
  rec(d.expected_records === SHORT_RECORDS, "Edit: stored trimmed with line breaks preserved");
  rec(JSON.stringify(before) === JSON.stringify(after), `Edit changed ONLY the Document's Expected Records: Versions, reviews, Findings, Verification, Actions, files, mappings, Storage objects, other Document fields and the derived status (${after.status}) are identical`);
  await page.reload();
  const shown = await page.getByTestId("expected-records-text").innerText();
  rec(shown.split("\n").length === 4 && shown.trim() === SHORT_RECORDS, "Document Detail shows the text with its 4 lines");
  await page.getByTestId("document-expected-records").getByRole("button", { name: "Edit" }).click();
  await dlg(page).locator("#doc-expected-records").fill("");
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Document updated").first().waitFor({ timeout: 20000 });
  rec(one(`select expected_records from documents where id='${f.dv}'`).expected_records === null && JSON.stringify(snap()) === JSON.stringify(before), "Clearing the field stores NULL; nothing else changed");
  await ctx.close();
}

// ================= 3. Gap Assessment context (read-only) =================
{
  const { ctx, page } = await open(1280, 800);
  await page.goto(`${P}/documents/${f.dg}`);
  const panel = page.getByTestId("gap-assessment");
  await panel.getByRole("button", { name: "Start Gap Assessment" }).click();
  await panel.getByRole("button", { name: "Complete Assessment" }).waitFor({ timeout: 20000 });
  const block = page.getByTestId("gap-expected-records");
  rec((await block.isVisible()) && (await page.getByTestId("gap-expected-records-text").innerText()).trim() === SHORT_RECORDS && (await block.getByRole("button").getAttribute("aria-expanded")) === "true", "Short Expected Records are visible, expanded, in the Gap Assessment");
  rec((await block.locator("textarea, input").count()) === 0 && /Reference only/.test(await block.innerText()), "…as read-only context (no input; editing stays in Edit Document)");
  const order = await panel.evaluate((p) => {
    const a = p.querySelector('[data-testid="assessed-against"]'), e = p.querySelector('[data-testid="gap-expected-records"]');
    const c = Array.from(p.querySelectorAll("p")).find((x) => /No comments yet\\.|No comments\\./.test(x.textContent ?? "") || /comments/i.test(x.textContent ?? ""));
    const before = (x, y) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { aE: before(a, e), eC: c ? before(e, c) : null };
  });
  rec(order.aE === true && order.eC !== false, "Placement: after the requirement context ('Assessed against'), before the Review Comments");
  await panel.getByRole("button", { name: "Complete Assessment" }).click();
  await dlg(page).waitFor();
  const prefilled = await dlg(page).locator("#ga-comments").inputValue();
  await dlg(page).locator("#ga-comments").fill("Plan reviewed; attendance records missing.");
  await dlg(page).getByRole("button", { name: "Revision Required", exact: true }).click();
  await dlg(page).getByRole("button", { name: "Complete", exact: true }).click();
  await page.waitForFunction(() => /Revision Required/.test(document.querySelector('[data-testid="gap-assessment"]')?.textContent ?? ""), null, { timeout: 20000 });
  const rv = one(`select r.status, r.notes, d.expected_records from document_reviews r join document_versions v on v.id=r.document_version_id join documents d on d.id=v.document_id where d.id='${f.dg}'`);
  rec(prefilled === "" && rv.notes === "Plan reviewed; attendance records missing." && rv.status === "revision_required" && rv.expected_records === SHORT_RECORDS, "Review Comments are NOT pre-filled from Expected Records; concluding as Revision Required leaves Expected Records unchanged");
  rec(await page.getByTestId("gap-expected-records").isVisible(), "The context stays visible after the assessment is concluded");
  // long text collapsed by default
  await page.goto(`${P}/documents/${f.dgl}`);
  const lb = page.getByTestId("gap-expected-records");
  await lb.waitFor({ timeout: 30000 });
  rec((await lb.getByRole("button").getAttribute("aria-expanded")) === "false" && (await page.getByTestId("gap-expected-records-text").count()) === 0, "Long Expected Records (over 240 characters / 4 lines) start collapsed");
  await lb.getByRole("button").click();
  const longShown = await page.getByTestId("gap-expected-records-text").innerText();
  rec(longShown.length >= 1800 && noHOverflow(page) !== false && (await noHOverflow(page)), "Expanding shows the whole long text, no horizontal overflow");
  await page.goto(`${P}/documents/${f.dgn}`);
  await page.getByTestId("gap-assessment").waitFor({ timeout: 30000 });
  rec((await page.getByTestId("gap-expected-records").count()) === 0, "A Document without Expected Records shows no block in the Gap Assessment");
  await ctx.close();
}

// ================= 4. Import =================
async function xlsx(name, headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Required Documents");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  const file = path.join(DIR, name);
  await wb.xlsx.writeFile(file);
  return file;
}
const BASE = ["Framework", "Framework Requirement", "Required Document", "Document Code", "Document Type", "Owner", "Site", "Applicable"];
const IMPORT = `${P}/documents/import`;
const preview = (p) => p.getByTestId("import-preview");
async function choose(page, file) {
  await page.goto(IMPORT);
  await page.getByRole("heading", { name: "Import Required Documents" }).waitFor({ timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByLabel("Choose an Excel workbook").setInputFiles(file);
  await preview(page).waitFor({ timeout: 60000 });
}
const importBtn = (p) => p.getByRole("button", { name: /^(Import \d+ Documents?|Importing…)$/ });
async function runImport(page) {
  const cb = page.getByRole("checkbox");
  if (await cb.count()) await cb.first().check();
  await importBtn(page).click();
  await page.waitForURL("**/documents**", { timeout: 90000 });
}
{
  const { ctx, page } = await open(1280, 800);
  // (a) new column, multiline cells, Vietnamese, CRLF, multi-framework, blank + value, same value twice
  const f1 = await xlsx("new-column.xlsx", [...BASE, "Expected Records"], [
    ["ISO 9001:2015", "7.5", "Import Training Procedure", "IT-01", "Procedure", "HR Manager", "", "", "Annual training plan\nAttendance records\nCompetence evaluation"],
    ["", "", "Hồ sơ đào tạo nhân sự", "", "", "", "", "", VN_RECORDS],
    ["", "", "CRLF Document", "", "", "", "", "", "First line\r\nSecond line"],
    ["ISO 9001:2015", "7.5", "Multi Framework Document", "", "", "", "", "", "Document register\nDistribution list"],
    ["ISO 14001:2015", "8.1", "Multi Framework Document", "", "", "", "", "", "Document register\nDistribution list"],
    ["ISO 9001:2015", "7.5", "Blank Then Value Document", "", "", "", "", "", ""],
    ["ISO 14001:2015", "8.1", "Blank Then Value Document", "", "", "", "", "", "Calibration records"],
    ["", "", "Long Import Document", "", "", "", "", "", LONG_RECORDS],
  ]);
  await choose(page, f1);
  const text = flat(await preview(page).innerText());
  const trainRow = page.locator("tr[data-testid=import-row]", { hasText: "Import Training Procedure" });
  rec(/Annual training plan/.test(await trainRow.innerText()) && /\+2 more lines/.test(await trainRow.innerText()), "Preview shows the Expected Records (first line, '+2 more lines') in its own column");
  rec(/Yes \(default\)/.test(flat(await page.locator("tr[data-testid=import-row]", { hasText: "Hồ sơ đào tạo nhân sự" }).innerText())) && /\bYes\b/.test(flat(await trainRow.innerText())), "The preview keeps its Applicable column (Yes / Yes (default)) next to the new one");
    await runImport(page);
  const get = (t) => docByTitle(t);
  const t1 = get("Import Training Procedure"), t2 = get("Hồ sơ đào tạo nhân sự"), t3 = get("CRLF Document"), t4 = get("Multi Framework Document"), t5 = get("Blank Then Value Document"), t6 = get("Long Import Document");
  rec(t1.expected_records === "Annual training plan\nAttendance records\nCompetence evaluation", "Import: multiline cell stored with its line breaks (new column)");
  rec(t2.expected_records === VN_RECORDS && t3.expected_records === "First line\nSecond line", "Import: Vietnamese stored intact; CRLF in a cell normalized to LF only");
  rec(t4.expected_records === "Document register\nDistribution list" && maps(t4.id) === 2 && one(`select count(*)::int n from documents where project_id='${f.pP}' and title='Multi Framework Document'`).n === 1, "Multi-framework Document: ONE Document, two mappings, one Expected Records value");
  rec(t5.expected_records === "Calibration records" && maps(t5.id) === 2, "Duplicate rows, one blank + one populated: the populated value survives, no false conflict");
  rec(t6.expected_records === LONG_RECORDS && t6.expected_records.length === 1900, "Import: a 1,900-character, 25-line value is stored whole");
  // (b) old workbook without the column
  const f2 = await xlsx("old-template.xlsx", BASE, [["ISO 9001:2015", "7.5", "Old Template Document", "OT-1", "Procedure", "QM", "", "Yes"]]);
  await choose(page, f2);
  await runImport(page);
  rec(get("Old Template Document").expected_records === null, "Backward compatible: a workbook without the column imports unchanged; expected_records NULL");
  // (c) aliases
  for (const [alias, title] of [["Required Evidence", "Alias Evidence Document"], ["Records", "Alias Records Document"], ["Expected Records / Required Evidence", "Alias Both Document"]]) {
    const fa = await xlsx(`alias-${alias.replace(/\W+/g, "")}.xlsx`, [...BASE, alias], [["", "", title, "", "", "", "", "", `Line A of ${title}\nLine B`]]);
    await choose(page, fa);
    const r = page.locator("tr[data-testid=import-row]", { hasText: title });
    rec(new RegExp(`Line A of ${title}`).test(await r.innerText()), `Alias header "${alias}" resolves to Expected Records (preview)`);
    if (alias === "Required Evidence") {
      await runImport(page);
      rec(get(title).expected_records === `Line A of ${title}\nLine B`, `Alias "${alias}": stored`);
    }
  }
  // (d) conflict
  const countBefore = one(`select count(*)::int n from documents where project_id='${f.pP}'`).n;
  const fc = await xlsx("conflict.xlsx", [...BASE, "Expected Records"], [
    ["ISO 9001:2015", "7.5", "Conflict Records Document", "", "", "", "", "", "Annual training plan"],
    ["ISO 14001:2015", "8.1", "Conflict Records Document", "", "", "", "", "", "Attendance register"],
  ]);
  await choose(page, fc);
  const crow = flat(await page.locator("tr[data-testid=import-row]", { hasText: "Conflict Records Document" }).nth(1).innerText());
  rec(/Expected Records "Attendance register" vs "Annual training plan"/.test(crow) && /Error/i.test(crow) && /different values/.test(crow) && (await importBtn(page).isDisabled()), "Two different Expected Records for one Document identity -> conflict error on the second row, Import disabled");
  rec(one(`select count(*)::int n from documents where project_id='${f.pP}'`).n === countBefore, "The conflicting workbook created nothing (no partial Document)");
  // same text with different line endings / surrounding whitespace is NOT a conflict
  const fs2 = await xlsx("same-normalized.xlsx", [...BASE, "Expected Records"], [
    ["ISO 9001:2015", "7.5", "Same Normalized Document", "", "", "", "", "", "A\nB"],
    ["ISO 14001:2015", "8.1", "Same Normalized Document", "", "", "", "", "", "  A\r\nB  "],
  ]);
  await choose(page, fs2);
  rec(!/different values/.test(flat(await preview(page).innerText())), "The same text with other line endings / surrounding spaces is not a conflict (kept once)");
  // (e) too long
  const fl = await xlsx("too-long.xlsx", [...BASE, "Expected Records"], [["", "", "Too Long Import Document", "", "", "", "", "", "y".repeat(MAX + 1)]]);
  await choose(page, fl);
  const lrow = flat(await page.locator("tr[data-testid=import-row]", { hasText: "Too Long Import Document" }).innerText());
  rec(/Expected Records is longer than 2,000 characters \(2,001\)\. Shorten it; nothing is truncated\./.test(lrow) && (await importBtn(page).isDisabled()), "More than 2,000 characters -> a row error in the preview, never truncated, Import disabled");
  // template carries the column
  const tpl = await ctx.request.get(`${P}/documents/template`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await tpl.body());
  const hdr = wb.getWorksheet("Required Documents").getRow(1).values.slice(1);
  rec(hdr[hdr.length - 1] === "Expected Records" && hdr.length === 9, `The downloadable template has the optional "Expected Records" column (${hdr.join(", ")})`);
  await ctx.close();
}

// ================= 5. Export =================
{
  const { ctx } = await open(1280, 800);
  const res = await ctx.request.get(`${P}/documents/export?tz=Asia%2FHo_Chi_Minh`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.body());
  const ws = wb.getWorksheet("Gap Assessment");
  const headers = ws.getRow(1).values.slice(1);
  const OLD = ["Framework", "Framework Requirement", "Required Document", "Document Code", "Document Type", "Site", "Owner", "Applicable", "Current Version", "Current Revision", "Current File", "Received On", "Gap Assessment Status", "Review Comments", "Reviewed By", "Last Review", "Findings", "Verification Items", "Follow-up Summary"];
  const expectedHeaders = [...OLD.slice(0, 13), "Expected Records", ...OLD.slice(13)];
  rec(JSON.stringify(headers) === JSON.stringify(expectedHeaders), `Export: 'Expected Records' is inserted immediately before 'Review Comments'; every other column unchanged (${headers.length} columns)`);
  const col = (h) => headers.indexOf(h) + 1;
  const rows = [];
  ws.eachRow((row, n) => { if (n > 1) rows.push(row); });
  const byTitle = (t) => rows.filter((r) => r.getCell(col("Required Document")).text === t);
  const cell = (r, h) => r.getCell(col(h));
  const dgRow = byTitle("Training Procedure Context")[0];
  rec(cell(dgRow, "Expected Records").value === SHORT_RECORDS && cell(dgRow, "Expected Records").alignment?.wrapText === true, "Export: the Expected Records cell keeps its line breaks and wraps");
  rec(byTitle("Multi Framework Document").length === 2 && byTitle("Multi Framework Document").every((r) => cell(r, "Expected Records").value === "Document register\nDistribution list"), "Export: a multi-framework Document repeats its Document-level value on each of its rows");
  const nr = byTitle("No Records Procedure")[0];
  rec(["", null, undefined].includes(cell(nr, "Expected Records").value), "Export: no Expected Records -> a blank cell (not N/A / None)");
  rec(byTitle("Hồ sơ đào tạo nhân sự")[0] && cell(byTitle("Hồ sơ đào tạo nhân sự")[0], "Expected Records").value === VN_RECORDS, "Export: Vietnamese text intact (no mojibake)");
  const lr = byTitle("Long Records Procedure")[0];
  rec(String(cell(lr, "Expected Records").value).length === 1900 && (lr.height === undefined || lr.height <= 8 * 15), `Export: the 1,900-character value is complete and the row height is capped (${lr.height ?? "auto"})`);
  // existing columns on the fixture Document with a Version + concluded assessment + Finding + Verification item
  const hr = byTitle("History Procedure")[0];
  rec(cell(hr, "Gap Assessment Status").value === "Revision Required" && cell(hr, "Current Version").value === "V1" && cell(hr, "Current File").value === "history-procedure.pdf" && cell(hr, "Review Comments").value === "Retention period missing." && cell(hr, "Findings").value === 1 && cell(hr, "Verification Items").value === 1 && /1 Finding \(Open\)/.test(String(cell(hr, "Follow-up Summary").value)) && cell(hr, "Last Review").value instanceof Date, "Export regression: status, current Version / file, Review Comments, Last Review (date), Finding and Verification counts, Follow-up Summary all correct");
  rec(!/SECRET Q/.test(JSON.stringify(rows.map((r) => r.values))), "Export of this Project contains no Expected Records of another Project");
  await ctx.close();
}

// ================= 6. Register / search / Bulk Upload compatibility =================
{
  const { ctx, page } = await open(1280, 800);
  await page.goto(`${P}/documents`);
  await page.getByRole("button", { name: "+ New Document" }).waitFor({ timeout: 30000 });
  rec(!/Expected Records/.test(await page.locator("table").first().innerText()), "The Documents register has no Expected Records column (long text stays out of the scan view)");
  await page.getByLabel("Search documents").fill("Annual training plan");
  await page.waitForTimeout(500);
  rec(!/Training Procedure\b/.test(await page.locator("tbody").first().innerText().catch(() => "")), "Register search is unchanged: it does not search Expected Records");
  await page.goto(`${P}/documents/bulk-upload`);
  await page.getByTestId("bulk-file-input").waitFor({ state: "attached", timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const file = path.join(DIR, "Annual training plan.pdf");
  (await import("node:fs")).writeFileSync(file, Buffer.from("%PDF-1.4\n"));
  await page.getByTestId("bulk-file-input").setInputFiles(file);
  await page.getByTestId("bulk-analyze").click();
  await page.locator('[data-testid="bulk-row"]').first().waitFor({ timeout: 20000 });
  rec((await page.locator('[data-testid="bulk-row"]').first().getAttribute("data-status")) === "unmatched" && !(await page.content()).includes("Training effectiveness records"), "Bulk Upload is unchanged: a file named like an Expected Records line does not match, and the catalog carries no Expected Records");
  await ctx.close();
}

// ================= 7. Isolation / authorization =================
{
  const { ctx } = await open(1280, 800);
  const cookie = await cookieOf(ctx);
  const q = () => one(`select expected_records, md5((to_jsonb(d))::text) h from documents d where id='${f.dq}'`);
  const dvBefore = one(`select expected_records from documents where id='${f.dv}'`).expected_records;
  const qBefore = q();
  const t1 = await replay(editCap, [[f.dv, f.dq]], cookie); // Project P + a Document of Project Q
  const t2 = await replay(editCap, [[f.pP, f.pQ]], cookie); // Project Q + a Document of Project P
  const generic = (t) => /could not be found/i.test(t) && !/SECRET Q/.test(t);
  rec(generic(t1.text) && generic(t2.text) && JSON.stringify(q()) === JSON.stringify(qBefore) && one(`select expected_records from documents where id='${f.dv}'`).expected_records === dvBefore, "Cross-project tampering through the edit action: 'could not be found', nothing exposed, nothing changed");
  const anon = await replay(editCap, [], null);
  rec(!/"ok":true/.test(anon.text) && JSON.stringify(q()) === JSON.stringify(qBefore), `Signed out: the edit action is refused (HTTP ${anon.status})`);
  const rest = await http("PATCH", `/rest/v1/documents?id=eq.${f.dq}`, { body: { expected_records: "HACK" }, headers: { prefer: "return=representation" } });
  rec(JSON.stringify(q()) === JSON.stringify(qBefore) && !(rest.status >= 200 && rest.status < 300 && Array.isArray(rest.json) && rest.json.length > 0), `Signed out: a REST update of expected_records is denied (HTTP ${rest.status})`);
  const read = await http("GET", `/rest/v1/documents?id=eq.${f.dq}&select=expected_records`);
  rec(!(Array.isArray(read.json) && read.json.length > 0), "Signed out: Expected Records cannot be read through the REST API");
  const page2 = await ctx.newPage();
  await page2.goto(`${P}/documents/${f.dq}`);
  const body = await page2.locator("body").innerText();
  rec(!/SECRET Q/.test(body), "Project P's route with Project Q's Document id shows nothing of its Expected Records");
  await ctx.close();
}

// ================= 8. Mobile 390 / 412 =================
for (const w of [390, 412]) {
  const { ctx, page } = await open(w, 844, "consultant");
  await page.goto(`${P}/documents`);
  await page.getByRole("button", { name: "+ New Document" }).click();
  const ta = dlg(page).locator("#doc-expected-records");
  await ta.fill(LONG_RECORDS);
  await ta.scrollIntoViewIfNeeded();
  const inView = await ta.evaluate((e) => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.right <= window.innerWidth; });
  rec(inView && (await noHOverflow(page)), `${w}px Create Document: the Expected Records textarea fits the screen, no horizontal overflow`);
  const create = dlg(page).getByRole("button", { name: "Create", exact: true });
  rec(await hit(create), `${w}px Create Document: the Create button is reachable (not covered)`);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await page.goto(`${P}/documents/${f.dgl}`);
  await page.getByTestId("expected-records-text").waitFor({ timeout: 30000 });
  const wrapOk = await page.getByTestId("expected-records-text").evaluate((e) => e.getBoundingClientRect().right <= window.innerWidth + 1);
  rec(wrapOk && (await noHOverflow(page)), `${w}px Document Detail: the long text wraps, no overflow`);
  const gb = page.getByTestId("gap-expected-records");
  await gb.evaluate((el) => el.scrollIntoView({ block: "center" }));
  rec((await gb.getByRole("button").getAttribute("aria-expanded")) === "false" && (await hit(gb.getByRole("button"))), `${w}px Gap Assessment: the long block is collapsed and its toggle is reachable (not under the bottom nav)`);
  await gb.getByRole("button").click();
  rec((await page.getByTestId("gap-expected-records-text").isVisible()) && (await noHOverflow(page)), `${w}px Gap Assessment: expanding shows the text, no overflow`);
  await page.goto(`${P}/documents/${f.dg}`);
  await page.getByTestId("gap-expected-records").waitFor({ timeout: 30000 });
  rec((await page.getByTestId("gap-expected-records").getByRole("button").getAttribute("aria-expanded")) === "true" && (await noHOverflow(page)), `${w}px Gap Assessment: a short block starts expanded and fits`);
  await ctx.close();
}

// ================= 9. Desktop density =================
{
  const { ctx, page } = await open(1280, 800);
  await page.goto(`${P}/documents/${f.dg}`);
  await page.getByTestId("gap-expected-records").waitFor({ timeout: 30000 });
  const detailH = await page.getByTestId("document-expected-records").evaluate((e) => e.getBoundingClientRect().height);
  const panelH = await page.getByTestId("gap-assessment").evaluate((e) => e.getBoundingClientRect().height);
  await page.screenshot({ path: path.join(process.env.TEMP, "p7d-desktop-detail.png") });
  rec(detailH < 260 && (await noHOverflow(page)), `Desktop 1280x800: the Expected Records card is compact (${Math.round(detailH)} px for 4 lines), no overflow`);
  rec(panelH < 520, `Desktop: the Gap Assessment panel stays compact with the context block (${Math.round(panelH)} px)`);
  await ctx.close();
}

// ================= 10. Cleanup =================
await browser.close();
await cleanupP7d(admin.token);
const left = one(`select (select count(*) from clients where name like 'P7D-ACCEPT-%')::int c, (select count(*) from projects where name like 'P7D-ACCEPT-%')::int p, (select count(*) from documents)::int d, (select count(*) from document_versions)::int v, (select count(*) from document_reviews)::int r, (select count(*) from issues)::int i, (select count(*) from attachments)::int at, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o`);
rec(Object.values(left).every((n) => n === 0), `Fixtures removed; documents / versions / reviews / findings / attachments / files / Storage objects all 0 (${JSON.stringify(left)})`);
const failed = R.done();
process.exit(failed ? 1 : 0);
