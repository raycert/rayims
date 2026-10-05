// Phase 7A unit test of lib/ui/business-date.ts (date-only display, the viewer's local "today", the
// undecided-day band). No server, no database. The parent run repeats the checks in child processes
// whose process time zone (TZ) differs, because date-only text must NOT depend on it.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ZONES = ["Asia/Ho_Chi_Minh", "UTC", "America/Los_Angeles", "Pacific/Kiritimati"];

if (process.argv[2] === "child") {
  const { dateInZone, addDays, formatBusinessDate, todayBand, utcToday } = await import(new URL("../../lib/ui/business-date.ts", import.meta.url).href);
  let pass = 0;
  let fail = 0;
  const rec = (ok, m) => {
    console.log(`${ok ? "PASS" : "FAIL"}  [${process.env.TZ}] ${m}`);
    ok ? (pass += 1) : (fail += 1);
  };
  rec(formatBusinessDate("2026-10-03", "en-US") === "Oct 3, 2026", `date-only 2026-10-03 prints Oct 3, 2026 (got ${formatBusinessDate("2026-10-03", "en-US")})`);
  rec(formatBusinessDate("2026-12-31", "en-US") === "Dec 31, 2026" && formatBusinessDate("2026-01-01", "en-US") === "Jan 1, 2026", "year boundaries keep their day");
  rec(formatBusinessDate("2026-10-03T00:00:00+00:00", "en-US") === "Oct 3, 2026", "a date column that arrives with a time part still prints its calendar day");
  const naive = new Date("2026-10-03").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  console.log(`INFO  [${process.env.TZ}] the previous implementation printed "${naive}" here`);
  // "today" in the viewer's zone (the rule behind overdue is: due date < today)
  const cases = [
    ["Asia/Ho_Chi_Minh", "2026-10-03T16:59:00Z", "2026-10-03", "VN 23:59 on 3 Oct"],
    ["Asia/Ho_Chi_Minh", "2026-10-03T17:01:00Z", "2026-10-04", "VN 00:01 on 4 Oct"],
    ["America/Los_Angeles", "2026-10-04T06:59:00Z", "2026-10-03", "LA 23:59 on 3 Oct"],
    ["America/Los_Angeles", "2026-10-04T07:01:00Z", "2026-10-04", "LA 00:01 on 4 Oct"],
    ["Pacific/Kiritimati", "2026-10-03T09:59:00Z", "2026-10-03", "UTC+14 23:59 on 3 Oct"],
    ["Pacific/Kiritimati", "2026-10-03T10:01:00Z", "2026-10-04", "UTC+14 00:01 on 4 Oct"],
    ["UTC", "2026-10-03T23:59:00Z", "2026-10-03", "UTC 23:59 on 3 Oct"],
    ["UTC", "2026-10-04T00:01:00Z", "2026-10-04", "UTC 00:01 on 4 Oct"],
  ];
  for (const [zone, instant, expected, label] of cases) {
    const today = dateInZone(new Date(instant), zone);
    rec(today === expected, `${label}: today = ${expected} (got ${today})`);
    const due = "2026-10-03"; // an Action due on 3 Oct
    rec((due < today) === (expected === "2026-10-04"), `${label}: Action due 2026-10-03 is ${expected === "2026-10-04" ? "overdue" : "not overdue"}`);
  }
  // Without a zone the runtime's own zone is used (the browser's, in the app).
  const local = dateInZone(new Date("2026-10-03T12:00:00Z"));
  rec(/^\d{4}-\d{2}-\d{2}$/.test(local), `dateInZone without a zone returns a date (${local})`);
  rec(addDays("2026-10-31", 1) === "2026-11-01" && addDays("2026-03-01", -1) === "2026-02-28" && addDays("2026-10-04", -1) === "2026-10-03", "addDays crosses month ends as a calendar operation");
  const band = todayBand("2026-10-04");
  rec(band.dayBefore === "2026-10-03" && band.today === "2026-10-04", "the undecided band is the server UTC day and the day before it");
  // Every viewer's today lies inside [utc - 1, utc + 1]: the band + 'definite' rows decide every case.
  let inside = true;
  const utc = utcToday(new Date("2026-10-04T05:00:00Z"));
  for (const z of ["Pacific/Pago_Pago", "Pacific/Honolulu", "America/Los_Angeles", "UTC", "Asia/Ho_Chi_Minh", "Pacific/Auckland", "Pacific/Kiritimati"]) {
    const t = dateInZone(new Date("2026-10-04T05:00:00Z"), z);
    inside &&= t >= addDays(utc, -1) && t <= addDays(utc, 1);
  }
  rec(inside, "the local day of every zone from UTC-11 to UTC+14 is within one day of the server's UTC day");
  console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

let total = 0;
let failed = 0;
for (const tz of ZONES) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "child"], { env: { ...process.env, TZ: tz }, encoding: "utf8" });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const m = [...out.matchAll(/(\d+)\/(\d+) passed, (\d+) failed/g)].pop();
  for (const line of out.split(/\r?\n/).filter((l) => /^(PASS|FAIL|INFO)/.test(l))) console.log(line);
  if (!m) {
    console.log(`FAIL  [${tz}] child crashed: ${out.slice(0, 300)}`);
    failed += 1;
    total += 1;
  } else {
    total += Number(m[2]);
    failed += Number(m[3]);
  }
}
console.log(`\n${total - failed}/${total} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
