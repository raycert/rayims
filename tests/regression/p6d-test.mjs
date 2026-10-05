import { chromium } from "playwright-core";
import path from "node:path";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { REPO, users, makeReporter, signIn, dbQuery } from "./common.mjs";
import { createFixtures, createPerformanceData, cleanupP6d, PFX } from "./p6d-fixtures.mjs";

const require = createRequire(REPO + "/package.json");
const JSZip = require("jszip");
const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p6d-shots");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const info = (m) => console.log(`INFO  ${m}`);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const T = (s) => `${PFX}${s}`;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const state = (p) =>
  dbQuery(`select
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from activities t where project_id='${p}') a,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from verification_items t where project_id='${p}') v,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from issues t where project_id='${p}') i,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from actions t where project_id='${p}') ac,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from attachments t where project_id='${p}') at,
    (select count(*)::int from files where project_id='${p}') f,
    (select count(*)::int from storage.objects where bucket_id='rayims-files' and split_part(name,'/',1)='${p}') o`)[0];

/** DOCX → { files, xml, text, paragraphs, tables: [[cell text…]…] per table } */
async function readDocx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml").async("string");
  const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const paraText = (frag) => (frag.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => unesc((p.match(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  const tables = (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).map((tbl) =>
    (tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map((tr) => (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((tc) => paraText(tc).join("\n"))),
  );
  const paragraphs = paraText(xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, ""));
  return { files: Object.keys(zip.files), xml, text: paraText(xml).join("\n"), paragraphs, tables };
}
const findTable = (d, firstHeader) => d.tables.find((t) => t[0]?.[0] === firstHeader);

const admin = await signIn("admin");
const consultant = await signIn("consultant");
const t0 = Date.now();
const f = await createFixtures(admin.token);
info(`fixtures ${Math.round((Date.now() - t0) / 1000)} s`);
const ACT = (id, p = f.p) => `${APP}/projects/${p}/activities/${id}`;
const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function open(width, height, who = "admin") {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, timezoneId: "Asia/Ho_Chi_Minh" });
  const page = await ctx.newPage();
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
  return { ctx, page };
}
const rs = (p) => p.getByTestId("activity-report-summary");
async function exportVia(page, id, name) {
  await page.goto(ACT(id));
  await rs(page).waitFor({ timeout: 30000 });
  const t = Date.now();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), rs(page).getByRole("button", { name: "Export Report" }).click()]);
  const file = path.join(OUT, name);
  await dl.saveAs(file);
  const buf = readFileSync(file);
  return { ms: Date.now() - t, bytes: buf.length, name: dl.suggestedFilename(), buf, d: await readDocx(buf) };
}

try {
  const before = state(f.p);
  const { ctx, page } = await open(1280, 800);

  // ===== Full report (Activity A) =====
  await page.goto(ACT(f.A));
  await rs(page).waitFor({ timeout: 30000 });
  const btn = rs(page).getByRole("button", { name: "Export Report" });
  const btnClass = await btn.getAttribute("class");
  rec(await btn.isVisible() && !/bg-primary\b/.test(btnClass ?? "") && (await page.getByRole("button", { name: /^(Finalize|Approve|Submit|Sign off|Sign report|Mark as final)/i }).count()) === 0 /* "Sign out" is the app's own nav */, "Export Report in the Report Summary header, secondary style; no Finalize / Approve / Submit");
  const screenMetrics = flat(await page.getByTestId("report-verification-metrics").innerText());
  const screenFindings = await rs(page).getByTestId("report-finding").evaluateAll((els) => els.map((e) => e.querySelector("span")?.textContent?.trim()));
  const screenActions = await rs(page).getByTestId("report-action").count();
  const screenEvidence = await rs(page).getByTestId("report-evidence-item").count();
  const E1 = await exportVia(page, f.A, "full.docx");
  info(`full report ${E1.ms} ms, ${E1.bytes} bytes`);
  const d = E1.d;
  rec(E1.name === "RayIMS-Site-Assessment-Report-P6D-ACCEPT-ISO-Implementation-20261027-Viet-Long.docx", `Filename: ${E1.name}`);
  rec(E1.buf.subarray(0, 2).toString() === "PK" && d.files.includes("[Content_Types].xml") && d.files.includes("word/document.xml") && d.xml.length > 1000, "Valid DOCX package (zip, [Content_Types].xml, non-empty word/document.xml)");
  const wellFormed = await page.evaluate((x) => !new DOMParser().parseFromString(x, "application/xml").getElementsByTagName("parsererror").length, d.xml);
  rec(wellFormed, "word/document.xml is well-formed XML");
  rec(/<w:pgSz w:w="11906" w:h="16838"/.test(d.xml) && !/w:orient="landscape"/.test(d.xml), "A4 portrait");
  rec(!d.files.some((x) => x.startsWith("word/media")) && !/<w:drawing|<pic:/.test(d.xml) && !/https?:\/\/|token=|\/storage\/v1/.test(d.text), "No images, no links, no signed URLs");
  rec(/<w:tblHeader\/>/.test(d.xml) && /<w:cantSplit\/>/.test(d.xml) && /<w:keepNext\/>/.test(d.xml), "Table header rows repeat, rows don't split, headings keep with next");

  const headings = ["1. Project / Activity Information", "2. Objectives & Scope", "3. Work Performed", "4. Verification Summary", "5. Findings", "6. Actions / Follow-up", "7. Evidence", "8. Consultant Summary", "9. Recommendations / Next Steps"];
  const idx = headings.map((h) => d.paragraphs.indexOf(h));
  rec(idx.every((x, i) => x >= 0 && (i === 0 || x > idx[i - 1])) && headings.every((h) => d.paragraphs.filter((p) => p === h).length === 1), "Sections 1–9 in the approved order, each exactly once");
  rec(d.paragraphs[0] === "Site Assessment Report" && d.paragraphs[1] === T("Site Assessment – Viet Long"), "Title from the Activity Type label: 'Site Assessment Report'");

  const info1 = Object.fromEntries(d.tables[0].map((r) => [r[0], r[1]]));
  rec(info1.Client === T("Chinh Long Demo") && info1.Project === T("ISO Implementation") && info1["Activity Type"] === "Site Assessment" && info1.Site === "Viet Long" && info1.Mode === "On-site" && info1["Date / Period"] === "27/10/2026 08:30 – 16:00" && info1["Activity Status"] === "In Progress" && !!info1.Consultant, `Information: client, project, type, site, mode, '27/10/2026 08:30 – 16:00', status, consultant`);
  rec(info1["Client Participants"] === "Nguyễn Văn A — Trưởng phòng Chất lượng\nTran Thi B — QA Supervisor", "Client Participants with its line break and Vietnamese intact");
  rec(!/\bN\/A\b|Not provided|undefined|null/.test(d.text), "No 'N/A' / 'Not provided' / undefined / null filler");
  rec(d.paragraphs.includes("Đánh giá việc kiểm soát vận hành và hồ sơ môi trường.") && d.paragraphs.includes("Walk-through of the drum store and waste area.") && d.paragraphs.includes("Interviews with the HSE Manager."), "Objectives & Planned Work / Scope with line breaks as paragraphs");
  const wpI = d.paragraphs.indexOf("Đã đánh giá hiện trạng tài liệu và kiểm tra điều kiện tại hiện trường.");
  rec(wpI > 0 && d.paragraphs[wpI + 1] === "" && d.paragraphs[wpI + 2].startsWith("Reviewed operational controls"), "Work Performed: Vietnamese paragraph, blank line and second paragraph preserved");

  const counts = Object.fromEntries(findTable(d, "Executed").map((r) => [r[0], r[1]]));
  rec(counts.Executed === "8" && counts["Verified OK"] === "6" && counts["Issue Identified"] === "1" && counts["Follow-up Required"] === "1" && counts["Planned, not completed"] === "1" && counts["Completed in another Activity"] === "1", `Verification counts: ${JSON.stringify(counts)}`);
  const sm = (k) => Number(new RegExp(`(\\d+) ${k}`).exec(screenMetrics)?.[1] ?? 0);
  rec(Number(counts.Executed) === sm("executed") && Number(counts["Verified OK"]) === sm("Verified OK") && Number(counts["Issue Identified"]) === sm("Issue Identified") && Number(counts["Planned, not completed"]) === sm("planned, not completed"), `Screen / DOCX parity — Verification counts ("${screenMetrics}")`);
  const vt = findTable(d, "Requirement");
  rec(vt.length === 3 && vt[0].join("|") === "Requirement|Check / Question|Result|Notes|Related Finding(s)" && vt.slice(1).some((r) => r[1] === T("Is secondary containment provided?") && r[0].startsWith("ISO 14001:2015 · 8.1") && r[2] === "Issue Identified" && r[3] === "No bund at drum store." && r[4] === "F-001") && vt.slice(1).some((r) => r[2] === "Follow-up Required"), "Issue table: 2 rows (only Issue / Follow-up), requirement, question, result, notes, F-001");

  const ft = findTable(d, "No.");
  const docFindings = ft.slice(1).map((r) => r[0]);
  rec(JSON.stringify(docFindings) === JSON.stringify(["F-001", "F-002", "F-005"]) && JSON.stringify(docFindings) === JSON.stringify(screenFindings), `Findings F-001 / F-002 / F-005, each once; = screen (${screenFindings.join(", ")})`);
  const f2 = ft.find((r) => r[0] === "F-002");
  rec(f2[3].startsWith(T("Chưa kiểm soát đầy đủ hồ sơ theo yêu cầu.")) && f2[3].includes("Hồ sơ đào tạo và hồ sơ quan trắc") && f2[4] === "Long An" && f2[1] === "Observation", "Finding cell: Vietnamese title + long description; site Long An; type");
  rec(!/Correction|Root Cause|Effectiveness/i.test(d.text), "No Correction / Root Cause / Effectiveness");
  rec(ft[0].join("|") === "No.|Type|Framework Requirement|Finding|Site|Priority|Status", "Findings columns as specified");

  const at = findTable(d, "Action");
  const aRows = at.slice(1);
  rec(aRows.length === 4 && aRows.length === screenActions && aRows.filter((r) => r[0] === T("Train storekeepers on containment")).length === 1, `Actions: 4 = screen (${screenActions}); the both-paths Action once`);
  const bund = aRows.find((r) => r[0] === T("Install bund at drum store"));
  rec(bund[1] === "F-001" && bund[2] === "Plant Manager" && bund[5] === "Open — Overdue", `Overdue Action: F-001, owner, 'Open — Overdue'`);
  rec(aRows.find((r) => r[0] === T("Send visit notes to client"))[1] === "—" && aRows.some((r) => r[0].startsWith(T("Prepare a detailed corrective action plan")) && r[2] === "Nguyễn Văn A" && r[3] === "15/12/2026"), "Standalone Action: related Finding '—'; long Action wraps, Vietnamese owner, due 15/12/2026");
  rec(at[0].join("|") === "Action|Related Finding|Owner|Due Date|Priority|Status", "Actions columns as specified");

  const et = findTable(d, "Origin");
  const eRows = et.slice(1);
  rec(eRows.length === 4 && eRows.length === screenEvidence && ["Activity", "Verification", "Finding", "Action"].every((o) => eRows.filter((r) => r[0] === o).length === 1), `Evidence: 4 = screen (${screenEvidence}), one per origin`);
  rec(eRows.find((r) => r[0] === "Finding")[1] === `F-001 · ${T("No secondary containment at drum store")}` && eRows.some((r) => r[3] === "site-overview-photo-with-a-very-long-file-name-for-wrapping-checks.jpg") && !/permits\.jpg|BMARKER/.test(d.text), "Evidence rows: Finding origin named 'F-001 · …', long file name, no elsewhere / Project B file");
  rec(d.paragraphs.some((p) => p.startsWith("Document retention and secondary containment require improvement")) && d.paragraphs.includes("Define record retention periods."), "Consultant Summary (multi-paragraph) and Recommendations / Next Steps present");
  const widths = (d.xml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/g) ?? []).map((g) => (g.match(/w:w="(\d+)"/g) ?? []).reduce((n, m) => n + Number(m.match(/\d+/)[0]), 0));
  rec(widths.length >= 5 && widths.every((w) => w <= 9638), `Every table fits the A4 content width (${[...new Set(widths)].join(", ")} twips ≤ 9638)`);

  // ===== Consultant: same content =====
  const c = await open(1280, 800, "consultant");
  const C1 = await exportVia(c.page, f.A, "consultant.docx");
  rec(C1.d.xml === d.xml, "Consultant export: document body identical to Admin's");
  await c.ctx.close();

  // ===== Cross-activity (B) =====
  const resB = await page.request.get(`${ACT(f.B)}/report`);
  const dB = await readDocx(await resB.body());
  const cB = Object.fromEntries(findTable(dB, "Executed").map((r) => [r[0], r[1]]));
  rec(cB.Executed === "1" && cB["Issue Identified"] === "1" && cB["Completed in another Activity"] === "1" && JSON.stringify(findTable(dB, "No.").slice(1).map((r) => r[0])) === '["F-003"]', "Export B: the check planned for A counts here; its Finding F-003 appears only in B");
  rec(!docFindings.includes("F-003") && counts["Completed in another Activity"] === "1", "Export A: that check is only 'Completed in another Activity'; F-003 absent");

  // ===== Empty =====
  const resE = await page.request.get(`${ACT(f.E)}/report`);
  const dE = await readDocx(await resE.body());
  rec(resE.status() === 200 && dE.tables.length === 1 && ["No objectives or planned work recorded.", "No checks executed.", "No issue or follow-up checks recorded.", "No Findings recorded.", "No Actions recorded.", "No report Evidence recorded.", "No consultant summary recorded.", "No next steps recorded."].every((m) => dE.paragraphs.includes(m)), "Empty Activity: valid DOCX, only the information table, one empty-state line per section");

  // No mutation by the exports so far (the next step changes data on purpose)
  rec(JSON.stringify(state(f.p)) === JSON.stringify(before), "Exports so far (full, consultant, B, empty) changed nothing");

  // ===== Post-export change =====
  dbQuery(`update issues set status = 'closed', closed_at = now() where id = '${f.F.manual}'`);
  const E2 = await exportVia(page, f.A, "after-close.docx");
  rec(findTable(E2.d, "No.").find((r) => r[0] === "F-002")[6] === "Closed" && findTable(d, "No.").find((r) => r[0] === "F-002")[6] === "Open", "After closing F-002: a new export shows Closed; the earlier file still says Open (point-in-time copy)");
  dbQuery(`update issues set status = 'open', closed_at = null where id = '${f.F.manual}'`);
  const before2 = state(f.p);

  // ===== Isolation / anon / headers =====
  const cross = await page.request.get(`${ACT(f.XB)}/report`);
  const cross2 = await page.request.get(`${APP}/projects/${f.pB}/activities/${f.A}/report`);
  const bogus = await page.request.get(`${APP}/projects/${f.p}/activities/not-an-id/report`);
  rec(cross.status() === 404 && cross2.status() === 404 && bogus.status() === 404 && !(cross.headers()["content-type"] ?? "").includes("wordprocessingml"), `Project A route + Project B Activity → 404; Project B route + A Activity → 404; malformed id → 404 (no DOCX)`);
  const okRes = await page.request.get(`${ACT(f.A)}/report`);
  rec(okRes.headers()["content-type"] === DOCX_MIME && /^attachment; filename="RayIMS-[^"]+\.docx"$/.test(okRes.headers()["content-disposition"]) && /no-store/.test(okRes.headers()["cache-control"]), "Headers: DOCX MIME, attachment with sanitized name, no-store");
  const anon = await fetch(`${ACT(f.A)}/report`, { redirect: "manual" });
  const anonBody = Buffer.from(await anon.arrayBuffer());
  rec(anon.status >= 300 && anon.status < 400 && anonBody.subarray(0, 2).toString() !== "PK", `Signed out: redirected (HTTP ${anon.status}), no DOCX bytes`);
  await ctx.close();

  // ===== No mutation =====
  rec(JSON.stringify(state(f.p)) === JSON.stringify(before2), "Exports after the post-export check (isolation / headers) changed nothing (Activities / checks / Findings / Actions / attachments / files / Storage objects)");

  // ===== Mobile =====
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    await m.page.goto(ACT(f.A));
    await rs(m.page).waitFor({ timeout: 30000 });
    const b = rs(m.page).getByRole("button", { name: "Export Report" });
    await b.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const hit = await b.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h)); });
    const [dl] = await Promise.all([m.page.waitForEvent("download", { timeout: 120000 }), b.click()]);
    rec(hit && await noHOverflow(m.page) && /\.docx$/.test(dl.suggestedFilename()), `${w}px: Export Report reachable (not under the bottom nav), downloads, no overflow`);
    await m.ctx.close();
  }

  // ===== Large report =====
  createPerformanceData(f.p, f.PERF, f.vl);
  const L = await open(1280, 800);
  const times = [];
  let big;
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    const res = await L.page.request.get(`${ACT(f.PERF)}/report`);
    big = await res.body();
    times.push(Date.now() - t);
  }
  const dl = await readDocx(big);
  rec(findTable(dl, "No.").length === 21 && findTable(dl, "Action").length === 31 && findTable(dl, "Origin").length === 41 && findTable(dl, "Executed").find((r) => r[0] === "Executed")[1] === "50", `Large: 50 checks / 20 Findings / 30 Actions / 40 Evidence all in the DOCX; ${times.join(" / ")} ms, ${(big.length / 1024).toFixed(0)} KB`);
  info(`PERF large DOCX: ${times.join(" / ")} ms, ${big.length} bytes`);
  await L.ctx.close();
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0] + " " + String(e.stderr ?? "").replace(/\s+/g, " ").slice(0, 300));
} finally {
  await browser.close();
  const removed = await cleanupP6d(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like '${PFX}%')::int c, (select count(*) from issues)::int i, (select count(*) from actions)::int a, (select count(*) from attachments)::int at, (select count(*) from files)::int f, (select count(*) from documents)::int d`)[0];
  rec(left.c === 0 && left.i === 0 && left.a === 0 && left.at === 0 && left.f === 0 && left.d === 0, `Cleanup: fixtures removed (+${removed} objects); issues / actions / attachments / files / documents 0`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
