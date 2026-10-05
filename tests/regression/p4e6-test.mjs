import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { users, makeReporter, signIn, dbQuery } from "./common.mjs";
import { createFixtures, cleanupP4e6 } from "./p4e6-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p4e6-shots");
mkdirSync(OUT, { recursive: true });
const jpg = path.join(OUT, "photo.jpg");
writeFileSync(jpg, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20000, 7), Buffer.from([0xff, 0xd9])]));
const R = makeReporter();
const rec = R.rec.bind(R);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 15000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
async function waitDb(fn, ms = 15000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 700)); } return false; }
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });

const admin = await signIn("admin");
const f = await createFixtures(admin.token);
const P = `${APP}/projects/${f.p}`;
const ACT = `${P}/activities/${f.actVL}`;
const browser = await chromium.launch({ executablePath: process.env.RAYIMS_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(APP + "/login");
  await page.fill("#email", users.admin.email);
  await page.fill("#password", users.admin.password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
  return { ctx, page };
}
const dlg = (p) => p.getByRole("dialog");
const card = (p, q) => p.locator("div.rounded-lg", { hasText: q }).last();
const actStatus = () => dbQuery(`select status from activities where id='${f.actVL}'`)[0].status;

async function activityChecks(page, label) {
  await page.goto(ACT);
  await page.getByText("Verification", { exact: true }).first().waitFor({ timeout: 20000 });
  const sel = page.locator("#activity-status");
  rec(await wait(sel) && (await sel.inputValue()) === "in_progress", `${label}: single status select shows the current status`);
  rec((await page.locator('button[aria-pressed]').filter({ hasText: /^(Planned|In Progress|Completed)$/ }).count()) === 0, `${label}: no tab-like Planned / In Progress / Completed buttons`);
  // 6C: Action status badges inside the Activity Report Summary are not the Activity's status — excluded.
  const badgeCount = await page.locator("span", { hasText: /^In Progress$/ }).evaluateAll((els) => els.filter((e) => !e.closest('[data-testid="activity-report-summary"]')).length);
  rec(badgeCount === 0, `${label}: current status not repeated as a badge (${badgeCount})`);
  const order = await page.locator("section h2").allInnerTexts();
  rec(JSON.stringify(order) === JSON.stringify(["Plan", "Verification", "General Activity Evidence", "Outcome / Activity Summary", "Activity Report Summary"] /* 6C: report summary section added */ /* 4F rename; 6B: Activity Summary */), `${label}: order ${order.join(" → ")}`);
  const h = (await sel.boundingBox()).height;
  rec(h >= 40, `${label}: status control ${Math.round(h)}px tall`);
  rec(await noHOverflow(page), `${label}: no horizontal overflow`);
}

try {
  // ===== DESKTOP =====
  const { ctx, page } = await open(1280, 800);
  await activityChecks(page, "Desktop");
  await shot(page, "d-activity-top");
  // status lifecycle
  const sel = page.locator("#activity-status");
  for (const [v, l] of [["planned", "Planned"], ["in_progress", "In Progress"], ["completed", "Completed"], ["in_progress", "In Progress (reverse)"]]) {
    await sel.selectOption(v);
    rec(await wait(page.getByText("Status updated").first()) && await waitDb(() => actStatus() === v), `Status → ${l}: saved with feedback`);
    // 6B: poll the control (up to 10 s) instead of reading it once after 600 ms — the refresh after a save can take longer on a slow network.
    await page.waitForFunction((want) => document.querySelector("#activity-status")?.value === want, v, { timeout: 10000 }).catch(() => {});
    rec((await page.locator("section h2").count()) === 5 /* 6C */ && (await sel.inputValue()) === v, `  ...same page, all four sections still shown, control shows ${l}`);
  }
  // cancelled status still via overflow menu, shown in the control
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Cancel Activity" }).click();
  await page.getByRole("button", { name: "Cancel Activity" }).last().click();
  await waitDb(() => actStatus() === "cancelled");
  await page.reload();
  rec((await page.locator("#activity-status").inputValue()) === "cancelled", "Cancelled (via menu) is shown in the same single control");
  await page.locator("#activity-status").selectOption("in_progress");
  rec(await waitDb(() => actStatus() === "in_progress"), "Cancelled → In Progress still allowed (no new restriction)");

  // verification card hierarchy (desktop)
  await page.goto(ACT);
  await page.getByText("Verification", { exact: true }).first().waitFor();
  const states = { pending: "Check chemical storage", ok: "fire extinguisher", follow: "waste segregation", multi: "spill kit", elsewhere: "oil separator" };
  for (const [k, q] of Object.entries(states)) {
    const c = card(page, q);
    const ok = await c.evaluate((el) => {
      const ev = el.querySelector('[data-testid="evidence-button"]');
      const btns = [...el.querySelectorAll("button")].filter((b) => /^(Verify|Review \/ Edit|Create Finding|Add another Finding)$/.test(b.textContent.trim()));
      if (!ev) return "noevidence";
      return btns.every((b) => b.compareDocumentPosition(ev) & Node.DOCUMENT_POSITION_FOLLOWING) ? "ok" : "evidence-first";
    });
    rec(ok === "ok" || (k === "elsewhere" && ok === "ok"), `Card ${k}: execution/Finding actions come before Evidence (${ok})`);
  }
  // Notes terminology
  rec((await page.getByText(/^Notes: /).count()) >= 3 && (await page.getByText(/^Observation: /).count()) === 0, "Cards show 'Notes:' — never 'Observation:'");
  await card(page, "Check SDS").getByRole("button", { name: "Verify" }).click();
  await dlg(page).waitFor();
  rec((await dlg(page).locator('label[for="ve-notes"]').innerText()).trim() === "Notes" && !/Observation/.test(await dlg(page).innerText()), "Execution drawer labels the field 'Notes'");
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await gone(dlg(page));

  // Finding badges / list
  await page.goto(`${P}/findings`);
  await page.locator("tbody tr").first().waitFor();
  const openBadge = page.locator("tbody tr", { hasText: "Drum labels faded" }).locator("span", { hasText: /^Open$/ });
  rec(/bg-neutral-soft/.test(await openBadge.getAttribute("class")), "Finding 'Open' badge is neutral");
  const amber = await page.locator("tbody tr", { hasText: "Drum labels faded" }).locator("span.bg-warning-soft").count();
  rec(amber < 3, `Observation row: ${amber} amber badge(s) — Open no longer amber (was 3: Observation / Medium / Open)`);
  const siteCell = page.locator("tbody tr", { hasText: "Spill kit missing" }).locator("td").nth(3); // 6A: "No." column added first
  rec(await siteCell.evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); return getComputedStyle(e).whiteSpace === "nowrap" && r.getClientRects().length === 1; }), "Findings table: Site does not wrap (one line)");
  await shot(page, "d-findings");

  // NC detail
  await page.goto(`${P}/findings/${f.F.ncChem}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  const findingSec = page.locator("section", { has: page.getByRole("heading", { name: "Finding", exact: true }) });
  rec(!/TITLE/i.test(await findingSec.innerText()) && /DESCRIPTION/i.test(await findingSec.innerText()), "Finding section shows Description, no repeated Title");
  const eff = page.getByTestId("effectiveness");
  rec(/Not reviewed yet\./.test(await eff.innerText()) && !/Reviewed By/i.test(await eff.innerText()) && await wait(eff.getByRole("button", { name: "Record Effectiveness Review" })), "Effectiveness before review: 'Not reviewed yet.' + Record button");
  // action cards: editable = no status badge
  const editable = page.locator('[data-testid="action-card"]', { hasText: "Revise chemical storage procedure" });
  rec((await editable.locator("span", { hasText: /^In Progress$/ }).count()) === 0 && (await editable.getByLabel("Action status").inputValue()) === "in_progress" && /Overdue/.test(await editable.innerText()), "Editable action: status shown once (control), Overdue kept");
  const closedA = page.locator('[data-testid="action-card"]', { hasText: "Train warehouse personnel" });
  rec((await closedA.getByLabel("Action status").inputValue()) === "closed", "Closed action: status still clear (control shows Closed)");
  // close remaining actions, review, close, reopen wording
  for (const d of ["Revise chemical storage procedure", "Update warehouse inspection checklist"]) {
    const ac = page.locator('[data-testid="action-card"]', { hasText: d });
    await ac.getByLabel("Action status").selectOption("closed");
    await ac.getByRole("button", { name: "Close Action" }).click();
    await page.waitForTimeout(1500);
  }
  await page.getByRole("button", { name: "Record Effectiveness Review" }).click();
  await dlg(page).getByRole("button", { name: "Effective", exact: true }).click();
  await dlg(page).locator("#eff-notes").fill("No recurrence");
  await dlg(page).getByRole("button", { name: "Save" }).click();
  await gone(dlg(page));
  await eff.getByText("No recurrence").waitFor({ timeout: 20000 });
  const effT = flat(await eff.innerText());
  rec(/Result Effective/i.test(effT) && /Notes No recurrence/i.test(effT) && /Reviewed By \S+/i.test(effT) && /Reviewed At/i.test(effT), "After review: Result / Notes / Reviewed By / Reviewed At shown");
  await page.getByRole("button", { name: "Close Finding" }).click();
  await page.getByTestId("close-panel").getByRole("button", { name: "Close Finding" }).click();
  await page.getByRole("button", { name: "Reopen Finding" }).waitFor({ timeout: 20000 });
  // frozen actions show a read-only badge
  const frozen = page.locator('[data-testid="action-card"]', { hasText: "Train warehouse personnel" });
  rec((await frozen.locator("span", { hasText: /^Closed$/ }).count()) === 1 && (await frozen.getByLabel("Action status").count()) === 0, "Read-only (frozen) action: status badge shown instead of the control");
  await page.getByRole("button", { name: "Reopen Finding" }).click();
  const rt = flat(await page.locator("div.bg-warning-soft").innerText());
  rec(/clears the current Effectiveness Result/.test(rt) && /effectiveness notes/.test(rt) && /Correction/.test(rt) && /Root Cause Analysis/.test(rt) && /Corrective Actions are kept/.test(rt), `Reopen wording covers result, notes, Correction, RCA and Actions`);
  await page.locator("div.bg-warning-soft").getByRole("button", { name: "Cancel" }).click();

  // Actions desktop: finding title clamp
  await page.goto(`${P}/actions`);
  await page.locator("tbody tr").first().waitFor();
  const link = page.locator("tbody tr td:nth-child(2) a").first();
  const lh = await link.evaluate((e) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight), title: e.getAttribute("title") }));
  rec(lh.h <= lh.lh * 2 + 2 && lh.title && lh.title.length > 30, `Actions table: Finding title clamped to 2 lines (${Math.round(lh.h)}px), full title in tooltip`);
  await shot(page, "d-actions");
  rec(await noHOverflow(page), "Desktop Actions: no overflow");
  await ctx.close();

  // ===== MOBILE =====
  for (const [w, h] of [[390, 844], [412, 915]]) {
    const { ctx: mc, page: mp } = await open(w, h);
    await activityChecks(mp, `Mobile ${w}`);
    await shot(mp, `m${w}-activity-top`);
    const nav = await mp.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); const n = document.querySelector('nav[class*="fixed"]'); const els = [...document.querySelectorAll("main button, main a, main select")].filter((e) => e.getBoundingClientRect().height > 0); const r = els[els.length - 1].getBoundingClientRect(); return { last: r.bottom, navTop: n.getBoundingClientRect().top }; });
    rec(nav.last <= nav.navTop, `Mobile ${w}: last control above bottom navigation`);
    await mp.evaluate(() => window.scrollTo(0, 0));
    // card heights vs 4E.5 baseline
    const base = { pending: 224, ok: 246, follow: 212, multi: 338, elsewhere: 180 };
    const heights = {};
    for (const [k, q] of Object.entries({ pending: "Check chemical storage", ok: "fire extinguisher", follow: "waste segregation", multi: "spill kit", elsewhere: "oil separator" })) heights[k] = Math.round((await card(mp, q).boundingBox()).height);
    if (w === 390) rec(Object.keys(base).every((k) => heights[k] <= base[k] + 4), `Mobile 390: card heights not increased ${JSON.stringify(heights)} vs ${JSON.stringify(base)}`);
    const multi = card(mp, "spill kit");
    const vf = multi.getByRole("button", { name: /View Findings/ });
    rec((await vf.boundingBox()).height >= 36, `Mobile ${w}: 'View Findings' tap target ${Math.round((await vf.boundingBox()).height)}px`);
    const row = await multi.evaluate((el) => { const b = [...el.querySelectorAll("button")].filter((x) => /^(Review \/ Edit|Add another Finding)$/.test(x.textContent.trim())); return b.length === 2 ? Math.abs(b[0].getBoundingClientRect().top - b[1].getBoundingClientRect().top) : -1; });
    rec(row === 0, `Mobile ${w}: Review / Edit and Add another Finding share one row`);
    await multi.scrollIntoViewIfNeeded();
    await shot(mp, `m${w}-card-multi`);
    if (w === 390) {
      // toast vs sheet footer
      const pc = card(mp, "Check chemical storage");
      await pc.getByTestId("evidence-button").click();
      await dlg(mp).getByTestId("evidence-photo-input").setInputFiles(jpg);
      await dlg(mp).getByRole("button", { name: "Upload" }).click();
      await mp.getByText("Evidence added").first().waitFor({ timeout: 60000 });
      await dlg(mp).getByRole("button", { name: "Close" }).click();
      await pc.getByRole("button", { name: "Verify" }).click();
      await dlg(mp).waitFor();
      const toastBox = await mp.getByRole("status").filter({ hasText: "Evidence added" }).boundingBox().catch(() => null);
      const footerBtns = await dlg(mp).getByRole("button", { name: /^(Cancel|Save)$/ }).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
      const overlaps = toastBox ? footerBtns.some((b) => toastBox.y < b.bottom && toastBox.y + toastBox.height > b.top) : false;
      rec(toastBox && !overlaps, `Mobile 390: toast (y=${toastBox ? Math.round(toastBox.y) : "?"}) does not cover the sheet's Cancel / Save`);
      await shot(mp, "m390-toast-sheet");
      await dlg(mp).getByRole("button", { name: "Cancel" }).click();
      // action form layout
      await mp.goto(`${P}/findings/${f.F.ncSpill}`);
      await mp.getByRole("button", { name: "+ Add Corrective Action" }).click();
      await dlg(mp).waitFor();
      const ow = await dlg(mp).locator("#ac-owner").boundingBox(), du = await dlg(mp).locator("#ac-due").boundingBox();
      rec(ow.width > 300 && du.width > 300 && du.y > ow.y + 20, `Mobile 390: Owner and Due Date stacked full width (${Math.round(ow.width)}/${Math.round(du.width)}px)`);
      await shot(mp, "m390-action-form");
      await dlg(mp).getByRole("button", { name: "Cancel" }).click();
    }
    await mc.close();
  }

  // ===== REGRESSION =====
  {
    const { ctx: rc, page: rp } = await open(1280, 800);
    await rp.goto(ACT);
    await rp.getByText("Verification", { exact: true }).first().waitFor();
    const n0 = dbQuery(`select count(*) n from issues where project_id='${f.p}'`)[0].n;
    const c = card(rp, "emergency exit");
    await c.getByRole("button", { name: "Verify" }).click();
    await dlg(rp).getByRole("button", { name: "Issue Identified", exact: true }).click();
    await dlg(rp).locator("#ve-notes").fill("Exit partly blocked by pallets");
    await dlg(rp).getByRole("button", { name: "Save" }).click();
    await gone(dlg(rp));
    rec(await waitDb(() => dbQuery(`select notes from verification_items where id='${f.V.pendingExit}'`)[0].notes === "Exit partly blocked by pallets") && dbQuery(`select count(*) n from issues where project_id='${f.p}'`)[0].n === n0, "Issue Identified alone creates 0 Findings; notes saved to verification_items.notes");
    await c.getByRole("button", { name: "Create Finding" }).click();
    await dlg(rp).waitFor();
    rec((await dlg(rp).locator("#fd-description").inputValue()) === "Exit partly blocked by pallets", "Create Finding still prefills Description from the verification notes");
    await dlg(rp).getByRole("button", { name: "Observation", exact: true }).click();
    await dlg(rp).locator("#fd-title").fill("Exit route partly blocked");
    await dlg(rp).getByRole("button", { name: "Create" }).click();
    rec(await gone(dlg(rp)) && await waitDb(() => dbQuery(`select count(*) n from issues where title='Exit route partly blocked' and finding_type='observation'`)[0].n === 1), "Create Finding (type Observation) still works");
    await rp.goto(`${P}/findings/${f.F.ncSpill}`);
    await rp.getByRole("button", { name: "Close Finding" }).click();
    await rp.getByTestId("close-panel").getByText(/Close Finding?|Cannot close/).first().waitFor();
    const t = flat(await rp.getByTestId("close-panel").innerText());
    rec(/Correction has not been recorded/.test(t) && /Close Anyway/.test(t), "NC closure warnings unchanged");
    await rp.goto(`${P}/findings/${f.F.ofi}`);
    await rp.getByRole("button", { name: "Close Finding" }).click();
    await rp.getByTestId("close-panel").getByText(/Close Finding?|Cannot close/).first().waitFor();
    rec(/1 action is still open/.test(await rp.getByTestId("close-panel").innerText()), "OFI closure blocker unchanged");
    await rp.goto(`${P}/verification`);
    rec(await wait(rp.getByRole("link", { name: "Import Excel" })), "Verification workspace + Excel import entry");
    await rp.goto(`${P}/verification/import`);
    rec(await wait(rp.getByRole("heading", { name: "Import Verification Items" })), "Excel import page");
    await rp.goto(`${P}/plan`);
    rec(await wait(rp.getByText("Site Assessment – Viet Long").first()), "Master Plan");
    await rp.goto(P);
    rec(await wait(rp.getByRole("heading", { level: 1 }).first()), "Project Overview");
    await rc.close();
  }
} catch (e) {
  console.error("SCRIPT ERROR", e);
  rec(false, "script crashed: " + String(e).slice(0, 300));
} finally {
  await browser.close();
  const removed = await cleanupP4e6(admin.token);
  console.log("cleanup removed objects:", removed);
  process.exitCode = R.done() ? 1 : 0;
}
