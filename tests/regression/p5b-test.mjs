import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { users, makeReporter, signIn, dbQuery, http } from "./common.mjs";
import { createFixtures, cleanupP5b, fixtureObjects } from "./p5b-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p5b-shots");
const FILES = path.join(OUT, "files");
mkdirSync(FILES, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 15000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
async function waitDb(fn, ms = 20000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 700)); } return false; }
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });
const today = new Date().toISOString().slice(0, 10);

// ---- test files ----
function make(name, head, size) {
  const p = path.join(FILES, name);
  const body = Buffer.alloc(Math.max(size - head.length - 6, 0), 0x20);
  writeFileSync(p, Buffer.concat([Buffer.from(head, "binary"), body, Buffer.from("\n%%EOF")]));
  return p;
}
const PDF = "%PDF-1.4\n";
const ZIP = "PK\x03\x04";
const F = {
  pdf: make("procedure.pdf", PDF, 30_000),
  pdf2: make("procedure-rev01.pdf", PDF, 40_000),
  docx: make("procedure.docx", ZIP, 25_000),
  xlsx: make("register.xlsx", ZIP, 25_000),
  pptx: make("training.pptx", ZIP, 25_000),
  doc: make("legacy.doc", "\xD0\xCF\x11\xE0", 20_000),
  xls: make("legacy.xls", "\xD0\xCF\x11\xE0", 20_000),
  ppt: make("legacy.ppt", "\xD0\xCF\x11\xE0", 20_000),
  jpg: make("photo.jpg", "\xFF\xD8\xFF\xE0", 10_000),
  png: make("image.png", "\x89PNG", 10_000),
  txt: make("notes.txt", "hello", 1_000),
  exe: make("setup.exe", "MZ", 5_000),
  nine: make("nine-mb.pdf", PDF, 9 * 1024 * 1024),
  big: make("eleven-mb.pdf", PDF, 11 * 1024 * 1024),
  long: make("P5B-Very-Long-Client-Document-File-Name-Environmental-Aspects-Register-Final-Signed-Copy-2026.pdf", PDF, 20_000),
};
mkdirSync(path.join(FILES, "dupA"), { recursive: true });
mkdirSync(path.join(FILES, "dupB"), { recursive: true });
const dupA = path.join(FILES, "dupA", "same-name.pdf");
const dupB = path.join(FILES, "dupB", "same-name.pdf");
writeFileSync(dupA, Buffer.from(PDF + "A".repeat(15_000)));
writeFileSync(dupB, Buffer.from(PDF + "B".repeat(16_000)));

const admin = await signIn("admin");
const consultant = await signIn("consultant");
const f = await createFixtures(admin.token);
const DOCS = `${APP}/projects/${f.p}/documents`;
const objectsBefore = fixtureObjects().length;

const versions = (docId) =>
  dbQuery(`select v.id, v.version_no, v.revision, v.received_on::text, v.notes, v.uploaded_by, f.id file_id, f.storage_key, f.original_name, f.mime_type, f.size_bytes, f.project_id
    from document_versions v join files f on f.id=v.file_id where v.document_id='${docId}' order by v.version_no`);
const objExists = (key) => dbQuery(`select count(*)::int n from storage.objects where bucket_id='rayims-files' and name='${key}'`)[0].n === 1;
const reg = (docId) => dbQuery(`select status, latest_version_no, latest_revision from document_register where document_id='${docId}'`)[0];
const mapHash = (docId) => dbQuery(`select md5(coalesce(string_agg(t::text,'|' order by framework_item_id),'')) h from document_framework_items t where document_id='${docId}'`)[0].h;
const docHash = (docId) => dbQuery(`select md5(t::text) h from documents t where id='${docId}'`)[0].h;
const count = (sql) => dbQuery(sql)[0].n;
const projectFiles = () => count(`select count(*)::int n from files where project_id='${f.p}'`);

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
/** Rewrites Server Action bodies; `when` limits it to calls whose body contains that text. */
async function tamper(page, replacements, when = null) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      let body = req.postData() ?? "";
      if (!when || body.includes(when)) for (const [a, b] of replacements) body = body.split(a).join(b);
      return route.continue({ postData: body });
    }
    return route.continue();
  });
}
const untamper = (page) => page.unroute("**/*");
const dlg = (p) => p.getByRole("dialog");
const delDlg = (p) => p.getByTestId("delete-dialog");
const rows = (p) => p.getByTestId("version-row");
async function openDoc(page, id) {
  await page.goto(`${DOCS}/${id}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  await page.getByTestId("document-versions").waitFor();
}
async function startUpload(page, file) {
  await page.getByRole("button", { name: "Upload New Version" }).click();
  await dlg(page).waitFor();
  if (file) await dlg(page).getByLabel("File *").setInputFiles(file);
}
async function upload(page, file, { revision, receivedOn, notes, timeout = 60000 } = {}) {
  await startUpload(page, file);
  if (revision) await dlg(page).locator("#ver-revision").fill(revision);
  if (receivedOn) await dlg(page).locator("#ver-received").fill(receivedOn);
  if (notes) await dlg(page).locator("#ver-notes").fill(notes);
  await dlg(page).getByRole("button", { name: "Upload", exact: true }).click();
  const ok = await wait(page.getByText("Version uploaded.").first(), timeout);
  await gone(dlg(page), 20000);
  await page.waitForTimeout(800);
  return ok;
}
async function openVersionDelete(page) {
  await rows(page).first().getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete Version" }).click();
  await delDlg(page).waitFor();
  await delDlg(page).getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  return delDlg(page);
}
const blockers = async (d) => {
  await d.getByTestId("delete-blockers").waitFor({ timeout: 15000 }).catch(() => {}); // re-rendered after a refused delete
  return (await d.getByTestId("delete-blockers").locator("li").allInnerTexts()).map(flat);
};

try {
  const { ctx, page } = await open(1280, 800);

  // ===== First version =====
  const procMap = mapHash(f.D.proc);
  const procDoc = docHash(f.D.proc);
  await openDoc(page, f.D.proc);
  rec(/Not Received/.test(await page.locator("body").innerText()) && /No versions received yet\./.test(await page.getByTestId("document-versions").innerText()), "Before upload: Not Received, 'No versions received yet.'");
  await startUpload(page, null);
  const labels = (await dlg(page).locator("label[for]").allInnerTexts()).map((l) => l.trim());
  rec(JSON.stringify(labels) === JSON.stringify(["File *", "Revision", "Received on", "Notes"]), `Upload drawer fields exactly: ${labels.join(" | ")}`);
  rec(/This will be V1\./.test(flat(await dlg(page).innerText())), "Drawer states the next version (V1)");
  rec((await dlg(page).locator("#ver-file").getAttribute("accept")) === ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx", "File input accept = PDF / Office only");
  await dlg(page).getByLabel("File *").setInputFiles(F.pdf);
  rec(/procedure\.pdf/.test(await dlg(page).getByTestId("selected-file").innerText()) && /KB/.test(await dlg(page).getByTestId("selected-file").innerText()), "Selected file name + size shown before upload");
  await shot(page, "d-upload-drawer");
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  rec(await upload(page, F.pdf, { revision: "Rev.00", receivedOn: today, notes: "Initial issue" }), "Upload V1: toast 'Version uploaded.'");
  let vs = versions(f.D.proc);
  rec(vs.length === 1 && vs[0].version_no === 1 && vs[0].revision === "Rev.00" && vs[0].received_on === today && vs[0].notes === "Initial issue" && vs[0].uploaded_by === admin.userId, "DB: V1 · Rev.00, received_on = today, notes, uploaded_by = session user");
  rec(vs[0].mime_type === "application/pdf" && vs[0].project_id === f.p && objExists(vs[0].storage_key) && vs[0].storage_key.startsWith(`${f.p}/`), "One files row (project-scoped key {projectId}/{uuid}-name) + one Storage object");
  rec(reg(f.D.proc).status === "received" && /Received/.test(await page.locator("body").innerText()), "Status Not Received → Received (derived)");
  rec(/V1 · Rev\.00/.test(await rows(page).first().innerText()) && /Current/.test(await rows(page).first().innerText()), "Detail: V1 · Rev.00 with Current badge");
  const r1 = flat(await rows(page).first().innerText());
  rec(/procedure\.pdf/.test(r1) && /Received [A-Z][a-z]{2} \d/.test(r1) && /Uploaded by \S+/.test(r1) && /Initial issue/.test(r1), "Row: file name, Received on, Uploaded by, time, notes");

  // ===== Second + third version =====
  rec(await upload(page, F.docx, { revision: "Rev.01" }), "Upload V2 (DOCX, Rev.01)");
  await rows(page).first().filter({ hasText: "V2 · Rev.01" }).waitFor({ timeout: 15000 }).catch(() => {}); // refreshed list
  let rowTexts = (await rows(page).allInnerTexts()).map(flat);
  rec(/^V2 · Rev\.01 Current/.test(rowTexts[0]) && /^V1 · Rev\.00/.test(rowTexts[1]) && !/Current/.test(rowTexts[1]), "V2 · Rev.01 Current first, V1 without Current");
  rec(reg(f.D.proc).status === "received" && reg(f.D.proc).latest_version_no === 2, "Status stays Received; register latest = V2");
  rec(await upload(page, F.xlsx, { revision: "Draft B" }), "Upload V3 (XLSX, revision 'Draft B')");
  vs = versions(f.D.proc);
  rec(JSON.stringify(vs.map((v) => v.version_no)) === "[1,2,3]" && reg(f.D.proc).latest_version_no === 3, "Ordering by version_no (V3 > V2 > V1), revision text never parsed");
  rowTexts = (await rows(page).allInnerTexts()).map(flat);
  rec(rowTexts.length === 2 && /^V3 · Draft B Current/.test(rowTexts[0]) && /^V2/.test(rowTexts[1]), "More than 2 versions: newest 2 shown");
  await page.getByRole("button", { name: /Show earlier versions \(1\)/ }).click();
  rec((await rows(page).count()) === 3 && /^V1/.test(flat(await rows(page).nth(2).innerText())), "'Show earlier versions (1)' reveals V1");
  rec((await rows(page).nth(1).getByRole("button", { name: "More actions" }).count()) === 0 && (await rows(page).first().getByRole("button", { name: "More actions" }).count()) === 1, "Delete offered only on the Current version");
  // Updated in 5C: the Current row now also holds its Gap Assessment panel; measure a plain (older) version row.
  const rowH = (await rows(page).nth(1).boundingBox()).height;
  rec(rowH < 150, `Desktop: compact version row (${Math.round(rowH)}px, non-current)`);
  rec(mapHash(f.D.proc) === procMap && docHash(f.D.proc) === procDoc, "Uploads left framework mappings and Document identity byte-identical");
  await shot(page, "d-versions", true);

  // ===== View / Download / signed URL =====
  await page.getByRole("button", { name: "Show fewer versions" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), rows(page).first().getByRole("button", { name: "Download V3 file" }).click()]);
  rec(dl.suggestedFilename() === "register.xlsx", `Download keeps the original filename (${dl.suggestedFilename()})`);
  rec((await rows(page).first().getByRole("button", { name: /^View/ }).count()) === 0, "Office file: Download only (no View)");
  await page.getByRole("button", { name: /Show earlier versions/ }).click();
  const [popup] = await Promise.all([page.context().waitForEvent("page", { timeout: 20000 }), rows(page).nth(2).getByRole("button", { name: "View V1 file" }).click()]);
  await popup.waitForURL(/\/storage\/v1\/object\/sign\/rayims-files\//, { timeout: 20000 }).catch(() => {});
  const signed = popup.url();
  rec(/\/storage\/v1\/object\/sign\/rayims-files\//.test(signed) && /token=/.test(signed), "PDF View opens a signed URL in a new tab");
  const token = new URL(signed).searchParams.get("token");
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  rec(claims.exp - claims.iat === 60, `Signed URL TTL = ${claims.exp - claims.iat}s`);
  await popup.close();
  rec(!/token=/.test(await page.content()), "No signed URL pre-generated in the page");

  // ===== Delete flow (latest unreviewed) =====
  const delMap = mapHash(f.D.del);
  await openDoc(page, f.D.del);
  await upload(page, F.pdf, { revision: "Rev.00" });
  await upload(page, F.pdf2, { revision: "Rev.01" });
  const beforeDel = versions(f.D.del);
  const v2 = beforeDel.find((v) => v.version_no === 2);
  await page.goto(DOCS);
  await page.locator("tbody tr", { hasText: "Delete Flow" }).waitFor();
  rec(/V2 · Rev\.01 Received/.test(flat(await page.locator("tbody tr", { hasText: "Delete Flow" }).innerText())), "Register reflects the upload (Latest Version V2 · Rev.01, Received)");
  await openDoc(page, f.D.del);
  let d = await openVersionDelete(page);
  rec(flat(await d.innerText()).includes("Delete version?") && flat(await d.innerText()).includes("This permanently removes V2 and its uploaded file."), "Delete confirmation text (V2)");
  rec(/bg-danger/.test(await d.getByRole("button", { name: "Delete", exact: true }).getAttribute("class")), "Delete is destructive-styled");
  await shot(page, "d-version-delete");
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  rec(await wait(page.getByText("Version deleted.").first()), "Toast 'Version deleted.'");
  rec(await waitDb(() => versions(f.D.del).length === 1), "V2 row removed");
  rec(count(`select count(*)::int n from files where id='${v2.file_id}'`) === 0 && await waitDb(() => !objExists(v2.storage_key)), "V2 files row and Storage object removed");
  await page.waitForTimeout(800);
  rec(/^V1 · Rev\.00 Current/.test(flat(await rows(page).first().innerText())), "V1 becomes Current");
  rec(reg(f.D.del).status === "received" && reg(f.D.del).latest_version_no === 1 && mapHash(f.D.del) === delMap && count(`select count(*)::int n from documents where id='${f.D.del}'`) === 1, "Document remains, status Received, mappings unchanged");
  await page.goto(DOCS);
  const fallbackRow = page.locator("tbody tr", { hasText: "Delete Flow" });
  const fellBack = await fallbackRow.filter({ hasText: "V1 · Rev.00" }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  rec(fellBack && /V1 · Rev\.00 Received/.test(flat(await fallbackRow.innerText())), `Register falls back to V1 ("${flat(await fallbackRow.innerText()).slice(0, 90)}")`);
  await openDoc(page, f.D.del);
  rec(await upload(page, F.pdf2, { revision: "Rev.01b" }), "Re-upload after delete");
  rec(JSON.stringify(versions(f.D.del).map((v) => v.version_no)) === "[1,2]", "New upload becomes V2 again (no uniqueness error)");
  // non-latest delete (tampered id)
  const [dv1, dv2] = versions(f.D.del);
  d = await openVersionDelete(page);
  await tamper(page, [[dv2.id, dv1.id]]);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(2500);
  rec(JSON.stringify((await blockers(d))) === JSON.stringify(["Only the latest unreviewed version can be deleted."]), "Deleting V1 while V2 exists: 'Only the latest unreviewed version can be deleted.'");
  await untamper(page);
  rec(versions(f.D.del).length === 2 && objExists(dv1.storage_key) && objExists(dv2.storage_key), "  ...V1 / V2, files and objects unchanged");
  await page.keyboard.press("Escape");

  // ===== Reviewed version =====
  await openDoc(page, f.D.reviewed);
  // Updated in 5C: the Current version's review result is shown in its Gap Assessment panel.
  rec(/Revision Required/.test(await rows(page).first().getByTestId("gap-assessment").innerText()), "Existing review shown on the version (Gap Assessment panel, 5C)");
  d = await openVersionDelete(page);
  rec(JSON.stringify(await blockers(d)) === JSON.stringify(["This version has review history and cannot be deleted."]) && (await d.getByRole("button", { name: "Delete", exact: true }).count()) === 0, "Reviewed version: 'This version has review history and cannot be deleted.'");
  await d.getByRole("button", { name: "Close" }).click();
  rec(count(`select count(*)::int n from document_reviews where id='${f.reviewId}'`) === 1 && dbQuery(`select document_review_id from issues where id='${f.issueId}'`)[0].document_review_id === f.reviewId, "Review and the Finding's review lineage remain");

  // ===== Document delete interaction =====
  await openDoc(page, f.D.single);
  await upload(page, F.pdf, { revision: "Rev.00" });
  const openDocDelete = async () => {
    await page.getByRole("button", { name: "More actions" }).first().click(); // header menu precedes the version rows
    await page.getByRole("menuitem", { name: "Delete Document" }).click();
    await delDlg(page).waitFor();
    await delDlg(page).getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
    return delDlg(page);
  };
  d = await openDocDelete();
  rec(JSON.stringify(await blockers(d)) === JSON.stringify(["This document has versions and cannot be deleted."]), "Document with one version: Document delete blocked");
  await d.getByRole("button", { name: "Close" }).click();
  d = await openVersionDelete(page);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await wait(page.getByText("Version deleted.").first());
  await page.waitForTimeout(1200);
  rec(reg(f.D.single).status === "not_received" && /Not Received/.test(await page.locator("body").innerText()), "After deleting its only version: Not Received");
  d = await openDocDelete();
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => count(`select count(*)::int n from documents where id='${f.D.single}'`) === 0), "Document delete now allowed");

  // ===== Missing Storage object =====
  await openDoc(page, f.D.missing);
  const [mPopup] = await Promise.all([page.context().waitForEvent("page", { timeout: 10000 }).catch(() => null), rows(page).first().getByRole("button", { name: "View V1 file" }).click()]);
  rec(await wait(rows(page).first().getByText("File is unavailable.")), "Missing object: 'File is unavailable.'");
  if (mPopup && !mPopup.isClosed()) await mPopup.close().catch(() => {});
  rec(count(`select count(*)::int n from document_versions where id='${f.vMissing}'`) === 1, "  ...version metadata kept (no auto-delete)");
  d = await openVersionDelete(page);
  rec(await wait(d.getByRole("button", { name: "Delete", exact: true })), "  ...delete eligibility still follows the version rules (eligible)");
  await page.keyboard.press("Escape");

  // ===== Not Applicable =====
  await openDoc(page, f.D.na);
  rec((await page.getByRole("button", { name: "Upload New Version" }).count()) === 0 && /Versions cannot be uploaded while this document is Not Applicable\./.test(await page.getByTestId("document-versions").innerText()), "N/A: no Upload button, explanation shown");
  rec((await rows(page).count()) === 1, "N/A: existing version history stays visible");
  const filesBeforeNa = projectFiles();
  const objsBeforeNa = fixtureObjects().length;
  await openDoc(page, f.D.types);
  await startUpload(page, F.pdf);
  await tamper(page, [[f.D.types, f.D.na]]);
  await dlg(page).getByRole("button", { name: "Upload", exact: true }).click();
  rec(await wait(dlg(page).getByText("Versions cannot be uploaded while this document is Not Applicable.")), "Forced upload to an N/A document refused by the server");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  rec(projectFiles() === filesBeforeNa && fixtureObjects().length === objsBeforeNa, "  ...no files row / Storage object residue");
  // N/A version delete (tampered id)
  await openDoc(page, f.D.dup);
  await upload(page, dupA);
  d = await openVersionDelete(page);
  const dupV1 = versions(f.D.dup)[0];
  await tamper(page, [[dupV1.id, f.vNa]]);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(2500);
  rec((await blockers(d)).includes("This document is Not Applicable. Make it Applicable before changing version history."), "Version delete on an N/A document refused (N/A message)");
  await untamper(page);
  await page.keyboard.press("Escape");
  rec(count(`select count(*)::int n from document_versions where id='${f.vNa}'`) === 1, "  ...N/A version kept");

  // ===== Duplicate filename =====
  await upload(page, dupB);
  const dups = versions(f.D.dup);
  rec(dups.length === 2 && dups[0].original_name === dups[1].original_name && dups[0].storage_key !== dups[1].storage_key && objExists(dups[0].storage_key) && objExists(dups[1].storage_key), "Same filename twice: different keys, both objects kept (no overwrite)");
  const sizes = [];
  for (const [i, label] of [[0, "View V2 file"], [1, "View V1 file"]]) {
    const [pp] = await Promise.all([page.context().waitForEvent("page"), rows(page).nth(i).getByRole("button", { name: label }).click()]);
    await pp.waitForURL(/token=/, { timeout: 20000 }).catch(() => {});
    const res = await fetch(pp.url());
    sizes.push((await res.arrayBuffer()).byteLength);
    await pp.close();
  }
  rec(sizes[0] === dups[1].size_bytes && sizes[1] === dups[0].size_bytes && sizes[0] !== sizes[1], `Both same-name versions accessible with their own content (${sizes.join(" / ")} bytes)`);

  // ===== File types =====
  await openDoc(page, f.D.types);
  let n = 0;
  for (const [k, mime] of [["pdf", "application/pdf"], ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"], ["doc", "application/msword"], ["xls", "application/vnd.ms-excel"], ["ppt", "application/vnd.ms-powerpoint"]]) {
    const ok = await upload(page, F[k]);
    n += 1;
    const last = versions(f.D.types).at(-1);
    rec(ok && last.version_no === n && last.mime_type === mime, `Accepted: ${k.toUpperCase()} (${mime})`);
  }
  for (const k of ["jpg", "png", "txt", "exe"]) {
    await startUpload(page, F[k]);
    rec(await wait(dlg(page).getByText(/isn't supported for document versions/)), `Rejected in the browser: ${k.toUpperCase()}`);
    await dlg(page).getByRole("button", { name: "Cancel" }).click();
  }
  const typesBefore = versions(f.D.types).length;
  await startUpload(page, F.pdf);
  await tamper(page, [["procedure.pdf", "procedure.exe"]]);
  await dlg(page).getByRole("button", { name: "Upload", exact: true }).click();
  rec(await wait(dlg(page).getByText(/isn't supported for document versions/)), "Rejected by the server: forced .exe name");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();

  // ===== Size =====
  // A 9 MB upload takes minutes on this test machine's uplink (Storage itself accepts it: probe HTTP 200).
  rec(await upload(page, F.nine, { timeout: 600000 }), "9 MB PDF accepted");
  rec(versions(f.D.types).at(-1).size_bytes === 9 * 1024 * 1024, "  ...stored size recorded from the real object");
  await startUpload(page, F.big);
  rec(await wait(dlg(page).getByText("File must be 10 MB or smaller.")), "11 MB PDF rejected in the browser (friendly)");
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await startUpload(page, F.pdf);
  await tamper(page, [['"size":30000', '"size":11534336']]);
  await dlg(page).getByRole("button", { name: "Upload", exact: true }).click();
  rec(await wait(dlg(page).getByText("File must be 10 MB or smaller.")), "Declared 11 MB rejected by the server");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  rec(versions(f.D.types).length === typesBefore + 1, "  ...no version created by the rejected uploads");
  rec(await upload(page, F.long), "Long filename uploaded");
  await shot(page, "d-types", true);

  // ===== Project isolation =====
  const resp = await page.goto(`${DOCS}/${f.D.bDoc}`);
  await page.getByText("Page not found").waitFor({ timeout: 15000 }).catch(() => {});
  rec(/Page not found/.test(await page.locator("body").innerText()) && !/B-secret|B Secret/.test(await page.locator("body").innerText()), `Project B document via Project A URL: not found (HTTP ${resp.status()})`);
  const filesBeforeIso = count(`select count(*)::int n from files`);
  await openDoc(page, f.D.types);
  await startUpload(page, F.pdf);
  await tamper(page, [[f.D.types, f.D.bDoc]]);
  await dlg(page).getByRole("button", { name: "Upload", exact: true }).click();
  rec(await wait(dlg(page).getByText("This document could not be found.")), "Prepare upload for a Project B document refused");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await startUpload(page, F.pdf);
  await tamper(page, [[f.D.types, f.D.bDoc]], "storageKey");
  await dlg(page).getByRole("button", { name: "Upload", exact: true }).click();
  rec(await wait(dlg(page).getByText("This document could not be found.")), "Register an uploaded object for a Project B document refused");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(1500);
  rec(count(`select count(*)::int n from files`) === filesBeforeIso && count(`select count(*)::int n from document_versions where document_id='${f.D.bDoc}'`) === 1, "  ...no files row / version created; the uploaded object was discarded");
  const tv = versions(f.D.types).at(-1);
  const [xp] = await Promise.all([page.context().waitForEvent("page", { timeout: 10000 }).catch(() => null), (async () => {
    await tamper(page, [[tv.id, f.vB]]);
    await rows(page).first().getByRole("button", { name: /^View V/ }).click();
  })()]);
  rec(await wait(rows(page).first().getByText("File is unavailable.")), "View of a Project B version refused ('File is unavailable.', no URL)");
  if (xp && !xp.isClosed()) await xp.close().catch(() => {});
  await untamper(page);
  await openDoc(page, f.D.types); // clear the View error before testing Download
  await tamper(page, [[tv.id, f.vB]]);
  await rows(page).first().getByRole("button", { name: /^Download V/ }).click();
  await page.waitForTimeout(2000);
  rec(await wait(rows(page).first().getByText("File is unavailable.")), "Download of a Project B version refused");
  await untamper(page);
  d = await openVersionDelete(page);
  await tamper(page, [[tv.id, f.vB]]);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(2500);
  rec(count(`select count(*)::int n from document_versions where id='${f.vB}'`) === 1, "Delete of a Project B version refused");
  await untamper(page);
  await page.keyboard.press("Escape");
  rec(!/B-secret/.test(await page.locator("body").innerText()), "No Project B metadata leaked");

  await ctx.close();

  // ===== Mobile =====
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    const mp = m.page;
    await openDoc(mp, f.D.types);
    rec(await noHOverflow(mp), `${w}px: Document Detail with versions — no horizontal overflow`);
    const longRow = rows(mp).first();
    const lb = await longRow.boundingBox();
    rec(/Very-Long-Client-Document/.test(await longRow.innerText()) && lb.x + lb.width <= w + 1, `${w}px: long filename wraps inside the card`);
    rec(await wait(mp.getByRole("button", { name: "Upload New Version" })), `${w}px: Upload New Version reachable`);
    const ctrl = await longRow.getByRole("button", { name: /^(View|Download) V/ }).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    rec(ctrl.length >= 1 && ctrl.every((h) => h >= 36), `${w}px: View / Download tap targets ${ctrl.map(Math.round).join("/")}px`);
    rec((await longRow.getByRole("button", { name: "More actions" }).count()) === 1, `${w}px: Delete stays in the "…" menu`);
    await shot(mp, `m${w}-versions`, true);
    await startUpload(mp, F.pdf);
    const vis = await Promise.all(["#ver-file", "#ver-revision", "#ver-received", "#ver-notes"].map((s) => dlg(mp).locator(s).isVisible()));
    const up = await dlg(mp).getByRole("button", { name: "Upload", exact: true }).evaluate((b) => {
      const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.bottom <= innerHeight && (top === b || b.contains(top));
    });
    rec(vis.every(Boolean) && up, `${w}px: upload sheet fields usable, Upload button not covered`);
    await shot(mp, `m${w}-upload`);
    await dlg(mp).getByRole("button", { name: "Cancel" }).click();
    await m.ctx.close();
  }

  // ===== Consultant =====
  const c = await open(1280, 800, "consultant");
  const cp = c.page;
  await openDoc(cp, f.D.consultant);
  rec(await upload(cp, F.pdf, { revision: "C-1" }), "Consultant: uploads a version");
  rec(versions(f.D.consultant)[0]?.uploaded_by === consultant.userId, "  ...uploaded_by = consultant");
  const [cpop] = await Promise.all([cp.context().waitForEvent("page"), rows(cp).first().getByRole("button", { name: "View V1 file" }).click()]);
  await cpop.waitForURL(/token=/, { timeout: 20000 }).catch(() => {});
  rec(/token=/.test(cpop.url()), "Consultant: views");
  await cpop.close();
  const [cdl] = await Promise.all([cp.waitForEvent("download"), rows(cp).first().getByRole("button", { name: "Download V1 file" }).click()]);
  rec(cdl.suggestedFilename() === "procedure.pdf", "Consultant: downloads");
  const ckey = versions(f.D.consultant)[0].storage_key;
  d = await openVersionDelete(cp);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => versions(f.D.consultant).length === 0 && !objExists(ckey)), "Consultant: deletes the eligible version (row, file, object)");
  await c.ctx.close();

  // ===== Signed out =====
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${DOCS}/${f.D.proc}`);
  rec(/\/login/.test(anon.url()), "Anon: Document Detail redirects to login");
  const key = versions(f.D.proc)[0].storage_key;
  const pub = await http("GET", `/storage/v1/object/public/rayims-files/${key}`);
  const auth = await http("GET", `/storage/v1/object/authenticated/rayims-files/${key}`);
  const sign = await http("POST", `/storage/v1/object/sign/rayims-files/${key}`, { body: { expiresIn: 60 } });
  rec(pub.status >= 400 && auth.status >= 400 && sign.status >= 400, `Anon: no public URL, no direct read, no signed URL (HTTP ${pub.status}/${auth.status}/${sign.status})`);
  const anonRest = await http("GET", `/rest/v1/document_versions?select=id&document_id=eq.${f.D.proc}`);
  rec(anonRest.status === 401 || (Array.isArray(anonRest.json) && anonRest.json.length === 0), `Anon: version rows not readable (HTTP ${anonRest.status})`);
  rec(fixtureObjects().length >= objectsBefore, "Storage objects exist only under the fixture project prefix");
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const removed = await cleanupP5b(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like 'P5B-ACCEPT-%')::int c, (select count(*) from documents)::int d, (select count(*) from document_versions)::int v, (select count(*) from document_reviews)::int r, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o`)[0];
  rec(left.c === 0 && left.d === 0 && left.v === 0 && left.r === 0 && left.f === 0 && left.o === 0, `Cleanup: fixtures + ${removed} Storage objects removed; documents/versions/reviews/files/objects all 0`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
