// Phase 7A acceptance: consultant Home, date-only / local-today / timestamp correctness, Gap Assessment ->
// Verification deep link, Findings / Actions Activity filters, mobile + desktop. Fixtures: P7A-ACCEPT- only.
// Needs a production build served on 127.0.0.1:3105 (see tests/README.md).
import { chromium } from "playwright-core";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { users, makeReporter, signIn, dbQuery } from "./common.mjs";
import { createP7a, cleanupP7a } from "./p7a-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p7a-shots");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = (ok, name, detail = "") => { R.rec(ok, name, detail); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " :: " + detail : ""}`); };
const info = (m) => console.log(`INFO  ${m}`);
const wait = (l, t = 20000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const one = (sql) => dbQuery(sql)[0];
const HYDRATION = /hydrat|minified react error #(418|423|425)|did not match|text content does not match/i;
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png") });
const vnToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const state = (ids) =>
  one(`select
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from activities t where project_id in (${ids})) a,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from verification_items t where project_id in (${ids})) v,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from issues t where project_id in (${ids})) i,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from actions t where project_id in (${ids})) ac,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from documents t where project_id in (${ids})) d,
    (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from document_reviews t where document_version_id in (select v.id from document_versions v join documents d on d.id=v.document_id where d.project_id in (${ids}))) r,
    (select count(*)::int from files where project_id in (${ids})) f,
    (select count(*)::int from storage.objects where bucket_id='rayims-files') o`);

const admin = await signIn("admin");
const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function open(width, height, who = "admin", tz = "Asia/Ho_Chi_Minh") {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: tz, locale: "en-US" });
  const page = await ctx.newPage();
  page.problems = [];
  page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && HYDRATION.test(m.text())) page.problems.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => { if (HYDRATION.test(String(e))) page.problems.push(String(e).slice(0, 200)); });
  await page.goto(APP + "/login");
  await page.fill("#email", users[who].email);
  await page.fill("#password", users[who].password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 25000 }).catch(() => {}), page.click('button[type="submit"]')]);
  return { ctx, page };
}
const sec = (p, id) => p.getByTestId(id);
const rows = (s) => s.locator("a[class*='min-h-10']");
const texts = async (l) => (await l.allInnerTexts()).map(flat);

// ================= 1. Home empty state (no fixtures yet; genuine data has no pending work) =================
await cleanupP7a(admin.token);
{
  const { ctx, page } = await open(1280, 800);
  await page.goto(APP + "/dashboard");
  const empty = sec(page, "home-empty");
  const ok = await wait(empty);
  const body = flat(await page.locator("main").innerText());
  rec(ok && /No pending work needs your attention\./i.test(body) && (await empty.getByRole("link", { name: "View Projects" }).count()) === 1, "Home empty state: 'No pending work needs your attention.' with View Projects");
  rec(!/workspace is ready|will appear here as they are built/i.test(await page.locator("body").innerText()) && (await page.locator("h1").first().innerText()).trim() === "Home", "Home empty state: no placeholder wording; page title Home");
  rec(await page.getByRole("link", { name: "Home", exact: true }).first().isVisible(), "Navigation entry is Home");
  await empty.getByRole("link", { name: "View Projects" }).click();
  rec(/\/projects$/.test((await page.waitForURL("**/projects", { timeout: 15000 }).then(() => page.url()).catch(() => page.url()))), "View Projects opens the Projects workspace");
  await ctx.close();
}

// ================= 2. Fixtures + Home with data =================
const t0 = Date.now();
const f = await createP7a(admin.token);
info(`fixtures ${Math.round((Date.now() - t0) / 1000)} s`);
const IDS = `'${f.pA}','${f.pB}','${f.pF}'`;
const before = state(IDS);
const ACT = (p, id) => `${APP}/projects/${p}/activities/${id}`;

{
  const { ctx, page } = await open(1280, 800);
  const t = Date.now();
  await page.goto(APP + "/dashboard");
  await sec(page, "recent-projects").waitFor({ timeout: 30000 });
  const homeMs = Date.now() - t;
  info(`Home load ${homeMs} ms`);
  await shot(page, "home-desktop");
  const up = sec(page, "upcoming-activities");
  const upRows = await texts(rows(up));
  rec(upRows.length === 5, `Upcoming: capped at 5 (got ${upRows.length})`);
  rec(upRows[0].startsWith("P7A-ACCEPT-Upcoming 1") && upRows[1].startsWith("P7A-ACCEPT-Upcoming B") && upRows[2].startsWith("P7A-ACCEPT-Upcoming 2") && upRows[4].startsWith("P7A-ACCEPT-Upcoming 4"), `Upcoming: soonest first across projects (${upRows.map((r) => r.slice(14, 26)).join(" | ")})`);
  rec(upRows[1].includes("P7A-ACCEPT-Project B") && upRows[0].includes("P7A-ACCEPT-Project A") && /Site Assessment/.test(upRows[0]) && /Project-wide|P7A-ACCEPT-Site A1/.test(upRows[0]), "Upcoming: shows Project, Activity Type and Site (or Project-wide), date and status");
  const upAll = flat(await up.innerText());
  rec(!/Completed Future|Cancelled Future/.test(upAll), "Upcoming: completed / cancelled Activities are not listed");
  rec((await up.locator("a[class*='min-h-10']").first().getAttribute("href")) === `/projects/${f.pA}/activities/${f.upcoming[0]}`, "Upcoming: a row opens Activity Detail");

  const od = sec(page, "overdue-actions");
  const odRows = await texts(rows(od));
  const expectedTotal = 9 + (vnToday > "2026-10-03" ? 1 : 0);
  rec(odRows.length === 5 && flat(await od.locator("h2").innerText()).includes(`(${expectedTotal})`), `Overdue: 5 rows, total (${expectedTotal}) counted across Projects (heading: ${flat(await od.locator("h2").innerText())})`);
  const odAll = flat(await od.innerText());
  rec(/F-\d{3} · P7A-ACCEPT-Home Finding/.test(odRows[0]) && /Due /.test(odRows[0]) && /HSE Manager/.test(odRows[0]) && odRows[0].includes("P7A-ACCEPT-Project A"), "Overdue: description, related Finding number, owner, due date and Project");
  rec(odAll.includes("P7A-ACCEPT-Overdue B") && odAll.includes("P7A-ACCEPT-Project B") && !/Closed Past Due|Due Tomorrow/.test(odAll), "Overdue: other Project included; closed and not-yet-due Actions excluded");
  const hrefs = await rows(od).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  rec(hrefs[0] === `/projects/${f.pA}/findings/${f.homeFinding}` && hrefs.slice(1).every((h) => h.endsWith("/actions?filter=overdue")), "Overdue: Finding-linked row opens the Finding; others open the Actions workspace filtered to Overdue");

  const dr = sec(page, "documents-under-review");
  const drRows = await texts(rows(dr));
  rec(drRows.length === 5 && flat(await dr.locator("h2").innerText()).includes("(8)"), `Documents Under Review: 5 rows, total (8) (heading: ${flat(await dr.locator("h2").innerText())})`);
  rec(drRows[0].includes("P7A-ACCEPT-Procedure B") && drRows[0].includes("P7A-ACCEPT-Project B") && drRows.every((r) => /V1/.test(r) && /Under Review/.test(r)), "Documents Under Review: oldest open assessment first, Project, Site, current Version and Under Review");
  const drAll = flat(await dr.innerText());
  rec(!/Accepted Procedure|No Version Procedure/.test(drAll) && /QP-0/.test(drAll), "Documents Under Review: concluded / unreceived Documents are not listed; Document Code shown");
  rec((await rows(dr).first().getAttribute("href")) === `/projects/${f.pB}/documents/${f.docB.doc}`, "Documents Under Review: a row opens Document Detail");

  const rp = sec(page, "recent-projects");
  const rpRows = await texts(rows(rp));
  rec(rpRows.length === 5 && rpRows.every((r, i) => r.startsWith(`P7A-ACCEPT-Recent ${6 - i}`)), `Recent Projects: the 5 newest (${rpRows.map((r) => r.slice(10, 20)).join(" | ")})`);
  rec(await noHOverflow(page) && page.problems.length === 0, `Home desktop: no horizontal overflow, no hydration warning (${page.problems.join(" / ")})`);
  const b1 = await up.boundingBox();
  const b2 = await od.boundingBox();
  rec(Math.abs(b1.y - b2.y) < 4 && b2.x > b1.x + b1.width - 4, "Home desktop 1280x800: Upcoming and Overdue sit side by side");
  rec(!/Your workspace is ready/i.test(await page.locator("body").innerText()), "Home with data: no placeholder");
  await rows(up).first().click();
  rec(new RegExp(`/activities/${f.upcoming[0]}$`).test(await page.waitForURL("**/activities/**", { timeout: 20000 }).then(() => page.url()).catch(() => page.url())), "Clicking an Upcoming row lands on its Activity Detail");
  await ctx.close();
}

// Consultant sees the same Home; signed-out request goes to login without fixture content
{
  const { ctx, page } = await open(1280, 800, "consultant");
  await page.goto(APP + "/dashboard");
  await sec(page, "recent-projects").waitFor({ timeout: 30000 });
  const oh = flat(await sec(page, "overdue-actions").locator("h2").innerText());
  const dh = flat(await sec(page, "documents-under-review").locator("h2").innerText());
  rec(oh.includes(`(${9 + (vnToday > "2026-10-03" ? 1 : 0)})`) && dh.includes("(8)") && (await rows(sec(page, "upcoming-activities")).count()) === 5, "Consultant: same Home as Admin (same counts and caps)");
  await ctx.close();
  const anon = await (await browser.newContext()).newPage();
  const res = await anon.goto(APP + "/dashboard");
  const body = await anon.locator("body").innerText();
  rec(/\/login/.test(anon.url()) && !/P7A-ACCEPT/.test(body), `Signed out: /dashboard redirects to login, no fixture content (${res?.status()})`);
  await anon.context().close();
}

// ================= 3. Project Overview (shares the same sections) =================
{
  const { ctx, page } = await open(1280, 800);
  await page.goto(`${APP}/projects/${f.pA}`);
  await sec(page, "overdue-actions").waitFor({ timeout: 30000 });
  const up = sec(page, "upcoming-activities");
  const upRows = await texts(rows(up));
  const od = sec(page, "overdue-actions");
  const odRows = await texts(rows(od));
  rec(upRows.length === 3 && upRows[0].startsWith("P7A-ACCEPT-Upcoming 1") && !upRows.join(" ").includes("Upcoming B") && !upRows[0].includes("P7A-ACCEPT-Project A"), `Project Overview: 3 upcoming of this Project only, no repeated Project name (${upRows.map((r) => r.slice(14, 26)).join(" | ")})`);
  rec(odRows.length === 5 && flat(await od.locator("h2").innerText()).includes("(8)") && !flat(await od.innerText()).includes("Overdue B") && (await od.getByRole("link", { name: "View all Actions" }).count()) === 1, "Project Overview: Overdue Actions of this Project only (8), 5 shown, View all Actions");
  await ctx.close();
}

// ================= 4. Date-only values in four time zones =================
const ZONES = ["Asia/Ho_Chi_Minh", "UTC", "America/Los_Angeles", "Pacific/Kiritimati"];
for (const tz of ZONES) {
  const { ctx, page } = await open(1280, 800, "admin", tz);
  await page.goto(`${APP}/projects/${f.pF}/actions`);
  const row = page.locator(`tr[data-action-id="${f.aFA}"]`);
  await row.waitFor({ timeout: 30000 });
  const due = flat(await row.innerText());
  await page.goto(ACT(f.pF, f.FA));
  await page.locator("h1").first().waitFor({ timeout: 30000 });
  const detail = flat(await page.locator("main").innerText());
  rec(/Oct 3, 2026/.test(due) && !/Oct 2, 2026|Oct 4, 2026/.test(due) && /Oct 3, 2026/.test(detail) && !/Oct 2, 2026/.test(detail) && page.problems.length === 0, `${tz}: date-only 2026-10-03 shows Oct 3, 2026 on Actions and Activity Detail, no hydration warning`);
  await ctx.close();
}

// ================= 5. Midnight: local "today" (controlled clock) =================
async function atInstant(tz, iso, fn) {
  const { ctx, page } = await open(1280, 800, "admin", tz);
  await page.clock.setFixedTime(new Date(iso));
  const out = await fn(page);
  await ctx.close();
  return out;
}
async function overdueAt(tz, iso) {
  return atInstant(tz, iso, async (page) => {
    await page.goto(`${APP}/projects/${f.pF}/actions?filter=overdue`);
    const table = page.locator("tbody");
    await page.getByRole("heading", { name: "Actions", exact: true }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(600);
    const actionOverdue = (await page.locator(`tr[data-action-id="${f.aFA}"]`).count()) === 1 && /Overdue/.test(await page.locator(`tr[data-action-id="${f.aFA}"]`).innerText());
    await page.goto(`${APP}/projects/${f.pF}/plan`);
    await page.getByRole("heading", { name: /Master Plan|Activities/ }).first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
    const midnight = page.locator("tbody tr", { hasText: "P7A-ACCEPT-Activity Midnight" });
    const activityOverdue = (await midnight.count()) > 0 && /Overdue/.test(await midnight.first().innerText());
    void table;
    return { actionOverdue, activityOverdue };
  });
}
for (const [tz, before1, after1, label] of [
  ["Asia/Ho_Chi_Minh", "2026-10-03T16:59:00Z", "2026-10-03T17:01:00Z", "Asia/Ho_Chi_Minh"],
  ["America/Los_Angeles", "2026-10-04T06:59:00Z", "2026-10-04T07:01:00Z", "America/Los_Angeles"],
]) {
  const a = await overdueAt(tz, before1);
  const b = await overdueAt(tz, after1);
  rec(!a.actionOverdue && !a.activityOverdue, `${label} local 03 Oct 23:59: Action due 2026-10-03 and Activity ending 2026-10-03 are NOT overdue`);
  rec(b.actionOverdue && b.activityOverdue, `${label} local 04 Oct 00:01: both ARE overdue`);
}

// ================= 6. Timestamps (LocalTime) =================
for (const [tz, re, label] of [
  ["Asia/Ho_Chi_Minh", /Oct 3, 2026, 11:59 PM/, "Ho Chi Minh 23:59"],
  ["America/Los_Angeles", /Oct 3, 2026, 09:59 AM/, "Los Angeles 09:59"],
]) {
  const { ctx, page } = await open(1280, 800, "admin", tz);
  await page.goto(`${APP}/projects/${f.pF}/findings/${f.fNone}`);
  await page.locator("h1").first().waitFor({ timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll("time.invisible").length === 0, null, { timeout: 15000 }).catch(() => {});
  const txt = flat(await page.locator("main").innerText());
  rec(re.test(txt) && page.problems.length === 0 && (await page.locator("time.invisible").count()) === 0, `${tz}: timestamp 2026-10-03T16:59Z shows as ${label}; no hydration warning`);
  if (tz === "Asia/Ho_Chi_Minh") {
    const html = await (await ctx.request.get(`${APP}/projects/${f.pF}/findings/${f.fNone}`)).text();
    rec(/<time[^>]*class="invisible"/.test(html) && !/Oct 3, 2026, 11:59 PM/.test(html), "Server HTML carries a hidden placeholder, never a server-zone time on screen");
  }
  await ctx.close();
}


// ================= 7. Gap Assessment -> Verification deep link =================
const TARGET_Q = "Is the authority matrix defined?";
async function inViewport(el, bottomReserve = 0) {
  return el.evaluate((n, reserve) => { const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight - reserve; }, bottomReserve);
}
async function followLink(page, reserve) {
  await page.goto(`${APP}/projects/${f.pA}/documents/${f.linkDoc.doc}`);
  const panel = page.getByTestId("gap-assessment");
  await panel.waitFor({ timeout: 30000 });
  await panel.getByTestId("follow-up-summary").getByRole("button", { name: /Follow-up/ }).click();
  const link = panel.getByTestId("follow-up-list").getByRole("link", { name: /authority matrix/ });
  const href = await link.getAttribute("href");
  await Promise.all([page.waitForURL("**/verification?item=*", { timeout: 25000 }), link.click()]);
  const target = page.locator(`[data-verification-item-id="${f.viTarget}"]:visible`);
  await target.waitFor({ timeout: 25000 });
  await page.waitForTimeout(500);
  return { href, target, search: await page.getByLabel("Search verification items").inputValue() };
}
{
  const { ctx, page } = await open(1280, 800, "consultant");
  const t = Date.now();
  const r = await followLink(page, 0);
  const ms = Date.now() - t;
  rec(r.href === `/projects/${f.pA}/verification?item=${f.viTarget}`, "Gap Assessment follow-up link carries ?item=<verification item id>");
  rec((await r.target.getAttribute("data-highlighted")) === "true" && (await inViewport(r.target)) && r.search === "", "Desktop: the follow-up item is scrolled into view and highlighted, no search needed");
  await page.mouse.move(2, 2); // no hover colour in the measurement
  const bg = await r.target.evaluate((n) => getComputedStyle(n).backgroundColor);
  const plain = await page.locator("tbody tr[data-verification-item-id]:visible").first().evaluate((n) => getComputedStyle(n).backgroundColor);
  rec(bg !== plain && bg !== "rgba(0, 0, 0, 0)", `Desktop: highlight differs from a normal row without hover (highlight ${bg} vs row ${plain})`);
  await shot(page, "verification-deeplink-desktop");
  await page.waitForTimeout(6500);
  rec((await r.target.getAttribute("data-highlighted")) === null && (await page.locator("[data-highlighted]").count()) === 0, "The highlight is temporary (cleared after a few seconds)");
  rec(page.problems.length === 0, "Deep link: no hydration warning");
  info(`Verification deep link (incl. Document Detail + click) ${ms} ms`);
  await ctx.close();
}
for (const w of [390, 412]) {
  const { ctx, page } = await open(w, 844, "consultant");
  const r = await followLink(page, 72);
  const hit = await r.target.evaluate((el) => { const b = el.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height / 2, 30)); return !!h && (h === el || el.contains(h)); });
  rec((await r.target.getAttribute("data-highlighted")) === "true" && (await inViewport(r.target, 60)) && hit && await noHOverflow(page), `${w}px: deep-linked item visible, highlighted, not under the bottom nav, no overflow`);
  await ctx.close();
}

// ================= 8. Invalid deep links =================
{
  const { ctx, page } = await open(1280, 800, "consultant");
  for (const [label, item] of [["malformed id", "not-a-uuid"], ["another project's item", f.viB], ["deleted item", f.viDeleted], ["very long value", "x".repeat(300)]]) {
    const res = await page.goto(`${APP}/projects/${f.pA}/verification?item=${item}`);
    await page.getByRole("heading", { name: "Verification", exact: true }).waitFor({ timeout: 30000 });
    const body = await page.locator("body").innerText();
    rec(res.status() < 400 && (await wait(page.getByTestId("verification-link-note"), 5000)) && (await page.locator("[data-highlighted]").count()) === 0 && !/BMARKER/.test(body) && /Filler check 01/.test(body), `Invalid link (${label}): the workspace loads, a compact note, no highlight, nothing from another project`);
  }
  await page.goto(`${APP}/projects/${f.pA}/verification?item=${f.viB}`);
  await page.getByTestId("verification-link-note").getByRole("button", { name: "Dismiss" }).click();
  rec((await page.getByTestId("verification-link-note").count()) === 0, "The note can be dismissed");
  await ctx.close();
}

// ================= 9. Findings: Activity filter =================
async function chooseFilter(page, label, text) { await page.getByLabel(`Filter by ${label}`).selectOption({ label: text }); }
async function selectOptions(page, label) { return (await page.getByLabel(`Filter by ${label}`).locator("option").allInnerTexts()).map(flat); }
{
  const { ctx, page } = await open(1280, 800);
  await page.goto(`${APP}/projects/${f.pF}/findings`);
  await page.getByRole("heading", { name: "Findings", exact: true }).first().waitFor({ timeout: 30000 });
  const body = () => page.locator("tbody tr");
  const names = async () => (await texts(body())).map((t) => (t.match(/P7A-ACCEPT-(Finding [A-Za-z0-9-]+)/) ?? [])[1]).sort();
  const opts = await selectOptions(page, "Activity");
  rec(opts[0] === "All Activities" && opts[1] === "Project-wide / No Activity" && opts.length === 5 && opts.some((o) => /Activity FA$/.test(o)) && opts.some((o) => /Activity FB$/.test(o)) && opts.some((o) => /Activity Midnight$/.test(o)) && !opts.some((o) => /Upcoming/.test(o)), `Findings: Activity filter lists All, Project-wide / No Activity and this Project's Activities only (${opts.length} options)`);
  rec(JSON.stringify(await names()) === JSON.stringify(["Finding FA1", "Finding FA2", "Finding FB1", "Finding Project-wide"]), "Findings: All Activities shows the 4 Findings");
  await chooseFilter(page, "Activity", opts.find((o) => /Activity FA$/.test(o)));
  rec(JSON.stringify(await names()) === JSON.stringify(["Finding FA1", "Finding FA2"]), "Findings: Activity FA -> exactly its 2 Findings");
  await chooseFilter(page, "Activity", opts.find((o) => /Activity FB$/.test(o)));
  rec(JSON.stringify(await names()) === JSON.stringify(["Finding FB1"]), "Findings: Activity FB -> exactly 1 Finding");
  await chooseFilter(page, "Activity", "Project-wide / No Activity");
  rec(JSON.stringify(await names()) === JSON.stringify(["Finding Project-wide"]), "Findings: Project-wide / No Activity -> only the Finding without an Activity");
  await chooseFilter(page, "Activity", opts.find((o) => /Activity Midnight$/.test(o)));
  rec((await body().count()) === 0 && /No findings match/i.test(await page.locator("main").innerText()), "Findings: an Activity without Findings -> empty state");
  await chooseFilter(page, "Activity", opts.find((o) => /Activity FA$/.test(o)));
  await chooseFilter(page, "Type", "Observation");
  rec(JSON.stringify(await names()) === JSON.stringify(["Finding FA2"]), "Findings: Activity + Type combine (FA + Observation -> FA2)");
  await page.getByLabel("Search findings").fill("FA1");
  rec((await body().count()) === 0, "Findings: Activity + Type + search combine (no match)");
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  rec(JSON.stringify(await names()) === JSON.stringify(["Finding FA1", "Finding FA2", "Finding FB1", "Finding Project-wide"]) && (await page.getByLabel("Filter by Activity").inputValue()) === "all", "Findings: Clear resets the Activity filter too");
  const t = Date.now();
  await chooseFilter(page, "Activity", opts.find((o) => /Activity FA$/.test(o)));
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2);
  info(`Findings Activity filter applied in ${Date.now() - t} ms`);
  rec(!/BMARKER/.test(await page.locator("body").innerText()), "Findings: nothing from another Project");
  await ctx.close();
}

// ================= 10. Actions: Activity filter (own Activity only) =================
{
  const { ctx, page } = await open(1280, 800);
  await page.goto(`${APP}/projects/${f.pF}/actions`);
  await page.getByRole("heading", { name: "Actions", exact: true }).first().waitFor({ timeout: 30000 });
  const body = () => page.locator("tbody tr[data-action-id]");
  const names = async () => (await texts(body())).map((t) => (t.match(/P7A-ACCEPT-(Action [A-Za-z0-9 -]+?)(?= (?:F-\d|Standalone|P7A|Project|—|HSE|\d|Open|Overdue|$))/) ?? [])[1] ?? t.slice(0, 40)).sort();
  const opts = await selectOptions(page, "Activity");
  rec(opts[0] === "All Activities" && opts[1] === "No Activity" && opts.length === 5 && !opts.some((o) => /Upcoming/.test(o)), `Actions: Activity filter lists All, No Activity and this Project's Activities only (${opts.length} options)`);
  rec((await body().count()) === 4, "Actions: All Activities shows the 4 Actions");
  await chooseFilter(page, "Activity", opts.find((o) => /Activity FA$/.test(o)));
  let t1 = await texts(body());
  rec(t1.length === 1 && t1[0].includes("P7A-ACCEPT-Action FA"), "Actions: Activity FA -> only the Action whose own Activity is FA (the Finding-linked Action without an Activity is NOT included)");
  await chooseFilter(page, "Activity", opts.find((o) => /Activity FB$/.test(o)));
  t1 = await texts(body());
  rec(t1.length === 1 && t1[0].includes("P7A-ACCEPT-Action FB"), "Actions: Activity FB -> exactly 1 Action");
  await chooseFilter(page, "Activity", "No Activity");
  t1 = await texts(body());
  rec(t1.length === 2 && t1.some((x) => x.includes("Action no Activity")) && t1.some((x) => x.includes("Action linked to FA1 without Activity")), "Actions: No Activity -> the standalone Action and the Finding-linked Action without an Activity");
  await chooseFilter(page, "Activity", opts.find((o) => /Activity FA$/.test(o)));
  await chooseFilter(page, "Status", "Overdue");
  t1 = await texts(body());
  rec(t1.length === (vnToday > "2026-10-03" ? 1 : 0), "Actions: Activity + Status (Overdue) combine");
  await page.getByLabel("Search actions").fill("zzz-no-such");
  rec((await body().count()) === 0, "Actions: Activity + Status + search combine (no match)");
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  rec((await body().count()) === 4 && (await page.getByLabel("Filter by Activity").inputValue()) === "all", "Actions: Clear resets the Activity filter too");
  const t = Date.now();
  await chooseFilter(page, "Activity", opts.find((o) => /Activity FA$/.test(o)));
  await page.waitForFunction(() => document.querySelectorAll("tbody tr[data-action-id]").length === 1);
  info(`Actions Activity filter applied in ${Date.now() - t} ms`);
  // The Activity Report is deliberately broader: it also lists the Actions of the Activity's Findings.
  await page.goto(ACT(f.pF, f.FA));
  const rs = page.getByTestId("activity-report-summary");
  await rs.waitFor({ timeout: 30000 });
  const rtext = flat(await rs.innerText());
  rec(rtext.includes("P7A-ACCEPT-Action FA") && rtext.includes("P7A-ACCEPT-Action linked to FA1 without Activity"), "Activity Report keeps its broader rule: lists the Action of Activity FA AND the Action linked to its Finding (the workspace filter shows only the first)");
  await ctx.close();
}

// ================= 11. Mobile (390 / 412) =================
for (const w of [390, 412]) {
  const { ctx, page } = await open(w, 844, "consultant");
  const mk = async (label, url, ready) => {
    await page.goto(url);
    await ready().waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
    return noHOverflow(page);
  };
  rec(await mk("Home", `${APP}/dashboard`, () => sec(page, "recent-projects")) && await rows(sec(page, "overdue-actions")).evaluateAll((els) => els.every((e) => e.getBoundingClientRect().right <= document.documentElement.clientWidth + 1)), `${w}px Home: no overflow, rows fit and wrap`);
  await shot(page, `home-${w}`);
  rec(await mk("Activity Detail", ACT(f.pA, f.upcoming[0]), () => page.getByTestId("activity-report-summary")), `${w}px Activity Detail: no overflow`);
  rec(await mk("Verification", `${APP}/projects/${f.pA}/verification`, () => page.getByRole("heading", { name: "Verification", exact: true })), `${w}px Verification: no overflow`);
  rec(await mk("Finding detail", `${APP}/projects/${f.pF}/findings/${f.fNone}`, () => page.locator("h1").first()), `${w}px Finding detail (timestamp row): no overflow`);
  await page.goto(`${APP}/projects/${f.pF}/findings`);
  await page.getByRole("button", { name: "+ New Finding" }).first().click();
  const dlg = page.getByRole("dialog");
  rec((await wait(dlg)) && await noHOverflow(page), `${w}px Finding create: the form opens and fits`);
  await dlg.getByRole("button", { name: "Cancel" }).click();
  rec(await mk("Findings", `${APP}/projects/${f.pF}/findings`, () => page.getByRole("heading", { name: "Findings", exact: true }).first()), `${w}px Findings: no overflow`);
  await shot(page, `findings-${w}`);
  const fsel = page.getByLabel("Filter by Activity");
  rec(await fsel.evaluate((e) => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.right <= window.innerWidth; }), `${w}px Findings: the Activity filter fits the screen`);
  await fsel.selectOption({ label: "Project-wide / No Activity" });
  rec((await page.locator("div.md\\:hidden a, div.md\\:hidden [role='button'], div.md\\:hidden > div").first().isVisible().catch(() => true)) && /Finding Project-wide/.test(await page.locator("main").innerText()), `${w}px Findings: the Activity filter is usable`);
  rec(await mk("Actions", `${APP}/projects/${f.pF}/actions`, () => page.getByRole("heading", { name: "Actions", exact: true }).first()), `${w}px Actions: no overflow`);
  const asel = page.getByLabel("Filter by Activity");
  await asel.selectOption({ label: "No Activity" });
  rec(await asel.evaluate((e) => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.right <= window.innerWidth; }) && /no Activity/.test(await page.locator("main").innerText()), `${w}px Actions: the Activity filter fits and is usable`);
  await shot(page, `actions-${w}`);
  rec(await mk("Document Detail", `${APP}/projects/${f.pA}/documents/${f.docs[0].doc}`, () => page.getByTestId("gap-assessment")), `${w}px Document Detail + Gap Assessment: no overflow`);
  const complete = page.getByTestId("gap-assessment").getByRole("button", { name: "Complete Assessment" });
  await complete.evaluate((el) => el.scrollIntoView({ block: "center" }));
  rec(await complete.evaluate((el) => { const b = el.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!h && (h === el || el.contains(h)); }), `${w}px Gap Assessment: Complete Assessment is reachable, not under the bottom nav`);
  await page.goto(ACT(f.pF, f.FA));
  await page.getByTestId("activity-summary").waitFor({ timeout: 30000 });
  const edit = page.getByTestId("activity-summary").getByRole("button", { name: /(Add|Edit) Activity Summary/ });
  await edit.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await edit.click();
  const sd = page.getByRole("dialog");
  await sd.waitFor({ timeout: 15000 });
  const save = sd.getByRole("button", { name: /^Save/ });
  rec(await save.isVisible() && await noHOverflow(page), `${w}px Activity Summary editor: opens, Save visible`);
  await ctx.close();
}

// ================= 12. Desktop: Verification highlight + filters density =================
{
  const { ctx, page } = await open(1280, 800);
  await page.goto(`${APP}/projects/${f.pF}/actions`);
  await page.getByRole("heading", { name: "Actions", exact: true }).first().waitFor({ timeout: 30000 });
  const bar = page.getByLabel("Filter by Activity");
  const ys = await page.locator("select[aria-label^=\"Filter by\"]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  rec(new Set(ys).size <= 2 && await bar.isVisible() && await noHOverflow(page), `Desktop 1280x800: Actions filters stay in at most 2 rows (${ys.length} filters)`);
  await page.goto(`${APP}/projects/${f.pF}/findings`);
  await page.getByRole("heading", { name: "Findings", exact: true }).first().waitFor({ timeout: 30000 });
  const ys2 = await page.locator("select[aria-label^=\"Filter by\"]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  rec(new Set(ys2).size <= 2 && await noHOverflow(page), `Desktop 1280x800: Findings filters stay in at most 2 rows (${ys2.length} filters)`);
  await ctx.close();
}

// ================= 13. Copy sweep (pilot-visible screens) =================
{
  const { ctx, page } = await open(1280, 800);
  const bad = /visit summary|visit report|approved\b|approval|finalize|submit for review|your workspace is ready|undefined|\[object|NaN/i;
  const pages = [
    ["Home", `${APP}/dashboard`], ["Projects", `${APP}/projects`], ["Project Overview", `${APP}/projects/${f.pA}`],
    ["Activity Detail", ACT(f.pF, f.FA)], ["Verification", `${APP}/projects/${f.pA}/verification`], ["Findings", `${APP}/projects/${f.pF}/findings`],
    ["Actions", `${APP}/projects/${f.pF}/actions`], ["Documents", `${APP}/projects/${f.pA}/documents`], ["Document Detail / Gap Assessment", `${APP}/projects/${f.pA}/documents/${f.linkDoc.doc}`],
  ];
  for (const [name, url] of pages) {
    await page.goto(url);
    await page.locator("h1, h2").first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
    const text = await page.locator("main").innerText();
    const m = text.match(bad);
    rec(!m && !/Not provided[\s\S]{0,40}Not provided/.test(text), `Copy: ${name} has no stale / approval / placeholder wording${m ? ` (found "${m[0]}")` : ""}`);
  }
  await ctx.close();
}

// ================= 14. No mutation, isolation, cleanup =================
const after = state(IDS);
rec(JSON.stringify(before) === JSON.stringify(after), "Opening Home, filters, deep links and date display changed no business data (Activities, checks, Findings, Actions, Documents, reviews, files, objects)");
await cleanupP7a(admin.token);
const left = one(`select (select count(*) from clients where name like 'P7A-ACCEPT-%')::int c, (select count(*) from projects where name like 'P7A-ACCEPT-%')::int p, (select count(*) from issues)::int i, (select count(*) from actions)::int a, (select count(*) from attachments)::int at, (select count(*) from files)::int f, (select count(*) from storage.objects where bucket_id='rayims-files')::int o, (select count(*) from documents)::int d`);
rec(left.c === 0 && left.p === 0 && left.i === 0 && left.a === 0 && left.at === 0 && left.f === 0 && left.o === 0 && left.d === 0, `Fixtures removed (${JSON.stringify(left)})`);
await browser.close();
const failed = R.done();
process.exit(failed ? 1 : 0);
