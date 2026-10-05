import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { users, makeReporter, signIn, dbQuery, http } from "./common.mjs";
import { createFixtures, cleanupP5d } from "./p5d-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p5d-shots");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 15000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
async function waitDb(fn, ms = 20000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 700)); } return false; }
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });

const admin = await signIn("admin");
const consultant = await signIn("consultant");
const f = await createFixtures(admin.token);
const P = `${APP}/projects/${f.p}`;
const DOCS = `${P}/documents`;

const findingsOf = (reviewId) => dbQuery(`select * from issues where document_review_id='${reviewId}' order by created_at`);
const checksOf = (reviewId) => dbQuery(`select * from verification_items where document_review_id='${reviewId}' order by created_at`);
const reviewHash = (id) => dbQuery(`select md5(t::text) h from document_reviews t where id='${id}'`)[0].h;
const status = (docId) => dbQuery(`select status from document_register where document_id='${docId}'`)[0].status;
const count = (sql) => dbQuery(sql)[0].n;
const projectIssues = () => count(`select count(*)::int n from issues where project_id='${f.p}'`);

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
const followUp = (p) => panel(p).getByTestId("review-follow-up");
async function openDoc(page, id) {
  await page.goto(`${DOCS}/${id}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  await panel(page).first().waitFor({ timeout: 20000 });
}
async function openFindingForm(page) {
  await followUp(page).getByRole("button", { name: /^(Create Finding|Add another Finding)$/ }).click();
  await dlg(page).waitFor();
}
async function openCheckForm(page) {
  await followUp(page).getByRole("button", { name: "Add to Verification" }).click();
  await dlg(page).waitFor();
}
async function saveFinding(page, { type, title, site }) {
  const d = dlg(page);
  await d.getByRole("button", { name: type, exact: true }).click();
  await d.locator("#fd-title").fill(title);
  if (site) {
    await d.getByRole("button", { name: "Specific site" }).click();
    await d.locator("#fd-site").selectOption({ label: site });
  }
  await d.getByRole("button", { name: "Create", exact: true }).click();
}
async function saveCheck(page, { question, activity }) {
  const d = dlg(page);
  await d.locator("#vi-question").fill(question);
  if (activity) await d.locator("#vi-target-activity").selectOption({ label: activity });
  await d.getByRole("button", { name: "Create", exact: true }).click();
}
const optgroups = (d, sel) => d.locator(`${sel} optgroup`).evaluateAll((els) => els.map((g) => ({ label: g.label, options: [...g.querySelectorAll("option")].map((o) => o.value) })));
const activityLabel = (name) => `${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · ${name}`;

try {
  const { ctx, page } = await open(1280, 800);
  const pwReviewHash = reviewHash(f.R.pw);
  const pwStatus = status(f.D.pw);

  // ===== Direct Finding (Revision Required, project-wide, 2 mapped requirements) =====
  await openDoc(page, f.D.pw);
  const fu = flat(await followUp(page).innerText());
  rec(/Create Finding/.test(fu) && /Add to Verification/.test(fu) && /Create Finding for a gap the document already shows/.test(fu), "Concluded assessment: Create Finding / Add to Verification + path helper");
  rec(/Upload a new Version if the document content is revised\./.test(await panel(page).innerText()), "Revision Required hint kept");
  await shot(page, "d-followup");
  await openFindingForm(page);
  const d = dlg(page);
  const origin = flat(await d.getByTestId("finding-review-origin").innerText());
  rec(/Document Gap Assessment/i.test(origin) && /Document Control Procedure/.test(origin) && /V1 · Rev\.00/.test(origin) && /Revision Required/.test(origin), "Finding form shows the Gap Assessment origin (document, version, result)");
  rec((await d.locator("#fd-description").inputValue()) === "Retention period is not defined.", "Description prefilled from Review Comments");
  rec((await d.locator("#fd-title").inputValue()) === "", "Title blank");
  const pressedTypes = await Promise.all(["Nonconformity", "Observation", "Opportunity for Improvement"].map((n) => d.getByRole("button", { name: n, exact: true }).getAttribute("aria-pressed")));
  rec(pressedTypes.every((v) => v === "false"), "Finding Type: no default (not derived from Revision Required)");
  rec((await d.getByRole("button", { name: "Medium", exact: true }).getAttribute("aria-pressed")) === "true", "Priority Medium");
  rec((await d.getByRole("button", { name: "Project-wide" }).getAttribute("aria-pressed")) === "true", "Project-wide document: Project-wide by default");
  rec((await d.locator("#fd-activity").inputValue()) === "", "No Activity inferred");
  const groups = await optgroups(d, "#fd-framework");
  rec((await d.locator("#fd-framework").inputValue()) === "" && groups[0]?.label === "Mapped to this document" && groups[0].options.length === 2 && groups.slice(1).some((g) => /ISO 14001/.test(g.label)), "Several mapped requirements: none preselected, mapped listed first, then project items");
  await shot(page, "d-finding-form");
  await saveFinding(page, { type: "Nonconformity", title: "P5D-ACCEPT-Retention period missing" });
  rec(await wait(page.getByText(/^Finding F-\d{3,} created\.$/).first() /* 6A */), "Create Finding: toast");
  rec(await waitDb(() => findingsOf(f.R.pw).length === 1), "Finding created");
  let fin = findingsOf(f.R.pw)[0];
  rec(fin.document_review_id === f.R.pw && fin.verification_item_id === null && fin.finding_type === "nonconformity" && fin.description === "Retention period is not defined." && fin.site_id === null && fin.activity_id === null && fin.priority === "medium", "DB: document_review_id set, verification_item_id NULL, chosen type, prefilled description, Medium, project-wide");
  rec(reviewHash(f.R.pw) === pwReviewHash && status(f.D.pw) === pwStatus, "Review byte-identical; Document status unchanged");
  await page.waitForTimeout(1200);
  rec(await wait(followUp(page).getByRole("button", { name: "Add another Finding" })), "Next: 'Add another Finding'");
  await openFindingForm(page);
  await saveFinding(page, { type: "Observation", title: "P5D-ACCEPT-Retention owner unclear", site: "Long An" });
  rec(await waitDb(() => findingsOf(f.R.pw).length === 2), "Second Finding from the same assessment");
  rec(findingsOf(f.R.pw)[1].site_id === f.la, "Project-wide document: a project site may be chosen");

  // ===== Add to Verification =====
  await page.waitForTimeout(1200);
  await openCheckForm(page);
  rec((await dlg(page).locator("h2").first().innerText()) === "Add to Verification" && /From Gap Assessment/i.test(await dlg(page).getByTestId("verification-review-origin").innerText()), "Verification form: 'Add to Verification' with the Gap Assessment origin");
  rec((await dlg(page).locator("#vi-question").inputValue()) === "" && (await dlg(page).locator("#vi-target-activity").inputValue()) === "", "Check blank, Target Activity chosen by the user");
  await saveCheck(page, { question: "P5D-ACCEPT-Verify retention records onsite", activity: activityLabel("Site Assessment – Viet Long") });
  rec(await waitDb(() => checksOf(f.R.pw).length === 1), "Verification item created");
  let vi = checksOf(f.R.pw)[0];
  rec(vi.result === null && vi.notes === null && vi.verified_activity_id === null && vi.verified_by === null && vi.verified_at === null, "Planning only: result / notes / verified_* NULL");
  rec(vi.target_activity_id === f.A.vl && vi.site_id === f.vl, "Target Activity set; site follows the site-specific Activity");
  rec(findingsOf(f.R.pw).length === 2, "No Finding created by Add to Verification");
  await page.waitForTimeout(1200);
  await openCheckForm(page);
  await saveCheck(page, { question: "P5D-ACCEPT-Check archive room", activity: activityLabel("Project Review Meeting") });
  rec(await waitDb(() => checksOf(f.R.pw).length === 2) && checksOf(f.R.pw)[1].site_id === null, "Second check (project-wide Activity, project-wide scope)");
  rec(reviewHash(f.R.pw) === pwReviewHash && status(f.D.pw) === pwStatus, "After 2 Findings + 2 checks: review byte-identical, status unchanged");
  await page.reload();
  await panel(page).waitFor();
  const summary = followUp(page).getByTestId("follow-up-summary");
  rec(/2 Findings · 2 Verification Items/.test(await summary.innerText()), "Summary: 2 Findings · 2 Verification Items");
  await summary.getByRole("button").click();
  const list = flat(await summary.getByTestId("follow-up-list").innerText());
  rec(/Nonconformity/.test(list) && /Retention period missing/.test(list) && /Open/.test(list) && /Verify retention records onsite/.test(list) && /Pending/.test(list), "Expanded list: type, title, status / check, result");

  // ===== Tampered follow-up =====
  await openCheckForm(page);
  await dlg(page).locator("#vi-question").fill("P5D-ACCEPT-TAMPER");
  await dlg(page).locator("#vi-target-activity").selectOption({ label: activityLabel("Project Review Meeting") });
  const checksBefore = count(`select count(*)::int n from verification_items where project_id in ('${f.p}','${f.pB}')`);
  for (const [label, swap, msg] of [
    ["Activity from Project B", [f.A.pw, f.A.b], /could not be found/],
    ["Framework item of an unassigned Framework", null, /not assigned to this project/],
    ["Review of Project B", [f.R.pw, f.R.b], /could not be found/],
  ]) {
    if (swap) await tamper(page, [swap]);
    else {
      await dlg(page).locator("#vi-framework").selectOption(f.I.q61);
      await tamper(page, [[f.I.q61, f.I.n41]]);
    }
    await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
    rec(await wait(dlg(page).getByText(msg).first()), `Tampered check refused: ${label}`);
    await untamper(page);
  }
  await dlg(page).locator("#vi-framework").selectOption("");
  await dlg(page).getByRole("button", { name: "Specific site" }).click().catch(() => {});
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await openFindingForm(page);
  await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
  await dlg(page).locator("#fd-title").fill("P5D-ACCEPT-TAMPER site");
  await dlg(page).getByRole("button", { name: "Specific site" }).click();
  await dlg(page).locator("#fd-site").selectOption({ label: "Viet Long" });
  await tamper(page, [[f.vl, f.bs]]);
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  rec(await wait(dlg(page).getByText(/not in this project's scope/).first()), "Tampered Finding refused: Site of Project B");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  rec(count(`select count(*)::int n from verification_items where project_id in ('${f.p}','${f.pB}')`) === checksBefore && findingsOf(f.R.pw).length === 2 && findingsOf(f.R.b).length === 0, "  ...nothing created by the refused requests");

  // ===== Site-specific document (one mapped requirement) =====
  await openDoc(page, f.D.site);
  await openFindingForm(page);
  const sd = dlg(page);
  rec(/Viet Long/.test(await sd.getByTestId("finding-site-locked").innerText()) && /Locked because the document is site-specific\./.test(await sd.innerText()), "Site-specific document: site prefilled and locked");
  rec((await sd.locator("#fd-framework").inputValue()) === f.I.e82, "One mapped requirement: prefilled");
  const actOpts = await sd.locator("#fd-activity option").allInnerTexts();
  rec(actOpts.some((o) => /Viet Long/.test(o)) && actOpts.some((o) => /Project Review Meeting/.test(o)) && !actOpts.some((o) => /Long An/.test(o)), "Activity choices limited to project-wide / same-site Activities");
  await sd.getByRole("button", { name: "Observation", exact: true }).click();
  await sd.locator("#fd-title").fill("P5D-ACCEPT-Evacuation roles unclear");
  await tamper(page, [[f.vl, f.la]]);
  await sd.getByRole("button", { name: "Create", exact: true }).click();
  rec(await wait(sd.getByText("Site must match the document's site.").first()), "Server rejects another site for a site-specific document");
  await untamper(page);
  await sd.getByRole("button", { name: "Create", exact: true }).click();
  rec(await waitDb(() => findingsOf(f.R.site).length === 1) && findingsOf(f.R.site)[0].site_id === f.vl && findingsOf(f.R.site)[0].framework_item_id === f.I.e82, "Created with the document's site and the mapped requirement");
  await page.waitForTimeout(1200);
  await openCheckForm(page);
  rec(/Locked because the document is site-specific\./.test(await dlg(page).innerText()) && (await dlg(page).locator("#vi-framework").inputValue()) === f.I.e82, "Add to Verification: site locked, requirement prefilled");
  await dlg(page).locator("#vi-question").fill("P5D-ACCEPT-Walk the evacuation route");
  await tamper(page, [[f.vl, f.la]]);
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  rec(await wait(dlg(page).getByText("Site must match the document's site.").first()), "Server rejects another site for a check from a site-specific document");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();

  // ===== No mapping + Accepted =====
  await openDoc(page, f.D.none);
  const accBtn = await followUp(page).getByRole("button", { name: "Create Finding" }).getAttribute("class");
  rec(/bg-transparent/.test(accBtn) && (await panel(page).locator("span", { hasText: /^Accepted$/ }).getAttribute("class")).includes("bg-success-soft"), "Accepted: green, follow-up buttons secondary / quiet");
  await openFindingForm(page);
  const ng = await optgroups(dlg(page), "#fd-framework");
  rec((await dlg(page).locator("#fd-framework").inputValue()) === "" && !ng.some((g) => g.label === "Mapped to this document") && ng.length >= 2, "No mapping: no preselection, project-assigned items offered");
  await dlg(page).getByRole("button", { name: "Cancel" }).click();

  // ===== Historical assessment / older version / open assessment =====
  await openDoc(page, f.D.hist);
  rec(await wait(followUp(page).getByRole("button", { name: "Create Finding" })), "Latest assessment of the current version offers follow-up");
  await page.getByRole("button", { name: /Earlier assessments \(1\)/ }).click();
  const hist = page.getByTestId("assessment-history");
  rec((await hist.getByRole("button", { name: /Create Finding|Add to Verification/ }).count()) === 0 && /1 Finding/.test(await hist.innerText()), "Historical assessment: no follow-up actions, existing link visible");
  await openFindingForm(page);
  await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
  await dlg(page).locator("#fd-title").fill("P5D-ACCEPT-TAMPER historical");
  await tamper(page, [[f.R.hist2, f.R.hist1]]);
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  rec(await wait(dlg(page).getByText("Only the latest assessment of the current version can create new follow-up.").first()), "Forced follow-up from the earlier assessment refused");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  rec(findingsOf(f.R.hist1).length === 1, "  ...historical link untouched, nothing new");

  await openDoc(page, f.D.old);
  rec((await followUp(page).count()) === 0 && /Not started/.test(await panel(page).innerText()), "Older version replaced: current V2 has no follow-up yet");
  const v1row = page.getByTestId("version-row").nth(1);
  await v1row.getByRole("button", { name: /Assessment history \(1\)/ }).click();
  rec(/1 Verification Item/.test(await v1row.getByTestId("assessment-history").innerText()) && (await v1row.getByRole("button", { name: /Create Finding|Add to Verification/ }).count()) === 0, "V1 assessment: existing check visible, no new follow-up");
  await openDoc(page, f.D.pw);
  await openFindingForm(page);
  await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
  await dlg(page).locator("#fd-title").fill("P5D-ACCEPT-TAMPER old version");
  await tamper(page, [[f.R.pw, f.R.old1]]);
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  rec(await wait(dlg(page).getByText(/belongs to an older version/).first()), "Forced follow-up from an older version's assessment refused");
  await untamper(page);
  await tamper(page, [[f.R.pw, f.R.open]]);
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  rec(await wait(dlg(page).getByText("Follow-up can be created only from a completed assessment.").first()), "Forced follow-up from an Under Review assessment refused");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  // Not Applicable document: existing link visible, no new follow-up (UI + server)
  await openDoc(page, f.D.pw);
  await openFindingForm(page);
  await dlg(page).getByRole("button", { name: "Observation", exact: true }).click();
  await dlg(page).locator("#fd-title").fill("P5D-ACCEPT-TAMPER not applicable");
  await tamper(page, [[f.R.pw, f.R.na]]);
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  rec(await wait(dlg(page).getByText("Follow-up cannot be created while this document is Not Applicable.").first()), "Forced follow-up on a Not Applicable document refused");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await openDoc(page, f.D.na);
  rec((await followUp(page).count()) === 0 && /1 Finding/.test(await panel(page).getByTestId("follow-up-summary").innerText()) && findingsOf(f.R.na).length === 1, "Not Applicable: no follow-up actions, existing Finding still listed");
  await openDoc(page, f.D.open);
  rec((await followUp(page).count()) === 0, "Under Review: no follow-up actions");
  rec(findingsOf(f.R.old1).length === 0 && findingsOf(f.R.open).length === 0, "  ...nothing created");

  // ===== Finding Detail origin =====
  fin = findingsOf(f.R.pw)[0];
  await page.goto(`${P}/findings/${fin.id}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  const src = flat(await page.getByTestId("finding-review-source").innerText());
  rec(/Source: Document Gap Assessment · P5D-ACCEPT-Document Control Procedure · V1 · Rev\.00/.test(src), "Finding Detail: source line under the header");
  const os = flat(await page.getByTestId("finding-review-origin-section").innerText());
  rec(/Created from Document Gap Assessment/.test(await page.locator("body").innerText()) && /Revision Required/.test(os) && /Retention period is not defined\./.test(os), "Origin section: document, version, result, Review Comments");
  await page.getByTestId("finding-review-source").getByRole("link").click();
  rec(await page.waitForURL(`**/documents/${f.D.pw}`, { timeout: 20000 }).then(() => true).catch(() => false), "Link back to Document Detail");
  const siteFinding = findingsOf(f.R.site)[0];
  await page.goto(`${P}/findings/${siteFinding.id}`);
  await page.getByRole("button", { name: "Edit Finding" }).click();
  rec(/Locked because the document is site-specific\./.test(await dlg(page).innerText()), "Editing a review-origin Finding keeps the document's site locked");
  await dlg(page).getByRole("button", { name: "Cancel" }).click();

  // ===== Verification workspace source =====
  await page.goto(`${P}/verification`);
  await page.locator("tbody tr").first().waitFor({ timeout: 20000 });
  rec(/From Gap Assessment · P5D-ACCEPT-Document Control Procedure · V1/.test(flat(await page.locator("tbody tr", { hasText: "Verify retention records onsite" }).innerText())), "Verification workspace: subtle 'From Gap Assessment' source");

  // ===== Delete integration =====
  const [, check2] = checksOf(f.R.pw);
  await page.locator("tbody tr", { hasText: "Check archive room" }).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByTestId("delete-dialog").getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => count(`select count(*)::int n from verification_items where id='${check2.id}'`) === 0), "Planning-only review-origin check deleted");
  const fin2 = findingsOf(f.R.pw)[1];
  await page.goto(`${P}/findings/${fin2.id}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete Finding" }).click();
  await page.getByTestId("delete-dialog").getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => count(`select count(*)::int n from issues where id='${fin2.id}'`) === 0), "Review-origin Finding deleted");
  rec(reviewHash(f.R.pw) === pwReviewHash && status(f.D.pw) === pwStatus, "Review and Document status unchanged by the deletes");
  await openDoc(page, f.D.pw);
  rec(/1 Finding · 1 Verification Item/.test(await followUp(page).getByTestId("follow-up-summary").innerText()), "Summary counts refreshed (1 · 1)");

  // ===== Execution chain: Review → Verification → Finding =====
  await page.goto(`${P}/activities/${f.A.vl}`);
  const card = page.locator("div.rounded-lg", { hasText: "Verify retention records onsite" }).last();
  await card.getByRole("button", { name: "Verify" }).click();
  await dlg(page).getByRole("button", { name: "Issue Identified", exact: true }).click();
  await dlg(page).locator("#ve-notes").fill("Retention records not available at site.");
  await dlg(page).getByRole("button", { name: "Save" }).click();
  await gone(dlg(page));
  rec(await waitDb(() => checksOf(f.R.pw)[0].result === "issue_identified"), "Review-origin check executed normally (Issue Identified)");
  await page.waitForTimeout(1200);
  await card.getByRole("button", { name: "Create Finding" }).click();
  await dlg(page).getByRole("button", { name: "Nonconformity", exact: true }).click();
  await dlg(page).locator("#fd-title").fill("P5D-ACCEPT-Retention records missing onsite");
  await dlg(page).getByRole("button", { name: "Create", exact: true }).click();
  const viId = checksOf(f.R.pw)[0].id;
  rec(await waitDb(() => count(`select count(*)::int n from issues where verification_item_id='${viId}'`) === 1), "Finding created from that Verification");
  const chainF = dbQuery(`select * from issues where verification_item_id='${viId}'`)[0];
  rec(chainF.document_review_id === null && chainF.verification_item_id === viId, "Chain Review → Verification → Finding: Finding.document_review_id stays NULL");
  rec(reviewHash(f.R.pw) === pwReviewHash && status(f.D.pw) === pwStatus, "Execution changed neither the review nor the Document status");
  await ctx.close();

  // ===== Consultant =====
  const c = await open(1280, 800, "consultant");
  await openDoc(c.page, f.D.none);
  await openFindingForm(c.page);
  await saveFinding(c.page, { type: "Opportunity for Improvement", title: "P5D-ACCEPT-Consultant OFI" });
  rec(await waitDb(() => findingsOf(f.R.none).length === 1) && findingsOf(f.R.none)[0].created_by === consultant.userId, "Consultant: Create Finding from an Accepted assessment");
  await c.page.waitForTimeout(1200);
  await openCheckForm(c.page);
  await saveCheck(c.page, { question: "P5D-ACCEPT-Consultant onsite check" });
  rec(await waitDb(() => checksOf(f.R.none).length === 1), "Consultant: Add to Verification");
  await c.ctx.close();

  // ===== Mobile =====
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    await openDoc(m.page, f.D.site);
    rec(await noHOverflow(m.page) && await wait(followUp(m.page).getByRole("button", { name: /Create Finding|Add another Finding/ })) && await wait(followUp(m.page).getByRole("button", { name: "Add to Verification" })), `${w}px: follow-up actions reachable, no overflow`);
    for (const opener of [openFindingForm, openCheckForm]) {
      await opener(m.page);
      const ok = await dlg(m.page).getByRole("button", { name: "Create", exact: true }).evaluate((b) => {
        const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.bottom <= innerHeight && (top === b || b.contains(top));
      });
      rec(ok, `${w}px: ${opener === openFindingForm ? "Finding" : "Verification"} sheet — Create reachable, not covered`);
      await dlg(m.page).getByRole("button", { name: "Cancel" }).click();
      await gone(dlg(m.page));
    }
    await shot(m.page, `m${w}-followup`, true);
    await m.ctx.close();
  }

  // ===== Signed out / isolation page =====
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${DOCS}/${f.D.pw}`);
  rec(/\/login/.test(anon.url()), "Anon: redirected to login");
  const anonRest = await http("GET", `/rest/v1/issues?select=id&document_review_id=eq.${f.R.pw}`);
  rec(anonRest.status === 401 || (Array.isArray(anonRest.json) && anonRest.json.length === 0), `Anon: follow-up rows not readable (HTTP ${anonRest.status})`);
  rec(findingsOf(f.R.b).length === 0 && checksOf(f.R.b).length === 0, "Project B review has no follow-up created from Project A");
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const removed = await cleanupP5d(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like 'P5D-ACCEPT-%')::int c, (select count(*) from documents)::int d, (select count(*) from document_reviews)::int r, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o`)[0];
  rec(left.c === 0 && left.d === 0 && left.r === 0 && left.f === 0 && left.o === 0, `Cleanup: fixtures (+${removed} objects) removed`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
