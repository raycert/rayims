import { chromium } from "playwright-core";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { users, makeReporter, signIn, dbQuery, http } from "./common.mjs";
import { createFixtures, cleanupP6b, PFX } from "./p6b-fixtures.mjs";

const APP = "http://127.0.0.1:3105";
const OUT = path.join(process.env.TEMP, "p6b-shots");
mkdirSync(OUT, { recursive: true });
const R = makeReporter();
const rec = R.rec.bind(R);
const info = (m) => console.log(`INFO  ${m}`);
const wait = (l, t = 15000) => l.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const gone = (l, t = 15000) => l.waitFor({ state: "hidden", timeout: t }).then(() => true).catch(() => false);
const noHOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
const flat = (s) => s.replace(/\s+/g, " ").trim();
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: full });
async function waitDb(fn, ms = 30000) { const e = Date.now() + ms; while (Date.now() < e) { if (fn()) return true; await new Promise((r) => setTimeout(r, 800)); } return false; }
const row = (id) => dbQuery(`select id, status, work_performed, summary, next_steps, client_participants, objectives, planned_work, name, updated_at from activities where id='${id}'`)[0];
const narrHash = (id) => dbQuery(`select md5(coalesce(work_performed,'')||'|'||coalesce(summary,'')||'|'||coalesce(next_steps,'')||'|'||coalesce(client_participants,'')) h from activities where id='${id}'`)[0].h;
const fullHash = (id) => dbQuery(`select md5(t::text) h from activities t where id='${id}'`)[0].h;

const LONG = [
  "Đã đánh giá hiện trạng tài liệu và kiểm tra điều kiện tại hiện trường.",
  "",
  "Paragraph 2: Operational controls for chemical storage are implemented; secondary containment exists at both warehouses & labels are legible (see photos / evidence).",
  "",
  "Paragraph 3: " + "Document retention for EMS records must be defined. ".repeat(12).trim(),
].join("\n");

const admin = await signIn("admin");
const t0 = Date.now();
const f = await createFixtures(admin.token);
info(`fixtures ${Math.round((Date.now() - t0) / 1000)} s`);
const ACT = (id, p = f.pA) => `${APP}/projects/${p}/activities/${id}`;
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
const section = (p) => p.getByTestId("activity-summary");
async function openActivity(page, id) {
  await page.goto(ACT(id));
  await section(page).waitFor({ timeout: 30000 });
}
async function openEditor(page) {
  await section(page).getByRole("button", { name: /^(Add|Edit) Activity Summary$/ }).click();
  await dlg(page).getByText("Edit Activity Summary").waitFor();
}
async function fill(page, values) {
  for (const [id, v] of Object.entries(values)) await dlg(page).locator(`#${id}`).fill(v);
}
async function save(page) {
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  const ok = await wait(page.getByText("Activity Summary saved").first());
  await gone(dlg(page));
  return ok;
}

try {
  const { ctx, page } = await open(1280, 800);

  // ===== Empty state =====
  await openActivity(page, f.A.planned);
  const empty = flat(await section(page).innerText());
  rec(/No Activity Summary has been recorded yet\./.test(empty) && (await section(page).getByRole("button", { name: "Add Activity Summary" }).count()) === 1 && !/Not set/.test(empty), "Empty: 'No Activity Summary has been recorded yet.' + Add Activity Summary, no 'Not set.' rows");
  const order = await page.locator("section h2").allInnerTexts();
  rec(JSON.stringify(order) === JSON.stringify(["Plan", "Verification", "General Activity Evidence", "Outcome / Activity Summary", "Activity Report Summary"] /* 6C: report summary section added */), `Sections: ${order.join(" → ")} (Plan separate from Outcome)`);
  rec(/Assess operational controls\./.test(await page.locator("section", { hasText: "Plan" }).first().innerText()), "Plan still shows Objectives / Planned Work");
  await shot(page, "d-empty");

  // ===== Edit Activity no longer edits Outcome =====
  await page.getByRole("button", { name: "Edit Activity", exact: true }).click();
  const editText = flat(await dlg(page).innerText());
  rec(!/Work Performed|Next Steps|Consultant Summary|Client Participants|Outcome/.test(editText) && /Objectives|Planned Work/.test(editText), "Edit Activity drawer: identity / schedule / Plan only (no Outcome fields)");
  await dlg(page).getByRole("button", { name: "Cancel" }).click();

  // ===== Full summary =====
  const before = row(f.A.planned);
  await openEditor(page);
  const drawerText = flat(await dlg(page).innerText());
  rec(["Work Performed", "Consultant Summary", "Next Steps", "Client Participants"].every((l) => drawerText.includes(l)) && /Overall consultant conclusion for this Activity\./.test(drawerText) && /Names and roles of client participants or coordinators\./.test(drawerText) && !/Activity Type|Start Date|Consultant \*|Site|Mode/.test(drawerText), "Editor: the four narrative fields with helper text only (no Project / Site / Type / Dates / Consultant / Mode)");
  await fill(page, {
    "sum-work-performed": "  Reviewed operational controls and interviewed process owners.  ",
    "sum-summary": "Controls are generally implemented. Document retention requires improvement.",
    "sum-next-steps": "Update retention requirements and verify implementation during follow-up.",
    "sum-client-participants": "Nguyen Van A — HSE Manager\nTran Thi B — QA Supervisor",
  });
  await shot(page, "d-editor");
  rec(await save(page), "Save → toast 'Activity Summary saved'");
  const r1 = row(f.A.planned);
  rec(r1.work_performed === "Reviewed operational controls and interviewed process owners." && r1.summary === "Controls are generally implemented. Document retention requires improvement." && r1.next_steps === "Update retention requirements and verify implementation during follow-up." && r1.client_participants === "Nguyen Van A — HSE Manager\nTran Thi B — QA Supervisor", "Stored exactly (surrounding whitespace trimmed, line breaks kept)");
  rec(r1.status === "planned" && r1.id === before.id && r1.name === before.name && r1.objectives === before.objectives && r1.planned_work === before.planned_work && dbQuery(`select count(*)::int n from activities where project_id='${f.pA}'`)[0].n === 5, "Same Activity, status Planned unchanged, Plan untouched, no new record");
  const shown = await section(page).innerText();
  rec(["Work Performed", "Consultant Summary", "Next Steps", "Client Participants"].every((l) => new RegExp(l, "i").test(shown)) && shown.includes("Nguyen Van A — HSE Manager\nTran Thi B — QA Supervisor") && (await section(page).getByRole("button", { name: "Edit Activity Summary" }).count()) === 1, "Detail shows all four with line breaks; action is now 'Edit Activity Summary'");
  await shot(page, "d-full", true);

  // ===== Edit Activity save keeps the narrative =====
  const narr = narrHash(f.A.planned);
  await page.getByRole("button", { name: "Edit Activity", exact: true }).click();
  await dlg(page).locator("#act-objectives").fill("Assess operational controls (updated).");
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  await gone(dlg(page));
  rec(await waitDb(() => row(f.A.planned).objectives === "Assess operational controls (updated).") && narrHash(f.A.planned) === narr, "Saving Edit Activity leaves the Activity Summary untouched");

  // ===== Edit existing + blank → NULL =====
  await openActivity(page, f.A.planned);
  await openEditor(page);
  await fill(page, { "sum-summary": "Controls implemented; retention gap closed in follow-up.", "sum-client-participants": "Le Van C — Plant Manager", "sum-next-steps": "   " });
  await save(page);
  const r2 = row(f.A.planned);
  rec(r2.summary === "Controls implemented; retention gap closed in follow-up." && r2.client_participants === "Le Van C — Plant Manager" && r2.next_steps === null && r2.work_performed === r1.work_performed && r2.id === r1.id, "Edit: summary / participants updated, blank Next Steps stored as NULL, same record");
  rec(!/Next Steps/i.test(await section(page).innerText()), "  ...cleared field disappears from the Detail");

  // ===== Partial (summary only) =====
  await openActivity(page, f.A.progress);
  await openEditor(page);
  await fill(page, { "sum-summary": "Only the conclusion so far." });
  await save(page);
  await section(page).getByText("Only the conclusion so far.").waitFor({ timeout: 15000 }).catch(() => {}); // wait for the refreshed section
  const partial = flat(await section(page).innerText());
  info(`partial section text: ${partial}`);
  rec(/Consultant Summary/i.test(partial) && /Only the conclusion so far\./.test(partial) && !/Work Performed|Next Steps|Client Participants|Not set|Not provided/i.test(partial), "Partial: only Consultant Summary shown, no placeholders for the blank fields");
  rec(row(f.A.progress).status === "in_progress", "Saved while In Progress: status unchanged");

  // ===== Long text + Vietnamese, Completed =====
  await openActivity(page, f.A.completed);
  await openEditor(page);
  await fill(page, { "sum-work-performed": LONG, "sum-client-participants": "Nguyễn Văn Ánh — Trưởng phòng HSE\nTrần Thị Bích Ngọc — Giám sát QA (Nhà máy Long An)" });
  await save(page);
  const r3 = row(f.A.completed);
  rec(r3.work_performed === LONG && r3.client_participants.startsWith("Nguyễn Văn Ánh — Trưởng phòng HSE") && r3.status === "completed", `Long multi-paragraph Vietnamese text stored in full (${LONG.length} chars), status Completed unchanged`);
  const longShown = await section(page).innerText();
  rec(longShown.includes("Đã đánh giá hiện trạng tài liệu và kiểm tra điều kiện tại hiện trường.\n\nParagraph 2") && longShown.includes("Trần Thị Bích Ngọc — Giám sát QA (Nhà máy Long An)") && await noHOverflow(page), "Rendered with paragraph breaks, Vietnamese intact, no overflow");
  await shot(page, "d-long", true);

  // ===== Cancelled: still editable (no report lock) =====
  await openActivity(page, f.A.cancelled);
  await openEditor(page);
  await fill(page, { "sum-summary": "Visit cancelled by the client; rescheduled." });
  rec(await save(page) && row(f.A.cancelled).status === "cancelled" && row(f.A.cancelled).summary === "Visit cancelled by the client; rescheduled.", "Cancelled Activity: summary saved, status stays Cancelled");

  // ===== Project isolation (tampered activity id) =====
  const bBefore = fullHash(f.A.b);
  await openActivity(page, f.A.progress);
  await openEditor(page);
  await fill(page, { "sum-summary": "Tampered write" });
  await tamper(page, [[f.A.progress, f.A.b]]);
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  rec(await wait(dlg(page).getByText("This Activity could not be found.")), "Project A context → Project B Activity id: 'This Activity could not be found.'");
  await untamper(page);
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  rec(fullHash(f.A.b) === bBefore && row(f.A.progress).summary === "Only the conclusion so far.", "  ...Project B Activity unchanged, Project A Activity unchanged");
  const cross = await page.goto(ACT(f.A.b));
  await page.getByText("Page not found").waitFor({ timeout: 20000 }).catch(() => {});
  const crossBody = await page.locator("body").innerText();
  rec(/Page not found/.test(crossBody) && !/BMARKER/.test(crossBody), `Project B Activity through a Project A URL: 'Page not found' (HTTP ${cross.status()}), no narrative leaked`);

  // ===== Anon replay of the save action =====
  const captured = {};
  await openActivity(page, f.A.progress);
  page.on("request", (req) => { if (req.method() === "POST" && req.headers()["next-action"]) Object.assign(captured, { url: req.url(), headers: req.headers(), body: req.postData() ?? "" }); });
  await openEditor(page);
  await fill(page, { "sum-summary": "Only the conclusion so far." });
  await save(page);
  const progBefore = fullHash(f.A.progress);
  const res = await fetch(captured.url, { method: "POST", headers: { "next-action": captured.headers["next-action"], "content-type": captured.headers["content-type"] ?? "text/plain;charset=UTF-8", accept: "text/x-component" }, body: captured.body.split("Only the conclusion so far.").join("ANON WRITE"), redirect: "manual" });
  await res.text();
  rec(!!captured.body && fullHash(f.A.progress) === progBefore && !/ANON WRITE/.test(row(f.A.progress).summary ?? ""), `Signed-out replay of the save action: nothing changed (HTTP ${res.status})`);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(ACT(f.A.planned));
  rec(/\/login/.test(anon.url()), "Signed out: Activity Detail redirects to login");
  await anon.context().close();

  // ===== Delete interaction =====
  await openActivity(page, f.A.deletable);
  await openEditor(page);
  await fill(page, { "sum-work-performed": "Nothing yet.", "sum-summary": "Planned in error.", "sum-next-steps": "None.", "sum-client-participants": "—" });
  await save(page);
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Delete Activity" }).click();
  await page.getByRole("button", { name: "Delete Activity" }).last().click();
  rec(await waitDb(() => dbQuery(`select count(*)::int n from activities where id='${f.A.deletable}'`)[0].n === 0), "An unreferenced Activity with a full narrative can still be deleted (no new delete blocker)");
  await ctx.close();

  // ===== Consultant =====
  const c = await open(1280, 800, "consultant");
  await openActivity(c.page, f.A.completed);
  await openEditor(c.page);
  await c.page.locator("#sum-summary").fill("Consultant conclusion: ready for the follow-up visit.");
  rec(await save(c.page) && row(f.A.completed).summary === "Consultant conclusion: ready for the follow-up visit.", "Consultant edits the Activity Summary (no admin role, no approval step)");
  await c.ctx.close();

  // ===== Report readiness =====
  const ready = await http("GET", `/rest/v1/activities?select=objectives,planned_work,work_performed,summary,next_steps,client_participants&id=eq.${f.A.completed}`, { token: admin.token });
  rec(ready.status === 200 && ready.json?.[0]?.summary === "Consultant conclusion: ready for the follow-up visit." && "client_participants" in (ready.json?.[0] ?? {}), "All six narrative fields readable from the Activity (report-ready)");
  rec(dbQuery(`select count(*)::int n from information_schema.tables where table_schema='public' and table_name ~ '(report|summar)'`)[0].n === 0, "No report / summary table exists");

  // ===== Mobile =====
  for (const w of [390, 412]) {
    const m = await open(w, 844);
    await openActivity(m.page, f.A.completed);
    const sec = section(m.page);
    await sec.evaluate((el) => el.scrollIntoView({ block: "center" }));
    rec(await noHOverflow(m.page) && (await sec.innerText()).includes("Trần Thị Bích Ngọc — Giám sát QA (Nhà máy Long An)"), `${w}px Detail: long Vietnamese participant names wrap, no overflow`);
    const btn = sec.getByRole("button", { name: "Edit Activity Summary" });
    await btn.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const hit = await btn.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h)) && r.height >= 36; });
    rec(hit, `${w}px: Edit Activity Summary reachable, not under the bottom nav`);
    await btn.click();
    await m.page.locator("#sum-summary").click();
    await m.page.locator("#sum-summary").fill("Mobile note after the site visit.");
    const saveBtn = dlg(m.page).getByRole("button", { name: "Save", exact: true });
    const saveHit = await saveBtn.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h)) && r.bottom <= innerHeight; });
    const taWidth = await m.page.locator("#sum-summary").evaluate((el) => el.getBoundingClientRect().width);
    rec(saveHit && taWidth > w * 0.7 && await noHOverflow(m.page), `${w}px editor: text areas full width (${Math.round(taWidth)}px), Save visible and tappable while typing, no overflow`);
    await shot(m.page, `m${w}-editor`);
    await saveBtn.click();
    rec(await wait(m.page.getByText("Activity Summary saved").first()) && row(f.A.completed).summary === "Mobile note after the site visit.", `${w}px: saved`);
    await m.ctx.close();
  }
} catch (e) {
  rec(false, "Unexpected error", e.message.split("\n")[0] + " " + String(e.stderr ?? "").replace(/\s+/g, " ").slice(0, 300));
} finally {
  await browser.close();
  const removed = await cleanupP6b(admin.token);
  const left = dbQuery(`select (select count(*) from clients where name like '${PFX}%')::int c, (select count(*) from activities where name like '${PFX}%')::int a`)[0];
  rec(left.c === 0 && left.a === 0, `Cleanup: fixtures removed (+${removed} objects)`);
  const failed = R.done();
  process.exitCode = failed ? 1 : 0;
}
