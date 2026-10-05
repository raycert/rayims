// Phase 7A: minimal Activity smoke test (the closest thing to a standalone "Phase 3" regression):
// a Consultant creates an Activity in the Master Plan (type, name, site, mode, consultant, date, times),
// edits it (name, end time, Project-wide), moves its status, and Activity Detail shows the result.
// Fixtures: P7A-ACCEPT- only (shared prefix with p7a-test; run them one after the other).
import { chromium } from "playwright-core";
import { randomUUID } from "node:crypto";
import { users, makeReporter, signIn, dbQuery } from "./common.mjs";
import { cleanupP7a } from "./p7a-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const R = makeReporter();
const rec = (ok, name, detail = "") => { R.rec(ok, name, detail); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " :: " + detail : ""}`); };
const wait = (l, t = 20000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 20000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const one = (sql) => dbQuery(sql)[0];
async function waitDb(fn, ms = 30000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 800)); } return false; }
const flat = (s) => s.replace(/\s+/g, " ").trim();
const T = (s) => `P7A-ACCEPT-${s}`;

const admin = await signIn("admin");
const consultant = await signIn("consultant");
await cleanupP7a(admin.token);
const [c, s1, s2, p] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
dbQuery(`insert into clients (id, name) values ('${c}', '${T("Smoke Client")}');
  insert into sites (id, client_id, name) values ('${s1}', '${c}', '${T("Smoke Site 1")}'), ('${s2}', '${c}', '${T("Smoke Site 2")}');
  insert into projects (id, client_id, name, status) values ('${p}', '${c}', '${T("Smoke Project")}', 'active');
  insert into project_sites (project_id, site_id) values ('${p}', '${s1}'), ('${p}', '${s2}');`);

const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "Asia/Ho_Chi_Minh", locale: "en-US" });
const page = await ctx.newPage();
await page.goto(APP + "/login");
await page.fill("#email", users.consultant.email);
await page.fill("#password", users.consultant.password);
await Promise.all([page.waitForURL("**/dashboard", { timeout: 25000 }).catch(() => {}), page.click('button[type="submit"]')]);
const dlg = () => page.getByRole("dialog");

// ---- create
await page.goto(`${APP}/projects/${p}/plan`);
await page.getByRole("button", { name: "+ New Activity" }).first().click();
const d = dlg();
await d.locator("#act-type").selectOption({ label: "Site Assessment" });
await d.locator("#act-name").fill(T("Smoke Assessment"));
await d.getByRole("button", { name: "Specific site" }).click();
await d.locator("#act-site").selectOption({ label: T("Smoke Site 1") });
await d.getByRole("button", { name: "On-site" }).click();
await d.locator("#act-consultant").selectOption(consultant.userId);
await d.locator("#act-start-date").fill("2026-11-10");
await d.locator("#act-start-time").fill("08:30");
await d.locator("#act-end-time").fill("16:00");
await d.getByRole("button", { name: "Create", exact: true }).click();
await gone(d);
await waitDb(() => !!one(`select id from activities where project_id='${p}'`));
const a = one(`select a.*, t.key from activities a join activity_types t on t.id = a.activity_type_id where a.project_id='${p}'`);
rec(a.key === "site_assessment" && a.name === T("Smoke Assessment") && a.site_id === s1 && a.mode === "on_site" && a.consultant_id === consultant.userId && a.start_date === "2026-11-10" && a.start_time === "08:30:00" && a.end_time === "16:00:00" && a.status === "planned", "Create: type, name, site, mode, consultant, date, start / end time and status Planned are stored");
rec(await wait(page.getByText(T("Smoke Assessment")).first()), "Create: the Activity is listed in the Master Plan");

// ---- validation: a time range that ends before it starts is refused, nothing changes
await page.goto(`${APP}/projects/${p}/activities/${a.id}`);
await page.getByRole("button", { name: "Edit Activity", exact: true }).click();
await dlg().locator("#act-end-time").fill("07:00");
await dlg().getByRole("button", { name: "Save", exact: true }).click();
await page.waitForTimeout(2500);
const unchanged = one(`select end_time from activities where id='${a.id}'`).end_time === "16:00:00";
rec(unchanged && (await dlg().count()) === 1, "Edit: an end time before the start time is refused and nothing is saved");

// ---- edit: name, end time, Project-wide
await dlg().locator("#act-end-time").fill("17:30");
await dlg().locator("#act-name").fill(T("Smoke Assessment (edited)"));
await dlg().getByRole("button", { name: "Project-wide" }).click();
await dlg().getByRole("button", { name: "Save", exact: true }).click();
await gone(dlg());
rec(await waitDb(() => { const r = one(`select name, end_time, site_id from activities where id='${a.id}'`); return r.name === T("Smoke Assessment (edited)") && r.end_time === "17:30:00" && r.site_id === null; }), "Edit: name, end time and site (Project-wide) are saved");

// ---- status
await page.reload();
await page.locator("#activity-status").selectOption("in_progress");
rec(await waitDb(() => one(`select status from activities where id='${a.id}'`).status === "in_progress"), "Status: Planned -> In Progress is saved");
await page.locator("#activity-status").selectOption("completed");
rec(await waitDb(() => one(`select status from activities where id='${a.id}'`).status === "completed"), "Status: In Progress -> Completed is saved");

// ---- Activity Detail
await page.reload();
await page.locator("h1").first().waitFor({ timeout: 20000 });
const text = flat(await page.locator("main").innerText());
rec(text.includes(T("Smoke Assessment (edited)")) && /Site Assessment/.test(text) && /Nov 10, 2026/.test(text) && /17:30/.test(text) && /Project-wide/.test(text) && /Completed/.test(text), "Activity Detail shows the name, type, date, time range, Project-wide scope and status");
rec(!/Overdue/.test(text), "A completed Activity is never overdue");

await browser.close();
await cleanupP7a(admin.token);
const left = one(`select (select count(*) from clients where name like 'P7A-ACCEPT-%')::int c, (select count(*) from activities)::int a`);
rec(left.c === 0, `Fixtures removed (${JSON.stringify(left)})`);
const failed = R.done();
process.exit(failed ? 1 : 0);
