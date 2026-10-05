// Shared helpers for hosted-Supabase verification. Secrets are read from git-ignored
// env files inside the process and are NEVER printed.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";
import os from "node:os";
// Windows sets TEMP; elsewhere fall back to the OS temp dir (many suites write screenshots / scratch files there).
process.env.TEMP ??= os.tmpdir();
/** The repository root (this file lives in tests/regression/). */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").replace(/\\/g, "/");
function load(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8").split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
    );
  } catch { return {}; }
}
export const env = { ...load(REPO + "/.env.local"), ...load(REPO + "/.env.test.local") };
export const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
export const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const BUCKET = env.NEXT_PUBLIC_STORAGE_BUCKET || "rayims-files";
export const users = {
  admin: { email: env.RAYIMS_ADMIN_EMAIL, password: env.RAYIMS_ADMIN_PASSWORD },
  consultant: { email: env.RAYIMS_CONSULTANT_EMAIL, password: env.RAYIMS_CONSULTANT_PASSWORD },
};
export const mask = (e) => (e ? e.replace(/^(.).*(@.*)$/, "$1***$2") : "(missing)");

export function makeReporter() {
  const results = [];
  return {
    results,
    rec(ok, name, detail = "") { results.push([ok ? "PASS" : "FAIL", name + (detail ? " :: " + detail : "")]); },
    done() {
      for (const [s, n] of results) console.log(s.padEnd(5), n);
      const f = results.filter((r) => r[0] === "FAIL").length;
      console.log(`\n${results.length - f}/${results.length} passed, ${f} failed`);
      return f;
    },
  };
}

export async function http(method, p, { token, body, headers = {}, raw = false } = {}) {
  const h = { apikey: KEY, ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (body !== undefined && !raw && !h["content-type"]) h["content-type"] = "application/json";
  const r = await fetch(URL_ + p, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  const txt = buf.toString("utf8");
  let json = null; try { json = JSON.parse(txt); } catch { /* not json */ }
  return { status: r.status, json, text: txt, buf, headers: r.headers };
}

export async function signIn(who) {
  const u = users[who];
  const r = await http("POST", "/auth/v1/token?grant_type=password", { body: { email: u.email, password: u.password } });
  return { ok: r.status === 200 && !!r.json?.access_token, status: r.status, token: r.json?.access_token, refresh: r.json?.refresh_token, userId: r.json?.user?.id, err: r.json?.error_code };
}

const TMP = path.join(process.env.TEMP, `rayims-common-${process.pid}.sql`);
export function dbQuery(sql) {
  writeFileSync(TMP, sql);
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const out = execFileSync("npx", ["--yes", "supabase@latest", "db", "query", "--linked", "-o", "json", "-f", TMP], { cwd: REPO, shell: true, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
      return JSON.parse(out.slice(out.indexOf("{"))).rows;
    } catch (e) {
      lastErr = e; // transient CLI/network transport errors: retry (statements here are idempotent or read-only)
    }
  }
  throw lastErr;
}
