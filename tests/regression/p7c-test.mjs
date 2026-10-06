// Phase 7C acceptance: Bulk Document Upload (Match Review, confirm, sequential per-file upload, failures, retry,
// isolation, Vietnamese, mobile / desktop). Fixtures: P7C-ACCEPT- only. Needs a production build on 127.0.0.1:3105.
import { chromium } from "playwright-core";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { users, makeReporter, signIn, dbQuery } from "./common.mjs";
import { createP7c, cleanupP7c } from "./p7c-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const R = makeReporter();
const rec = (ok, name, detail = "") => { R.rec(ok, name, detail); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " :: " + detail : ""}`); };
const info = (m) => console.log(`INFO  ${m}`);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const one = (sql) => dbQuery(sql)[0];
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const vnToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const DIR = path.join(process.env.TEMP, "p7c-files");
mkdirSync(DIR, { recursive: true });
/** A small PDF-looking file of exactly `size` bytes on disk (so lastModified is stable across selections). */
function mk(name, size = 2048) {
  const p = path.join(DIR, name);
  const head = Buffer.from("%PDF-1.4\n% P7C fixture\n");
  writeFileSync(p, Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 0x20)]));
  return p;
}

const admin = await signIn("admin");
const consultant = await signIn("consultant");
await cleanupP7c(admin.token);
const t0 = Date.now();
const f = await createP7c(admin.token);
info(`fixtures ${Math.round((Date.now() - t0) / 1000)} s`);
const BULK = `${APP}/projects/${f.pP}/documents/bulk-upload`;
const counts = () => one(`select (select count(*)::int from documents where project_id='${f.pP}') d, (select count(*)::int from document_versions v join documents d on d.id=v.document_id where d.project_id='${f.pP}') v, (select count(*)::int from files where project_id='${f.pP}') f, (select count(*)::int from storage.objects where bucket_id='rayims-files' and split_part(name,'/',1)='${f.pP}') o`);
const versionsOf = (docId) => dbQuery(`select v.version_no, v.revision, v.received_on::text r, v.uploaded_by, fl.original_name, fl.size_bytes, fl.storage_key from document_versions v join files fl on fl.id=v.file_id where v.document_id='${docId}' order by v.version_no`);
const objExists = (key) => one(`select count(*)::int n from storage.objects where bucket_id='rayims-files' and name='${key}'`).n === 1;
const base = counts();

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const caps = [];
async function open(width, height, who = "admin") {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: "Asia/Ho_Chi_Minh", locale: "en-US" });
  const page = await ctx.newPage();
  page.on("request", (req) => { if (req.method() === "POST" && req.headers()["next-action"]) caps.push({ url: req.url(), headers: req.headers(), body: req.postData() ?? "" }); });
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 25000 }).catch(() => {}), page.click('button[type="submit"]')]);
  return { ctx, page };
}
const cookieOf = async (ctx) => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const replay = async (cap, swaps, cookie) => {
  let body = cap.body;
  for (const [a, b] of swaps) body = body.split(a).join(b);
  const r = await fetch(cap.url, { method: "POST", headers: { "next-action": cap.headers["next-action"], "content-type": cap.headers["content-type"] ?? "text/plain;charset=UTF-8", accept: "text/x-component", ...(cookie ? { cookie } : {}) }, body, redirect: "manual" });
  return { status: r.status, text: await r.text() };
};
const T = (page, id) => page.getByTestId(id);
const table = (page) => T(page, "bulk-table");
const rowOf = (page, name, n = 0) => table(page).locator(`[data-testid="bulk-row"][data-file="${name}"]`).nth(n);
const cardOf = (page, name) => T(page, "bulk-cards").locator(`[data-testid="bulk-card"][data-file="${name}"]`).first();
const statusOf = (loc) => loc.getAttribute("data-status");
async function selectFiles(page, paths) {
  await page.goto(BULK);
  await T(page, "bulk-file-input").waitFor({ state: "attached", timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  // The input is server-rendered: a change fired before React has hydrated is lost (and React ignores a repeat of the
  // identical selection), so clear the input and set the files again until the page reacts.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await T(page, "bulk-file-input").setInputFiles(paths);
    if (await T(page, "bulk-selected-count").waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) return;
    await T(page, "bulk-file-input").setInputFiles([]);
  }
  throw new Error("the page never reacted to the selected files");
}
async function analyze(page) {
  await T(page, "bulk-analyze").click();
  await page.locator('[data-testid="bulk-bar-top"]').waitFor({ timeout: 20000 });
}
async function pick(scope, page, documentId, search) {
  await scope.getByTestId("document-picker").click();
  if (search) await page.getByLabel("Search Documents").fill(search);
  await page.locator(`[data-picker-option][data-document-id="${documentId}"]`).first().click();
}
async function upload(page, timeout = 240000) {
  await T(page, "bulk-bar-top-upload").click();
  await T(page, "bulk-confirm").waitFor({ timeout: 10000 });
  await T(page, "bulk-confirm-upload").click();
  await T(page, "bulk-result").waitFor({ timeout });
}
const resultCounts = async (page) => flat(await T(page, "bulk-result-counts").innerText());

// ================= Entry point + file selection limits =================
{
  const { ctx, page } = await open(1280, 800);
  await page.goto(`${APP}/projects/${f.pP}/documents`);
  rec(await page.getByRole("link", { name: "Bulk Upload" }).first().isVisible(), "Documents workspace has a Bulk Upload action");
  await page.getByRole("link", { name: "Bulk Upload" }).first().click();
  await page.waitForURL("**/documents/bulk-upload", { timeout: 20000 });
  await page.getByRole("heading", { name: "Bulk Upload", level: 2 }).waitFor({ timeout: 30000 });
  rec((await page.getByRole("heading", { name: "Bulk Upload", level: 2 }).isVisible()) && (await page.locator("input[webkitdirectory]").count()) === 0, "Bulk Upload is a page (not a drawer); the file picker offers files only (no folder upload)");
  // 51 files: blocked before Analyze
  const many = Array.from({ length: 51 }, (_, i) => mk(`limit-${String(i).padStart(2, "0")}.pdf`, 600));
  await page.waitForLoadState("networkidle").catch(() => {});
  await T(page, "bulk-file-input").setInputFiles(many);
  const msg = flat(await T(page, "bulk-too-many").innerText());
  rec(/Select up to 50 files per batch\./.test(msg) && (await T(page, "bulk-analyze").isDisabled()), `More than 50 files: "${msg.slice(0, 60)}…" and Analyze is disabled (nothing truncated: ${flat(await T(page, "bulk-selected-count").innerText()).slice(0, 20)})`);
  await page.getByRole("button", { name: "Remove limit-00.pdf" }).click();
  rec(!(await T(page, "bulk-analyze").isDisabled()) && (await T(page, "bulk-too-many").count()) === 0, "Removing one file (50 left) re-enables Analyze");
  await page.getByRole("button", { name: "Clear all" }).click();
  // total size advisory
  const big = Array.from({ length: 31 }, (_, i) => mk(`size-${String(i).padStart(2, "0")}.pdf`, 10 * 1024 * 1024));
  await T(page, "bulk-file-input").setInputFiles(big);
  rec((await T(page, "bulk-size-warning").isVisible()) && !(await T(page, "bulk-analyze").isDisabled()), "Total over 300 MB: an advisory warning, Analyze not blocked");
  await page.getByRole("button", { name: "Clear all" }).click();
  // drag and drop
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(100)], "dropped.pdf", { type: "application/pdf" }));
    document.querySelector('[data-testid="bulk-dropzone"]').dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  rec(/1 file selected/.test(flat(await T(page, "bulk-selected-count").innerText())), "Drag and drop adds files (the Choose files button is the keyboard / mobile fallback)");
  rec(await page.locator("label[for=bulk-files]").isVisible() && (await page.locator("#bulk-files").getAttribute("multiple")) !== null, "The picker is labelled and multi-file");
  await ctx.close();
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(BULK);
  rec(/\/login/.test(anon.url()) && !/Bulk Upload/.test(await anon.locator("body").innerText()), "Signed out: the Bulk Upload page redirects to login");
  await anon.context().close();
}

// ================= 1. Mixed batch (Consultant) =================
{
  const { ctx, page } = await open(1280, 800, "consultant");
  const names = {
    auto: "P7C-PR-01_rev02.pdf", dup: "P7C-FM-05.xlsx", title: "Records Control Procedure.pdf", none: "Random scan 001.pdf", big: "P7C-PR-02_big.pdf", ext: "P7C-PR-03_notes.txt",
    dupe: "P7C-DUP.pdf", open: "P7C-PR-04.pdf", na: "P7C-PR-05.pdf", same: "P7C-PR-06.pdf", manual: "scan_0007.pdf", skip: "P7C-PR-07.pdf",
  };
  const dupPath = mk(names.dupe);
  const paths = [mk(names.auto), mk(names.dup), mk(names.title), mk(names.none), mk(names.big, 10 * 1024 * 1024 + 1024), mk(names.ext), dupPath, dupPath, mk(names.open), mk(names.na), mk(names.same, 2048), mk(names.manual), mk(names.skip)];
  await selectFiles(page, paths);
  rec(/13 files selected/.test(flat(await T(page, "bulk-selected-count").innerText())), "13 files selected (one of them twice)");
  const tAn = Date.now();
  await analyze(page);
  info(`Analyze (13 files) -> review ready in ${Date.now() - tAn} ms`);
  const st = async (n, i = 0) => statusOf(rowOf(page, n, i));
  rec((await st(names.auto)) === "ready" && /Auto-match/.test(await rowOf(page, names.auto).innerText()) && (await rowOf(page, names.auto).getByLabel(`Revision for ${names.auto}`).inputValue()) === "Rev.02" && /P7C-PR-01 · Document Control Procedure · Viet Long/.test(await rowOf(page, names.auto).innerText()) && /→ V1/.test(await rowOf(page, names.auto).innerText()), "Unique Document Code -> Auto-match, ready, preselected Document (code · title · site), Revision prefilled Rev.02, preview V1");
  rec((await st(names.dup)) === "unmatched" && /Suggested/.test(await rowOf(page, names.dup).innerText()) && /Choose Document/.test(await rowOf(page, names.dup).innerText()), "Same code on two Sites -> Suggested with no preselected Document");
  await rowOf(page, names.dup).getByTestId("document-picker").click();
  const suggestedList = flat(await page.getByRole("listbox", { name: "Documents" }).innerText());
  rec(/suggested/i.test(suggestedList) && (await page.locator(`[data-picker-option][data-document-id="${f.m2vl.id}"]`).count()) >= 1 && (await page.locator(`[data-picker-option][data-document-id="${f.m2la.id}"]`).count()) >= 1 && /Viet Long/.test(suggestedList) && /Long An/.test(suggestedList), "The picker lists both candidates (Viet Long, Long An) first under Suggested");
  await page.locator(`[data-picker-option][data-document-id="${f.m2vl.id}"]`).first().click();
  rec((await st(names.dup)) === "ready", "Choosing a candidate makes the row ready");
  rec((await st(names.title)) === "needs-review" && /Suggested/.test(await rowOf(page, names.title).innerText()) && /Records Control Procedure/.test(await rowOf(page, names.title).innerText()), "Exact title match -> Suggested, needs review (never auto-uploaded)");
  await rowOf(page, names.title).getByRole("button", { name: `Accept suggestion for ${names.title}` }).click();
  rec((await st(names.title)) === "ready", "Accepting the suggestion makes it ready");
  rec((await st(names.none)) === "unmatched" && /No match/.test(await rowOf(page, names.none).innerText()), "No match -> Unmatched, no Document preselected");
  rec((await st(names.big)) === "blocked" && /File must be 10 MB or smaller\./.test(await rowOf(page, names.big).innerText()), "Oversize file -> Blocked (10 MB policy message)");
  rec((await st(names.ext)) === "blocked" && /isn't supported/.test(await rowOf(page, names.ext).innerText()), "Invalid extension -> Blocked (existing policy message)");
  rec((await st(names.dupe, 0)) === "unmatched" && (await st(names.dupe, 1)) === "blocked" && /Duplicate of an earlier selected file\./.test(await rowOf(page, names.dupe, 1).innerText()), "The same file selected twice: the second is Blocked as a duplicate");
  rec((await st(names.open)) === "blocked" && /Complete the current Gap Assessment before uploading a new Version\./.test(await rowOf(page, names.open).innerText()), "Open Gap Assessment -> Blocked (existing wording)");
  rec((await st(names.na)) === "blocked" && /Not Applicable/.test(await rowOf(page, names.na).innerText()), "Not Applicable Document -> Blocked");
  rec((await st(names.same)) === "ready" && /Same file name and size as current Version\./.test(await rowOf(page, names.same).innerText()) && /→ V2/.test(await rowOf(page, names.same).innerText()), "Same file name and size as the current Version -> warning only (still ready), preview V2");
  await pick(rowOf(page, names.manual), page, f.m11.id, "Manual Target");
  rec((await st(names.manual)) === "ready" && /Manual/.test(await rowOf(page, names.manual).innerText()), "No match + manual assignment (searched in the picker) -> ready, labelled Manual");
  await rowOf(page, names.skip).getByRole("checkbox", { name: `Include ${names.skip}` }).uncheck();
  rec((await st(names.skip)) === "skipped", "Skip -> Skipped");
  // filters
  const vis = async (v) => { await page.getByLabel("Show files").selectOption(v); return table(page).locator('[data-testid="bulk-row"]').count(); };
  rec((await vis("ready")) === 5 && (await vis("unmatched")) === 2 && (await vis("blocked")) === 5 && (await vis("review")) === 0 && (await vis("all")) === 13, "Filters: Ready 5, Unmatched 2, Blocked 5, Needs review 0, All 13");
  const bar = flat(await T(page, "bulk-bar-top-summary").innerText());
  rec(/5 ready/.test(bar) && /2 unmatched/.test(bar) && /5 blocked/.test(bar) && /1 skipped/.test(bar) && /Upload 5 files/.test(await T(page, "bulk-bar-top-upload").innerText()), `Summary bar: ${bar}`);
  const pre = counts();
  rec(pre.f === base.f && pre.v === base.v && pre.o === base.o, "Nothing is uploaded before Confirm (no file row, Version or Storage object yet)");
  await T(page, "bulk-bar-top-upload").click();
  const dlgText = flat(await T(page, "bulk-confirm").innerText());
  rec(/Upload 5 files\?/.test(dlgText) && /Ready to upload: 5/.test(dlgText) && /Skipped: 1/.test(dlgText) && /Blocked: 5/.test(dlgText) && /Unmatched: 2/.test(dlgText), "Confirm dialog shows Ready 5 / Skipped 1 / Blocked 5 / Unmatched 2");
  await T(page, "bulk-confirm").getByRole("button", { name: "Cancel" }).click();
  rec((await T(page, "bulk-confirm").count()) === 0 && counts().f === base.f, "Cancel in the Confirm dialog uploads nothing");
  const tUp = Date.now();
  await upload(page);
  info(`Mixed batch: 5 files uploaded in ${Date.now() - tUp} ms`);
  const rc = await resultCounts(page);
  rec(/Completed: 5/.test(rc) && /Failed: 0/.test(rc) && /Skipped: 1/.test(rc) && /\(needs review, unmatched or blocked\): 7/.test(rc), `Result summary: ${rc}`);
  const runText = flat(await T(page, "bulk-run-list").innerText());
  rec(/created V1/.test(runText) && /created V2/.test(runText), "Result rows show the Version the server actually created (V1 … V2 for the Document that had V1)");
  // database truth
  const v1 = versionsOf(f.m1.id), v2 = versionsOf(f.m2vl.id), v3 = versionsOf(f.m3.id), v10 = versionsOf(f.m10.id), v11 = versionsOf(f.m11.id);
  rec(v1.length === 1 && v1[0].version_no === 1 && v1[0].revision === "Rev.02" && v1[0].r === vnToday && v1[0].uploaded_by === consultant.userId && v1[0].original_name === names.auto && v1[0].size_bytes === 2048, "Auto-match: V1 with revision Rev.02, received today, uploaded by the Consultant, original file name and size intact");
  rec(v2.length === 1 && v3.length === 1 && v11.length === 1 && v10.length === 2 && v10[1].version_no === 2 && v10[1].original_name === names.same, "Chosen candidate, accepted suggestion, manual assignment -> V1; the Document with V1 -> V2");
  const after = counts();
  rec(after.v === base.v + 5 && after.f === base.f + 5 && after.o === base.o + 5 && after.d === base.d, `5 Versions, 5 file rows, 5 Storage objects created; no Document created (versions ${after.v}, files ${after.f}, objects ${after.o}, documents ${after.d})`);
  rec([f.m5, f.m8, f.m9, f.m12].every((d) => d) && versionsOf(f.m5.id).length === 0 && versionsOf(f.m8.id).length === 1 && versionsOf(f.m9.id).length === 0 && versionsOf(f.m12.id).length === 0, "Blocked, unmatched and skipped files created nothing");
  const keys = [v1[0].storage_key, v2[0].storage_key, v3[0].storage_key, v10[1].storage_key, v11[0].storage_key];
  rec(keys.every((k) => k.startsWith(`${f.pP}/`) && objExists(k)), "Every created file has its private Storage object under the Project prefix");
  await T(page, "bulk-back").click();
  await page.waitForURL("**/documents", { timeout: 20000 });
  await page.getByText("Document Control Procedure").first().waitFor({ timeout: 30000 });
  const list = flat(await page.locator("main").innerText());
  rec(/Document Control Procedure[^]*?Received/.test(list), "Back to Documents shows the current state (Document Control Procedure now Received)");
  await ctx.close();
}

// ================= 2. Next Version preview vs server =================
{
  const { ctx, page } = await open(1280, 800);
  await selectFiles(page, [mk("P7C-NV-1.pdf"), mk("P7C-NV-2.pdf"), mk("P7C-NV-3.pdf")]);
  await analyze(page);
  const t = async (n) => flat(await rowOf(page, n).innerText());
  rec(/→ V1/.test(await t("P7C-NV-1.pdf")) && /→ V2/.test(await t("P7C-NV-2.pdf")) && /→ V3/.test(await t("P7C-NV-3.pdf")), "Preview: no Version -> V1, V1 -> V2, V1 + V2 -> V3");
  await upload(page);
  const n1 = versionsOf(f.nv1.id).map((x) => x.version_no), n2 = versionsOf(f.nv2.id).map((x) => x.version_no), n3 = versionsOf(f.nv3.id).map((x) => x.version_no);
  rec(JSON.stringify([n1, n2, n3]) === JSON.stringify([[1], [1, 2], [1, 2, 3]]), `Server created exactly V1 / V2 / V3 (${JSON.stringify([n1, n2, n3])})`);
  await ctx.close();
}

// ================= 3. Vietnamese =================
{
  const { ctx, page } = await open(1280, 800);
  const a = "Quy trình kiểm soát tài liệu Rev.02.pdf", b = "Hồ sơ đào tạo 2026.xlsx";
  await selectFiles(page, [mk(a), mk(b)]);
  await analyze(page);
  const ra = flat(await rowOf(page, a).innerText()), rb = flat(await rowOf(page, b).innerText());
  rec(ra.includes(a) && rb.includes(b) && /Quy trình kiểm soát tài liệu · Project-wide/.test(ra) && /Hồ sơ đào tạo · Project-wide/.test(rb) && !/Ã|â€|\uFFFD/.test(ra + rb), "Vietnamese file and Document names display intact (no mojibake)");
  rec((await statusOf(rowOf(page, a))) === "needs-review" && /Suggested/.test(ra) && (await rowOf(page, a).getByLabel(`Revision for ${a}`).inputValue()) === "Rev.02" && (await statusOf(rowOf(page, b))) === "needs-review", "Accent-aware title matching: 'Quy trình…' (Rev.02 hint) and 'Hồ sơ đào tạo 2026' (word overlap) are Suggested");
  await rowOf(page, a).getByRole("button", { name: /Accept suggestion/ }).click();
  await rowOf(page, b).getByRole("button", { name: /Accept suggestion/ }).click();
  await upload(page);
  const va = versionsOf(f.vn1.id), vb = versionsOf(f.vn2.id);
  rec(va.length === 1 && vb.length === 1 && va[0].original_name === a && vb[0].original_name === b && va[0].revision === "Rev.02" && /^[\x20-\x7e]+$/.test(va[0].storage_key.split("/")[1]), "Original Vietnamese file names are stored unchanged; only the Storage key is ASCII-safe");
  await ctx.close();
}

// ================= 4. One file per Document + isolation (captured actions) =================
{
  const { ctx, page } = await open(1280, 800);
  caps.length = 0;
  await selectFiles(page, [mk("conflict-a.pdf"), mk("conflict-b.pdf")]);
  await analyze(page);
  await pick(rowOf(page, "conflict-a.pdf"), page, f.cf.id, "Conflict Document");
  await pick(rowOf(page, "conflict-b.pdf"), page, f.cf.id, "Conflict Document");
  rec((await statusOf(rowOf(page, "conflict-a.pdf"))) === "conflict" && (await statusOf(rowOf(page, "conflict-b.pdf"))) === "conflict" && (await T(page, "bulk-bar-top-upload").isDisabled()) && /Resolve 2 conflicting files first/.test(flat(await T(page, "bulk-bar-top").innerText())), "Two files for one Document: both Conflict, Confirm / Upload is not possible");
  await rowOf(page, "conflict-b.pdf").getByRole("checkbox", { name: "Include conflict-b.pdf" }).uncheck();
  rec((await statusOf(rowOf(page, "conflict-a.pdf"))) === "ready" && !(await T(page, "bulk-bar-top-upload").isDisabled()), "Skipping one resolves the conflict");
  await upload(page);
  rec(versionsOf(f.cf.id).length === 1 && versionsOf(f.cf.id)[0].original_name === "conflict-a.pdf", "Only ONE Version was created for the Document");
  const prepare = caps.find((c) => !/storageKey/.test(c.body));
  const register = caps.find((c) => /storageKey/.test(c.body));
  rec(!!prepare && !!register, "Captured the existing prepareDocumentVersionUpload / registerDocumentVersion actions (the bulk flow reuses them)");
  const cookie = await cookieOf(ctx);
  const before = counts();
  const beforeQ = one(`select (select count(*)::int from document_versions where document_id='${f.other.id}') v, (select count(*)::int from files where project_id='${f.pQ}') f, (select count(*)::int from storage.objects where bucket_id='rayims-files' and split_part(name,'/',1)='${f.pQ}') o`);
  const x1 = await replay(prepare, [[f.cf.id, f.other.id]], cookie); // Project P + a Document of Project Q
  const x2 = await replay(prepare, [[f.pP, f.pQ]], cookie); // Project Q + a Document of Project P
  const fakeKey = `${f.pP}/${randomUUID()}-injected.pdf`;
  const x3 = await replay(register, [[f.cf.id, f.other.id], [/"storageKey":"[^"]+"/.exec(register.body)?.[0] ?? "", `"storageKey":"${fakeKey}"`]], cookie);
  const afterQ = one(`select (select count(*)::int from document_versions where document_id='${f.other.id}') v, (select count(*)::int from files where project_id='${f.pQ}') f, (select count(*)::int from storage.objects where bucket_id='rayims-files' and split_part(name,'/',1)='${f.pQ}') o`);
  const generic = (t) => /could not be found/i.test(t) && !/Other Project Document|P7C-OT-1/.test(t);
  rec(generic(x1.text) && generic(x2.text) && generic(x3.text), "Tampering: another Project's Document id in prepare / register -> generic 'could not be found', no metadata revealed");
  rec(JSON.stringify(beforeQ) === JSON.stringify(afterQ) && counts().v === before.v && counts().f === before.f, "Tampering created no Version, file row or Storage object");
  const anon = await replay(prepare, [], null);
  rec(!/"ok":true/.test(anon.text), `Signed out: the prepare action is refused (HTTP ${anon.status})`);
  // catalog isolation on the page itself
  await page.goto(BULK);
  rec(!(await page.content()).includes("Other Project Document"), "The Bulk Upload page of Project P does not contain Project Q's Document metadata");
  await ctx.close();
}

// ================= 5. Realistic 30-file batch (Admin) + desktop density =================
let thirty = null;
{
  const { ctx, page } = await open(1280, 800);
  const paths = f.b30.map((_, i) => mk(`P7C-B-${String(i + 1).padStart(3, "0")}_rev01.pdf`, 20 * 1024));
  await selectFiles(page, paths);
  const tA = Date.now();
  await T(page, "bulk-analyze").click();
  await table(page).locator('[data-testid="bulk-row"]').nth(29).waitFor({ timeout: 20000 });
  const analyzeMs = Date.now() - tA;
  const stats = await table(page).locator('[data-testid="bulk-row"]').evaluateAll((rows) => rows.map((r) => r.getAttribute("data-status")));
  rec(stats.length === 30 && stats.every((s) => s === "ready"), `30 files -> 30 Auto-match rows, all ready (analyze + render ${analyzeMs} ms)`);
  const heights = await table(page).locator('[data-testid="bulk-row"]').evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
  const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
  await page.screenshot({ path: path.join(process.env.TEMP, "p7c-desktop-30.png") });
  const clipped = await table(page).evaluate((t) => { const right = t.getBoundingClientRect().right; return Array.from(t.querySelectorAll("td, th")).filter((c) => c.getBoundingClientRect().right > right + 1 || Array.from(c.querySelectorAll("*")).some((e) => e.getBoundingClientRect().right > right + 1)).length; });
  rec(clipped === 0, `Desktop: no cell or control is clipped at the table's right edge (${clipped} overflowing)`);
  rec(avg < 140 && (await noHOverflow(page)), `Desktop 1280x800: compact rows (average ${Math.round(avg)} px; ${Math.floor(700 / avg)} rows per screen), no horizontal overflow`);
  const b0 = counts();
  const tU = Date.now();
  await upload(page, 420000);
  const totalMs = Date.now() - tU;
  const rc = await resultCounts(page);
  info(`30 files: ${totalMs} ms total, ${Math.round(totalMs / 30)} ms/file (sequential)`);
  thirty = { analyzeMs, totalMs };
  const b1 = counts();
  const per = dbQuery(`select d.id, count(v.id)::int n from documents d left join document_versions v on v.document_id=d.id where d.project_id='${f.pP}' and d.doc_code like 'P7C-B-%' group by d.id`);
  const keys = dbQuery(`select fl.storage_key from document_versions v join documents d on d.id=v.document_id join files fl on fl.id=v.file_id where d.doc_code like 'P7C-B-%' and d.project_id='${f.pP}'`).map((r) => r.storage_key);
  const objs = one(`select count(*)::int n from storage.objects where bucket_id='rayims-files' and name = any(array[${keys.map((k) => `'${k}'`).join(",")}])`).n;
  rec(/Completed: 30/.test(rc) && /Failed: 0/.test(rc) && b1.v === b0.v + 30 && b1.f === b0.f + 30 && b1.o === b0.o + 30 && per.length === 30 && per.every((r) => r.n === 1), `30 Versions, 30 file rows, 30 Storage objects, exactly one Version per Document (${rc})`);
  rec(objs === 30 && new Set(keys).size === 30, "Every created file row has its object; all Storage keys are unique (no duplicate, no orphan)");
  await ctx.close();
}

// ================= 6. Partial failure: one Storage failure among four, then retry =================
{
  const { ctx, page } = await open(1280, 800);
  let failNext = true;
  await page.route("**/storage/v1/object/rayims-files/**", async (route) => {
    if (failNext && /P7C-F-2/.test(route.request().url())) return route.abort("failed");
    return route.continue();
  });
  await selectFiles(page, [1, 2, 3, 4].map((n) => mk(`P7C-F-${n}.pdf`)));
  await analyze(page);
  const b0 = counts();
  await upload(page);
  const rc = await resultCounts(page);
  const failedRow = T(page, "bulk-run-list").locator('[data-testid="bulk-run-row"][data-file="P7C-F-2.pdf"]');
  rec(/Completed: 3/.test(rc) && /Failed: 1/.test(rc) && (await failedRow.getAttribute("data-phase")) === "failed" && /The upload failed\. Check your connection and retry\./.test(await failedRow.innerText()), `One Storage failure among four: 3 completed, 1 failed with a reason (${rc})`);
  const v = (i) => versionsOf(f.pf[i].id).length;
  const b1 = counts();
  rec(v(0) === 1 && v(1) === 0 && v(2) === 1 && v(3) === 1, "Earlier success kept, the failed file created no Version, later files continued (F-3 and F-4 uploaded after the failure)");
  rec(b1.v === b0.v + 3 && b1.f === b0.f + 3 && b1.o === b0.o + 3, "The failed upload left no file row and no Storage object");
  failNext = false;
  await page.getByRole("button", { name: "Retry P7C-F-2.pdf" }).click();
  await failedRow.waitFor({ timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('[data-file="P7C-F-2.pdf"][data-testid="bulk-run-row"]')?.getAttribute("data-phase") === "completed", null, { timeout: 60000 });
  rec(v(1) === 1 && versionsOf(f.pf[1].id)[0].version_no === 1 && counts().v === b0.v + 4, "Retry (fresh prepare) succeeds: exactly one Version V1, no duplicate");
  rec(/Completed: 4/.test(await resultCounts(page)) || (await T(page, "bulk-retry-failed").count()) === 0, "After the retry nothing is left to retry");
  await ctx.close();
}

// ================= 7. Register failure after the Storage upload (server revalidation + cleanup) =================
{
  const { ctx, page } = await open(1280, 800);
  let armed = true;
  await page.route("**/storage/v1/object/rayims-files/**", async (route) => {
    if (armed && /P7C-RF-1/.test(route.request().url())) {
      const resp = await route.fetch(); // the real upload happens ...
      armed = false;
      dbQuery(`insert into document_reviews (document_version_id, status) values ('${f.rf.versions[0]}', 'under_review')`); // ... then another consultant opens a Gap Assessment
      return route.fulfill({ response: resp });
    }
    return route.continue();
  });
  await selectFiles(page, [mk("P7C-RF-1.pdf")]);
  await analyze(page);
  rec(/→ V2/.test(flat(await rowOf(page, "P7C-RF-1.pdf").innerText())) && (await statusOf(rowOf(page, "P7C-RF-1.pdf"))) === "ready", "Review preview: the file is Ready and previews V2");
  const b0 = counts();
  await upload(page);
  const row = T(page, "bulk-run-list").locator('[data-testid="bulk-run-row"]').first();
  const b1 = counts();
  rec((await row.getAttribute("data-phase")) === "failed" && /Complete the current Gap Assessment before uploading a new Version\./.test(await row.innerText()), "The server refuses at registration: the row fails with the existing open-assessment message");
  rec(versionsOf(f.rf.id).length === 1 && b1.v === b0.v && b1.f === b0.f && b1.o === b0.o && one(`select count(*)::int n from files where original_name='P7C-RF-1.pdf'`).n === 0, "Register failure: the uploaded object was removed, no file row, no Version (explicit orphan check)");
  await page.getByRole("button", { name: "Retry P7C-RF-1.pdf" }).click();
  await page.waitForFunction(() => /Complete the current Gap Assessment/.test(document.querySelector('[data-testid="bulk-run-row"]')?.textContent ?? ""), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  rec(versionsOf(f.rf.id).length === 1 && counts().f === b0.f, "Retry while the assessment is still open fails again cleanly (fresh prepare, nothing left behind)");
  dbQuery(`update document_reviews set status='accepted', reviewed_at=now() where document_version_id='${f.rf.versions[0]}'`); // the assessment is concluded
  await T(page, "bulk-retry-failed").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="bulk-run-row"]')?.getAttribute("data-phase") === "completed", null, { timeout: 60000 });
  rec(versionsOf(f.rf.id).length === 2 && versionsOf(f.rf.id)[1].version_no === 2 && counts().o === b0.o + 1, "After the assessment is concluded, Retry Failed creates V2 (one Version, one object)");
  await ctx.close();
}

// ================= 8. State change during the batch =================
{
  const { ctx, page } = await open(1280, 800);
  let armed = true;
  await page.route("**/storage/v1/object/rayims-files/**", async (route) => {
    if (armed && /P7C-SC-1/.test(route.request().url())) {
      armed = false;
      dbQuery(`insert into document_reviews (document_version_id, status) values ('${f.sc[1].versions[0]}', 'under_review')`); // another consultant starts a Gap Assessment on the SECOND file's Document
    }
    return route.continue();
  });
  await selectFiles(page, [mk("P7C-SC-1.pdf"), mk("P7C-SC-2.pdf"), mk("P7C-SC-3.pdf")]);
  await analyze(page);
  rec((await statusOf(rowOf(page, "P7C-SC-2.pdf"))) === "ready", "Before the upload all three files are Ready (the second Document is still open for upload)");
  await upload(page);
  const phase = async (n) => T(page, "bulk-run-list").locator(`[data-testid="bulk-run-row"][data-file="${n}"]`).getAttribute("data-phase");
  const rowText = flat(await T(page, "bulk-run-list").locator('[data-testid="bulk-run-row"][data-file="P7C-SC-2.pdf"]').innerText());
  rec((await phase("P7C-SC-1.pdf")) === "completed" && (await phase("P7C-SC-2.pdf")) === "failed" && (await phase("P7C-SC-3.pdf")) === "completed" && /Complete the current Gap Assessment before uploading a new Version\./.test(rowText), "The server blocks the file whose Document became blocked mid-batch; the batch continues (1 and 3 completed)");
  rec(versionsOf(f.sc[0].id).length === 1 && versionsOf(f.sc[1].id).length === 1 && versionsOf(f.sc[2].id).length === 1, "Result in the database: the blocked file created nothing, the others created V1");
  await ctx.close();
}

// ================= 9. Mobile 390 / 412 =================
for (const w of [390, 412]) {
  const { ctx, page } = await open(w, 844, "consultant");
  const files = [mk(`P7C-MB-1.pdf`), mk(`P7C-MB-2.pdf`), mk(`mobile unmatched ${w}.pdf`), mk(`P7C-MB-3.pdf`)];
  await selectFiles(page, files);
  rec(await noHOverflow(page), `${w}px: file selection fits the screen`);
  await analyze(page);
  const cards = T(page, "bulk-cards");
  rec((await cards.isVisible()) && !(await table(page).isVisible()) && (await cards.locator('[data-testid="bulk-card"]').count()) === 4 && await noHOverflow(page), `${w}px: Match Review uses stacked cards, no horizontal overflow`);
  const un = cardOf(page, `mobile unmatched ${w}.pdf`);
  await un.getByTestId("document-picker").click();
  const panel = page.getByRole("listbox", { name: "Documents" });
  const inView = await panel.evaluate((el) => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= window.innerWidth; });
  rec(inView && await noHOverflow(page), `${w}px: the Document selector panel fits the screen`);
  // First target a Document another file already targets (MB-3): both rows become a Conflict, explained in the card
  await page.getByLabel("Search Documents").fill("Mobile Document 3");
  await page.locator(`[data-picker-option][data-document-id="${f.mob[2].id}"]`).first().click();
  const conflictText = flat(await cardOf(page, "P7C-MB-3.pdf").innerText());
  rec((await cardOf(page, "P7C-MB-3.pdf").getAttribute("data-status")) === "conflict" && (await un.getAttribute("data-status")) === "conflict" && /Another file in this batch targets the same Document/.test(conflictText), `${w}px: two files for one Document -> Conflict, explained in the card (not by colour alone)`);
  // Then a free Document: the card becomes ready
  await un.getByTestId("document-picker").click();
  await page.getByLabel("Search Documents").fill("Version Zero");
  await page.locator(`[data-picker-option][data-document-id="${f.nv1.id}"]`).first().click();
  rec((await un.getAttribute("data-status")) === "ready" && (await cardOf(page, "P7C-MB-3.pdf").getAttribute("data-status")) === "ready", `${w}px: reassigning in the card (searched in the selector) resolves the conflict, both ready`);
  await un.getByRole("checkbox", { name: `Include mobile unmatched ${w}.pdf` }).uncheck();
  const upBtn = T(page, "bulk-bar-top-upload");
  await upBtn.evaluate((el) => el.scrollIntoView({ block: "center" }));
  rec(await upBtn.evaluate((el) => { const b = el.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!h && (h === el || el.contains(h)); }), `${w}px: Upload is reachable and not under the bottom navigation`);
  await upBtn.click();
  const conf = T(page, "bulk-confirm-upload");
  rec((await conf.isVisible()) && await conf.evaluate((el) => { const b = el.getBoundingClientRect(); return b.bottom <= window.innerHeight && b.right <= window.innerWidth; }), `${w}px: the Confirm sheet and its Upload button are fully on screen`);
  await conf.click();
  await T(page, "bulk-progress").waitFor({ timeout: 10000 });
  await T(page, "bulk-result").waitFor({ timeout: 120000 });
  const back = T(page, "bulk-back");
  await back.evaluate((el) => el.scrollIntoView({ block: "center" }));
  rec(/Upload finished/.test(await T(page, "bulk-result").innerText()) && await noHOverflow(page) && await back.evaluate((el) => { const b = el.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!h && (h === el || el.contains(h)); }), `${w}px: progress and result summary are readable, Back to Documents reachable`);
  await page.screenshot({ path: path.join(process.env.TEMP, `p7c-mobile-${w}.png`) });
  await ctx.close();
}

// ================= 10. Documents not created, cleanup =================
const fin = counts();
rec(fin.d === base.d, `Bulk Upload created no Document (documents ${base.d} -> ${fin.d})`);
info(`performance: analyze 30 files ${thirty?.analyzeMs} ms; 30 sequential uploads ${thirty?.totalMs} ms (${Math.round((thirty?.totalMs ?? 0) / 30)} ms per file)`);
await browser.close();
await cleanupP7c(admin.token);
const left = one(`select (select count(*) from clients where name like 'P7C-ACCEPT-%')::int c, (select count(*) from projects where name like 'P7C-ACCEPT-%')::int p, (select count(*) from documents)::int d, (select count(*) from document_versions)::int v, (select count(*) from document_reviews)::int r, (select count(*) from attachments)::int at, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o`);
rec(Object.values(left).every((n) => n === 0), `Fixtures removed; documents / versions / reviews / attachments / files / Storage objects all 0 (${JSON.stringify(left)})`);
const failed = R.done();
process.exit(failed ? 1 : 0);
