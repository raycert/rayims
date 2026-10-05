import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { users, makeReporter, signIn, dbQuery, http } from "./common.mjs";
import { createFixtures, cleanupP5a } from "./p5a-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p5a-shots");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 15000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
async function waitDb(fn, ms = 15000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 700)); } return false; }
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });
const docBy = (title) => dbQuery(`select * from documents where title='${title}'`)[0];
const mappings = (docId) => dbQuery(`select framework_item_id from document_framework_items where document_id='${docId}'`).map((r) => r.framework_item_id).sort();
const count = (sql) => dbQuery(sql)[0].n;

const admin = await signIn("admin");
const consultant = await signIn("consultant");
const f = await createFixtures(admin.token);
const P = `${APP}/projects/${f.p}`;
const DOCS = `${P}/documents`;
const fiBefore = count(`select count(*)::int n from framework_items`);
const e41 = dbQuery(`select fi.id from framework_items fi join frameworks f2 on f2.id=fi.framework_id where f2.code='ISO 14001' and fi.code='4.1'`)[0].id;
const pfBefore = count(`select count(*)::int n from project_frameworks where project_id='${f.p}'`);

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
const delDlg = (p) => p.getByTestId("delete-dialog");
const row = (p, title) => p.locator("tbody tr", { hasText: title });
async function gotoDocs(page, url = DOCS) {
  await page.goto(url);
  await page.getByRole("heading", { name: "Documents", level: 2 }).waitFor({ timeout: 20000 });
}
/** Check a requirement in the picker: search, then tick it inside its Framework group. */
async function pick(page, frameworkIdentity, code) {
  const picker = dlg(page).getByTestId("framework-picker");
  await picker.getByLabel("Search framework requirements").fill(code);
  const group = picker.locator("div", { has: page.locator("div.sticky", { hasText: frameworkIdentity }) }).last();
  await group.getByRole("checkbox", { name: new RegExp(`^${code.replace(/\./g, "\\.")} — `) }).check();
  await picker.getByLabel("Search framework requirements").fill("");
}
async function fillForm(page, { title, code, type, owner, site, applicable, items = [] }) {
  const d = dlg(page);
  if (title !== undefined) await d.locator("#doc-title").fill(title);
  if (code !== undefined) await d.locator("#doc-code").fill(code);
  if (type !== undefined) await d.locator("#doc-type").fill(type);
  if (owner !== undefined) await d.locator("#doc-owner").fill(owner);
  if (site) {
    await d.getByRole("button", { name: "Specific site" }).click();
    await d.locator("#doc-site").selectOption({ label: site });
  }
  if (applicable !== undefined) await d.locator("#doc-applicable").setChecked(applicable);
  for (const [fw, c] of items) await pick(page, fw, c);
}
async function saveDrawer(page, label = /^(Create|Save)$/) {
  await dlg(page).getByRole("button", { name: label }).click();
  return gone(dlg(page));
}
async function openDetail(page, docId) {
  await page.goto(`${DOCS}/${docId}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
}
async function openDelete(page, docId) {
  await openDetail(page, docId);
  await page.getByRole("button", { name: "More actions" }).first().click(); // 5B: version rows have their own "…"; header menu is first
  await page.getByRole("menuitem", { name: "Delete Document" }).click();
  await delDlg(page).waitFor();
  await delDlg(page).getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  return delDlg(page);
}
const badgeClass = async (page, title) => row(page, title).locator("td").nth(4).locator("span").first().getAttribute("class");

try {
  const { ctx, page } = await open(1280, 800);

  // ===== Navigation =====
  await page.goto(P);
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.waitForURL("**/documents", { timeout: 20000 });
  await page.getByRole("heading", { name: "Documents", level: 2 }).waitFor();
  const tabCls = await page.getByRole("link", { name: "Documents", exact: true }).getAttribute("class");
  rec(/border-primary/.test(tabCls), "Documents tab: live link from Overview, active state on /documents");
  rec((await page.locator('[aria-disabled="true"]', { hasText: "Documents" }).count()) === 0, "Documents tab no longer inert (Reports still inert)");
  rec((await page.locator('[aria-disabled="true"]', { hasText: "Reports" }).count()) === 1, "  ...Reports remains the only inert tab");

  // ===== Status tones & register columns (DB fixtures) =====
  const tones = {
    "P5A-ACCEPT-Status Received": ["Received", /bg-primary\/10/],
    "P5A-ACCEPT-Status Under Review": ["Under Review", /bg-primary\/10/],
    "P5A-ACCEPT-Status Revision Required": ["Revision Required", /bg-warning-soft/],
    "P5A-ACCEPT-Status Accepted": ["Accepted", /bg-success-soft/],
    "P5A-ACCEPT-Status Not Applicable": ["Not Applicable", /bg-neutral-soft/],
    "P5A-ACCEPT-Delete Me – Empty With Mappings": ["Not Received", /bg-neutral-soft/],
  };
  for (const [title, [label, cls]] of Object.entries(tones)) {
    const r = row(page, title);
    const text = flat(await r.innerText());
    rec(text.includes(label) && cls.test(await badgeClass(page, title)), `Status ${label}: derived label + tone (${(await badgeClass(page, title)).match(/bg-[a-z-]+(\/10)?/)[0]})`);
  }
  rec(flat(await row(page, "Status Revision Required").innerText()).includes("V2 · Rev.01"), "Latest Version column: V2 · Rev.01 (from the register view)");
  rec(/— .*—$/.test(flat(await row(page, "Delete Me").innerText())) && flat(await row(page, "Delete Me").innerText()).includes("Not Received"), "No versions: Latest Version and Last Review show —");
  rec(/[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(flat(await row(page, "Status Accepted").innerText())), "Last Review shows a date when a review exists");
  rec(flat(await row(page, "Status Accepted").innerText()).includes("ST-04"), "Document column: code as subline");
  await shot(page, "d-register-tones");

  // ===== Create: Document Control Procedure =====
  await page.getByRole("button", { name: "+ New Document" }).first().click();
  await dlg(page).waitFor();
  const box = await dlg(page).boundingBox();
  rec(box.width >= 380 && box.width <= 420, `Drawer width ${Math.round(box.width)}px (established ~400px)`);
  const labels = [
    ...(await dlg(page).locator("label[for], h3").allInnerTexts()),
    ...(await dlg(page).locator("label:has(#doc-applicable) span.font-medium").allInnerTexts()),
  ];
  rec(
    !labels.some((l) => /Status|Version|File|Upload|Review|Description|Department|Due/i.test(l)) && (await dlg(page).locator('input[type="file"]').count()) === 0,
    `Form has no status / version / file / review / description / due-date fields (${labels.join(" | ")})`,
  );
  await dlg(page).locator("#doc-code").fill("ST-01");
  rec(await wait(dlg(page).getByTestId("duplicate-code")) && /Status Received/.test(await dlg(page).getByTestId("duplicate-code").innerText()), "Duplicate code: non-blocking hint only");
  await fillForm(page, {
    title: "  P5A-ACCEPT-Document Control Procedure  ", code: "PR-QMS-01", type: "Procedure", owner: "Quality Manager",
    items: [["ISO 9001:2015", "7.5"], ["ISO 9001:2015", "6.1"]],
  });
  rec((await dlg(page).getByTestId("framework-chip").count()) === 2, "Picker: 2 chips selected (grouped search by clause)");
  await shot(page, "d-create-drawer");
  rec(await saveDrawer(page), "Create: drawer closes");
  rec(await wait(page.getByText("Document created").first()), "Create: toast 'Document created'");
  const dcp = await (async () => { let d; await waitDb(() => (d = docBy("P5A-ACCEPT-Document Control Procedure"))); return d; })();
  rec(!!dcp && dcp.doc_code === "PR-QMS-01" && dcp.document_type === "Procedure" && dcp.owner_name === "Quality Manager" && dcp.site_id === null && dcp.is_applicable === true, "DB: title trimmed, code, type, owner, project-wide, applicable");
  rec(dcp.created_by === admin.userId && dcp.project_id === f.p, "DB: created_by = session user, project_id = route project");
  rec(JSON.stringify(mappings(dcp.id)) === JSON.stringify([f.I.q75, f.I.q61].sort()), "DB: 2 framework mappings created");
  await page.waitForTimeout(800);
  rec(flat(await row(page, "Document Control Procedure").innerText()).includes("Not Received"), "Register: new document Not Received");
  rec(/ISO 9001 6\.1, ISO 9001 7\.5/.test(flat(await row(page, "Document Control Procedure").innerText())), "Register: Framework Requirements 'ISO 9001 6.1, ISO 9001 7.5'");
  await openDetail(page, dcp.id);
  const hdr = flat(await page.locator("body").innerText());
  rec(/P5A-ACCEPT-Document Control Procedure/.test(hdr) && /PR-QMS-01/.test(hdr) && /Not Received/.test(hdr) && /Project-wide/.test(hdr), "Detail header: title, code, status, scope");
  const info = page.locator("section", { has: page.getByRole("heading", { name: "Document Information" }) });
  const infoRow = async (label) => flat(await info.locator("div", { has: page.getByText(label, { exact: true }) }).last().innerText());
  rec((await infoRow("Owner")).endsWith("Quality Manager") && (await infoRow("Document Type")).endsWith("Procedure") && (await infoRow("Applicability")).endsWith("Applicable"), "Detail: owner, type, applicability");
  rec(/ISO 9001:2015 · 6\.1 — Risks and opportunities/.test(flat(await page.getByTestId("document-requirements").innerText())), "Detail: requirements human-readable 'ISO 9001:2015 · 6.1 — …'");
  rec(flat(await page.getByTestId("document-versions").innerText()).endsWith("No versions received yet."), "Detail: 'No versions received yet.'");
  // Updated in 5B: Document Detail now offers the real "Upload New Version" action (no placeholder).
  rec((await page.getByRole("button", { name: "Upload New Version" }).count()) === 1 && !/Coming soon/i.test(hdr), "Upload New Version offered (5B), no 'Coming soon'");
  rec(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(hdr), "Detail shows no UUIDs");
  await shot(page, "d-detail", true);

  // ===== Site-specific + multi-framework =====
  await gotoDocs(page);
  await page.getByRole("button", { name: "+ New Document" }).first().click();
  await dlg(page).waitFor();
  await fillForm(page, {
    title: "P5A-ACCEPT-Emergency Response Plan", site: "Viet Long",
    items: [["ISO 14001:2015", "8.2"], ["ISO 45001:2018", "8.2"], ["ISO 14001:2015", "6.1.2"]],
  });
  rec(await saveDrawer(page), "Create site-specific, multi-framework document");
  let erp;
  await waitDb(() => (erp = docBy("P5A-ACCEPT-Emergency Response Plan")));
  rec(erp.site_id === f.vl && mappings(erp.id).length === 3, "DB: site Viet Long, 3 mappings (ISO 14001 + ISO 45001)");
  await page.waitForTimeout(800);
  const erpRow = flat(await row(page, "Emergency Response Plan").innerText());
  rec(/Viet Long/.test(erpRow) && /\+1/.test(erpRow), `Register: site + first two requirements +1 ("${erpRow.slice(0, 120)}")`);
  await openDetail(page, erp.id);
  rec((await page.getByTestId("document-requirements").locator("li").count()) === 3 && /Viet Long/.test(await page.locator("body").innerText()), "Detail: all 3 requirements, site Viet Long");

  // ===== Server rejects out-of-scope site / framework (tampered) =====
  await gotoDocs(page);
  const docsBefore = count(`select count(*)::int n from documents where project_id='${f.p}'`);
  await page.getByRole("button", { name: "+ New Document" }).first().click();
  await fillForm(page, { title: "P5A-ACCEPT-TAMPER site", site: "Viet Long" });
  await tamper(page, [[f.vl, f.bs]]);
  await dlg(page).getByRole("button", { name: "Create" }).click();
  rec(await wait(dlg(page).getByText(/not in this project's scope/).first()), "Cross-project site rejected by the server");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "+ New Document" }).first().click();
  await fillForm(page, { title: "P5A-ACCEPT-TAMPER framework", items: [["ISO 9001:2015", "6.1"]] });
  await tamper(page, [[f.I.q61, f.I.n41]]);
  await dlg(page).getByRole("button", { name: "Create" }).click();
  rec(await wait(dlg(page).getByText(/not assigned to this project/).first()), "Framework item from an unassigned Framework (ISO 50001) rejected");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  rec(count(`select count(*)::int n from documents where project_id='${f.p}'`) === docsBefore, "  ...no document created by the rejected requests (validated before any write)");
  const picker50001 = await (async () => {
    await page.getByRole("button", { name: "+ New Document" }).first().click();
    const t = await dlg(page).getByTestId("framework-picker").innerText();
    await dlg(page).getByRole("button", { name: "Cancel" }).click();
    return t;
  })();
  rec(!/ISO 50001/.test(picker50001) && /ISO 9001:2015/.test(picker50001) && /ISO 14001:2015/.test(picker50001), "Picker offers only the project's assigned Frameworks");

  // ===== Applicability toggle =====
  await openDetail(page, dcp.id);
  await page.getByRole("button", { name: "Edit Document" }).click();
  await dlg(page).locator("#doc-applicable").uncheck();
  await saveDrawer(page);
  rec(await wait(page.getByText("Document updated").first()), "Edit: toast 'Document updated'");
  await page.getByText("Not Applicable").first().waitFor({ timeout: 15000 });
  const statusBadge = page.locator("h1").locator("xpath=../../following-sibling::div[1]").locator("span").first();
  rec(docBy("P5A-ACCEPT-Document Control Procedure").is_applicable === false && (await statusBadge.innerText()).trim() === "Not Applicable", "Applicable → Not Applicable: status Not Applicable");
  rec(mappings(dcp.id).length === 2, "  ...mappings preserved");
  await page.getByRole("button", { name: "Edit Document" }).click();
  await dlg(page).locator("#doc-applicable").check();
  await saveDrawer(page);
  await page.waitForTimeout(1200);
  rec(docBy("P5A-ACCEPT-Document Control Procedure").is_applicable === true && /Not Received/.test(await page.locator("body").innerText()) && mappings(dcp.id).length === 2, "Not Applicable → Applicable: Not Received again, mappings preserved");
  const created = docBy("P5A-ACCEPT-Document Control Procedure");
  rec(created.created_by === admin.userId && created.created_at === dcp.created_at, "Edit never touches created_by / created_at");

  // ===== Historical mapping (framework unassigned) =====
  dbQuery(`delete from project_frameworks where project_id='${f.p}' and framework_id=(select id from frameworks where code='ISO 45001')`);
  await openDetail(page, erp.id);
  rec(/ISO 45001:2018 · 8\.2 — .*\(not currently assigned\)/.test(flat(await page.getByTestId("document-requirements").innerText())), "Historical mapping stays visible, marked '(not currently assigned)'");
  await page.getByRole("button", { name: "Edit Document" }).click();
  const chips = await dlg(page).getByTestId("framework-chip").allInnerTexts();
  rec(chips.some((c) => /ISO 45001:2018/.test(c) && /not currently assigned/.test(c)), "Edit: historical chip shown");
  rec(!/ISO 45001:2018/.test(await dlg(page).getByRole("group", { name: "Framework requirements" }).innerText()), "Edit: no ISO 45001 items offered for new selection");
  await dlg(page).locator("#doc-owner").fill("EHS Manager");
  await saveDrawer(page);
  await page.waitForTimeout(1200);
  rec(mappings(erp.id).includes(f.I.h82) && docBy("P5A-ACCEPT-Emergency Response Plan").owner_name === "EHS Manager", "Save keeps the historical mapping");
  await page.getByRole("button", { name: "Edit Document" }).click();
  await pick(page, "ISO 14001:2015", "4.1");
  await tamper(page, [[e41, f.I.h612]]); // swap the picked ISO 14001 4.1 for an ISO 45001 item
  await dlg(page).getByRole("button", { name: "Save" }).click();
  rec(await wait(dlg(page).getByText(/not assigned to this project/).first()) && !mappings(erp.id).includes(f.I.h612), "Adding another item from the unassigned Framework is rejected");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Edit Document" }).click();
  await dlg(page).getByRole("button", { name: /^Remove ISO 45001:2018/ }).click();
  await saveDrawer(page);
  await page.waitForTimeout(1200);
  rec(!mappings(erp.id).includes(f.I.h82) && mappings(erp.id).length === 2, "Historical mapping can be removed");
  dbQuery(`insert into project_frameworks (project_id, framework_id) select '${f.p}', id from frameworks where code='ISO 45001'`);

  // ===== Search / filters =====
  await gotoDocs(page);
  const search = page.getByLabel("Search documents");
  await search.fill("pr-qms");
  rec((await page.locator("tbody tr").count()) === 1 && (await row(page, "Document Control Procedure").count()) === 1, "Search by code (case-insensitive)");
  await search.fill("emergency");
  rec((await page.locator("tbody tr").count()) === 1, "Search by title");
  await search.fill("zzz-nothing");
  rec(await wait(page.getByText("No documents match the current search or filters.")), "No-results state");
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await page.getByLabel("Filter by Status").selectOption("accepted");
  rec((await page.locator("tbody tr").count()) === 1 && (await row(page, "Status Accepted").count()) === 1, "Status filter (Accepted)");
  await page.getByLabel("Filter by Status").selectOption("n_a");
  rec((await page.locator("tbody tr").count()) === 1 && (await row(page, "Status Not Applicable").count()) === 1, "Status filter (Not Applicable)");
  await page.getByLabel("Filter by Status").selectOption("all");
  await page.getByLabel("Filter by Site").selectOption("Viet Long");
  rec((await page.locator("tbody tr").count()) === 1 && (await row(page, "Emergency Response Plan").count()) === 1, "Site filter (Viet Long)");
  await page.getByLabel("Filter by Site").selectOption("all");
  await page.getByLabel("Filter by Framework").selectOption("ISO 14001:2015");
  rec((await page.locator("tbody tr").count()) === 2, `Framework filter (ISO 14001) — ${await page.locator("tbody tr").count()} rows`);
  await page.getByLabel("Filter by Framework").selectOption("all");
  const titles = await page.locator("tbody tr td:first-child a").allInnerTexts();
  const sorted = [...titles].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  rec(JSON.stringify(titles) === JSON.stringify(sorted), "Default sort: Title A–Z");

  // ===== Delete allowed =====
  let d = await openDelete(page, f.D.deleteMe);
  rec(flat(await d.innerText()).includes("Delete Document?") && flat(await d.innerText()).includes("This permanently removes this Document."), "Delete: confirmation text");
  await shot(page, "d-delete-confirm");
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  rec(await page.waitForURL(`**/projects/${f.p}/documents`, { timeout: 20000 }).then(() => true).catch(() => false), "Delete: back to the register");
  rec(await waitDb(() => count(`select count(*)::int n from documents where id='${f.D.deleteMe}'`) === 0) && count(`select count(*)::int n from document_framework_items where document_id='${f.D.deleteMe}'`) === 0, "Document and its mappings removed");
  rec(count(`select count(*)::int n from framework_items`) === fiBefore && count(`select count(*)::int n from project_frameworks where project_id='${f.p}'`) === pfBefore, "Framework reference data and project assignments untouched");

  // ===== Delete blocked =====
  d = await openDelete(page, f.D.blocked);
  const bl = (await d.getByTestId("delete-blockers").locator("li").allInnerTexts()).map(flat);
  rec(JSON.stringify(bl) === JSON.stringify(["This document has versions and cannot be deleted."]) && (await d.getByRole("button", { name: "Delete", exact: true }).count()) === 0, "Blocked: 'This document has versions and cannot be deleted.' + Close only");
  await shot(page, "d-delete-blocked");
  await d.getByRole("button", { name: "Close" }).click();
  rec(count(`select count(*)::int n from document_versions where id='${f.vBlocked}'`) === 1 && count(`select count(*)::int n from files f join document_versions v on v.file_id=f.id where v.id='${f.vBlocked}'`) === 1, "  ...version and its file remain");
  rec(/V1 · Rev\.00/.test(flat(await page.getByTestId("document-versions").innerText())), "Existing version shown read-only on Detail (no hidden data)");
  d = await openDelete(page, f.D.tamperSrc);
  await tamper(page, [[f.D.tamperSrc, f.D.blocked]]);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(2500);
  rec(count(`select count(*)::int n from documents where id in ('${f.D.blocked}','${f.D.tamperSrc}')`) === 2, "Tampered delete (id → document with a version) refused");
  await untamper(page);
  await page.keyboard.press("Escape");

  // ===== Project isolation =====
  const resp = await page.goto(`${DOCS}/${f.D.bDoc}`);
  await page.getByText("Page not found").waitFor({ timeout: 15000 }).catch(() => {});
  const iso = await page.locator("body").innerText();
  rec(/Page not found/.test(iso) && !/B Secret|B-SECRET/.test(iso), `Project A URL → Project B document: not found, nothing leaked (HTTP ${resp.status()})`);
  await gotoDocs(page);
  rec(!/B Secret|B-SECRET/.test(await page.locator("body").innerText()), "Project B document not in Project A register");
  await openDetail(page, dcp.id);
  await page.getByRole("button", { name: "Edit Document" }).click();
  await tamper(page, [[dcp.id, f.D.bDoc]]);
  await dlg(page).locator("#doc-owner").fill("Hijacked");
  await dlg(page).getByRole("button", { name: "Save" }).click();
  rec(await wait(dlg(page).getByText(/could not be found/).first()) && dbQuery(`select owner_name from documents where id='${f.D.bDoc}'`)[0].owner_name === null, "Editing a Project B document through Project A refused");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  d = await openDelete(page, f.D.tamperSrc);
  await tamper(page, [[f.D.tamperSrc, f.D.bDoc]]);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(2500);
  rec(count(`select count(*)::int n from documents where id='${f.D.bDoc}'`) === 1, "Deleting a Project B document through Project A refused");
  await untamper(page);
  await page.keyboard.press("Escape");

  // ===== Empty state =====
  await gotoDocs(page, `${APP}/projects/${f.pEmpty}/documents`);
  rec(await wait(page.getByText("No documents yet.")) && (await page.getByRole("button", { name: "+ New Document" }).count()) === 2, "Empty register: 'No documents yet.' + '+ New Document'");

  // ===== Regression smoke =====
  for (const [pathPart, check] of [["", "Upcoming Activities"], ["/plan", "Plan"], ["/verification", "Verification"], ["/findings", "Findings"], ["/actions", "Actions"]]) {
    await page.goto(`${P}${pathPart}`);
    rec(await wait(page.getByText(check).first()), `Regression: ${pathPart || "/ (Overview)"} loads`);
  }
  await page.goto(`${APP}/frameworks`);
  rec(await wait(page.getByText("ISO 9001").first()), "Regression: Framework Library loads");
  await ctx.close();

  // ===== Mobile =====
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    const mp = m.page;
    await gotoDocs(mp);
    const cards = mp.locator("div.md\\:hidden a[href*='/documents/']");
    rec((await mp.locator("table").isVisible()) === false && (await cards.count()) >= 5, `${w}px: register as cards (no table)`);
    const card = cards.filter({ hasText: "Emergency Response Plan" });
    const ct = flat(await card.innerText());
    rec(/Emergency Response Plan/.test(ct) && /Not Received/.test(ct) && /Viet Long/.test(ct) && /Latest version: None/.test(ct), `${w}px: card shows title, status, site, requirements, latest version`);
    rec(await noHOverflow(mp), `${w}px: register no horizontal overflow`);
    const tabs = await mp.getByRole("link", { name: "Documents", exact: true }).evaluate((el) => {
      const bar = el.parentElement; return { h: bar.getBoundingClientRect().height, wrap: getComputedStyle(bar).flexWrap };
    });
    rec(tabs.h < 50 && tabs.wrap === "nowrap", `${w}px: project tabs stay one scrollable row (${Math.round(tabs.h)}px)`);
    const tabVisible = await mp.getByRole("link", { name: "Documents", exact: true }).evaluate((el) => {
      const a = el.getBoundingClientRect(); const b = el.parentElement.getBoundingClientRect();
      return el.getAttribute("aria-current") === "page" && a.left >= b.left - 1 && a.right <= b.right + 1;
    });
    rec(tabVisible, `${w}px: active Documents tab fully visible (scrolled into view, aria-current=page)`);
    await mp.getByLabel("Filter by Status").selectOption("accepted");
    rec((await cards.count()) === 1, `${w}px: filters usable`);
    await mp.getByLabel("Filter by Status").selectOption("all");
    await shot(mp, `m${w}-register`, true);
    await mp.getByRole("button", { name: "+ New Document" }).first().click();
    await dlg(mp).waitFor();
    const sheet = await dlg(mp).boundingBox();
    rec(sheet.width >= w - 1 && sheet.y + sheet.height <= 845, `${w}px: New Document is a full-width bottom sheet`);
    await pick(mp, "ISO 9001:2015", "7.5");
    await dlg(mp).getByRole("button", { name: "Specific site" }).click();
    rec((await dlg(mp).getByTestId("framework-chip").count()) === 1 && await wait(dlg(mp).locator("#doc-site")), `${w}px: framework multi-select and site controls usable`);
    const saveOk = await dlg(mp).getByRole("button", { name: "Create" }).evaluate((b) => {
      const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.bottom <= innerHeight && (top === b || b.contains(top));
    });
    rec(saveOk, `${w}px: Create button visible and not covered (bottom navigation)`);
    await shot(mp, `m${w}-drawer`);
    await dlg(mp).getByRole("button", { name: "Cancel" }).click();
    await openDetail(mp, erp.id);
    rec(await noHOverflow(mp) && await wait(mp.getByRole("button", { name: "More actions" })) && /Not Received/.test(await mp.locator("body").innerText()), `${w}px: detail readable, status clear, overflow reachable`);
    await mp.getByRole("button", { name: "More actions" }).click();
    rec(await wait(mp.getByRole("menuitem", { name: "Delete Document" })), `${w}px: Delete Document reachable in the overflow`);
    await shot(mp, `m${w}-detail`, true);
    await m.ctx.close();
  }

  // ===== Consultant parity =====
  const c = await open(1280, 800, "consultant");
  const cp = c.page;
  await gotoDocs(cp);
  await cp.getByRole("button", { name: "+ New Document" }).first().click();
  await fillForm(cp, { title: "P5A-ACCEPT-Consultant Legal Register", code: "REG-01", items: [["ISO 14001:2015", "6.1.2"]] });
  await saveDrawer(cp);
  let cdoc;
  rec(await waitDb(() => (cdoc = docBy("P5A-ACCEPT-Consultant Legal Register"))) && cdoc.created_by === consultant.userId, "Consultant: creates a document (created_by = consultant)");
  await openDetail(cp, cdoc.id);
  await cp.getByRole("button", { name: "Edit Document" }).click();
  await dlg(cp).locator("#doc-owner").fill("EHS Officer");
  await saveDrawer(cp);
  rec(await waitDb(() => docBy("P5A-ACCEPT-Consultant Legal Register").owner_name === "EHS Officer"), "Consultant: edits a document");
  d = await openDelete(cp, f.D.consultantDel);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => count(`select count(*)::int n from documents where id='${f.D.consultantDel}'`) === 0), "Consultant: deletes an empty document");
  await c.ctx.close();

  // ===== Anonymous =====
  const anonPage = await (await browser.newContext()).newPage();
  await anonPage.goto(DOCS);
  rec(/\/login/.test(anonPage.url()), "Anon: register redirects to login");
  const anonRest = await http("GET", `/rest/v1/documents?select=id,title&project_id=eq.${f.p}`);
  rec(anonRest.status === 401 || (Array.isArray(anonRest.json) && anonRest.json.length === 0), `Anon REST read of documents denied (HTTP ${anonRest.status})`);
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const removed = await cleanupP5a(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like 'P5A-ACCEPT-%')::int c, (select count(*) from documents)::int d, (select count(*) from document_versions)::int v, (select count(*) from document_reviews)::int r, (select count(*) from document_framework_items)::int m, (select count(*) from files)::int f`)[0];
  rec(left.c === 0 && left.d === 0 && left.v === 0 && left.r === 0 && left.m === 0 && left.f === 0, `Cleanup: fixtures removed (${removed} Storage objects); documents/versions/reviews/mappings/files all 0`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
