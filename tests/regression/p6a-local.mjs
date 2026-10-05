// Local migration test (PGlite, stubbed Supabase auth/roles + Supabase-like default grants).
// Applies the real migrations in order (storage migration skipped: no storage schema locally).
import { PGlite } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

const MIG = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url)).replace(/\\/g, "/");
const SIXA = "20261002000100_finding_numbering.sql";
let pass = 0, fail = 0;
const rec = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); ok ? pass++ : fail++; };

async function base({ skip6a }) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    -- Supabase-like default privileges: new tables / functions are granted to the API roles.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const f of readdirSync(MIG).sort()) {
    if (f.includes("storage_bucket")) continue;
    if (f === SIXA && skip6a) continue;
    await db.exec(readFileSync(MIG + f, "utf8"));
  }
  return db;
}
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params) => (await db.query(sql, params)).rows;
async function as(db, role, fn) {
  await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
async function denied(fn) { try { await fn(); return false; } catch { return true; } }

// ---------- A. Existing Findings, then the 6A migration ----------
{
  const db = await base({ skip6a: true });
  const u = "00000000-0000-4000-8000-0000000000aa";
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@example.com')`, [u]);
  const c = (await one(db, `insert into clients (name) values ('Local Client') returning id`)).id;
  const pA = (await one(db, `insert into projects (client_id, name) values ($1, 'A') returning id`, [c])).id;
  const pB = (await one(db, `insert into projects (client_id, name) values ($1, 'B') returning id`, [c])).id;
  const pEmpty = (await one(db, `insert into projects (client_id, name) values ($1, 'Empty') returning id`, [c])).id;
  // Known created_at / ids (incl. a created_at tie broken by id) in a deliberately scrambled insert order
  const rows = [
    [pA, "a3", "2026-09-03T10:00:00Z", "00000000-0000-4000-8000-000000000003"],
    [pA, "a1", "2026-09-01T10:00:00Z", "00000000-0000-4000-8000-000000000009"],
    [pA, "a2-tie-high-id", "2026-09-02T10:00:00Z", "00000000-0000-4000-8000-0000000000f2"],
    [pA, "a2-tie-low-id", "2026-09-02T10:00:00Z", "00000000-0000-4000-8000-0000000000a2"],
    [pB, "b2", "2026-09-05T10:00:00Z", "00000000-0000-4000-8000-000000000b02"],
    [pB, "b1", "2026-09-04T10:00:00Z", "00000000-0000-4000-8000-000000000b01"],
  ];
  for (const [p, t, at, id] of rows) {
    await db.query(`insert into issues (id, project_id, title, created_at, updated_at) values ($1, $2, $3, $4, '2026-09-10T00:00:00Z')`, [id, p, t, at]);
  }
  await db.exec(readFileSync(MIG + SIXA, "utf8"));
  const got = await all(db, `select title, finding_no from issues order by project_id = $1 desc, finding_no`, [pA]);
  const a = got.filter((r) => r.title.startsWith("a")).map((r) => `${r.finding_no}:${r.title}`).join(" ");
  const b = got.filter((r) => r.title.startsWith("b")).map((r) => `${r.finding_no}:${r.title}`).join(" ");
  rec(a === "1:a1 2:a2-tie-low-id 3:a2-tie-high-id 4:a3" && b === "1:b1 2:b2", `Backfill per project by (created_at, id): A ${a} · B ${b}`);
  const ctr = await all(db, `select p.name, c.last_finding_no from project_finding_counters c join projects p on p.id = c.project_id order by p.name`);
  rec(JSON.stringify(ctr) === JSON.stringify([{ name: "A", last_finding_no: 4 }, { name: "B", last_finding_no: 2 }]), `Counters seeded to each project's max (A 4, B 2; no row for a project without Findings)`);
  rec((await one(db, `select count(*)::int n from issues where updated_at <> '2026-09-10T00:00:00Z'`)).n === 0, "Backfill left updated_at untouched");
  const n5 = (await one(db, `insert into issues (project_id, title) values ($1, 'a5') returning finding_no`, [pA])).finding_no;
  const e1 = (await one(db, `insert into issues (project_id, title) values ($1, 'e1') returning finding_no`, [pEmpty])).finding_no;
  rec(n5 === 5 && e1 === 1, `Next number = max + 1 (A → ${n5}); a project's first Finding → ${e1}`);
  const forced = (await one(db, `insert into issues (project_id, title, finding_no) values ($1, 'forced', 999) returning finding_no`, [pA])).finding_no;
  rec(forced === 6, `A number supplied on INSERT is ignored (got ${forced}, not 999)`);
  // immutability
  await db.query(`update issues set finding_no = 77, title = 'a1 renamed', finding_type = 'nonconformity', priority = 'high', status = 'closed' where title = 'a1'`);
  const r1 = await one(db, `select finding_no, title from issues where title = 'a1 renamed'`);
  rec(r1.finding_no === 1, `UPDATE of finding_no (and title / type / priority / status) keeps the number (${r1.finding_no})`);
  // delete gaps
  await db.query(`delete from issues where finding_no = 6 and project_id = $1`, [pA]);
  const n7 = (await one(db, `insert into issues (project_id, title) values ($1, 'after delete of 6') returning finding_no`, [pA])).finding_no;
  await db.query(`delete from issues where finding_no = 2 and project_id = $1`, [pA]);
  const n8 = (await one(db, `insert into issues (project_id, title) values ($1, 'after delete of 2') returning finding_no`, [pA])).finding_no;
  rec(n7 === 7 && n8 === 8, `Deleted numbers never reused (delete 6 → next 7; delete 2 → next 8)`);
  // unique constraint
  rec(await denied(() => db.query(`alter table issues disable trigger assign_finding_no; insert into issues (project_id, title, finding_no) values ('${pA}', 'dup', 1);`)), "UNIQUE (project_id, finding_no) rejects a duplicate even with the trigger bypassed");
  await db.exec(`alter table issues enable trigger assign_finding_no`).catch(() => {});
  // authenticated role: normal Finding work works, counter + function unreachable
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [u]);
  const asAuth = await as(db, "authenticated", async () => (await one(db, `insert into issues (project_id, title) values ($1, 'by authenticated') returning finding_no`, [pB])).finding_no);
  rec(asAuth === 3, `authenticated creates a Finding; the trigger numbers it (B → ${asAuth})`);
  const upd = await as(db, "authenticated", async () => { await db.query(`update issues set finding_no = 50 where title = 'by authenticated'`); return (await one(db, `select finding_no from issues where title = 'by authenticated'`)).finding_no; });
  rec(upd === 3, "authenticated UPDATE of finding_no: number unchanged");
  const ctrDenied = await Promise.all([
    as(db, "authenticated", () => denied(() => db.query(`select * from project_finding_counters`))),
    as(db, "authenticated", () => denied(() => db.query(`insert into project_finding_counters values ('${pEmpty}', 0)`))),
    as(db, "authenticated", () => denied(() => db.query(`update project_finding_counters set last_finding_no = 0`))),
    as(db, "authenticated", () => denied(() => db.query(`delete from project_finding_counters`))),
    as(db, "anon", () => denied(() => db.query(`select * from project_finding_counters`))),
  ]);
  rec(ctrDenied.every(Boolean), "authenticated / anon cannot SELECT / INSERT / UPDATE / DELETE the counter (permission denied, despite default grants)");
  const fnAcl = await one(db, `select has_function_privilege('authenticated', 'public.assign_finding_no()', 'execute') a, has_function_privilege('anon', 'public.assign_finding_no()', 'execute') b`);
  rec(fnAcl.a === false && fnAcl.b === false, "assign_finding_no(): no EXECUTE for authenticated / anon");
  const ctrGrants = await one(db, `select has_table_privilege('authenticated', 'public.project_finding_counters', 'select') s, (select relrowsecurity from pg_class where oid = 'public.project_finding_counters'::regclass) rls, (select count(*)::int from pg_policies where tablename = 'project_finding_counters') pol`);
  rec(ctrGrants.s === false && ctrGrants.rls === true && ctrGrants.pol === 0, "Counter: RLS enabled, no policies, no grants");
  // project delete cascades the counter
  await db.query(`delete from issues where project_id = $1`, [pEmpty]);
  await db.query(`delete from projects where id = $1`, [pEmpty]);
  rec((await one(db, `select count(*)::int n from project_finding_counters where project_id = $1`, [pEmpty])).n === 0, "Deleting a project removes its counter row (cascade)");
  await db.close();
}

// ---------- B. Fresh database (0 Findings) ----------
{
  const db = await base({ skip6a: false });
  rec((await one(db, `select count(*)::int n from project_finding_counters`)).n === 0, "0 Findings: migration applies, no counter rows");
  const c = (await one(db, `insert into clients (name) values ('C') returning id`)).id;
  const p = (await one(db, `insert into projects (client_id, name) values ($1, 'P') returning id`, [c])).id;
  const ns = [];
  for (let i = 0; i < 3; i++) ns.push((await one(db, `insert into issues (project_id, title) values ($1, $2) returning finding_no`, [p, `f${i}`])).finding_no);
  rec(ns.join(",") === "1,2,3", `0 Findings: first Findings numbered ${ns.join(", ")}`);
  const col = await one(db, `select is_nullable, data_type from information_schema.columns where table_name = 'issues' and column_name = 'finding_no'`);
  rec(col.is_nullable === "NO" && col.data_type === "integer", "issues.finding_no integer NOT NULL");
  await db.close();
}
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
