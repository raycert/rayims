// Phase 7B acceptance: Document -> Version and Version -> Review RESTRICT, one open Gap Assessment per Version,
// deterministic latest review, race behaviour. Fixtures: P7B-ACCEPT- only. Needs a production build on
// 127.0.0.1:3105 (see tests/README.md).
//
// How the races are produced (no sequential faking of concurrency):
//  * Deterministic interleaving: the test plays both parties with REAL separate HTTP requests to the hosted
//    database - T1's check (a read), then T2's competing insert, then T1's delete - i.e. exactly the window the
//    application leaves between its check and its delete.
//  * Overlapping stress: N iterations fire the competing insert and the delete AT THE SAME TIME (Promise.all),
//    and the invariants are asserted whatever order the database serialized them in.
//  * Through the real application: server actions captured from the UI are replayed concurrently (12 starts of
//    a Gap Assessment on one Version; delete actions against inserts with a random 0-30 ms offset).
import { chromium } from "playwright-core";
import { randomUUID } from "node:crypto";
import { users, makeReporter, signIn, dbQuery, http } from "./common.mjs";
import { createP7b, cleanupP7b, putObject } from "./p7b-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const R = makeReporter();
const rec = (ok, name, detail = "") => { R.rec(ok, name, detail); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " :: " + detail : ""}`); };
const info = (m) => console.log(`INFO  ${m}`);
const wait = (l, t = 20000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 20000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const one = (sql) => dbQuery(sql)[0];
const count = (sql) => one(sql).n;
const objExists = (key) => count(`select count(*)::int n from storage.objects where bucket_id='rayims-files' and name='${key}'`) === 1;
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const admin = await signIn("admin");
const consultant = await signIn("consultant");
const tok = admin.token;
const rest = (method, p, body, prefer) => http(method, `/rest/v1/${p}`, { token: tok, body, headers: prefer ? { prefer } : {} });
const restGet = async (p) => (await rest("GET", p)).json;

await cleanupP7b(tok);
const t0 = Date.now();
const f = await createP7b(tok);
info(`fixtures ${Math.round((Date.now() - t0) / 1000)} s`);
const P = `${APP}/projects/${f.pP}`;
const rn = async (p) => (await restGet(p)).length;
const docStateR = async (d) => ({ d: await rn(`documents?id=eq.${d}&select=id`), v: await rn(`document_versions?document_id=eq.${d}&select=id`) });
const docState = (d) => one(`select (select count(*)::int from documents where id='${d}') d, (select count(*)::int from document_versions where document_id='${d}') v`);

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const caps = [];
async function open(who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "Asia/Ho_Chi_Minh", locale: "en-US" });
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
const dlg = (p) => p.locator("[role=dialog], [role=alertdialog]");
const rows = (p) => p.getByTestId("version-row");

// ================= 1. Constraint facts (hosted) =================
{
  const fk = dbQuery(`select conname, confdeltype d from pg_constraint where contype='f' and confrelid in ('public.documents'::regclass,'public.document_versions'::regclass) order by 1`);
  const byName = Object.fromEntries(fk.map((r) => [r.conname, r.d]));
  rec(byName.document_versions_document_id_fkey === "r" && byName.document_reviews_document_version_id_fkey === "r" && byName.document_framework_items_document_id_fkey === "c", "Hosted: Document -> Version and Version -> Review are RESTRICT; the mapping FK still cascades");
  const idx = dbQuery(`select indexdef from pg_indexes where indexname='document_reviews_one_open_per_version_idx'`);
  rec(idx.length === 1 && /UNIQUE/.test(idx[0].indexdef) && /status = 'under_review'/.test(idx[0].indexdef), "Hosted: the partial unique index for one open review exists");
  const v = one(`select pg_get_viewdef('public.document_register'::regclass, true) v, (select reloptions from pg_class where oid='public.document_register'::regclass) o`);
  rec(/r\.created_at DESC, r\.id DESC/.test(v.v) && JSON.stringify(v.o) === JSON.stringify(["security_invoker=true"]), "Hosted: document_register orders by created_at DESC, id DESC and keeps security_invoker");
}

// ================= 2. Document delete =================
{
  const { ctx, page } = await open("admin");
  // normal: no Versions (with a mapping)
  await page.goto(`${P}/documents/${f.dNoVersion}`);
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Delete Document" }).click();
  const d1 = dlg(page);
  await d1.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForURL("**/documents", { timeout: 25000 }).catch(() => {});
  const s1 = one(`select (select count(*)::int from documents where id='${f.dNoVersion}') d, (select count(*)::int from document_framework_items where document_id='${f.dNoVersion}') m`);
  rec(s1.d === 0 && s1.m === 0, "Document delete (no Versions, with a requirement mapping): deleted, mapping removed (as before)");
  // blocked: has a Version (the application check)
  await page.goto(`${P}/documents/${f.dWithVersion}`);
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Delete Document" }).click();
  const d2 = dlg(page);
  await d2.waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  rec(/This document has versions and cannot be deleted\./.test(flat(await d2.innerText())) && (await d2.getByRole("button", { name: "Delete", exact: true }).count()) === 0, "Document delete (has a Version): blocked by the application with the usual message, no Delete button");
  await d2.getByRole("button", { name: "Close" }).click();
  rec((await docState(f.dWithVersion)).d === 1 && (await docState(f.dWithVersion)).v === 1 && objExists(f.vWithVersion.key) && count(`select count(*)::int n from files where id='${f.vWithVersion.file}'`) === 1, "Document delete blocked: Document, Version, file row and Storage object all intact");
  await ctx.close();
}

// ================= 3. Version delete (UI) =================
{
  const { ctx, page } = await open("admin");
  const del = async (docId, versionHint) => {
    await page.goto(`${P}/documents/${docId}`);
    const row = versionHint ? rows(page).filter({ hasText: versionHint }).first() : rows(page).first();
    await row.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete Version" }).click();
    await dlg(page).waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    return dlg(page);
  };
  // normal: latest unreviewed Version
  const d1 = await del(f.dVerFree);
  await d1.getByRole("button", { name: "Delete", exact: true }).click();
  await gone(dlg(page));
  await page.waitForTimeout(1500);
  rec(count(`select count(*)::int n from document_versions where id='${f.vFree.v}'`) === 0 && count(`select count(*)::int n from files where id='${f.vFree.file}'`) === 0 && !objExists(f.vFree.key), "Version delete (latest, unreviewed): Version row, file row and Storage object are all removed");
  // blocked: concluded review, open review, non-latest
  for (const [label, docId, hint, v, re] of [
    ["concluded review", f.dVerConcluded, null, f.vConcluded, /review history/],
    ["open review", f.dVerOpen, null, f.vOpen, /review history/],
  ]) {
    const d = await del(docId, hint);
    const txt = flat(await d.innerText());
    const noBtn = (await d.getByRole("button", { name: "Delete", exact: true }).count()) === 0;
    await d.getByRole("button", { name: "Close" }).click();
    rec(re.test(txt) && noBtn && count(`select count(*)::int n from document_versions where id='${v.v}'`) === 1 && count(`select count(*)::int n from files where id='${v.file}'`) === 1 && objExists(v.key), `Version delete blocked (${label}): usual message, Version, file row and Storage object intact`);
  }
  rec(count(`select count(*)::int n from document_reviews where id in ('${f.rConcluded}','${f.rOpen}')`) === 2, "Blocked deletes left both reviews in place");
  await ctx.close();
}

// ================= 4. Deterministic race: Document delete =================
{
  const sharedFile = f.vStartRest.file;
  const ev0 = count(`select count(*)::int n from files`);
  // T1: the application's check - the Document has no Version
  const check = await restGet(`document_versions?document_id=eq.${f.dRaceDoc}&select=id`);
  // T2: another consultant uploads a Version in the meantime
  const ins = await rest("POST", "document_versions", { document_id: f.dRaceDoc, version_no: 1, file_id: sharedFile, revision: "Rev.RACE" }, "return=representation");
  // T1: the delete the application would now issue
  const del = await rest("DELETE", `documents?id=eq.${f.dRaceDoc}&project_id=eq.${f.pP}`, undefined, "return=representation");
  const s = await docState(f.dRaceDoc);
  rec(check.length === 0 && ins.status === 201, "Document race: the check saw no Version, then a competing Version was inserted");
  rec(del.status === 409 && ["23001", "23503"].includes(del.json?.code), `Document race: the stale delete is refused by the database (HTTP ${del.status}, SQLSTATE ${del.json?.code} - RESTRICT surfaces as a foreign-key violation)`);
  rec(s.d === 1 && s.v === 1 && objExists(f.vStartRest.key) && count(`select count(*)::int n from files where id='${sharedFile}'`) === 1 && count(`select count(*)::int n from files`) === ev0, "Document race: the Document and the new Version survive; no file row or Storage object is lost or orphaned");
}

// ================= 5. Deterministic race: Version delete (with Review Evidence) =================
{
  const check = await restGet(`document_reviews?document_version_id=eq.${f.vRaceVer.v}&select=id`);
  const rv = await rest("POST", "document_reviews", { document_version_id: f.vRaceVer.v, status: "under_review" }, "return=representation");
  const reviewId = rv.json?.[0]?.id;
  const evKey = await putObject(tok, f.pP, "evidence.pdf");
  const evFile = (await rest("POST", "files", { project_id: f.pP, storage_key: evKey, original_name: "evidence.pdf", mime_type: "application/pdf", size_bytes: 26 }, "return=representation")).json?.[0]?.id;
  const att = await rest("POST", "attachments", { project_id: f.pP, file_id: evFile, document_review_id: reviewId, caption: "race evidence" }, "return=representation");
  const del = await rest("DELETE", `document_versions?id=eq.${f.vRaceVer.v}&document_id=eq.${f.dRaceVer}`, undefined, "return=representation");
  rec(check.length === 0 && rv.status === 201 && att.status === 201, "Version race: the check saw no review, then a Gap Assessment with Evidence was added");
  rec(del.status === 409 && ["23001", "23503"].includes(del.json?.code), `Version race: the stale delete is refused by the database (HTTP ${del.status}, SQLSTATE ${del.json?.code} - RESTRICT surfaces as a foreign-key violation)`);
  rec(count(`select count(*)::int n from document_versions where id='${f.vRaceVer.v}'`) === 1 && count(`select count(*)::int n from document_reviews where id='${reviewId}'`) === 1 && count(`select count(*)::int n from attachments where id='${att.json?.[0]?.id}'`) === 1 && count(`select count(*)::int n from files where id in ('${evFile}','${f.vRaceVer.file}')`) === 2 && objExists(evKey) && objExists(f.vRaceVer.key), "Version race: Version, Review, Review Evidence attachment, both file rows and both Storage objects survive");
}

// ================= 6. Overlapping stress (Promise.all) =================
{
  const sharedFile = f.vStartRest.file;
  const N = 12;
  const outcomes1 = { insertWon: 0, deleteWon: 0, bad: 0 };
  for (let i = 0; i < N; i += 1) {
    const d = (await rest("POST", "documents", { project_id: f.pP, title: `P7B-ACCEPT-stress doc ${i}` }, "return=representation")).json[0].id;
    const [ins, del] = await Promise.all([
      rest("POST", "document_versions", { document_id: d, version_no: 1, file_id: sharedFile }, "return=representation"),
      rest("DELETE", `documents?id=eq.${d}`, undefined, "return=representation"),
    ]);
    const s = await docStateR(d);
    const insertOk = ins.status === 201;
    const deleteOk = del.status === 200 && Array.isArray(del.json) && del.json.length === 1;
    if (insertOk && s.d === 1 && s.v === 1 && !deleteOk) outcomes1.insertWon += 1;
    else if (!insertOk && deleteOk && s.d === 0 && s.v === 0) outcomes1.deleteWon += 1;
    else outcomes1.bad += 1;
  }
  rec(outcomes1.bad === 0, `Stress Document delete vs Version insert x${N}: no Version was ever lost (Version won ${outcomes1.insertWon}, delete won ${outcomes1.deleteWon}, inconsistent ${outcomes1.bad})`);
  const outcomes2 = { reviewWon: 0, deleteWon: 0, bad: 0 };
  for (let i = 0; i < N; i += 1) {
    const d = (await rest("POST", "documents", { project_id: f.pP, title: `P7B-ACCEPT-stress ver ${i}` }, "return=representation")).json[0].id;
    const v = (await rest("POST", "document_versions", { document_id: d, version_no: 1, file_id: sharedFile }, "return=representation")).json[0].id;
    const [rv, del] = await Promise.all([
      rest("POST", "document_reviews", { document_version_id: v, status: "under_review" }, "return=representation"),
      rest("DELETE", `document_versions?id=eq.${v}`, undefined, "return=representation"),
    ]);
    const vExists = await rn(`document_versions?id=eq.${v}&select=id`);
    const rExists = await rn(`document_reviews?document_version_id=eq.${v}&select=id`);
    const reviewOk = rv.status === 201;
    const deleteOk = del.status === 200 && Array.isArray(del.json) && del.json.length === 1;
    if (reviewOk && vExists === 1 && rExists === 1 && !deleteOk) outcomes2.reviewWon += 1;
    else if (!reviewOk && deleteOk && vExists === 0 && rExists === 0) outcomes2.deleteWon += 1;
    else outcomes2.bad += 1;
  }
  rec(outcomes2.bad === 0, `Stress Version delete vs Gap Assessment start x${N}: no Review was ever lost (Review won ${outcomes2.reviewWon}, delete won ${outcomes2.deleteWon}, inconsistent ${outcomes2.bad})`);
}

// ================= 7. One open Gap Assessment per Version =================
{
  // (a) database level: 12 simultaneous inserts
  const results = await Promise.all(Array.from({ length: 12 }, () => rest("POST", "document_reviews", { document_version_id: f.vStartRest.v, status: "under_review" }, "return=representation")));
  const created = results.filter((r) => r.status === 201).length;
  const conflicts = results.filter((r) => r.status === 409 && r.json?.code === "23505").length;
  rec(created === 1 && conflicts === 11 && count(`select count(*)::int n from document_reviews where document_version_id='${f.vStartRest.v}' and status='under_review'`) === 1, `Database: 12 simultaneous open-review inserts on one Version -> exactly 1 created, 11 refused (23505) (statuses ${results.map((r) => r.status).join(",")})`);
  const again = await rest("POST", "document_reviews", { document_version_id: f.vStartRest.v, status: "under_review" });
  rec(again.status === 409 && again.json?.code === "23505", "Database: a later second open review of the same Version is refused");
  const concl = await rest("POST", "document_reviews", { document_version_id: f.vStartRest.v, status: "accepted", reviewed_at: new Date().toISOString() }, "return=representation");
  const concl2 = await rest("POST", "document_reviews", { document_version_id: f.vStartRest.v, status: "revision_required", reviewed_at: new Date().toISOString() }, "return=representation");
  rec(concl.status === 201 && concl2.status === 201, "Database: concluded reviews are not restricted (history can hold several)");
  const mid = (await restGet(`document_reviews?document_version_id=eq.${f.vStartRest.v}&status=eq.under_review&select=id`))[0].id;
  await rest("PATCH", `document_reviews?id=eq.${mid}`, { status: "accepted", reviewed_at: new Date().toISOString() });
  const reopen = await rest("POST", "document_reviews", { document_version_id: f.vStartRest.v, status: "under_review" });
  rec(reopen.status === 201, "Database: once the open review is concluded, a new one can start");
  const dup = await rest("POST", "document_reviews", { document_version_id: f.vStartRest.v, status: "under_review" });
  rec(dup.status === 409, "Database: duplicate-open creation stays impossible (the precondition scenario is covered by the local migration test)");
}
const cap = {};
{
  // (b) through the application: capture the Start action as a Consultant, then replay it 12x at once
  const { ctx, page } = await open("consultant");
  caps.length = 0;
  await page.goto(`${P}/documents/${f.dStartCapture}`);
  const start = page.getByTestId("gap-assessment").getByRole("button", { name: "Start Gap Assessment" });
  const tStart = Date.now();
  await start.click();
  await wait(page.getByTestId("gap-assessment").getByRole("button", { name: "Complete Assessment" }));
  info(`Start Gap Assessment through the UI (click -> open panel): ${Date.now() - tStart} ms`);
  cap.start = caps[caps.length - 1];
  rec(count(`select count(*)::int n from document_reviews where document_version_id='${f.vStartCapture.v}'`) === 1 && count(`select count(*)::int n from document_reviews where document_version_id='${f.vStartCapture.v}' and status='under_review'`) === 1, "Normal start (Consultant): exactly one open Gap Assessment");
  const cookie = await cookieOf(ctx);
  const outs = await Promise.all(Array.from({ length: 12 }, () => replay(cap.start, [[f.vStartCapture.v, f.vStartApp.v]], cookie)));
  const okCount = outs.filter((o) => /"ok":true/.test(o.text)).length;
  const already = outs.filter((o) => /already open/i.test(o.text)).length;
  // A response is fine when HTTP 200 and it carries either the success flag or the "already open" message (the success
  // response also carries the refreshed page payload, so no keyword search for errors is meaningful).
  const bad = outs.filter((o) => o.status !== 200 || !(/"ok":true/.test(o.text) || /already open/i.test(o.text)));
  const openN = count(`select count(*)::int n from document_reviews where document_version_id='${f.vStartApp.v}' and status='under_review'`);
  const total = count(`select count(*)::int n from document_reviews where document_version_id='${f.vStartApp.v}'`);
  rec(okCount === 1 && already === 11 && bad.length === 0 && openN === 1 && total === 1, `Application: 12 simultaneous Start actions on one Version -> 1 started, ${already} told "already open", no 500 / raw error, DB has ${openN} open of ${total} reviews`);
  info(`Start replay responses: ${outs.map((o) => (/"ok":true/.test(o.text) ? "started" : /already open/i.test(o.text) ? "already-open" : "other:" + o.text.slice(0, 40))).join(", ")}`);
  // a second round on a fresh Version: 20 at once
  const dX = (await rest("POST", "documents", { project_id: f.pP, title: "P7B-ACCEPT-start round 2" }, "return=representation")).json[0].id;
  const vX = (await rest("POST", "document_versions", { document_id: dX, version_no: 1, file_id: f.vStartRest.file }, "return=representation")).json[0].id;
  const outs2 = await Promise.all(Array.from({ length: 20 }, () => replay(cap.start, [[f.vStartCapture.v, vX]], cookie)));
  const ok2 = outs2.filter((o) => /"ok":true/.test(o.text)).length;
  rec(ok2 === 1 && outs2.every((o) => o.status === 200) && count(`select count(*)::int n from document_reviews where document_version_id='${vX}'`) === 1, `Application: 20 simultaneous Start actions -> exactly one review row (${ok2} started)`);
  await ctx.close();
}

// ================= 8. Delete actions through the application =================
{
  const { ctx, page } = await open("admin");
  caps.length = 0;
  // capture deleteDocument: delete a Document without Versions through the UI
  await page.goto(`${P}/documents/${f.dCaptureDelete}`);
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Delete Document" }).click();
  await dlg(page).getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForURL("**/documents", { timeout: 25000 }).catch(() => {});
  cap.delDoc = caps[caps.length - 1];
  rec(!!cap.delDoc && (await docState(f.dCaptureDelete)).d === 0, "Captured the deleteDocument action (the UI delete succeeded)");
  // capture deleteDocumentVersion: delete a latest unreviewed Version through the UI
  await page.goto(`${P}/documents/${f.dCaptureVer}`);
  await rows(page).first().getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete Version" }).click();
  await dlg(page).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await dlg(page).getByRole("button", { name: "Delete", exact: true }).click();
  await gone(dlg(page));
  await page.waitForTimeout(1200);
  cap.delVer = caps[caps.length - 1];
  rec(!!cap.delVer && count(`select count(*)::int n from document_versions where id='${f.vCaptureVer.v}'`) === 0, "Captured the deleteDocumentVersion action (the UI delete succeeded)");
  const cookie = await cookieOf(ctx);

  // Real application vs. real competing insert, random 0-30 ms offset: classify what the app reports.
  const K = 30;
  const tally = { deleted: 0, raceMessage: 0, checkBlocked: 0, other: 0, bad: 0 };
  const sample = [];
  for (let i = 0; i < K; i += 1) {
    const d = (await rest("POST", "documents", { project_id: f.pP, title: `P7B-ACCEPT-app race ${i}` }, "return=representation")).json[0].id;
    const [a, ins] = await Promise.all([
      replay(cap.delDoc, [[f.dCaptureDelete, d]], cookie),
      new Promise((r) => setTimeout(r, Math.floor(Math.random() * 30))).then(() => rest("POST", "document_versions", { document_id: d, version_no: 1, file_id: f.vStartRest.file }, "return=representation")),
    ]);
    const s = await docStateR(d);
    const deleted = /"ok":true/.test(a.text);
    const msg = /can no longer be deleted because a version now exists/i.test(a.text);
    const blocked = /has versions and cannot be deleted/i.test(a.text);
    if (deleted) { tally.deleted += 1; if (!(s.d === 0 && ins.status !== 201)) tally.bad += 1; }
    else if (msg) { tally.raceMessage += 1; if (!(s.d === 1 && s.v === 1)) tally.bad += 1; }
    else if (blocked) { tally.checkBlocked += 1; if (!(s.d === 1 && s.v === 1)) tally.bad += 1; }
    else { tally.other += 1; sample.push(a.text.slice(0, 80)); tally.bad += 1; }
    if (a.status !== 200) tally.bad += 1;
  }
  rec(tally.bad === 0, `Application delete vs competing insert x${K}: never a lost Version or a raw error (deleted ${tally.deleted}, "can no longer be deleted" message ${tally.raceMessage}, blocked by the check ${tally.checkBlocked}, other ${tally.other}${sample.length ? " " + JSON.stringify(sample) : ""})`);
  info(`the race window inside the application was hit ${tally.raceMessage} time(s) in ${K} attempts`);

  // Version delete: application vs competing review start
  const tally2 = { deleted: 0, raceMessage: 0, checkBlocked: 0, other: 0, bad: 0 };
  for (let i = 0; i < K; i += 1) {
    const d = (await rest("POST", "documents", { project_id: f.pP, title: `P7B-ACCEPT-app ver race ${i}` }, "return=representation")).json[0].id;
    const v = (await rest("POST", "document_versions", { document_id: d, version_no: 1, file_id: f.vStartRest.file }, "return=representation")).json[0].id;
    const [a, rv] = await Promise.all([
      replay(cap.delVer, [[f.vCaptureVer.v, v]], cookie),
      new Promise((r) => setTimeout(r, Math.floor(Math.random() * 30))).then(() => rest("POST", "document_reviews", { document_version_id: v, status: "under_review" }, "return=representation")),
    ]);
    const vN = await rn(`document_versions?id=eq.${v}&select=id`);
    const rN = await rn(`document_reviews?document_version_id=eq.${v}&select=id`);
    const deleted = /"ok":true/.test(a.text);
    const msg = /can no longer be deleted because a gap assessment now exists/i.test(a.text);
    const blocked = /review history/i.test(a.text);
    if (deleted) { tally2.deleted += 1; if (!(vN === 0 && rN === 0 && rv.status !== 201)) tally2.bad += 1; }
    else if (msg || blocked) { (msg ? (tally2.raceMessage += 1) : (tally2.checkBlocked += 1)); if (!(vN === 1 && rN === 1)) tally2.bad += 1; }
    else { tally2.other += 1; tally2.bad += 1; }
  }
  rec(tally2.bad === 0, `Application Version delete vs competing Gap Assessment x${K}: never a lost Review or a raw error (deleted ${tally2.deleted}, "can no longer be deleted" message ${tally2.raceMessage}, blocked by the check ${tally2.checkBlocked}, other ${tally2.other})`);
  info(`the Version race window inside the application was hit ${tally2.raceMessage} time(s) in ${K} attempts`);

  // non-latest Version (the UI offers Delete on the current Version only): the action refuses it, nothing is removed
  const old = await replay(cap.delVer, [[f.vCaptureVer.v, f.vOld1.v]], cookie);
  rec(/Only the latest unreviewed version can be deleted/.test(old.text) && !/"ok":true/.test(old.text) && count(`select count(*)::int n from document_versions where document_id='${f.dVerOld}'`) === 2 && count(`select count(*)::int n from files where id='${f.vOld1.file}'`) === 1 && objExists(f.vOld1.key), "Version delete blocked (not the latest Version): usual message via the action; both Versions, file row and Storage object intact");

  // ---- security: cross-project tampering and signed-out replay
  const before = JSON.stringify([await docState(f.dWithVersion), await docState(f.dOther)]);
  const x1 = await replay(cap.delDoc, [[f.pP, f.pQ], [f.dCaptureDelete, f.dWithVersion]], cookie); // Project Q + a Document of Project P
  const x2 = await replay(cap.delDoc, [[f.dCaptureDelete, f.dOther]], cookie); // Project P + a Document of Project Q
  const x3 = await replay(cap.delVer, [[f.pP, f.pQ], [f.vCaptureVer.v, f.vWithVersion.v]], cookie);
  const generic = (t, re) => re.test(t) && !/has versions|version now exists|review history|Gap Assessment now exists/i.test(t);
  rec(generic(x1.text, /could not be found/i) && generic(x2.text, /could not be found/i) && generic(x3.text, /could not be found/i), `Cross-project tampering: delete actions answer "could not be found" — no hint that the Document / Version has a Version / review`);
  const anon = await replay(cap.delDoc, [[f.dCaptureDelete, f.dWithVersion]], null);
  const anonV = await replay(cap.delVer, [[f.vCaptureVer.v, f.vWithVersion.v]], null);
  rec(!/"ok":true/.test(anon.text + anonV.text) && JSON.stringify([await docState(f.dWithVersion), await docState(f.dOther)]) === before, `Signed out: the delete actions do nothing (HTTP ${anon.status} / ${anonV.status}); Documents and Versions unchanged`);
  const rAnon = await http("DELETE", `/rest/v1/documents?id=eq.${f.dWithVersion}`, {});
  rec(JSON.stringify(await docState(f.dWithVersion)) === JSON.stringify({ d: 1, v: 1 }) && !(rAnon.status >= 200 && rAnon.status < 300 && Array.isArray(rAnon.json) && rAnon.json.length > 0), `Signed out: REST delete of a Document is denied (HTTP ${rAnon.status})`);
  await ctx.close();
}

// ================= 9. Deterministic latest review + register statuses =================
{
  const reg = await restGet(`document_register?project_id=eq.${f.pP}&select=document_id,status,latest_review_id`);
  const st = (d) => reg.find((r) => r.document_id === d);
  rec(st(f.dTie)?.latest_review_id === f.rTieHigh && st(f.dTie)?.status === "revision_required", "Tie-break: two reviews with an identical created_at -> the higher id (…bb, Revision Required) is the register's latest review");
  const expected = [[f.sNA, "n_a"], [f.sNotReceived, "not_received"], [f.sReceived, "received"], [f.sUnder, "under_review"], [f.sRevision, "revision_required"], [f.sAccepted, "accepted"]];
  rec(expected.every(([d, s]) => st(d)?.status === s), "Register statuses unchanged: Not Applicable, Not Received, Received, Under Review, Revision Required, Accepted");
  const { ctx, page } = await open("consultant");
  await page.goto(`${P}/documents/${f.dTie}`);
  await page.getByTestId("gap-assessment").waitFor({ timeout: 30000 });
  const detail = flat(await page.locator("main").innerText());
  await page.goto(`${P}/documents`);
  await page.getByText("P7B-ACCEPT-Doc: review tie").first().waitFor({ timeout: 30000 });
  const list = flat(await page.locator("main").innerText());
  const rowOf = (t) => flat(list.split("P7B-ACCEPT-").find((x) => x.startsWith(t)) ?? "");
  rec(/Revision Required/.test(detail) && /Revision Required/.test(rowOf("Doc: review tie")), "Tie-break: the application (Document Detail and the register list) shows the same Revision Required status as the database view");
  rec(/Not Applicable/.test(rowOf("Status: not applicable")) && /Not Received/.test(rowOf("Status: not received")) && /Received/.test(rowOf("Status: received")) && /Under Review/.test(rowOf("Status: under review")) && /Revision Required/.test(rowOf("Status: revision required")) && /Accepted/.test(rowOf("Status: accepted")), "Register list in the application shows the six statuses");
  await ctx.close();
}

// ================= 10. Performance (after the migration) =================
{
  const open = [];
  const concluded = [];
  for (let i = 0; i < 10; i += 1) {
    const d = (await rest("POST", "documents", { project_id: f.pP, title: `P7B-ACCEPT-perf ${i}` }, "return=representation")).json[0].id;
    const v = (await rest("POST", "document_versions", { document_id: d, version_no: 1, file_id: f.vStartRest.file }, "return=representation")).json[0].id;
    const t1 = Date.now();
    await rest("POST", "document_reviews", { document_version_id: v, status: "under_review" });
    open.push(Date.now() - t1);
    const t2 = Date.now();
    await rest("POST", "document_reviews", { document_version_id: v, status: "accepted", reviewed_at: new Date().toISOString() });
    concluded.push(Date.now() - t2);
  }
  info(`Review insert median: open (covered by the partial unique index) ${median(open)} ms vs concluded (not covered) ${median(concluded)} ms (n=10 each, hosted REST)`);
  rec(median(open) < median(concluded) * 3 + 200, "Performance: starting an open review is not materially slower than inserting a concluded one (the partial index adds no visible cost)");
}

// ================= 11. Cleanup =================
await browser.close();
await cleanupP7b(tok);
const left = one(`select (select count(*) from clients where name like 'P7B-ACCEPT-%')::int c, (select count(*) from projects where name like 'P7B-ACCEPT-%')::int p, (select count(*) from documents)::int d, (select count(*) from document_versions)::int v, (select count(*) from document_reviews)::int r, (select count(*) from issues)::int i, (select count(*) from actions)::int a, (select count(*) from attachments)::int at, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o`);
rec(Object.values(left).every((n) => n === 0), `Fixtures removed; documents / versions / reviews / findings / verification / actions / attachments / files / Storage objects all 0 (${JSON.stringify(left)})`);
const failed = R.done();
process.exit(failed ? 1 : 0);
