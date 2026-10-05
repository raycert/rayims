import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { REPO, users, makeReporter, http, signIn, dbQuery, URL_ } from "./common.mjs";
import { createFixtures, makeFiles, cleanupP4e, fixtureObjectCount } from "./p4e-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p4e-files");
mkdirSync(OUT, { recursive: true });
const FILES = makeFiles(path.join(OUT, "upload"));
const R = makeReporter();
const rec = R.rec.bind(R);
const noHOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const wait = (l, timeout = 15000) => l.waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
const gone = (l, timeout = 15000) => l.waitFor({ state: "hidden", timeout }).then(() => true).catch(() => false);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
async function waitDb(fn, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 700)); } return false; }

const snapshotSql = `select
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.verification_items t where project_id in (select id from public.projects where name not like 'P4E-ACCEPT-%')) as vi,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.activities t where project_id in (select id from public.projects where name not like 'P4E-ACCEPT-%')) as act,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.projects t where name not like 'P4E-ACCEPT-%') as proj,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.clients t where name not like 'P4E-ACCEPT-%') as cl,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.sites t where client_id in (select id from public.clients where name not like 'P4E-ACCEPT-%')) as st,
  (select count(*) from public.frameworks) as frameworks, (select count(*) from public.framework_items) as items,
  (select count(*) from public.activity_types) as atypes,
  (select count(*) from public.issues where project_id in (select id from public.projects where name not like 'P4E-ACCEPT-%')) as issues,
  (select count(*) from public.actions where project_id in (select id from public.projects where name not like 'P4E-ACCEPT-%')) as actions,
  (select count(*) from public.attachments where project_id in (select id from public.projects where name not like 'P4E-ACCEPT-%')) as attachments,
  (select count(*) from public.files where project_id in (select id from public.projects where name not like 'P4E-ACCEPT-%')) as files,
  (select count(*) from storage.objects where bucket_id='rayims-files') as objects`;

{ const pre = await signIn("admin"); await cleanupP4e(pre.token); }
const before = dbQuery(snapshotSql)[0];
console.log("BEFORE", JSON.stringify(before));
rec(before.issues === 0 && before.actions === 0 && before.attachments === 0 && before.files === 0 && before.objects === 0, "Pre-flight: issues/actions/attachments/files/storage objects all 0");
const bucket = dbQuery(`select public, file_size_limit from storage.buckets where id='rayims-files'`)[0];
rec(bucket.public === false && Number(bucket.file_size_limit) === 10485760, "Pre-flight: bucket rayims-files private, 10 MB limit");
const admin = await signIn("admin");
const consultant = await signIn("consultant");
rec(admin.ok && consultant.ok, "Setup: sign-in");

const f = await createFixtures(admin.token);
writeFileSync(path.join(OUT, "fixture-ids.json"), JSON.stringify(f));
const FIND = `${APP}/projects/${f.projectA}/findings`;
const ACT = `${APP}/projects/${f.projectA}/activities/${f.actVL}`;
const att = (where) => dbQuery(`select a.*, fl.storage_key, fl.original_name, fl.mime_type, fl.size_bytes, fl.uploaded_by, fl.storage_provider from attachments a join files fl on fl.id=a.file_id where ${where} order by a.created_at`);
const objExists = (key) => dbQuery(`select count(*) n from storage.objects where bucket_id='rayims-files' and name='${key}'`)[0].n === 1;
const fixtureCounts = () => dbQuery(`select (select count(*) from attachments where project_id in ('${f.projectA}','${f.projectB}')) a, (select count(*) from files where project_id in ('${f.projectA}','${f.projectB}')) f`)[0];

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function login(page, who = "admin") {
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
}
const dlg = (page) => page.getByRole("dialog");
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
/** Upload through the real UI inside `scope` (a section or drawer containing the uploader). */
async function uploadVia(page, scope, file, caption, { expectOk = true, timeout = 30000 } = {}) {
  await scope.getByTestId("evidence-file-input").setInputFiles(file);
  if (caption) await scope.locator('input[id^="ev-caption-"]').fill(caption);
  const btn = scope.getByRole("button", { name: "Upload" });
  if (!(await btn.isVisible().catch(() => false))) return false;
  await btn.click();
  if (!expectOk) return true;
  return wait(page.getByText("Evidence added").first(), timeout);
}
async function openFindingAdd(page, id) {
  await page.goto(`${FIND}/${id}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  const sec = page.getByTestId("evidence-section-finding");
  await sec.getByRole("button", { name: "Add Evidence" }).click();
  return sec;
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await login(page, "admin");

  // ===== FINDING EVIDENCE: JPEG + PDF =====
  let sec = await openFindingAdd(page, f.fNC);
  {
    const order = await page.locator("section h2").allInnerTexts();
    rec(JSON.stringify(order) === JSON.stringify(["Finding", "Progress", "NC Response", "Corrective Actions", "Effectiveness Review", "Evidence", "Origin"]), `NC order with Evidence: ${order.join(" → ")}`);
    rec(await wait(sec.getByText("No evidence yet.")), "Empty state: 'No evidence yet.'");
    const photo = sec.getByTestId("evidence-photo-input"), file = sec.getByTestId("evidence-file-input");
    rec((await photo.getAttribute("accept")) === "image/*" && (await photo.getAttribute("capture")) === "environment" && /\.pdf/.test(await file.getAttribute("accept")) && !(await file.getAttribute("multiple")), "Inputs: Take Photo accept=image/* capture=environment; Choose File allowlist; single file");
    const progBefore = flat(await page.getByTestId("nc-progress").innerText());
    rec(await uploadVia(page, sec, FILES.jpg, "  Chemical storage before correction  "), "Upload JPEG with caption");
    sec = page.getByTestId("evidence-section-finding");
    if (!(await sec.getByRole("button", { name: "Done" }).isVisible().catch(() => false))) await sec.getByRole("button", { name: "Add Evidence" }).click();
    rec(await uploadVia(page, sec, FILES.pdf), "Upload PDF without caption");
    await waitDb(() => att(`a.issue_id='${f.fNC}'`).length === 2);
    const rows = att(`a.issue_id='${f.fNC}'`);
    rec(rows.length === 2 && new Set(rows.map((r) => r.file_id)).size === 2, "DB: 2 attachments, 2 files rows");
    const j = rows.find((r) => r.original_name === "site-photo.jpg"), p = rows.find((r) => r.original_name === "attendance.pdf");
    rec(j.caption === "Chemical storage before correction" && p.caption === null, "Caption trimmed; blank caption NULL");
    rec(j.mime_type === "image/jpeg" && p.mime_type === "application/pdf" && j.size_bytes > 0 && j.uploaded_by === admin.userId && j.created_by === admin.userId && j.storage_provider === "supabase", "files: mime, size, uploader, provider; attachment created_by");
    rec(rows.every((r) => r.issue_id === f.fNC && !r.activity_id && !r.verification_item_id && !r.action_id && !r.document_review_id && r.project_id === f.projectA), "Exactly one parent (issue_id) on each attachment");
    rec(rows.every((r) => r.storage_key.startsWith(`${f.projectA}/`) && !r.storage_key.includes("site-photo.jpg/") && objExists(r.storage_key)), "Keys are project-prefixed, server-generated; private objects exist");
    const txtRows = dbQuery(`select count(*) n from files where project_id='${f.projectA}' and (storage_key ilike '%http%' or storage_key ilike '%token%' or original_name ilike '%http%')`)[0].n + dbQuery(`select count(*) n from attachments where project_id='${f.projectA}' and caption ilike '%token=%'`)[0].n;
    rec(txtRows === 0, "No URL / signed token stored in files or attachments");
    await page.getByTestId("evidence-row").nth(1).waitFor({ timeout: 15000 });
    const list = flat(await sec.innerText());
    rec(/site-photo\.jpg/.test(list) && /Chemical storage before correction/.test(list) && /attendance\.pdf/.test(list) && /2 KB/.test(list) && !UUID.test(list) && !list.includes(f.projectA) && !/rayims-files/.test(list), "List: filename, caption, size, uploader/date; no key, bucket or UUID");
    rec(flat(await page.getByTestId("nc-progress").innerText()) === progBefore && dbQuery(`select status from issues where id='${f.fNC}'`)[0].status === "open", "Evidence does not change NC progress or status");
    // View -> signed URL in a new tab
    const [popup] = await Promise.all([ctx.waitForEvent("page"), sec.getByTestId("evidence-row").filter({ hasText: "site-photo.jpg" }).getByRole("button", { name: "View" }).click()]);
    await popup.waitForURL(/\/storage\/v1\/object\/sign\//, { timeout: 20000 });
    const signed = popup.url();
    const tok = new URL(signed).searchParams.get("token");
    const claims = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
    rec(/\/storage\/v1\/object\/sign\/rayims-files\//.test(signed) && claims.exp - claims.iat === 60, `View opens a signed URL valid for ${claims.exp - claims.iat}s`);
    const got = await fetch(signed);
    rec(got.status === 200, "Signed URL works while valid");
    await popup.close();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), sec.getByTestId("evidence-row").filter({ hasText: "attendance.pdf" }).getByRole("button", { name: "Download" }).click()]);
    rec(download.suggestedFilename() === "attendance.pdf", `Download uses the original filename (${download.suggestedFilename()})`);
    await page.goto(`${FIND}/${f.fNC}`);
    await page.getByTestId("evidence-row").first().waitFor();
    // anon direct object access
    const key = j.storage_key;
    const pub = await fetch(`${URL_}/storage/v1/object/public/rayims-files/${key}`);
    const noAuth = await fetch(`${URL_}/storage/v1/object/rayims-files/${key}`);
    rec(pub.status >= 400 && noAuth.status >= 400, `Anon direct object URLs unusable (public ${pub.status}, direct ${noAuth.status})`);
    globalThis.__signed = signed;
    // Remove the PDF
    const prow = page.getByTestId("evidence-row").filter({ hasText: "attendance.pdf" });
    await prow.getByRole("button", { name: "Remove" }).click();
    await prow.getByRole("button", { name: "Confirm remove" }).click();
    rec(await wait(page.getByText("Evidence removed").first()), "Remove evidence (confirm)");
    await waitDb(() => att(`a.issue_id='${f.fNC}'`).length === 1);
    rec(att(`a.issue_id='${f.fNC}'`).length === 1 && dbQuery(`select count(*) n from files where id='${p.file_id}'`)[0].n === 0 && !objExists(p.storage_key), "Removed: attachment, unreferenced files row and stored object gone");
    rec(objExists(j.storage_key) && att(`a.issue_id='${f.fNC}'`)[0].original_name === "site-photo.jpg", "Other evidence unaffected");
  }

  // ===== FILE TYPES / SIZE =====
  {
    sec = await openFindingAdd(page, f.fNC);
    const c0 = fixtureCounts(), o0 = fixtureObjectCount();
    for (const [k, name] of [["png", "diagram.png"], ["xlsx", "checklist.xlsx"], ["docx", "procedure.docx"]]) {
      if (!(await sec.getByRole("button", { name: "Done" }).isVisible().catch(() => false))) await sec.getByRole("button", { name: "Add Evidence" }).click();
      rec(await uploadVia(page, sec, FILES[k]), `Accepted: .${k}`);
      rec(await waitDb(() => att(`a.issue_id='${f.fNC}' and fl.original_name='${name}'`).length === 1), `  ...${name} registered`);
    }
    if (!(await sec.getByRole("button", { name: "Done" }).isVisible().catch(() => false))) await sec.getByRole("button", { name: "Add Evidence" }).click();
    const t0 = Date.now();
    rec(await uploadVia(page, sec, FILES.bigOk, undefined, { timeout: 180000 }), "Accepted: 9.5 MB PDF (under 10 MB)");
    console.log("big upload seconds", Math.round((Date.now() - t0) / 1000));
    await waitDb(() => att(`a.issue_id='${f.fNC}' and fl.original_name='big-ok.pdf'`).length === 1);
    rec(att(`a.issue_id='${f.fNC}' and fl.original_name='big-ok.pdf'`)[0]?.size_bytes > 9.4 * 1024 * 1024, "  ...size recorded from the stored object");
    const c1 = fixtureCounts(), o1 = fixtureObjectCount();
    if (!(await sec.getByRole("button", { name: "Done" }).isVisible().catch(() => false))) await sec.getByRole("button", { name: "Add Evidence" }).click();
    for (const [k, label, re] of [["bigOver", "10.5 MB PDF", /File must be 10 MB or smaller\./], ["exe", ".exe", /file type isn't supported/], ["sh", ".sh", /file type isn't supported/]]) {
      await sec.getByTestId("evidence-file-input").setInputFiles(FILES[k]);
      rec(await wait(sec.getByText(re).first()) && (await sec.getByRole("button", { name: "Upload" }).count()) === 0, `Rejected in the browser: ${label} (friendly message, no Upload)`);
    }
    // server-side policy (bypass the browser check by rewriting the request)
    await sec.getByTestId("evidence-file-input").setInputFiles(FILES.jpg);
    await tamper(page, [['"name":"site-photo.jpg"', '"name":"tool.exe"']]);
    await sec.getByRole("button", { name: "Upload" }).click();
    rec(await wait(sec.getByText(/file type isn't supported/).first()), "Server rejects a disguised .exe");
    await untamper(page);
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) return route.continue({ postData: (req.postData() ?? "").replace(/"size":\d+/, '"size":11534336') });
      return route.continue();
    });
    await sec.getByRole("button", { name: "Upload" }).click();
    rec(await wait(sec.getByText(/File must be 10 MB or smaller/).first()), "Server rejects a declared size over 10 MB");
    await untamper(page);
    const big = readFileSync(FILES.bigOver);
    const direct = await http("POST", `/storage/v1/object/rayims-files/${f.projectA}/00000000-0000-0000-0000-000000000000-big.pdf`, { token: admin.token, body: big, raw: true, headers: { "content-type": "application/pdf" } });
    rec(direct.status >= 400, `Bucket itself refuses an object over 10 MB (HTTP ${direct.status})`);
    const c2 = fixtureCounts(), o2 = fixtureObjectCount();
    rec(c2.a === c1.a && c2.f === c1.f && o2 === o1, "Rejected uploads left no rows or objects");
  }

  // ===== DUPLICATE FILENAME =====
  {
    for (const k of ["photoA", "photoB"]) {
      if (!(await sec.getByRole("button", { name: "Done" }).isVisible().catch(() => false))) await sec.getByRole("button", { name: "Add Evidence" }).click();
      await uploadVia(page, sec, FILES[k], k);
    }
    await waitDb(() => att(`a.issue_id='${f.fNC}' and fl.original_name='photo.jpg'`).length === 2);
    const d = att(`a.issue_id='${f.fNC}' and fl.original_name='photo.jpg'`);
    rec(d.length === 2 && d[0].storage_key !== d[1].storage_key && d.every((r) => objExists(r.storage_key)), "Two 'photo.jpg' uploads: both kept, different keys, original name preserved");
  }

  // ===== CLEANUP AFTER A FAILED REGISTRATION =====
  {
    const o0 = fixtureObjectCount(), c0 = fixtureCounts();
    if (!(await sec.getByRole("button", { name: "Done" }).isVisible().catch(() => false))) await sec.getByRole("button", { name: "Add Evidence" }).click();
    await sec.getByTestId("evidence-file-input").setInputFiles(FILES.png);
    // Let prepare + the Storage upload succeed, then break registration (parent -> another project's finding).
    let call = 0;
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) {
        call += 1;
        const body = req.postData() ?? "";
        if (body.includes("storageKey")) return route.continue({ postData: body.split(f.fNC).join(f.fB) });
      }
      return route.continue();
    });
    await sec.getByRole("button", { name: "Upload" }).click();
    rec(await wait(sec.getByText(/record could not be found/).first()), "Registration failure after a successful upload shows a friendly error");
    await untamper(page);
    rec(fixtureObjectCount() === o0 && fixtureCounts().a === c0.a && fixtureCounts().f === c0.f, "Uploaded object was removed again; no files/attachments rows (cleanup path)");
    // A re-sent key of an existing file is refused and never deletes the registered object
    const existing = att(`a.issue_id='${f.fNC}'`)[0];
    await sec.getByTestId("evidence-file-input").setInputFiles(FILES.png);
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) {
        const body = req.postData() ?? "";
        if (body.includes("storageKey")) return route.continue({ postData: body.replace(/"storageKey":"[^"]+"/, `"storageKey":"${existing.storage_key}"`) });
      }
      return route.continue();
    });
    await sec.getByRole("button", { name: "Upload" }).click();
    rec(await wait(sec.getByText(/already registered/).first()), "A re-sent existing key is refused");
    await untamper(page);
    rec(objExists(existing.storage_key) && att(`a.id='${existing.id}'`).length === 1, "  ...and the existing evidence object/rows are untouched");
    // the object just uploaded under the fresh key is an orphan now: remove it the same way the app would
    const orphan = dbQuery(`select name from storage.objects o where o.bucket_id='rayims-files' and o.name like '${f.projectA}/%' and not exists (select 1 from files where storage_key=o.name)`);
    rec(orphan.length === 1, `(test note) the refused re-send left its own fresh upload unregistered: ${orphan.length} object — removed by the fixture cleanup`);
  }

  // ===== MISSING OBJECT =====
  {
    const target = att(`a.issue_id='${f.fNC}' and fl.original_name='diagram.png'`)[0];
    await http("DELETE", "/storage/v1/object/rayims-files", { token: admin.token, body: { prefixes: [target.storage_key] } });
    rec(!objExists(target.storage_key), "(setup) object deleted behind the metadata");
    await page.goto(`${FIND}/${f.fNC}`);
    const row = page.getByTestId("evidence-row").filter({ hasText: "diagram.png" });
    await row.waitFor();
    const pages0 = ctx.pages().length;
    await row.getByRole("button", { name: "View" }).click();
    rec(await wait(row.getByText("File is unavailable.")), "Missing object: 'File is unavailable.'");
    await page.waitForTimeout(800);
    rec(ctx.pages().length === pages0 && await page.getByRole("heading", { level: 1 }).first().isVisible(), "  ...page intact, no broken tab left open");
    rec(att(`a.id='${target.id}'`).length === 1, "  ...metadata not auto-deleted");
  }

  // ===== EXACTLY ONE PARENT (DB constraint) =====
  {
    const fileId = att(`a.issue_id='${f.fNC}'`)[0].file_id;
    const two = await http("POST", "/rest/v1/attachments", { token: admin.token, body: { project_id: f.projectA, file_id: fileId, issue_id: f.fNC, action_id: f.aNC } });
    const zero = await http("POST", "/rest/v1/attachments", { token: admin.token, body: { project_id: f.projectA, file_id: fileId } });
    rec(two.status >= 400 && zero.status >= 400 && /exactly_one_parent/.test(two.text + zero.text), `Two parents / zero parents rejected by attachments_exactly_one_parent (${two.status}/${zero.status})`);
    const bad = dbQuery(`select count(*) n from attachments where num_nonnulls(activity_id, document_review_id, verification_item_id, issue_id, action_id) <> 1`)[0].n;
    rec(bad === 0, "Every attachment has exactly one parent");
  }

  // ===== ACTION EVIDENCE =====
  {
    await page.goto(`${FIND}/${f.fNC}`);
    const card = page.locator('[data-testid="action-card"]', { hasText: "P4E-ACCEPT-Update checklist" });
    await card.getByTestId("evidence-button").click();
    const d = dlg(page);
    await d.waitFor({ state: "visible" });
    rec((await d.getByRole("heading").first().innerText()) === "Action Evidence" && await wait(d.getByText("No evidence yet.")), "Action: 'Add Evidence' opens a compact Action Evidence drawer");
    rec(await uploadVia(page, d, FILES.jpg, "Updated checklist photo"), "Action evidence uploaded");
    await waitDb(() => att(`a.action_id='${f.aNC}'`).length === 1);
    const r = att(`a.action_id='${f.aNC}'`)[0];
    rec(r.action_id === f.aNC && !r.issue_id && !r.activity_id && !r.verification_item_id, "DB: linked to action_id only");
    await d.getByRole("button", { name: "Close" }).click(); await gone(d);
    await card.getByTestId("evidence-button").getByText("Evidence (1)").waitFor({ timeout: 15000 });
    rec(true, "Card summary 'Evidence (1)' (compact)");
    await card.getByLabel("Action status").selectOption("closed");
    await card.getByRole("button", { name: "Close Action" }).click();
    await waitDb(() => dbQuery(`select status from actions where id='${f.aNC}'`)[0].status === "closed");
    await page.reload();
    const card2 = page.locator('[data-testid="action-card"]', { hasText: "P4E-ACCEPT-Update checklist" });
    await card2.getByTestId("evidence-button").click();
    await d.waitFor({ state: "visible" });
    rec((await d.getByTestId("evidence-uploader").count()) === 0 && (await d.getByRole("button", { name: "Remove" }).count()) === 0 && await wait(d.getByText(/action is closed\. Reopen it/)) && await wait(d.getByRole("button", { name: "View" })), "Closed action: evidence visible, no Add / Remove");
    await d.getByRole("button", { name: "Close" }).click(); await gone(d);
    // server rejects add/remove on a closed action (tamper from the NC finding's uploader)
    const s2 = await openFindingAdd(page, f.fNC);
    await s2.getByTestId("evidence-file-input").setInputFiles(FILES.jpg);
    await tamper(page, [['"kind":"finding"', '"kind":"action"'], [f.fNC, f.aNC]]);
    await s2.getByRole("button", { name: "Upload" }).click();
    rec(await wait(s2.getByText(/action is closed\. Reopen it/).first()), "Server rejects upload to a closed action");
    await untamper(page);
    const actAtt = att(`a.action_id='${f.aNC}'`)[0].id;
    const fId = att(`a.issue_id='${f.fNC}' and fl.original_name='site-photo.jpg'`)[0].id;
    await tamper(page, [[fId, actAtt]]);
    await page.getByTestId("evidence-section-finding").getByTestId("evidence-row").filter({ hasText: "site-photo.jpg" }).getByRole("button", { name: "Remove" }).click();
    await page.getByTestId("evidence-section-finding").getByRole("button", { name: "Confirm remove" }).click();
    await page.waitForTimeout(2500);
    await untamper(page);
    rec(att(`a.id='${actAtt}'`).length === 1, "Server rejects removing evidence of a closed action");
    await page.goto(`${FIND}/${f.fNC}`);
    const card3 = page.locator('[data-testid="action-card"]', { hasText: "P4E-ACCEPT-Update checklist" });
    await card3.getByLabel("Action status").selectOption("open");
    await waitDb(() => dbQuery(`select status from actions where id='${f.aNC}'`)[0].status === "open");
    await page.reload();
    await page.locator('[data-testid="action-card"]', { hasText: "P4E-ACCEPT-Update checklist" }).getByTestId("evidence-button").click();
    rec(await wait(dlg(page).getByTestId("evidence-uploader")) && await wait(dlg(page).getByRole("button", { name: "Remove" })), "Reopened action: evidence management restored");
    await dlg(page).getByRole("button", { name: "Close" }).click();
    rec(dbQuery(`select status from actions where id='${f.aNC}'`)[0].status === "open", "Evidence does not change action status");
  }

  // ===== CLOSED FINDING =====
  {
    const s = await openFindingAdd(page, f.fObs);
    rec(await uploadVia(page, s, FILES.jpg, "Observation photo"), "Observation evidence uploaded");
    await waitDb(() => att(`a.issue_id='${f.fObs}'`).length === 1);
    await page.getByRole("button", { name: "Close Finding" }).click();
    await page.getByTestId("close-panel").getByRole("button", { name: "Close Finding" }).click();
    await waitDb(() => dbQuery(`select status from issues where id='${f.fObs}'`)[0].status === "closed");
    await page.reload();
    const sec2 = page.getByTestId("evidence-section-finding");
    rec((await sec2.getByRole("button", { name: "Add Evidence" }).count()) === 0 && (await sec2.getByRole("button", { name: "Remove" }).count()) === 0 && await wait(sec2.getByRole("button", { name: "View" })) && await wait(sec2.getByText(/finding is closed\. Reopen it/)), "Closed Finding: evidence visible; no Add / Remove");
    const s3 = await openFindingAdd(page, f.fNC);
    await s3.getByTestId("evidence-file-input").setInputFiles(FILES.jpg);
    await tamper(page, [[f.fNC, f.fObs]]);
    await s3.getByRole("button", { name: "Upload" }).click();
    rec(await wait(s3.getByText(/finding is closed\. Reopen it/).first()), "Server rejects upload to a closed Finding");
    await untamper(page);
    const obsAtt = att(`a.issue_id='${f.fObs}'`)[0].id;
    const ncAtt = att(`a.issue_id='${f.fNC}' and fl.original_name='site-photo.jpg'`)[0].id;
    await tamper(page, [[ncAtt, obsAtt]]);
    await page.getByTestId("evidence-section-finding").getByTestId("evidence-row").filter({ hasText: "site-photo.jpg" }).getByRole("button", { name: "Remove" }).click();
    await page.getByTestId("evidence-section-finding").getByRole("button", { name: "Confirm remove" }).click();
    await page.waitForTimeout(2500);
    await untamper(page);
    rec(att(`a.id='${obsAtt}'`).length === 1 && att(`a.id='${ncAtt}'`).length === 1, "Server rejects removing evidence of a closed Finding");
    await page.goto(`${FIND}/${f.fObs}`);
    await page.getByRole("button", { name: "Reopen Finding" }).click();
    await page.locator("div.bg-warning-soft").getByRole("button", { name: "Reopen Finding" }).click();
    await waitDb(() => dbQuery(`select status from issues where id='${f.fObs}'`)[0].status === "open");
    await page.reload();
    rec(await wait(page.getByTestId("evidence-section-finding").getByRole("button", { name: "Add Evidence" })), "Reopened Finding: evidence management available again");
    const order = await page.locator("section h2").allInnerTexts();
    rec(JSON.stringify(order) === JSON.stringify(["Finding", "Actions", "Evidence", "Origin"]), `Observation order: ${order.join(" → ")}`);
  }

  // ===== VERIFICATION + ACTIVITY EVIDENCE =====
  {
    await page.goto(ACT);
    await page.getByText("Verification", { exact: true }).first().waitFor({ timeout: 20000 });
    const vcard = () => page.locator("div.rounded-lg", { hasText: "P4E-ACCEPT-Q-issue" }).last();
    const h0 = (await vcard().boundingBox()).height;
    await vcard().getByTestId("evidence-button").click();
    const d = dlg(page);
    await d.waitFor({ state: "visible" });
    rec((await d.getByRole("heading").first().innerText()) === "Verification Evidence", "Verification card: 'Add Evidence' opens Verification Evidence");
    rec(await uploadVia(page, d, FILES.jpg, "Onsite photo"), "Verification evidence uploaded (stays on Activity Detail)");
    rec(page.url() === ACT, "  ...still on Activity Detail");
    await waitDb(() => att(`a.verification_item_id='${f.vIssue}'`).length === 1);
    const r = att(`a.verification_item_id='${f.vIssue}'`)[0];
    rec(r.verification_item_id === f.vIssue && !r.issue_id && !r.activity_id && !r.action_id, "DB: verification_item_id only");
    await d.getByRole("button", { name: "Close" }).click(); await gone(d);
    await vcard().getByText("Evidence (1)").waitFor({ timeout: 15000 });
    const h1 = (await vcard().boundingBox()).height;
    rec(h1 - h0 <= 2, `Card height unchanged by the evidence summary (${Math.round(h0)} → ${Math.round(h1)})`);
    // edit result keeps evidence
    await vcard().getByRole("button", { name: "Review / Edit" }).click();
    await d.waitFor({ state: "visible" });
    await d.getByRole("button", { name: "Follow-up Required", exact: true }).click();
    await d.getByRole("button", { name: "Save" }).click();
    await gone(d);
    rec(await waitDb(() => dbQuery(`select result from verification_items where id='${f.vIssue}'`)[0].result === "follow_up_required") && att(`a.verification_item_id='${f.vIssue}'`).length === 1, "Editing the result keeps the evidence; result unchanged by evidence");
    // pending verification can have evidence
    const pcard = page.locator("div.rounded-lg", { hasText: "P4E-ACCEPT-Q-pending" }).last();
    await pcard.getByTestId("evidence-button").click();
    rec(await uploadVia(page, dlg(page), FILES.pdf), "Pending verification item accepts evidence");
    await dlg(page).getByRole("button", { name: "Close" }).click();
    rec(await waitDb(() => att(`a.verification_item_id='${f.vPending}'`).length === 1) && dbQuery(`select result from verification_items where id='${f.vPending}'`)[0].result === null, "  ...stays Pending");
    // create finding from the verification: evidence not copied
    await page.reload();
    await vcard().getByRole("button", { name: /Create Finding/ }).click();
    await d.getByRole("button", { name: "Observation", exact: true }).click();
    await d.locator("#fd-title").fill("P4E-ACCEPT-From verification");
    await d.getByRole("button", { name: "Create" }).click();
    await gone(d);
    const nf = await waitDb(() => dbQuery(`select count(*) n from issues where title='P4E-ACCEPT-From verification'`)[0].n === 1);
    const nfId = dbQuery(`select id from issues where title='P4E-ACCEPT-From verification'`)[0].id;
    rec(nf && att(`a.issue_id='${nfId}'`).length === 0 && att(`a.verification_item_id='${f.vIssue}'`).length === 1, "Creating a Finding does not move or copy the verification evidence");
    // Activity evidence
    const asec = page.getByTestId("evidence-section-activity");
    await asec.scrollIntoViewIfNeeded();
    rec(/Activity Evidence/.test(await asec.innerText()), "Activity Detail: separate 'Activity Evidence' section");
    await asec.getByRole("button", { name: "Add Evidence" }).click();
    rec(await uploadVia(page, asec, FILES.pdf, "Attendance sheet"), "Activity evidence (PDF) uploaded");
    await waitDb(() => att(`a.activity_id='${f.actVL}'`).length === 1);
    const ar = att(`a.activity_id='${f.actVL}'`)[0];
    rec(ar.activity_id === f.actVL && !ar.verification_item_id && !ar.issue_id && !ar.action_id, "DB: activity_id only");
    await page.getByTestId("evidence-section-activity").getByText("1 file").waitFor({ timeout: 15000 });
    rec(/1 file/.test(await page.getByTestId("evidence-section-activity").innerText()) && att(`a.verification_item_id='${f.vIssue}'`).length === 1, "Activity and verification evidence kept separate");
    rec(dbQuery(`select status from activities where id='${f.actVL}'`)[0].status === "planned", "Evidence does not change the Activity");
    await page.screenshot({ path: path.join(OUT, "desktop-activity.png"), fullPage: true });
    rec(await noHOverflow(page), "Desktop: Activity Detail no overflow");
  }

  // ===== ISOLATION =====
  {
    const bFile = dbQuery(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes) values ('${f.projectB}', '${f.projectB}/11111111-1111-1111-1111-111111111111-secret.pdf', 'B-secret.pdf', 'application/pdf', 10) returning id`)[0].id;
    const bAtt = dbQuery(`insert into attachments (project_id, file_id, issue_id, caption) values ('${f.projectB}', '${bFile}', '${f.fB}', 'B secret caption') returning id`)[0].id;
    const s = await openFindingAdd(page, f.fNC);
    await s.getByTestId("evidence-file-input").setInputFiles(FILES.jpg);
    await tamper(page, [[f.fNC, f.fB]]);
    await s.getByRole("button", { name: "Upload" }).click();
    rec(await wait(s.getByText(/record could not be found/).first()), "Upload to another project's Finding rejected");
    await untamper(page);
    const row = page.getByTestId("evidence-section-finding").getByTestId("evidence-row").filter({ hasText: "site-photo.jpg" });
    const ncAtt = att(`a.issue_id='${f.fNC}' and fl.original_name='site-photo.jpg'`)[0].id;
    await tamper(page, [[ncAtt, bAtt]]);
    await row.getByRole("button", { name: "View" }).click();
    rec(await wait(row.getByText("File is unavailable.")), "View of another project's attachment: unavailable (no URL)");
    await row.getByRole("button", { name: "Remove" }).click();
    await page.getByTestId("evidence-section-finding").getByRole("button", { name: "Confirm remove" }).click();
    rec(await wait(row.getByText(/evidence could not be found/)), "Remove of another project's attachment rejected");
    await untamper(page);
    rec(att(`a.id='${bAtt}'`).length === 1, "  ...Project B attachment untouched");
    const body = await page.locator("body").innerText();
    rec(!body.includes("B-secret") && !body.includes("B secret caption"), "No Project B evidence metadata leaked");
    await page.goto(`${FIND}/${f.fB}`);
    rec(await wait(page.getByText("Page not found")), "Project B Finding via Project A URL: not found"); // 4F: wait for streamed not-found UI
    dbQuery(`delete from attachments where id='${bAtt}'; delete from files where id='${bFile}';`);
  }

  // ===== AUTHORIZATION =====
  {
    const cctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const cp = await cctx.newPage();
    await login(cp, "consultant");
    const s = await openFindingAdd(cp, f.fNC);
    rec(await uploadVia(cp, s, FILES.png, "Consultant upload"), "Consultant uploads evidence");
    await waitDb(() => att(`a.issue_id='${f.fNC}' and a.caption='Consultant upload'`).length === 1);
    const r = att(`a.issue_id='${f.fNC}' and a.caption='Consultant upload'`)[0];
    rec(r.uploaded_by === consultant.userId && r.created_by === consultant.userId, "uploaded_by / created_by = consultant");
    await cp.reload();
    const arow = cp.getByTestId("evidence-row").filter({ hasText: "procedure.docx" });
    await arow.getByRole("button", { name: "Remove" }).click();
    await arow.getByRole("button", { name: "Confirm remove" }).click();
    rec(await waitDb(() => att(`a.issue_id='${f.fNC}' and fl.original_name='procedure.docx'`).length === 0), "Consultant removes evidence uploaded by the admin");
    await cctx.close();
    const anonIns = await http("POST", "/rest/v1/attachments", { body: { project_id: f.projectA, file_id: r.file_id, issue_id: f.fNC } });
    const anonSel = await http("GET", "/rest/v1/files?select=id,storage_key");
    const anonUp = await http("POST", `/storage/v1/object/rayims-files/${f.projectA}/anon.txt`, { body: Buffer.from("x"), raw: true, headers: { "content-type": "text/plain" } });
    rec(anonIns.status >= 400 && anonSel.status >= 400 && anonUp.status >= 400, `Anon denied: attachments insert ${anonIns.status}, files select ${anonSel.status}, storage upload ${anonUp.status}`);
    const anonPage = await fetch(`${FIND}/${f.fNC}`, { redirect: "manual" });
    rec(anonPage.status >= 300 && anonPage.status < 400, "Anon: Finding Detail redirects to login");
  }

  // ===== MOBILE =====
  for (const width of [390, 412]) {
    const mctx = await browser.newContext({ viewport: { width, height: 844 } });
    const mp = await mctx.newPage();
    await login(mp, "admin");
    await mp.goto(ACT);
    await mp.getByText("Verification", { exact: true }).first().waitFor({ timeout: 20000 });
    const q = width === 390 ? "P4E-ACCEPT-Q-m390" : "P4E-ACCEPT-Q-m412";
    const vc = mp.locator("div.rounded-lg", { hasText: q }).last();
    await vc.scrollIntoViewIfNeeded();
    await vc.getByTestId("evidence-button").click();
    const d = dlg(mp);
    await d.waitFor({ state: "visible" });
    const photo = d.getByTestId("evidence-photo-input");
    rec((await d.boundingBox()).width >= width - 2 && (await photo.getAttribute("accept")) === "image/*" && (await photo.getAttribute("capture")) === "environment" && await d.getByRole("button", { name: "Take Photo" }).isVisible() && await d.getByRole("button", { name: "Choose File" }).isVisible(), `Mobile ${width}: verification evidence sheet — Take Photo (image/* + capture) and Choose File`);
    await photo.setInputFiles(FILES.jpg);
    await d.locator('input[id^="ev-caption-"]').fill("Mobile photo");
    const upOk = await d.getByRole("button", { name: "Upload" }).evaluate((e) => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; });
    rec(upOk && await noHOverflow(mp), `Mobile ${width}: Upload reachable, no overflow`);
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-verification-sheet.png`) });
    await d.getByRole("button", { name: "Upload" }).click();
    rec(await wait(mp.getByText("Evidence added").first(), 30000) && mp.url() === ACT, `Mobile ${width}: uploaded via the photo input, still on Activity Detail`);
    await d.getByRole("button", { name: "Close" }).click();
    // Finding evidence
    await mp.goto(`${FIND}/${f.fMobile}`);
    await mp.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
    const s = mp.getByTestId("evidence-section-finding");
    await s.scrollIntoViewIfNeeded();
    await s.getByRole("button", { name: "Add Evidence" }).click();
    await s.getByTestId("evidence-file-input").setInputFiles(FILES.pdf);
    await s.locator('input[id^="ev-caption-"]').fill(`Mobile ${width} finding`);
    const btn = s.getByRole("button", { name: "Upload" });
    await btn.scrollIntoViewIfNeeded();
    const clear = await btn.evaluate((e) => { const r = e.getBoundingClientRect(); const nav = document.querySelector('nav[class*="fixed"]'); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= (nav ? nav.getBoundingClientRect().top : innerHeight) && (top === e || e.contains(top)); });
    rec(clear && await noHOverflow(mp), `Mobile ${width}: Finding upload controls reachable, not under the bottom navigation`);
    await btn.click();
    rec(await wait(mp.getByText("Evidence added").first(), 30000), `Mobile ${width}: Finding evidence uploaded`);
    await mp.getByTestId("evidence-section-finding").getByTestId("evidence-row").first().waitFor();
    rec(await noHOverflow(mp), `Mobile ${width}: Finding evidence list no overflow`);
    await mp.getByTestId("evidence-section-finding").scrollIntoViewIfNeeded();
    await mp.screenshot({ path: path.join(OUT, `mobile-${width}-finding-evidence.png`) });
    // Action evidence
    const ac = mp.locator('[data-testid="action-card"]', { hasText: "P4E-ACCEPT-Mobile action" });
    await ac.scrollIntoViewIfNeeded();
    const acH = (await ac.boundingBox()).height;
    await ac.getByTestId("evidence-button").click();
    await d.waitFor({ state: "visible" });
    await d.getByTestId("evidence-file-input").setInputFiles(FILES.jpg);
    await d.getByRole("button", { name: "Upload" }).click();
    rec(await wait(mp.getByText("Evidence added").first(), 30000), `Mobile ${width}: action evidence uploaded from the card`);
    await d.getByRole("button", { name: "Close" }).click();
    await ac.getByText(/Evidence \(\d+\)/).waitFor({ timeout: 15000 });
    rec((await ac.boundingBox()).height - acH <= 2 && await noHOverflow(mp), `Mobile ${width}: action card stays compact (height ${Math.round(acH)}px)`);
    await mctx.close();
  }

  // ===== SIGNED URL EXPIRY =====
  {
    await new Promise((r) => setTimeout(r, 66000));
    const expired = await fetch(globalThis.__signed);
    rec(expired.status >= 400, `Signed URL expired after 60 s (HTTP ${expired.status})`);
  }

  // ===== QUERY APPROACH / REGRESSION =====
  {
    const src = ["activities", "verification-items", "actions", "findings"].map((n) => readFileSync(`${REPO}/lib/queries/${n}.ts`, "utf8"));
    rec(src.every((s) => s.includes("${EVIDENCE_EMBED}")) && !src.some((s) => /createSignedUrl|from\("attachments"\)/.test(s)), "Evidence loaded as an embedded relationship on each parent query; no signed URLs on page load");
    const ms = readFileSync(REPO + "/lib/mutations/evidence.ts", "utf8");
    // Updated in 5B: signing moved into the shared lib/files/server helper (Evidence calls it once, in getEvidenceUrl).
    const shared = readFileSync(REPO + "/lib/files/server.ts", "utf8");
    rec((ms.match(/createFileSignedUrl\(/g) ?? []).length === 1 && (shared.match(/createSignedUrl\(/g) ?? []).length === 1, "Signed URLs generated only in getEvidenceUrl (on click), via the one shared signing helper");
    await page.goto(`${APP}/projects/${f.projectA}/actions`);
    rec(await wait(page.getByRole("button", { name: "+ New Action" })) && await wait(page.locator("tbody tr").first().getByTestId("evidence-button")), "Actions workspace: compact evidence entry per action");
    await page.screenshot({ path: path.join(OUT, "desktop-actions.png") });
    rec(await noHOverflow(page), "Desktop: Actions workspace no overflow");
    await page.goto(`${FIND}/${f.fNC}`);
    await page.screenshot({ path: path.join(OUT, "desktop-finding.png"), fullPage: true });
    rec(await noHOverflow(page), "Desktop: Finding Detail no overflow");
    await page.getByTestId("evidence-section-finding").getByRole("button", { name: "Add Evidence" }).click();
    const upBox = await page.getByTestId("evidence-uploader").boundingBox();
    rec(upBox.height < 160, `Desktop: compact uploader (${Math.round(upBox.height)}px, no giant drop zone)`);
    await page.getByRole("button", { name: "Close Finding" }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="close-panel"]')?.textContent?.includes("Checking whether"), null, { timeout: 15000 });
    const t = flat(await page.getByTestId("close-panel").innerText());
    rec(/Cannot close this Finding/.test(t) && /1 Corrective Action is still open./.test(t) && !/evidence/i.test(t), "Closure rules unaffected by evidence (open action still blocks; evidence plays no part)");
    await page.goto(`${APP}/projects/${f.projectA}/verification`);
    rec(await wait(page.getByRole("link", { name: "Import Excel" })), "Regression: Verification workspace");
    await page.goto(`${APP}/projects/${f.projectA}/verification/import`);
    rec(await wait(page.getByRole("heading", { name: "Import Verification Items" })), "Regression: Excel import");
    await page.goto(FIND);
    rec(await wait(page.getByRole("link", { name: "P4E-ACCEPT-NC evidence" })), "Regression: Findings list");
    await page.goto(`${APP}/projects/${f.projectA}/plan`);
    rec(await wait(page.getByText("P4E-ACCEPT-Site Assessment").first()), "Regression: Master Plan");
    await page.goto(`${APP}/projects/${f.projectA}`);
    rec(await wait(page.getByRole("heading", { name: "P4E-ACCEPT-Project-A", level: 1 })), "Regression: Project Overview");
    await page.goto(`${APP}/frameworks`);
    rec(await wait(page.getByText("ISO 14001").first()), "Regression: Framework Library");
    const n0 = dbQuery(`select count(*) n from issues where project_id='${f.projectA}'`)[0].n;
    await page.goto(ACT);
    const pc = page.locator("div.rounded-lg", { hasText: "P4E-ACCEPT-Q-m390" }).last();
    await pc.getByRole("button", { name: "Verify" }).click();
    await dlg(page).getByRole("button", { name: "Issue Identified", exact: true }).click();
    await dlg(page).getByRole("button", { name: "Save" }).click();
    await gone(dlg(page));
    rec(await waitDb(() => dbQuery(`select result from verification_items where id='${f.vM390}'`)[0].result === "issue_identified") && dbQuery(`select count(*) n from issues where project_id='${f.projectA}'`)[0].n === n0, "Regression: Issue Identified alone creates 0 Findings");
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
