// Runs regression suites one after another against a running production server (see tests/README.md).
// Usage: node tests/regression/run.mjs [suite ...]   (default: the core list)   |   --list
// A suite = <name>-test.mjs; if <name>-post-verify.mjs exists it runs afterwards. Output of each suite is
// kept in <TEMP>/rayims-regression/<name>.txt. Exit code 1 when any suite fails or does not report a total.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
// Runnable independently, in dependency-free order (newest first). 4B / local PGlite suites are not listed.
export const CORE = ["p6d", "p6c", "p6b", "p6a", "p5c", "p5d", "p5e", "p5f", "p4c1", "p4c2", "p4d1", "p4d2", "p4e", "p4e6", "p4f"];
const EXTRA = ["p5a", "p5b", "p5g", "p6e", "p4b5"];
const APP = process.env.RAYIMS_APP_URL || "http://127.0.0.1:3105";

const args = process.argv.slice(2);
if (args.includes("--list")) {
  console.log("core :", CORE.join(" "));
  console.log("extra:", EXTRA.join(" "));
  process.exit(0);
}
const suites = args.length ? args : CORE;
const outDir = path.join(process.env.TEMP || os.tmpdir(), "rayims-regression");
mkdirSync(outDir, { recursive: true });

try {
  const r = await fetch(APP + "/login", { redirect: "manual" });
  if (r.status >= 500) throw new Error("status " + r.status);
} catch (e) {
  console.error(`No RayIMS server answering at ${APP} (${e.message}). Build and start it first - see tests/README.md.`);
  process.exit(2);
}

const failed = [];
for (const name of suites) {
  const file = path.join(here, `${name}-test.mjs`);
  if (!existsSync(file)) {
    console.log(`${name.padEnd(6)} :: MISSING`);
    failed.push(name);
    continue;
  }
  const res = spawnSync(process.execPath, [file], { cwd: here, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const text = (res.stdout ?? "") + (res.stderr ?? "");
  writeFileSync(path.join(outDir, `${name}.txt`), text);
  const totals = [...text.matchAll(/(\d+)\/(\d+) passed, (\d+) failed/g)].pop();
  const ok = !!totals && totals[3] === "0" && totals[1] === totals[2];
  console.log(`${name.padEnd(6)} :: ${totals ? `${totals[1]}/${totals[2]} passed, ${totals[3]} failed` : "NO TOTAL (crashed?)"}${ok ? "" : "  <-- FAIL"}`);
  if (!ok) failed.push(name);
  const post = path.join(here, `${name}-post-verify.mjs`);
  if (existsSync(post)) {
    const p = spawnSync(process.execPath, [post], { cwd: here, encoding: "utf8" });
    writeFileSync(path.join(outDir, `${name}-post.txt`), (p.stdout ?? "") + (p.stderr ?? ""));
  }
}
console.log(failed.length ? `\nFAILED: ${failed.join(", ")} (logs: ${outDir})` : `\nALL ${suites.length} SUITES PASSED (logs: ${outDir})`);
process.exit(failed.length ? 1 : 0);
