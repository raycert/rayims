// Timing probe: large-project register load + export, repeated (P5F-ACCEPT- fixtures, cleaned up).
import { chromium } from "playwright-core";
import { users, signIn, dbQuery } from "./common.mjs";
import { createFixtures, createLargeProject, cleanupP5f } from "./p5f-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const admin = await signIn("admin");
const f = await createFixtures(admin.token);
createLargeProject(f.pL, f.vl, f.la);
const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(APP + "/login");
  await page.fill("#email", users.admin.email);
  await page.fill("#password", users.admin.password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }), page.click('button[type="submit"]')]);
  for (let i = 1; i <= 4; i++) {
    let t = Date.now();
    const res = await page.goto(`${APP}/projects/${f.pL}/documents`);
    const ttfb = Date.now() - t;
    await page.locator("tbody tr").first().waitFor({ timeout: 60000 });
    const rows = await page.locator("tbody tr").count();
    const reg = Date.now() - t;
    t = Date.now();
    const ex = await page.request.get(`${APP}/projects/${f.pL}/documents/export`);
    const body = await ex.body();
    console.log(`run ${i}: register ${reg} ms (document response ${ttfb} ms, status ${res.status()}, ${rows} rows) · export ${Date.now() - t} ms (${body.length} bytes)`);
  }
  // Small-project baseline in the same session
  let t = Date.now();
  await page.goto(`${APP}/projects/${f.p}/documents`);
  await page.locator("tbody tr").first().waitFor({ timeout: 60000 });
  console.log(`small project register ${Date.now() - t} ms`);
} finally {
  await browser.close();
  await cleanupP5f(admin.token);
  console.log("cleanup", JSON.stringify(dbQuery(`select (select count(*) from clients where name like 'P5F-ACCEPT-%')::int c, (select count(*) from documents)::int d, (select count(*) from files)::int f`)[0]));
}
