import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { users, makeReporter, signIn, dbQuery, http } from "./common.mjs";
import { createFixtures, cleanupP5c } from "./p5c-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p5c-shots");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 15000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
async function waitDb(fn, ms = 20000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 700)); } return false; }
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });
const PDF1 = path.join(OUT, "procedure-rev00.pdf");
const PDF2 = path.join(OUT, "procedure-rev01.pdf");
writeFileSync(PDF1, Buffer.from("%PDF-1.4\n" + " ".repeat(20000) + "\n%%EOF"));
writeFileSync(PDF2, Buffer.from("%PDF-1.4\n" + "x".repeat(22000) + "\n%%EOF"));

const admin = await signIn("admin");
const consultant = await signIn("consultant");
const f = await createFixtures(admin.token);
const DOCS = `${APP}/projects/${f.p}/documents`;

const reviewsOf = (versionId) =>
  dbQuery(`select id, status, notes, reviewer_id, reviewed_at::text, created_at::text from document_reviews where document_version_id='${versionId}' order by created_at desc, id desc`);
const reviewHash = (id) => dbQuery(`select md5(t::text) h from document_reviews t where id='${id}'`)[0].h;
const versionsOf = (docId) => dbQuery(`select id, version_no from document_versions where document_id='${docId}' order by version_no`);
const status = (docId) => dbQuery(`select status from document_register where document_id='${docId}'`)[0].status;
const count = (sql) => dbQuery(sql)[0].n;
const issuesAndVis = () => count(`select ((select count(*) from issues) + (select count(*) from verification_items where document_review_id is not null))::int n`);

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function open(width, height, who = "admin") {
  const ctx = await browser.newContext({ viewport: { width, height } });
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
const rows = (p) => p.getByTestId("version-row");
async function openDoc(page, id) {
  await page.goto(`${DOCS}/${id}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  await page.getByTestId("document-versions").waitFor();
}
async function upload(page, file, revision) {
  await page.getByRole("button", { name: "Upload New Version" }).click();
  await dlg(page).getByLabel("File *").setInputFiles(file);
  await dlg(page).locator("#ver-revision").fill(revision);
  await dlg(page).getByRole("button", { name: "Upload", exact: true }).click();
  const ok = await wait(page.getByText("Version uploaded.").first(), 120000);
  await gone(dlg(page), 20000);
  await rows(page).first().filter({ hasText: revision }).waitFor({ timeout: 15000 }).catch(() => {});
  return ok;
}
async function waitPanel(page, text) {
  return panel(page).filter({ hasText: text }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
}
async function completeWith(page, result, comments) {
  await panel(page).getByRole("button", { name: "Complete Assessment" }).click();
  await dlg(page).waitFor();
  if (comments !== undefined) await dlg(page).locator("#ga-comments").fill(comments);
  if (result) await dlg(page).getByRole("button", { name: result, exact: true }).click();
  await dlg(page).getByRole("button", { name: "Complete", exact: true }).click();
}
const badgeTone = async (loc) => (await loc.getAttribute("class")).match(/bg-(primary\/10|warning-soft|success-soft|neutral-soft|danger-soft)/)?.[1];

try {
  const { ctx, page } = await open(1280, 800);
  const iv0 = issuesAndVis();

  // ===== Register: statuses, tones, Last Review =====
  await page.goto(DOCS);
  await page.locator("tbody tr").first().waitFor({ timeout: 20000 });
  const expect = {
    "Status Not Received": ["Not Received", "neutral-soft"],
    "Status Received": ["Received", "primary/10"],
    "Status Under Review": ["Under Review", "primary/10"],
    "Status Revision Required": ["Revision Required", "warning-soft"],
    "Status Accepted": ["Accepted", "success-soft"],
    "Status Not Applicable": ["Not Applicable", "neutral-soft"],
  };
  for (const [title, [label, tone]] of Object.entries(expect)) {
    const badge = page.locator("tbody tr", { hasText: title }).locator("td").nth(4).locator("span").first();
    rec((await badge.innerText()).trim() === label && (await badgeTone(badge)) === tone, `Register: ${label} (${await badgeTone(badge)})`);
  }
  const lastCell = async (title) => (await page.locator("tbody tr", { hasText: title }).locator("td").nth(5).innerText()).trim();
  // The app shows the UTC date of reviewed_at (same convention as the rest of the register).
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000 + 60000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  rec((await lastCell("Last Review With Open")) === threeDaysAgo, `Last Review with an open assessment on top = latest CONCLUDED date (${await lastCell("Last Review With Open")})`);
  rec((await lastCell("Status Under Review")) === "—" && (await lastCell("Status Received")) === "—", "Last Review '—' when no assessment is concluded (open only / none)");
  rec(/[A-Z][a-z]{2} \d{1,2}, \d{4}/.test(await lastCell("Status Accepted")), "Last Review shows the conclusion date");
  rec(!/Content acceptable|Scope section incomplete/.test(await page.locator("body").innerText()), "Register shows no Review Comments");
  await shot(page, "d-register");

  // ===== No version / not received =====
  await openDoc(page, f.D.noVersion);
  rec((await panel(page).count()) === 0 && (await page.getByRole("button", { name: /Gap Assessment/ }).count()) === 0, "No version: no Gap Assessment can start");

  // ===== Start =====
  await openDoc(page, f.D.flow);
  rec(await upload(page, PDF1, "Rev.00"), "Upload V1 (5B flow)");
  const v1 = versionsOf(f.D.flow)[0].id;
  rec(await waitPanel(page, "Not started") && /Assessed against ISO 9001 6\.1, ISO 9001 7\.5/.test(flat(await panel(page).innerText())), "Current version: 'Not started' + mapped requirements as context");
  rec(/files received for this document, each assessed separately/.test(await page.getByTestId("document-versions").innerText()), "Versions header explains Document vs received files");
  await panel(page).getByRole("button", { name: "Start Gap Assessment" }).click();
  rec(await wait(page.getByText("Gap Assessment started.").first()), "Start Gap Assessment: toast");
  rec(await waitDb(() => reviewsOf(v1).length === 1), "One review row created");
  let rv = reviewsOf(v1);
  rec(rv[0].status === "under_review" && rv[0].reviewer_id === admin.userId && rv[0].reviewed_at === null && rv[0].notes === null, "DB: under_review, reviewer = user, reviewed_at NULL, notes NULL");
  rec(status(f.D.flow) === "under_review", "Derived status: Under Review");
  await waitPanel(page, "Under Review");
  const urBadge = panel(page).locator("span", { hasText: /^Under Review$/ });
  rec((await badgeTone(urBadge)) === "primary/10", "Under Review badge is informational (blue)");
  rec((await panel(page).getByRole("button", { name: "Start Gap Assessment" }).count()) === 0 && await wait(panel(page).getByRole("button", { name: "Edit Assessment" })) && await wait(panel(page).getByRole("button", { name: "Complete Assessment" })), "Open assessment: Edit + Complete, no Start");
  await shot(page, "d-under-review");

  // forced second open review
  await openDoc(page, f.D.received);
  await tamper(page, [[f.V.received, v1]]);
  await panel(page).getByRole("button", { name: "Start Gap Assessment" }).click();
  rec(await wait(panel(page).getByText("A Gap Assessment is already open for this version.")), "Forced second open assessment rejected");
  await untamper(page);
  rec(reviewsOf(v1).length === 1 && reviewsOf(f.V.received).length === 0, "  ...still one review; nothing created on the other version");

  // version delete blocked by the open review
  await openDoc(page, f.D.flow);
  await rows(page).first().getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete Version" }).click();
  const dd = page.getByTestId("delete-dialog");
  await dd.getByTestId("delete-blockers").waitFor({ timeout: 15000 }).catch(() => {});
  rec(/This version has review history and cannot be deleted\./.test(await dd.innerText()), "Version with an Under Review assessment cannot be deleted");
  await dd.getByRole("button", { name: "Close" }).click();

  // ===== Edit =====
  await panel(page).getByRole("button", { name: "Edit Assessment" }).click();
  await dlg(page).waitFor();
  rec(/Assessed against ISO 9001/.test(flat(await dlg(page).innerText())) && (await dlg(page).getByRole("button", { name: "Accepted" }).count()) === 0, "Edit drawer: Review Comments only, requirements shown as context");
  await dlg(page).locator("#ga-comments").fill("  Initial read-through in progress.  ");
  await dlg(page).getByRole("button", { name: "Save" }).click();
  rec(await wait(page.getByText("Assessment updated.").first()), "Edit: toast");
  await waitDb(() => reviewsOf(v1)[0].notes === "Initial read-through in progress.");
  rv = reviewsOf(v1);
  rec(rv.length === 1 && rv[0].status === "under_review" && rv[0].notes === "Initial read-through in progress.", "Same review, still Under Review, comments trimmed and saved");

  // ===== Complete: Revision Required =====
  await panel(page).getByRole("button", { name: "Complete Assessment" }).click();
  await dlg(page).getByRole("button", { name: "Complete", exact: true }).click();
  rec(await wait(dlg(page).getByText("Choose Revision Required or Accepted.")), "Complete without a result: required (no default)");
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await completeWith(page, "Revision Required", "Responsibilities and document retention period need to be updated.");
  rec(await wait(page.getByText("Assessment completed.").first()), "Complete: toast");
  await waitDb(() => reviewsOf(v1)[0].status === "revision_required");
  rv = reviewsOf(v1);
  rec(rv[0].status === "revision_required" && rv[0].reviewed_at !== null && rv[0].reviewer_id === admin.userId && rv[0].notes === "Responsibilities and document retention period need to be updated.", "DB: revision_required, reviewed_at set, reviewer = concluding user");
  rec(status(f.D.flow) === "revision_required", "Derived status: Revision Required");
  await waitPanel(page, "Revision Required");
  const pt = flat(await panel(page).innerText());
  rec((await badgeTone(panel(page).locator("span", { hasText: /^Revision Required$/ }))) === "warning-soft" && /Upload a new Version if the document content is revised\./.test(pt), "Revision Required: amber + next-step hint");
  rec(/Reviewed by \S+/.test(pt) && /Responsibilities and document retention period/.test(pt), "Shows comments and Reviewed by / at");
  rec((await panel(page).getByRole("button", { name: /Edit Assessment|Complete Assessment/ }).count()) === 0 && await wait(panel(page).getByRole("button", { name: "Start New Assessment" })), "Concluded: no Edit / Complete; Start New Assessment offered");
  rec(issuesAndVis() === iv0, "Revision Required created no Finding and no Verification item");
  await shot(page, "d-revision-required");

  // forced edit / complete of the concluded review
  const concludedId = rv[0].id;
  const beforeHash = reviewHash(concludedId);
  await openDoc(page, f.D.under);
  await panel(page).getByRole("button", { name: "Edit Assessment" }).click();
  await dlg(page).locator("#ga-comments").fill("tampered");
  await tamper(page, [[f.R.under, concludedId]]);
  await dlg(page).getByRole("button", { name: "Save" }).click();
  rec(await wait(dlg(page).getByText(/completed and can no longer be changed/)), "Forced edit of a concluded assessment rejected");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await panel(page).getByRole("button", { name: "Complete Assessment" }).click();
  await dlg(page).getByRole("button", { name: "Accepted", exact: true }).click();
  await tamper(page, [[f.R.under, concludedId]]);
  await dlg(page).getByRole("button", { name: "Complete", exact: true }).click();
  rec(await wait(dlg(page).getByText(/completed and can no longer be changed/)), "Forced re-completion of a concluded assessment rejected");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  rec(reviewHash(concludedId) === beforeHash && reviewsOf(f.V.under)[0].status === "under_review", "  ...concluded review byte-identical; the open one untouched");

  // ===== New Version → Received =====
  await openDoc(page, f.D.flow);
  rec(await upload(page, PDF2, "Rev.01"), "Upload V2 after Revision Required");
  const v2 = versionsOf(f.D.flow)[1].id;
  rec(status(f.D.flow) === "received", "Derived status: Received (new version, no review)");
  await waitPanel(page, "Not started");
  rec(/^V2 · Rev\.01 Current/.test(flat(await rows(page).first().innerText())) && /Not started/.test(await panel(page).innerText()), "V2 Current, its assessment not started (old result not carried forward)");
  const v1row = rows(page).nth(1);
  rec(/Revision Required/.test(await v1row.innerText()) && (await v1row.getByTestId("gap-assessment").count()) === 0, "V1 keeps its final result, read-only (no assessment controls)");
  await v1row.getByRole("button", { name: /Assessment history \(1\)/ }).click();
  const entry = flat(await v1row.getByTestId("assessment-entry").first().innerText());
  rec(/Revision Required/.test(entry) && /Responsibilities and document retention period/.test(entry) && /Reviewed by \S+/.test(entry) && /started/.test(entry), "V1 Assessment history: status, comments, reviewer, started / reviewed");

  // older version forced start
  await tamper(page, [[v2, v1]]);
  await panel(page).getByRole("button", { name: "Start Gap Assessment" }).click();
  rec(await wait(panel(page).getByText("This version is no longer current. Review the current version instead.")), "Forced start on the older version rejected");
  await untamper(page);
  rec(reviewsOf(v1).length === 1 && reviewsOf(v2).length === 0, "  ...no review created");

  // ===== Accepted =====
  await openDoc(page, f.D.flow);
  await panel(page).getByRole("button", { name: "Start Gap Assessment" }).click();
  await waitPanel(page, "Under Review");
  await completeWith(page, "Accepted", "Content acceptable after revision.");
  await waitDb(() => reviewsOf(v2)[0]?.status === "accepted");
  rec(status(f.D.flow) === "accepted", "Derived status: Accepted");
  await waitPanel(page, "Accepted");
  rec((await badgeTone(panel(page).locator("span", { hasText: /^Accepted$/ }))) === "success-soft" && /Accepted for this assessment\./.test(await panel(page).innerText()) && !/Approved/.test(await page.locator("body").innerText()), "Accepted: green, 'Accepted for this assessment.', never 'Approved'");
  await shot(page, "d-accepted", true);

  // ===== Multiple reviews on the same version =====
  await panel(page).getByRole("button", { name: "Start New Assessment" }).click();
  await waitPanel(page, "Under Review");
  await completeWith(page, "Revision Required", "Signature block still missing.");
  await waitDb(() => reviewsOf(v2)[0]?.status === "revision_required");
  rv = reviewsOf(v2);
  rec(rv.length === 2 && rv[1].status === "accepted" && rv[0].status === "revision_required", "Same version: Accepted then Revision Required — both kept");
  rec(status(f.D.flow) === "revision_required", "Derived status follows the latest review (Revision Required)");
  await waitPanel(page, "Revision Required");
  await rows(page).first().getByRole("button", { name: /Earlier assessments \(1\)/ }).click();
  rec(/Accepted/.test(await rows(page).first().getByTestId("assessment-history").innerText()), "Earlier assessments list the previous Accepted entry");
  await rows(page).first().getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete Version" }).click();
  await dd.getByTestId("delete-blockers").waitFor({ timeout: 15000 }).catch(() => {});
  rec(/review history/.test(await dd.innerText()), "Version with concluded assessments still cannot be deleted");
  await dd.getByRole("button", { name: "Close" }).click();
  rec(versionsOf(f.D.flow).length === 2 && count(`select count(*)::int n from files where project_id='${f.p}' and original_name like 'procedure-rev0%'`) === 2, "Assessments never changed the version files");

  // ===== N/A =====
  await openDoc(page, f.D.na);
  rec(/Accepted/.test(await panel(page).innerText()) && /Accepted before the document became N\/A/.test(await panel(page).innerText()), "N/A: existing assessment visible");
  rec((await panel(page).getByRole("button").count()) === 0 && /Gap Assessments cannot start while this document is Not Applicable\./.test(await panel(page).innerText()), "N/A: no Start, explanation shown");
  await openDoc(page, f.D.received);
  await tamper(page, [[f.V.received, f.V.na]]);
  await panel(page).getByRole("button", { name: "Start Gap Assessment" }).click();
  rec(await wait(panel(page).getByText("Gap Assessments cannot start while this document is Not Applicable.")), "Forced start on an N/A document rejected");
  await untamper(page);
  rec(reviewsOf(f.V.na).length === 1, "  ...no review created");

  // ===== Project isolation =====
  const bHash = reviewHash(f.R.b);
  await openDoc(page, f.D.received);
  await tamper(page, [[f.V.received, f.V.b]]);
  await panel(page).getByRole("button", { name: "Start Gap Assessment" }).click();
  rec(await wait(panel(page).getByText("This version could not be found.")), "Start on a Project B version refused");
  await untamper(page);
  await openDoc(page, f.D.under);
  await panel(page).getByRole("button", { name: "Edit Assessment" }).click();
  await tamper(page, [[f.R.under, f.R.b]]);
  await dlg(page).getByRole("button", { name: "Save" }).click();
  rec(await wait(dlg(page).getByText("This assessment could not be found.")), "Edit of a Project B assessment refused");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await panel(page).getByRole("button", { name: "Complete Assessment" }).click();
  await dlg(page).getByRole("button", { name: "Accepted", exact: true }).click();
  await tamper(page, [[f.R.under, f.R.b]]);
  await dlg(page).getByRole("button", { name: "Complete", exact: true }).click();
  rec(await wait(dlg(page).getByText("This assessment could not be found.")), "Completion of a Project B assessment refused");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  rec(reviewHash(f.R.b) === bHash && reviewsOf(f.V.b).length === 1, "  ...Project B review unchanged, nothing created");
  const resp = await page.goto(`${DOCS}/${f.D.bDoc}`);
  await page.getByText("Page not found").waitFor({ timeout: 15000 }).catch(() => {});
  rec(/Page not found/.test(await page.locator("body").innerText()) && !/B secret review comment|B Secret/.test(await page.locator("body").innerText()), `Project B document via Project A: not found, nothing leaked (HTTP ${resp.status()})`);
  await ctx.close();

  // ===== Consultant (reviewer = concluding user) =====
  const c = await open(1280, 800, "consultant");
  await openDoc(c.page, f.D.under);
  await completeWith(c.page, "Accepted", "Accepted by the consultant.");
  rec(await waitDb(() => reviewsOf(f.V.under)[0].status === "accepted"), "Consultant completes an assessment started by the admin");
  rec(reviewsOf(f.V.under)[0].reviewer_id === consultant.userId, "  ...reviewer_id becomes the concluding user (consultant)");
  await c.page.waitForTimeout(1000);
  await c.page.reload();
  await panel(c.page).getByRole("button", { name: "Start New Assessment" }).click();
  rec(await waitDb(() => reviewsOf(f.V.under).length === 2 && reviewsOf(f.V.under)[0].reviewer_id === consultant.userId), "Consultant starts a new assessment");
  await c.ctx.close();

  // ===== Mobile =====
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    const mp = m.page;
    await openDoc(mp, f.D.flow);
    const expectComment = w === 390 ? "Signature block still missing" : "Completed on the 390px phone";
    rec(await noHOverflow(mp) && /Revision Required/.test(await panel(mp).innerText()) && (await panel(mp).innerText()).includes(expectComment), `${w}px: status and comments readable, no overflow`);
    await panel(mp).getByRole("button", { name: "Start New Assessment" }).click();
    await panel(mp).filter({ hasText: "Under Review" }).waitFor({ timeout: 15000 }).catch(() => {});
    await panel(mp).getByRole("button", { name: "Complete Assessment" }).click();
    await dlg(mp).waitFor();
    const ok = await dlg(mp).getByRole("button", { name: "Complete", exact: true }).evaluate((b) => {
      const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.bottom <= innerHeight && (top === b || b.contains(top));
    });
    const btnH = await dlg(mp).getByRole("button", { name: "Accepted", exact: true }).evaluate((b) => b.getBoundingClientRect().height);
    rec(ok && btnH >= 40 && await dlg(mp).locator("#ga-comments").isVisible(), `${w}px: Complete sheet usable (result ${Math.round(btnH)}px, comments, Complete not covered)`);
    await shot(mp, `m${w}-complete`);
    await dlg(mp).locator("#ga-comments").fill(`Completed on the ${w}px phone.`);
    await dlg(mp).getByRole("button", { name: "Revision Required", exact: true }).click();
    await dlg(mp).getByRole("button", { name: "Complete", exact: true }).click();
    await gone(dlg(mp));
    await mp.waitForTimeout(1200);
    rec(await noHOverflow(mp), `${w}px: completed on mobile, no overflow`);
    await shot(mp, `m${w}-detail`, true);
    await m.ctx.close();
  }
  rec(reviewsOf(v2).length === 4 && reviewsOf(v2).every((r) => r.status !== "under_review"), "Mobile completions stored (4 concluded reviews on V2)");

  // ===== Signed out =====
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${DOCS}/${f.D.flow}`);
  rec(/\/login/.test(anon.url()), "Anon: redirected to login");
  const anonRest = await http("GET", `/rest/v1/document_reviews?select=id,notes&document_version_id=eq.${v2}`);
  rec(anonRest.status === 401 || (Array.isArray(anonRest.json) && anonRest.json.length === 0), `Anon: reviews not readable (HTTP ${anonRest.status})`);
  rec(issuesAndVis() === iv0, "No Finding / Verification item created by any assessment");
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const removed = await cleanupP5c(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like 'P5C-ACCEPT-%')::int c, (select count(*) from documents)::int d, (select count(*) from document_versions)::int v, (select count(*) from document_reviews)::int r, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o`)[0];
  rec(left.c === 0 && left.d === 0 && left.v === 0 && left.r === 0 && left.f === 0 && left.o === 0, `Cleanup: fixtures + ${removed} Storage objects removed; all document tables / files / objects 0`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
