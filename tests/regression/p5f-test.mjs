import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { REPO, users, makeReporter, signIn, dbQuery } from "./common.mjs";
import { createFixtures, createLargeProject, cleanupP5f, LONG_COMMENT } from "./p5f-fixtures.mjs";

const require = createRequire(REPO + "/package.json");
const ExcelJS = require("exceljs");
const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p5f-shots");
const DIR = path.join(OUT, "files");
mkdirSync(DIR, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
async function waitDb(fn, ms = 30000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 800)); } return false; }
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });
const count = (sql) => dbQuery(sql)[0].n;
const T = (s) => `P5F-ACCEPT-${s}`;
const HEADERS = ["Framework", "Framework Requirement", "Required Document", "Document Code", "Document Type", "Site", "Owner", "Applicable", "Current Version", "Current Revision", "Current File", "Received On", "Gap Assessment Status", "Review Comments", "Reviewed By", "Last Review", "Findings", "Verification Items", "Follow-up Summary"];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ENUMS = /\b(not_received|revision_required|under_review|n_a|verified_ok|issue_identified|follow_up_required|opportunity_for_improvement)\b/;

/** Workbook → { wb, sheet, rows: [{Header: value}], all: every cell text (both sheets) } */
async function parse(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.getWorksheet("Gap Assessment");
  const header = sheet.getRow(1).values.slice(1);
  const rows = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const o = { _row: n };
    HEADERS.forEach((h, i) => {
      const v = row.getCell(i + 1).value;
      o[h] = v === null || v === undefined ? "" : v;
    });
    rows.push(o);
  });
  const all = [];
  wb.eachSheet((s) => s.eachRow((row) => row.eachCell((c) => all.push(c.value instanceof Date ? c.value.toISOString() : String(c.value)))));
  return { wb, sheet, header, rows, all: all.join("\n") };
}
const ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : null);
const byTitle = (x, t) => x.rows.filter((r) => r["Required Document"] === t);
const status = (docId) => dbQuery(`select status from document_register where document_id='${docId}'`)[0].status;

const totals = () =>
  dbQuery(`select (select count(*) from documents)::int d, (select count(*) from document_versions)::int v, (select count(*) from document_reviews)::int r,
    (select count(*) from issues)::int i, (select count(*) from verification_items)::int vi, (select count(*) from actions)::int a,
    (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o, (select count(*) from document_framework_items)::int m`)[0];

const admin = await signIn("admin");
const f = await createFixtures(admin.token);
const DOCS = (p) => `${APP}/projects/${p}/documents`;
const EXPORT = (p) => `${DOCS(p)}/export`;

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
async function download(page, projectId, name) {
  await page.goto(DOCS(projectId));
  await page.getByRole("heading", { name: "Documents", level: 2 }).waitFor({ timeout: 30000 });
  const t = Date.now();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.getByRole("button", { name: "Export Excel" }).click()]);
  const file = path.join(DIR, name);
  await dl.saveAs(file);
  return { ms: Date.now() - t, file, suggested: dl.suggestedFilename(), buf: readFileSync(file) };
}

try {
  const before = totals();
  const { ctx, page } = await open(1280, 800);

  // ===== Entry point (desktop) =====
  await page.goto(DOCS(f.p));
  await page.getByRole("heading", { name: "Documents", level: 2 }).waitFor({ timeout: 30000 });
  const btns = [page.getByRole("button", { name: "+ New Document" }), page.getByRole("link", { name: "Import Excel" }), page.getByRole("button", { name: "Export Excel" })];
  const boxes = await Promise.all(btns.map((b) => b.first().boundingBox()));
  rec(boxes.every(Boolean) && boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x && new Set(boxes.map((b) => Math.round(b.y))).size === 1, "Header: + New Document · Import Excel · Export Excel on one line (1280)");
  const cls = await Promise.all(btns.map((b) => b.first().getAttribute("class")));
  rec(cls[1] === cls[2] && cls[0] !== cls[2], "Export Excel styled secondary like Import Excel (New Document stays primary)");
  await shot(page, "d-header");

  // ===== Download =====
  const A = await download(page, f.p, "project-a.xlsx");
  const ymdLocal = (() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; })();
  rec(A.suggested === `RayIMS-Gap-Assessment-P5F-ACCEPT-ISO-Implementation-${ymdLocal}.xlsx`, `Filename: ${A.suggested}`);
  rec(A.buf.subarray(0, 2).toString() === "PK", `Browser download completes (${A.ms} ms, ${A.buf.length} bytes, valid .xlsx zip)`);
  const x = await parse(A.buf);

  // ===== Structure =====
  rec(JSON.stringify(x.wb.worksheets.map((s) => s.name)) === JSON.stringify(["Gap Assessment", "Summary"]) && x.wb.worksheets.every((s) => s.state === "visible"), "Sheets: Gap Assessment + Summary, no hidden sheets");
  rec(JSON.stringify(x.header) === JSON.stringify(HEADERS), "Main sheet: 19 columns in the approved order");
  rec(x.sheet.views[0]?.state === "frozen" && x.sheet.views[0]?.ySplit === 1, "Top row frozen");
  const af = x.sheet.autoFilter;
  rec(typeof af === "string" ? af === "A1:S1" : af?.from?.column === 1 && af?.to?.column === 19, `AutoFilter on all 19 columns (${JSON.stringify(af)})`);
  rec(x.sheet.getRow(1).getCell(1).font?.bold === true && x.sheet.getRow(1).getCell(19).font?.bold === true, "Header bold");
  const expectedRows = count(`select coalesce(sum(greatest(1, (select count(*) from document_framework_items m where m.document_id=d.id))), 0)::int n from documents d where d.project_id='${f.p}'`);
  rec(x.rows.length === expectedRows, `One row per Document × Framework Requirement: ${x.rows.length} rows (expected ${expectedRows})`);

  // ===== Basic register: five statuses =====
  const one = (t) => byTitle(x, t)[0] ?? {};
  const nr = one(T("Legal Register")), rc = one(T("Quy trình kiểm soát tài liệu & hồ sơ / ISO-9001 (Rev)")), rr = one(T("Documented Information Control Procedure")), ac = one(T("Quality Manual")), na = one(T("Radiation Safety Plan"));
  rec(nr["Gap Assessment Status"] === "Not Received" && nr["Current Version"] === "" && nr["Current File"] === "" && nr["Review Comments"] === "" && nr["Reviewed By"] === "" && nr["Received On"] === "" && nr.Findings === 0 && nr["Verification Items"] === 0 && nr["Follow-up Summary"] === "", "Not Received: no version / file / comments, counts 0");
  rec(nr.Framework === "ISO 9001:2015" && nr["Framework Requirement"] === "6.1 — Risks and opportunities" && nr["Document Code"] === "REG-01" && nr["Document Type"] === "Register" && nr.Owner === "HSE Manager" && nr.Site === "Project-wide" && nr.Applicable === "Yes", "Identity columns: framework identity, 'code — title', code, type, owner, Project-wide, Yes");
  rec(rc["Gap Assessment Status"] === "Received" && rc["Current Version"] === "V1" && rc["Current Revision"] === "Rev.00" && rc["Current File"] === "Quy trình kiểm soát tài liệu & hồ sơ (v1).pdf" && rc["Review Comments"] === "" && rc["Last Review"] === "", "Received: V1, Rev.00, original file name, no comments");
  rec(rr["Gap Assessment Status"] === "Revision Required" && rr["Review Comments"] === "Retention period is missing." && rr["Reviewed By"] === users.admin.email, "Revision Required: comments exactly 'Retention period is missing.', reviewer shown");
  rec(ac["Gap Assessment Status"] === "Accepted" && ac["Current Version"] === "V2" && ac["Current Revision"] === "Rev.01" && ac["Current File"] === "QM-01 Rev.01.pdf" && ac["Review Comments"] === "Updated manual is acceptable.", "Accepted: V2 / Rev.01, V2 comments");
  rec(na["Gap Assessment Status"] === "Not Applicable" && na.Applicable === "No", "Not Applicable: Applicable = No");
  const statusLabels = { not_received: "Not Received", received: "Received", under_review: "Under Review", revision_required: "Revision Required", accepted: "Accepted", n_a: "Not Applicable" };
  const mismatch = x.rows.filter((r) => { const d = dbQuery(`select status from document_register where project_id='${f.p}' and title='${r["Required Document"].replace(/'/g, "''")}'`)[0]; return statusLabels[d.status] !== r["Gap Assessment Status"]; });
  rec(mismatch.length === 0, "Every row's status = the document_register view's derived status");

  // ===== New version reset / Under Review / two reviews =====
  const rs = one(T("Waste Management Procedure"));
  rec(rs["Gap Assessment Status"] === "Received" && rs["Current Version"] === "V2" && rs["Current Revision"] === "Rev.02" && rs["Review Comments"] === "" && rs["Reviewed By"] === "" && rs["Last Review"] === "" && !x.all.includes("V1 COMMENT MUST NOT APPEAR"), "New version reset: V2 / Received, V1 comments nowhere in the workbook");
  const ur = one(T("Internal Audit Programme"));
  const openDone = dbQuery(`select reviewed_at::text t from document_reviews where id='${f.R.openDone}'`)[0].t.slice(0, 10);
  rec(ur["Gap Assessment Status"] === "Under Review" && ur["Review Comments"] === "Currently checking signatures." && ur["Reviewed By"] === users.consultant.email, "Under Review: current comments, current reviewer (no display name → email)");
  rec(ymd(ur["Last Review"]) === openDone, `Under Review: Last Review = earlier completed assessment (${openDone})`);
  const two = one(T("Improvement Procedure"));
  rec(two["Gap Assessment Status"] === "Revision Required" && two["Review Comments"] === "Newest assessment by created_at.", "Two reviews on one version: latest by created_at (not reviewed_at) decides status + comments");

  // ===== Multi-framework / no framework / sites =====
  const mf = byTitle(x, T("Emergency Response Procedure"));
  rec(mf.length === 2 && mf.map((r) => r.Framework).join("|") === "ISO 14001:2015|ISO 45001:2018" && mf.every((r) => r["Framework Requirement"] === "8.2 — Emergency preparedness and response"), "Multi-framework: two rows (ISO 14001:2015 · 8.2, ISO 45001:2018 · 8.2)");
  rec(mf.every((r) => r["Gap Assessment Status"] === "Revision Required" && r.Site === "Viet Long" && r["Review Comments"] === mf[0]["Review Comments"] && r.Findings === mf[0].Findings && r["Document Code"] === "ERP-01"), "  ...same document, status, site, comments and counts on both rows");
  const nf = byTitle(x, T("Unmapped Site Document"));
  rec(nf.length === 1 && nf[0].Framework === "" && nf[0]["Framework Requirement"] === "" && nf[0].Site === "Long An", "No framework: one row, blank Framework / Requirement, site name");
  rec(x.rows.findIndex((r) => r.Framework === "") > x.rows.findLastIndex((r) => r.Framework !== ""), "Unmapped documents listed after all framework rows");

  // ===== Sorting =====
  const fwOrder = [...new Set(x.rows.filter((r) => r.Framework).map((r) => r.Framework))];
  rec(JSON.stringify(fwOrder) === JSON.stringify(["ISO 9001:2015", "ISO 14001:2015", "ISO 45001:2018"]), `Framework natural order: ${fwOrder.join(" → ")}`);
  const q = x.rows.filter((r) => r.Framework === "ISO 9001:2015").map((r) => r["Framework Requirement"].split(" ")[0]);
  const sortedQ = [...q].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  rec(JSON.stringify(q) === JSON.stringify(sortedQ) && q.indexOf("9.1") < q.indexOf("10.2") && q.indexOf("9.1") !== -1, `Clause natural order in ISO 9001: ${[...new Set(q)].join(", ")} (9.1 before 10.2)`);

  // ===== Follow-up counts =====
  rec(rr.Findings === 2 && rr["Verification Items"] === 3 && rr["Follow-up Summary"] === "2 Findings (1 Open) · 3 Verification Items (2 Pending)", `Follow-up: 2 Findings (1 Open) · 3 Verification Items (2 Pending) — "${rr["Follow-up Summary"]}"`);
  const vf = one(T("Calibration Procedure"));
  rec(vf["Verification Items"] === 1 && vf.Findings === 0 && vf["Follow-up Summary"] === "1 Verification Item (Pending)", "Review → Verification → Finding: Verification Items 1, direct Findings 0");
  rec(ac.Findings === 1 && ac["Follow-up Summary"] === "1 Finding (Open)" && ac["Gap Assessment Status"] === "Accepted", "Historical follow-up: V1 Finding still counted while V2 is Accepted");
  rec(na.Findings === 1 && na["Current Version"] === "V1" && na["Current File"] === "Radiation plan.pdf" && ymd(na["Received On"]) === "2026-09-10" && na["Review Comments"] === "Gap found before the document became N/A.", "N/A history: status Not Applicable, historical file / date / comments / Finding kept");

  // ===== Dates =====
  const recvCell = x.sheet.getRow(rc._row).getCell(12), lastCell = x.sheet.getRow(rr._row).getCell(16);
  const rrDate = dbQuery(`select reviewed_at::text t from document_reviews where id='${f.R.revision}'`)[0].t.slice(0, 10);
  rec(recvCell.value instanceof Date && ymd(recvCell.value) === "2026-09-15" && recvCell.numFmt === "dd/mm/yyyy", "Received On: Excel date 15/09/2026 (dd/mm/yyyy)");
  rec(lastCell.value instanceof Date && ymd(lastCell.value) === rrDate && lastCell.numFmt === "dd/mm/yyyy", `Last Review: Excel date (${rrDate}), dd/mm/yyyy`);

  // ===== Long comments / special characters =====
  const lg = one(T("Record Control Procedure"));
  const lgCell = x.sheet.getRow(lg._row).getCell(14);
  rec(lg["Review Comments"] === LONG_COMMENT && lgCell.alignment?.wrapText === true, `Long multi-line comment preserved in full (${LONG_COMMENT.length} chars) and wrapped`);
  rec((x.sheet.getRow(lg._row).height ?? 0) <= 120 && (x.sheet.getRow(lg._row).height ?? 0) > 0, `  ...row height capped (${x.sheet.getRow(lg._row).height} pt), value not truncated`);
  rec(rc["Required Document"] === T("Quy trình kiểm soát tài liệu & hồ sơ / ISO-9001 (Rev)") && rc.Owner === "Trưởng phòng QA" && x.all.includes("§ 7.5.3.2") && x.all.includes("Dòng tiếng Việt"), "Vietnamese, &, /, -, parentheses, § preserved (no mojibake)");

  // ===== Status fills / no technical values =====
  const fill = (r) => x.sheet.getRow(r._row).getCell(13).fill?.fgColor?.argb;
  rec(fill(nr) === "FFF1F5F9" && fill(na) === "FFF1F5F9" && fill(rc) === "FFE0ECFF" && fill(ur) === "FFE0ECFF" && fill(rr) === "FFFEF3C7" && fill(ac) === "FFDCFCE7", "Status fills: neutral / info / amber / green, text always present");
  const storageKeys = dbQuery(`select storage_key from files where project_id='${f.p}'`).map((r) => r.storage_key);
  rec(!UUID.test(x.all) && !storageKeys.some((k) => x.all.includes(k)) && !ENUMS.test(x.all) && !/signedurl|token=|\/storage\/v1/i.test(x.all), "No UUIDs, storage keys, signed URLs or internal enum values anywhere");

  // ===== Summary sheet =====
  const sum = x.wb.getWorksheet("Summary");
  const sv = {};
  sum.eachRow((row) => { sv[String(row.getCell(1).value)] = row.getCell(2).value; });
  const reg = Object.fromEntries(dbQuery(`select status, count(*)::int n from document_register where project_id='${f.p}' group by status`).map((r) => [statusLabels[r.status], r.n]));
  const openF = count(`select count(*)::int n from issues i join document_reviews r on r.id=i.document_review_id join document_versions v on v.id=r.document_version_id join documents d on d.id=v.document_id where d.project_id='${f.p}' and i.status<>'closed'`);
  const pendV = count(`select count(*)::int n from verification_items i join document_reviews r on r.id=i.document_review_id join document_versions v on v.id=r.document_version_id join documents d on d.id=v.document_id where d.project_id='${f.p}' and i.result is null`);
  rec(sv.Project === T("ISO Implementation") && sv.Client === T("Chinh Long Demo") && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} \(.+\)$/.test(String(sv.Exported)) /* 5G: viewer time zone shown */, `Summary: project, client, export time (${sv.Exported})`);
  rec(sv.Total === 12 && Object.entries(statusLabels).every(([, l]) => (sv[l] ?? 0) === (reg[l] ?? 0)), `Summary: document counts by status = register (${JSON.stringify(reg)})`);
  rec(sv["Open Findings"] === openF && sv["Pending Verification Items"] === pendV, `Summary: Open Findings ${openF}, Pending Verification Items ${pendV} (direct)`);
  rec(x.wb.creator === "RayIMS" && x.wb.created instanceof Date && Math.abs(x.wb.created.getTime() - Date.now()) < 10 * 60000 && !x.header.includes("Exported"), "Generated time in workbook metadata + Summary, not a data column");

  // ===== Project isolation =====
  rec(!x.all.includes("BMARKER"), "Project A export: zero Project B values (BMARKER title / file / owner / comment / finding absent)");
  const bRes = await page.request.get(EXPORT(f.pB));
  const xb = await parse(await bRes.body());
  rec(xb.rows.length === 1 && xb.rows[0]["Review Comments"] === "BMARKER secret comment" && !xb.all.includes(T("Legal Register")), "Project B export: only Project B's document");
  const unknown = await page.request.get(EXPORT("00000000-0000-4000-8000-000000000000"), { maxRedirects: 0 });
  const bogus = await page.request.get(`${APP}/projects/not-a-project/documents/export`, { maxRedirects: 0 });
  rec(unknown.status() === 404 && bogus.status() === 404 && !(unknown.headers()["content-type"] ?? "").includes("spreadsheet"), `Unknown / malformed project id: 404, no workbook (${unknown.status()} / ${bogus.status()})`);

  // ===== Empty project =====
  const eRes = await page.request.get(EXPORT(f.pE));
  const xe = await parse(await eRes.body());
  rec(eRes.status() === 200 && JSON.stringify(xe.header) === JSON.stringify(HEADERS) && xe.rows.length === 0, "Empty project: valid workbook, headers, 0 rows");

  // ===== Failure toast =====
  await page.goto(DOCS(f.p));
  await page.getByRole("heading", { name: "Documents", level: 2 }).waitFor({ timeout: 30000 });
  await page.route("**/documents/export*", /* 5G: request carries ?tz= */ (route) => route.fulfill({ status: 500, body: "boom" }));
  await page.getByRole("button", { name: "Export Excel" }).click();
  rec(await wait(page.getByText("Could not export the register. Please try again.")), "Export failure: friendly toast");
  await page.unroute("**/documents/export*");
  await ctx.close();

  // ===== Consultant: same workbook content =====
  const c = await open(1280, 800, "consultant");
  const C = await download(c.page, f.p, "project-a-consultant.xlsx");
  const xc = await parse(C.buf);
  const strip = (w) => JSON.stringify(w.rows.map(({ _row, ...r }) => r));
  rec(strip(xc) === strip(x), "Consultant export works; main sheet identical to Admin's for the same state");
  await c.ctx.close();

  // ===== Anon =====
  const anon = await fetch(EXPORT(f.p), { redirect: "manual" });
  const anonBody = Buffer.from(await anon.arrayBuffer());
  rec(anon.status >= 300 && anon.status < 400 && /\/login/.test(anon.headers.get("location") ?? "") && anonBody.subarray(0, 2).toString() !== "PK", `Anon: redirected to login (HTTP ${anon.status}), no workbook bytes`);

  // ===== Read-only =====
  const after = totals();
  rec(JSON.stringify(after) === JSON.stringify(before), `Read-only: 0 documents / versions / reviews / findings / verification items / actions / files / objects / mappings created (${JSON.stringify(after)})`);

  // ===== Mobile =====
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    await m.page.goto(DOCS(f.p));
    await m.page.getByRole("heading", { name: "Documents", level: 2 }).waitFor({ timeout: 30000 });
    const btn = m.page.getByRole("button", { name: "Export Excel" });
    await btn.scrollIntoViewIfNeeded();
    const box = await btn.boundingBox();
    rec(await wait(btn) && box && box.x >= 0 && box.x + box.width <= w && await noHOverflow(m.page), `${w}px: Export Excel reachable, no horizontal overflow`);
    await shot(m.page, `m${w}-header`);
    if (w === 390) {
      const [dl] = await Promise.all([m.page.waitForEvent("download", { timeout: 120000 }), btn.click()]);
      rec(/^RayIMS-Gap-Assessment-.*\.xlsx$/.test(dl.suggestedFilename()), "390px: export downloads");
    }
    await m.ctx.close();
  }

  // ===== Large project =====
  createLargeProject(f.pL, f.vl, f.la);
  const L = await open(1280, 800);
  const tr = Date.now();
  await L.page.goto(DOCS(f.pL));
  await L.page.locator("tbody tr").first().waitFor({ timeout: 60000 });
  const regRows = await L.page.locator("tbody tr").count();
  rec(regRows === 260, `Register: all 260 documents (versions on ${count(`select count(*)::int n from document_versions v join documents d on d.id=v.document_id where d.project_id='${f.pL}'`)}), ${Date.now() - tr} ms`);
  const big = await download(L.page, f.pL, "large.xlsx");
  const xl = await parse(big.buf);
  const lgMaps = count(`select count(*)::int n from document_framework_items m join documents d on d.id=m.document_id where d.project_id='${f.pL}'`);
  rec(xl.rows.length === 1040 && lgMaps === 1040, `Large: ${xl.rows.length} rows (260 documents × 4 mappings — beyond the 1000-row response cap), ${big.ms} ms, ${(big.buf.length / 1024).toFixed(0)} KB`);
  const lgStatus = Object.fromEntries(dbQuery(`select status, count(*)::int n from document_register where project_id='${f.pL}' group by status`).map((r) => [statusLabels[r.status], r.n * 4]));
  const xlStatus = {};
  for (const r of xl.rows) xlStatus[r["Gap Assessment Status"]] = (xlStatus[r["Gap Assessment Status"]] ?? 0) + 1;
  rec(Object.keys(lgStatus).length >= 5 && Object.entries(lgStatus).every(([k, n]) => xlStatus[k] === n), `Large: status mix matches the register ×4 (${JSON.stringify(xlStatus)})`);
  const titles = new Set(xl.rows.map((r) => r["Required Document"]));
  rec(titles.size === 260 && new Set(xl.rows.map((r) => r.Site)).size === 3, "Large: every document present, 3 site values");
  const mem = process.memoryUsage().rss;
  rec(true, `Large: client RSS after parse ${(mem / 1048576).toFixed(0)} MB; workbook reopened by ExcelJS without error`);
  await L.ctx.close();

  // ===== Import → Export =====
  const I = await open(1280, 800);
  const wbI = new ExcelJS.Workbook();
  const wsI = wbI.addWorksheet("Required Documents");
  wsI.addRow(["Framework", "Framework Requirement", "Required Document", "Document Code", "Document Type", "Owner", "Site", "Applicable"]);
  const imp = [
    ["ISO 9001:2015", "7.5", T("Imported Control Procedure"), "IMP-01", "Procedure", "QA Lead", "", "Yes"],
    ["ISO 14001:2015", "8.2", T("Imported Emergency Plan"), "IMP-02", "Plan", "HSE", "Viet Long", ""],
    ["ISO 45001:2018", "8.2", T("Imported Emergency Plan"), "", "", "", "Viet Long", ""],
    ["", "", T("Imported Not Needed"), "IMP-03", "Record", "", "", "No"],
  ];
  imp.forEach((r) => wsI.addRow(r));
  const impFile = path.join(DIR, "import.xlsx");
  await wbI.xlsx.writeFile(impFile);
  await I.page.goto(`${DOCS(f.pI)}/import`);
  await I.page.getByLabel("Choose an Excel workbook").setInputFiles(impFile);
  await I.page.getByTestId("import-preview").waitFor({ timeout: 60000 });
  const confirm = I.page.getByRole("checkbox");
  if (await confirm.count()) await confirm.check();
  await I.page.getByRole("button", { name: /^Import \d+ Documents?$/ }).click();
  await I.page.waitForURL("**/documents**", { timeout: 90000 });
  await waitDb(() => count(`select count(*)::int n from documents where project_id='${f.pI}'`) === 3);
  const IE = await download(I.page, f.pI, "import-export.xlsx");
  const xi = await parse(IE.buf);
  const ic = byTitle(xi, T("Imported Control Procedure"))[0] ?? {}, ie = byTitle(xi, T("Imported Emergency Plan")), inn = byTitle(xi, T("Imported Not Needed"))[0] ?? {};
  rec(xi.rows.length === 4 && ic.Framework === "ISO 9001:2015" && /^7\.5 — /.test(ic["Framework Requirement"]) && ic["Document Code"] === "IMP-01" && ic["Document Type"] === "Procedure" && ic.Owner === "QA Lead" && ic.Site === "Project-wide" && ic.Applicable === "Yes", "Import → Export: identity columns represented (framework, requirement, code, type, owner, site, applicable)");
  rec(ie.length === 2 && ie.every((r) => r.Site === "Viet Long" && r["Document Code"] === "IMP-02" && r["Gap Assessment Status"] === "Not Received") && inn["Gap Assessment Status"] === "Not Applicable" && inn.Applicable === "No" && ic["Gap Assessment Status"] === "Not Received", "Import → Export: merged multi-framework document = 2 rows; Not Received / Not Applicable as imported");

  // ===== Full workflow =====
  const docId = dbQuery(`select id from documents where project_id='${f.pI}' and title='${T("Imported Control Procedure")}'`)[0].id;
  await I.page.goto(`${DOCS(f.pI)}/${docId}`);
  await I.page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  const pdf = path.join(DIR, "Control procedure.pdf");
  writeFileSync(pdf, Buffer.from("%PDF-1.4\n" + " ".repeat(15000) + "\n%%EOF"));
  await I.page.getByRole("button", { name: "Upload New Version" }).click();
  await I.page.getByRole("dialog").getByLabel("File *").setInputFiles(pdf);
  await I.page.getByRole("dialog").getByRole("button", { name: "Upload", exact: true }).click();
  await I.page.getByText("Version uploaded.").first().waitFor({ timeout: 120000 }).catch(() => {});
  await waitDb(() => status(docId) === "received");
  await I.page.getByTestId("gap-assessment").getByRole("button", { name: "Start Gap Assessment" }).click();
  await I.page.getByTestId("gap-assessment").getByRole("button", { name: "Complete Assessment" }).waitFor({ timeout: 15000 });
  await I.page.getByTestId("gap-assessment").getByRole("button", { name: "Complete Assessment" }).click();
  await I.page.getByRole("dialog").locator("#ga-comments").fill("Approval responsibilities must be updated.");
  await I.page.getByRole("dialog").getByRole("button", { name: "Revision Required", exact: true }).click();
  await I.page.getByRole("dialog").getByRole("button", { name: "Complete", exact: true }).click();
  await waitDb(() => status(docId) === "revision_required");
  const fu = I.page.getByTestId("review-follow-up");
  await fu.getByRole("button", { name: "Create Finding" }).waitFor({ timeout: 15000 });
  await fu.getByRole("button", { name: "Create Finding" }).click();
  await I.page.getByRole("dialog").getByRole("button", { name: "Observation", exact: true }).click();
  await I.page.getByRole("dialog").locator("#fd-title").fill(T("Approval responsibilities"));
  await I.page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  const rid = () => dbQuery(`select r.id from document_reviews r join document_versions v on v.id=r.document_version_id where v.document_id='${docId}'`)[0]?.id;
  await waitDb(() => count(`select count(*)::int n from issues where document_review_id='${rid()}'`) === 1);
  await I.page.waitForTimeout(1200);
  await fu.getByRole("button", { name: "Add to Verification" }).click();
  await I.page.getByRole("dialog").locator("#vi-question").fill(T("Check approval records"));
  await I.page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await waitDb(() => count(`select count(*)::int n from verification_items where document_review_id='${rid()}'`) === 1);
  const W = await download(I.page, f.pI, "workflow.xlsx");
  const xw = byTitle(await parse(W.buf), T("Imported Control Procedure"))[0] ?? {};
  rec(xw["Current Version"] === "V1" && xw["Current File"] === "Control procedure.pdf" && xw["Gap Assessment Status"] === "Revision Required" && xw["Review Comments"] === "Approval responsibilities must be updated." && xw.Findings === 1 && xw["Verification Items"] === 1 && xw["Follow-up Summary"] === "1 Finding (Open) · 1 Verification Item (Pending)", "Full workflow: import → V1 → Revision Required → Finding → Verification → export reflects all of it");
  await shot(I.page, "d-workflow-doc");
  await I.ctx.close();
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const removed = await cleanupP5f(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like 'P5F-ACCEPT-%')::int c, (select count(*) from documents)::int d, (select count(*) from document_versions)::int v, (select count(*) from document_reviews)::int r, (select count(*) from issues)::int i, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o`)[0];
  rec(left.c === 0 && left.d === 0 && left.v === 0 && left.r === 0 && left.i === 0 && left.f === 0 && left.o === 0, `Cleanup: fixtures (+${removed} Storage objects) removed; documents/versions/reviews/findings/files/objects all 0`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
