import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { users, makeReporter, signIn, dbQuery, http, KEY } from "./common.mjs";
import { createFixtures, cleanupP4f } from "./p4f-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p4f-shots");
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
const exists = (table, id) => dbQuery(`select count(*)::int n from ${table} where id='${id}'`)[0].n === 1;
const row = (table, id, cols) => dbQuery(`select ${cols} from ${table} where id='${id}'`)[0];

const admin = await signIn("admin");
const f = await createFixtures(admin.token);
const P = `${APP}/projects/${f.p}`;
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
const dialog = (p) => p.getByTestId("delete-dialog");
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

// Opens the Delete dialog for a verification item (desktop row or mobile card).
async function openVerificationDelete(page, question, mobile = false) {
  await page.goto(`${P}/verification`);
  const container = mobile
    ? page.locator('div[role="button"]', { hasText: question })
    : page.locator("tbody tr", { hasText: question });
  await container.first().waitFor({ timeout: 20000 });
  await container.first().getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await dialog(page).waitFor();
  await dialog(page).getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  return dialog(page);
}
async function openFindingDelete(page, findingId) {
  await page.goto(`${P}/findings/${findingId}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete Finding" }).click();
  await dialog(page).waitFor();
  await dialog(page).getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  return dialog(page);
}
async function openActionDelete(page, description) {
  await page.goto(`${P}/actions`);
  const btn = page.locator("tbody tr", { hasText: description }).getByRole("button", { name: description });
  await btn.waitFor({ timeout: 20000 });
  await btn.click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await dialog(page).waitFor();
  await dialog(page).getByText("Checking…").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  return dialog(page);
}
const blockers = async (d) => (await d.getByTestId("delete-blockers").locator("li").allInnerTexts()).map(flat);
const hasDeleteBtn = async (d) => (await d.getByRole("button", { name: "Delete", exact: true }).count()) === 1;

const findingCount = () => dbQuery(`select count(*)::int n from issues where project_id='${f.p}'`)[0].n;

try {
  const { ctx, page } = await open(1280, 800);

  // ===== Verification controlled delete =====
  let d = await openVerificationDelete(page, "P4F keep me");
  rec(flat(await d.innerText()).includes("Delete verification item?") && flat(await d.innerText()).includes("This will permanently remove the planning check."), "VI delete: confirmation title + message");
  rec(await d.getAttribute("role") === "alertdialog" && !!(await d.getAttribute("aria-labelledby")), "VI delete dialog: role=alertdialog, labelled");
  rec(await page.evaluate(() => document.activeElement?.textContent?.trim()) === "Cancel", "VI delete dialog: focus starts on Cancel (safe default)");
  const delCls = await d.getByRole("button", { name: "Delete", exact: true }).getAttribute("class");
  rec(/bg-danger/.test(delCls), "VI delete: Delete button is destructive-styled");
  await d.getByRole("button", { name: "Cancel" }).click();
  rec(await gone(d) && exists("verification_items", f.V.delCancel), "VI delete: Cancel keeps the item");
  d = await openVerificationDelete(page, "P4F keep me");
  await page.keyboard.press("Escape");
  rec(await gone(d) && exists("verification_items", f.V.delCancel), "VI delete: Escape closes the dialog, item kept");

  const findingsBefore = findingCount();
  d = await openVerificationDelete(page, "P4F delete me");
  await shot(page, "d-vi-confirm");
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  rec(await wait(page.getByText("Verification item deleted").first()), "VI delete: toast 'Verification item deleted'");
  rec(await gone(d) && await waitDb(() => !exists("verification_items", f.V.delOk)), "VI delete (unused planning check): deleted");
  rec(await gone(page.locator("tbody tr", { hasText: "P4F delete me" })), "VI delete: row removed from the workspace");

  d = await openVerificationDelete(page, "P4F executed check");
  let b = await blockers(d);
  rec(JSON.stringify(b) === JSON.stringify(["This verification has execution history and cannot be deleted."]) && !(await hasDeleteBtn(d)), `VI executed: blocked (execution history) — ${b.join(" | ")}`);
  rec(flat(await d.innerText()).includes("can't be deleted") && (await d.getByRole("button", { name: "Close" }).count()) === 1, "VI blocked: blocked title + Close only");
  await d.getByRole("button", { name: "Close" }).click(); await gone(d);

  d = await openVerificationDelete(page, "P4F notes only");
  b = await blockers(d);
  rec(b.length === 1 && b[0].includes("execution history"), "VI with only non-blank notes: execution history blocker");
  await d.getByRole("button", { name: "Close" }).click(); await gone(d);

  d = await openVerificationDelete(page, "P4F pending check with evidence");
  b = await blockers(d);
  rec(JSON.stringify(b) === JSON.stringify(["This verification has Evidence and cannot be deleted."]), "VI pending with evidence: Evidence blocker only");
  await d.getByRole("button", { name: "Close" }).click(); await gone(d);

  d = await openVerificationDelete(page, "P4F spill kit check");
  b = await blockers(d);
  rec(b.length === 3 && b[0].includes("execution history") && b[1].includes("linked Findings") && b[2].includes("Evidence"), `VI executed + findings + evidence: all 3 blockers shown`);
  await shot(page, "d-vi-blocked-all");
  await d.getByRole("button", { name: "Close" }).click(); await gone(d);
  rec(exists("verification_items", f.V.executed) && exists("verification_items", f.V.notesOnly) && exists("verification_items", f.V.evidenceOnly) && exists("verification_items", f.V.multi), "Blocked VIs all still exist");
  rec(findingCount() === findingsBefore, `Finding count unchanged by verification deletes (${findingsBefore})`);

  // progress: 3 checks → 2 checks
  await page.goto(`${P}/activities/${f.actProg}`);
  const vHead = page.locator("section", { has: page.getByRole("heading", { name: "Verification", exact: true }) });
  await vHead.waitFor({ timeout: 20000 });
  rec(/3 checks · 3 pending/.test(flat(await vHead.innerText())), "Activity progress before: 3 checks · 3 pending (0 of 3 verified)");
  d = await openVerificationDelete(page, "P4F progress check 2");
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await gone(d);
  await waitDb(() => !exists("verification_items", f.V.prog2));
  await page.goto(`${P}/activities/${f.actProg}`);
  await vHead.waitFor({ timeout: 20000 });
  rec(/2 checks · 2 pending/.test(flat(await vHead.innerText())) && !/progress check 2/.test(await vHead.innerText()), "Activity progress after delete: 2 checks · 2 pending (0 of 2)");
  rec(row("activities", f.actProg, "status").status === "in_progress", "Activity itself untouched by the delete");

  // delete is not on Activity cards
  const cardMenus = await vHead.getByRole("menuitem", { name: /Delete/ }).count();
  rec(cardMenus === 0 && (await vHead.getByRole("button", { name: /Delete/ }).count()) === 0, "No delete control on Activity verification cards");

  // tamper: allowed id → executed id
  d = await openVerificationDelete(page, "P4F tamper source");
  await tamper(page, [[f.V.tamperOk, f.V.executed]]);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(2500);
  rec(exists("verification_items", f.V.executed) && exists("verification_items", f.V.tamperOk), "Tampered VI delete (executed id) refused by the server; nothing deleted");
  rec(/execution history/.test(await d.innerText()), "  ...dialog then shows the server's current blockers");
  await untamper(page);
  await page.keyboard.press("Escape");

  // ===== Finding controlled delete =====
  const vBefore = row("verification_items", f.V.issueSingle, "result, notes, verified_activity_id, verified_by, verified_at::text");
  const actBefore = row("activities", f.actVL, "status, updated_at::text");
  d = await openFindingDelete(page, f.F.bare);
  rec(flat(await d.innerText()).includes("Delete Finding?") && flat(await d.innerText()).includes("This permanently removes this Finding."), "Finding delete: confirmation title + message");
  await shot(page, "d-finding-confirm");
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  rec(await page.waitForURL(`**/projects/${f.p}/findings`, { timeout: 20000 }).then(() => true).catch(() => false), "Finding delete: returns to the Findings list");
  rec(await waitDb(() => !exists("issues", f.F.bare)), "Finding delete (open, no actions/evidence): deleted");
  rec(JSON.stringify(row("verification_items", f.V.issueSingle, "result, notes, verified_activity_id, verified_by, verified_at::text")) === JSON.stringify(vBefore), "  ...its Verification item is unchanged (result, notes, execution)");
  rec(JSON.stringify(row("activities", f.actVL, "status, updated_at::text")) === JSON.stringify(actBefore), "  ...its Activity is unchanged");

  d = await openFindingDelete(page, f.F.withAction);
  b = await blockers(d);
  rec(b.length === 1 && b[0].includes("linked Actions") && !(await hasDeleteBtn(d)), "Finding with an Action: blocked");
  await d.getByRole("button", { name: "Close" }).click(); await gone(d);
  d = await openFindingDelete(page, f.F.closed);
  b = await blockers(d);
  rec(b.length === 1 && b[0] === "Closed Findings are retained as project history. Reopen it if you need to continue working on it.", "Closed Finding: retained-as-history message");
  await d.getByRole("button", { name: "Close" }).click(); await gone(d);
  d = await openFindingDelete(page, f.F.withEvidence);
  b = await blockers(d);
  rec(b.length === 1 && b[0].includes("Evidence"), "Finding with Evidence: blocked");
  await d.getByRole("button", { name: "Close" }).click(); await gone(d);
  rec(exists("issues", f.F.withAction) && exists("issues", f.F.closed) && exists("issues", f.F.withEvidence), "Blocked Findings all still exist");

  d = await openFindingDelete(page, f.F.tamperOk);
  await tamper(page, [[f.F.tamperOk, f.F.closed]]);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(2500);
  rec(exists("issues", f.F.closed) && exists("issues", f.F.tamperOk), "Tampered Finding delete (closed id) refused by the server");
  await untamper(page);
  await page.keyboard.press("Escape");

  // ===== Action controlled delete =====
  d = await openActionDelete(page, "P4F standalone action to delete");
  rec(flat(await d.innerText()).includes("Delete Action?") && flat(await d.innerText()).includes("This permanently removes the Action."), "Action delete: confirmation title + message");
  await shot(page, "d-action-confirm");
  await page.keyboard.press("Escape");
  rec(await gone(d) && await wait(page.getByRole("dialog")), "Escape closes only the confirmation, the edit drawer stays open");
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
  rec(await wait(page.getByText("Action deleted").first()) && await gone(page.getByRole("dialog")), "Action delete: toast + drawer closed");
  rec(await waitDb(() => !exists("actions", f.A.delOk)), "Action delete (open, standalone): deleted");

  d = await openActionDelete(page, "P4F action with evidence");
  b = await blockers(d);
  rec(b.length === 1 && b[0].includes("Evidence") && !(await hasDeleteBtn(d)), "Action with Evidence: blocked");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");

  // Corrective action on an open NC from Finding Detail → deletable; Finding untouched
  const fwaBefore = row("issues", f.F.withAction, "status, updated_at::text");
  await page.goto(`${P}/findings/${f.F.withAction}`);
  const ac = page.locator('[data-testid="action-card"]', { hasText: "P4F corrective action on NC" });
  await ac.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => !exists("actions", f.A.onWithAction)), "Corrective Action deleted from Finding Detail (shared mutation)");
  rec(JSON.stringify(row("issues", f.F.withAction, "status, updated_at::text")) === JSON.stringify(fwaBefore), "  ...the Finding itself is unchanged");
  await page.waitForTimeout(1500);
  d = await openFindingDelete(page, f.F.withAction);
  rec(await hasDeleteBtn(d), "  ...and with no Actions left, the Finding is now deletable");
  await page.keyboard.press("Escape");

  // Tamper: allowed action → closed action; and → action of a closed finding
  const closedFindingAction = dbQuery(`insert into actions (project_id, issue_id, description, status) values ('${f.p}', '${f.F.closed}', 'P4F action of closed finding', 'open') returning id`)[0].id;
  for (const [target, label] of [[f.A.closed, "closed action"], [closedFindingAction, "action of a closed Finding"]]) {
    d = await openActionDelete(page, "P4F tamper source action");
    await tamper(page, [[f.A.tamperOk, target]]);
    await d.getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForTimeout(2500);
    rec(exists("actions", target) && exists("actions", f.A.tamperOk), `Tampered Action delete (${label}) refused by the server`);
    await untamper(page);
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  }

  // Real upload then blocker (evidence added after load → server re-check)
  await page.goto(`${P}/actions`);
  const trEv = page.locator("tbody tr", { hasText: "P4F tamper source action" });
  await trEv.getByTestId("evidence-button").click();
  const evDlg = page.getByRole("dialog");
  await evDlg.getByTestId("evidence-photo-input").setInputFiles(jpg);
  await evDlg.getByRole("button", { name: "Upload" }).click();
  await page.getByText("Evidence added").first().waitFor({ timeout: 60000 }).catch(() => {});
  const uploaded = await waitDb(() => dbQuery(`select count(*)::int n from attachments where action_id='${f.A.tamperOk}'`)[0].n === 1, 30000);
  rec(uploaded, "Evidence uploaded to an Action (real Storage upload)");
  await page.keyboard.press("Escape");
  d = await openActionDelete(page, "P4F tamper source action");
  b = await blockers(d);
  rec(b.length === 1 && b[0].includes("Evidence"), "Action gains Evidence → delete now blocked (never auto-deletes evidence)");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");

  // ===== Overdue Actions on Overview =====
  await page.goto(P);
  const od = page.getByTestId("overdue-actions");
  await od.waitFor({ timeout: 20000 });
  const odText = flat(await od.innerText());
  const rows = await od.locator("a[href*='/findings/'], a[href*='actions?filter=overdue']").filter({ hasNotText: "View all Actions" }).allInnerTexts();
  const expected = ["overdue A", "overdue B", "overdue C", "overdue D", "overdue F"];
  rec(rows.length === 5, `Overview: at most 5 overdue actions (${rows.length})`);
  rec(expected.every((e, i) => rows[i]?.includes(e)), `Overview: order due date asc, then priority high→low (${rows.map((r) => r.split("\n")[0].replace("P4F ", "")).join(" / ")})`);
  rec(/Overdue Actions\s*\(6\)/.test(odText), "Overview: header shows the total overdue count (6)");
  rec(!/due today|no due date|closed action/i.test(odText), "Overview: due today, no due date and closed actions excluded");
  rec(/Warehouse Manager/.test(rows[0]) && /P4F spill kit missing/.test(rows[0]) && /Due [A-Z][a-z]{2} \d{1,2}, \d{4}/.test(rows[0]) && /Open/.test(rows[0]), "Overview row: description, due date, owner, Finding context, status");
  rec(/Standalone/.test(rows[1]) && /In Progress/.test(rows[2]), "Overview row: standalone context + non-Open status shown");
  await shot(page, "d-overview-overdue", true);
  await od.getByRole("link", { name: "View all Actions" }).click();
  await page.waitForURL("**/actions?filter=overdue", { timeout: 20000 });
  await page.locator("tbody tr").first().waitFor();
  rec((await page.getByLabel("Filter by Status").inputValue().catch(async () => await page.locator("select").first().inputValue())) === "overdue", "View all Actions → Actions workspace with the Overdue filter");
  rec((await page.locator("tbody tr").count()) === 6, `  ...lists all 6 overdue actions (${await page.locator("tbody tr").count()})`);
  await page.goto(`${APP}/projects/${f.pEmpty}`);
  await page.getByTestId("overdue-actions").waitFor({ timeout: 20000 });
  rec(/No overdue actions\./.test(await page.getByTestId("overdue-actions").innerText()), "Overview empty state: 'No overdue actions.'");

  // ===== General Activity Evidence =====
  await page.goto(`${P}/activities/${f.actVL}`);
  const ev = page.getByTestId("evidence-section-activity");
  await ev.waitFor({ timeout: 20000 });
  rec((await ev.locator("h2").innerText()).trim() === "General Activity Evidence", "Activity section titled 'General Activity Evidence'");
  rec((await ev.innerText()).includes("Files or photos for this activity that are not linked to a specific verification check."), "  ...with the helper text");
  const order = await page.locator("section h2").allInnerTexts();
  rec(JSON.stringify(order) === JSON.stringify(["Plan", "Verification", "General Activity Evidence", "Outcome / Activity Summary", "Activity Report Summary"] /* 6C: report summary section added */ /* 6B: renamed */), `Section order unchanged: ${order.join(" → ")}`);
  const evLabels = (await page.getByTestId("evidence-button").allInnerTexts()).map((t) => t.trim());
  rec(evLabels.length > 0 && evLabels.every((t) => /^(Add Evidence|Evidence \(\d+\))$/.test(t)), `Card-level Evidence labels unchanged (${[...new Set(evLabels)].join(", ")})`);
  await ctx.close();

  // ===== Mobile 390 / 412 =====
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    const mp = m.page;
    d = await openVerificationDelete(mp, "P4F keep me", true);
    const box = await d.boundingBox();
    const btn = await d.getByRole("button", { name: "Delete", exact: true }).boundingBox();
    rec(box.x >= 0 && box.x + box.width <= w + 1 && box.y + box.height <= 844 + 1, `${w}px: delete dialog fully on screen (bottom sheet)`);
    rec(btn.height >= 44, `${w}px: Delete button ${Math.round(btn.height)}px tall`);
    rec(await noHOverflow(mp), `${w}px: verification workspace no horizontal overflow`);
    await shot(mp, `m${w}-vi-confirm`);
    await d.getByRole("button", { name: "Cancel" }).click();
    await gone(d);
    const menuBox = await mp.locator('div[role="button"]', { hasText: "P4F keep me" }).getByRole("button", { name: "More actions" }).boundingBox();
    rec(menuBox.height >= 32 && menuBox.width >= 32, `${w}px: card "…" menu target ${Math.round(menuBox.width)}×${Math.round(menuBox.height)}`);
    d = await openFindingDelete(mp, f.F.closed);
    const mb = await blockers(d);
    rec(mb.some((x) => x.startsWith("Closed Findings are retained")) && mb.some((x) => x.includes("linked Actions")) && await noHOverflow(mp), `${w}px: Finding delete blocked dialog lists both blockers (closed + action added earlier), no overflow`);
    await shot(mp, `m${w}-finding-blocked`);
    await mp.keyboard.press("Escape");
    await mp.goto(P);
    await mp.getByTestId("overdue-actions").waitFor({ timeout: 20000 });
    rec(await noHOverflow(mp), `${w}px: Overview with Overdue Actions — no horizontal overflow`);
    await shot(mp, `m${w}-overview`, true);
    await mp.goto(`${P}/activities/${f.actVL}`);
    await mp.getByTestId("evidence-section-activity").waitFor({ timeout: 20000 });
    rec(await noHOverflow(mp), `${w}px: Activity Detail (General Activity Evidence) no overflow`);
    await m.ctx.close();
  }

  // ===== Consultant parity =====
  const c = await open(1280, 800, "consultant");
  d = await openVerificationDelete(c.page, "P4F consultant deletes this check");
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => !exists("verification_items", f.V.consultantDel)), "Consultant: can delete an unused verification item");
  d = await openFindingDelete(c.page, f.F.consultantDel);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => !exists("issues", f.F.consultantDel)), "Consultant: can delete an open Finding");
  d = await openActionDelete(c.page, "P4F consultant deletes this action");
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  rec(await waitDb(() => !exists("actions", f.A.consultantDel)), "Consultant: can delete an open Action");
  d = await openVerificationDelete(c.page, "P4F executed check");
  rec(!(await hasDeleteBtn(d)), "Consultant: same blockers apply (executed check)");
  await c.ctx.close();

  // ===== Anonymous =====
  const anonDel = await http("DELETE", `/rest/v1/verification_items?id=eq.${f.V.delCancel}`, { headers: { Prefer: "return=representation" } });
  rec(exists("verification_items", f.V.delCancel), `Anon REST delete: nothing deleted (HTTP ${anonDel.status})`);
  const anonPage = await (await browser.newContext()).newPage();
  const resp = await anonPage.goto(`${P}/verification`);
  rec(/\/login/.test(anonPage.url()), `Anon: workspace redirects to login (${resp?.status()})`);
  void KEY;
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const removed = await cleanupP4f(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like 'P4F-ACCEPT-%')::int c, (select count(*) from storage.objects where bucket_id='rayims-files' and name like '${f.p}/%')::int o`)[0];
  rec(left.c === 0 && left.o === 0, `Cleanup: fixtures and ${removed} Storage object(s) removed`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
