// Phase 7D local migration test (PGlite, stubbed Supabase auth/roles + Supabase-like default grants) for
// 20261006000100_document_expected_records.sql. Applies the real migrations in order (storage migration skipped).
// Needs @electric-sql/pglite (NOT a repository dependency, see tests/README.md): run it from a folder where that
// package is installed, with RAYIMS_MIGRATIONS pointing at supabase/migrations/ when the script is copied there.
import { PGlite } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

const MIG = (process.env.RAYIMS_MIGRATIONS ?? fileURLToPath(new URL("../../supabase/migrations/", import.meta.url))).replace(/\\/g, "/").replace(/\/?$/, "/");
const SEVEN_D = "20261006000100_document_expected_records.sql";
let pass = 0;
let fail = 0;
const rec = (ok, m) => { console.log(`${ok ? "PASS" : "FAIL"}  ${m}`); ok ? pass++ : fail++; };

const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated; grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
for (const f of readdirSync(MIG).sort()) { if (f.includes("storage_bucket") || f === SEVEN_D) continue; await db.exec(readFileSync(MIG + f, "utf8")); }

const c = (await db.query(`insert into clients (name) values ('C') returning id`)).rows[0].id;
const p = (await db.query(`insert into projects (client_id, name) values ($1, 'P') returning id`, [c])).rows[0].id;
const d = (await db.query(`insert into documents (project_id, title, doc_code) values ($1, 'Existing document', 'X-1') returning id`, [p])).rows[0].id;
const before = (await db.query(`select md5(t::text) h from documents t where id = $1`, [d])).rows[0].h;
const cols0 = (await db.query(`select column_name from information_schema.columns where table_name = 'documents' order by ordinal_position`)).rows.map((r) => r.column_name);
const pol0 = JSON.stringify((await db.query(`select policyname, cmd, roles::text from pg_policies where tablename = 'documents' order by 1`)).rows);
const grants0 = JSON.stringify((await db.query(`select grantee, privilege_type from information_schema.role_table_grants where table_name = 'documents' order by 1, 2`)).rows);
const objects0 = JSON.stringify({
  idx: (await db.query(`select indexname from pg_indexes where tablename = 'documents' order by 1`)).rows,
  trg: (await db.query(`select tgname from pg_trigger where tgrelid = 'public.documents'::regclass and not tgisinternal order by 1`)).rows,
  con: (await db.query(`select conname from pg_constraint where conrelid = 'public.documents'::regclass order by 1`)).rows,
  tables: (await db.query(`select count(*)::int n from information_schema.tables where table_schema = 'public'`)).rows[0].n,
  fns: (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows[0].n,
});
await db.exec(readFileSync(MIG + SEVEN_D, "utf8"));

const col = (await db.query(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'documents' and column_name = 'expected_records'`)).rows;
rec(col.length === 1 && col[0].data_type === "text" && col[0].is_nullable === "YES" && col[0].column_default === null, `documents.expected_records is nullable text with no default (${JSON.stringify(col[0])})`);
const cols1 = (await db.query(`select column_name from information_schema.columns where table_name = 'documents' order by ordinal_position`)).rows.map((r) => r.column_name);
rec(JSON.stringify(cols1.filter((x) => x !== "expected_records")) === JSON.stringify(cols0) && cols1[cols1.length - 1] === "expected_records", "the only new column is expected_records (appended); no other column changed");
const row = (await db.query(`select expected_records, title, doc_code from documents where id = $1`, [d])).rows[0];
rec(row.expected_records === null && row.title === "Existing document" && row.doc_code === "X-1", "an existing Document gets NULL (no backfill) and keeps its data");
rec(JSON.stringify((await db.query(`select policyname, cmd, roles::text from pg_policies where tablename = 'documents' order by 1`)).rows) === pol0, "documents RLS policies are unchanged");
rec(JSON.stringify((await db.query(`select grantee, privilege_type from information_schema.role_table_grants where table_name = 'documents' order by 1, 2`)).rows) === grants0, "documents table grants are unchanged");
const objects1 = JSON.stringify({
  idx: (await db.query(`select indexname from pg_indexes where tablename = 'documents' order by 1`)).rows,
  trg: (await db.query(`select tgname from pg_trigger where tgrelid = 'public.documents'::regclass and not tgisinternal order by 1`)).rows,
  con: (await db.query(`select conname from pg_constraint where conrelid = 'public.documents'::regclass order by 1`)).rows,
  tables: (await db.query(`select count(*)::int n from information_schema.tables where table_schema = 'public'`)).rows[0].n,
  fns: (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows[0].n,
});
rec(objects0 === objects1, "no new index, trigger, constraint, table or function");
await db.query(`select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false)`);
await db.exec("set role authenticated");
const multiline = "Annual training plan\nAttendance records\nKế hoạch đào tạo năm\r\nCompetence evaluation";
await db.query(`update documents set expected_records = $1 where id = $2`, [multiline, d]);
const stored = (await db.query(`select expected_records from documents where id = $1`, [d])).rows[0].expected_records;
const ins = await db.query(`insert into documents (project_id, title, expected_records) values ($1, 'New', 'One') returning id`, [p]);
await db.exec("reset role");
rec(stored === multiline && ins.rows.length === 1, "authenticated can write the column (existing policy + grants cover it); multiline and Vietnamese text round-trip exactly");
const long = "x".repeat(5000);
await db.query(`update documents set expected_records = $1 where id = $2`, [long, d]);
rec((await db.query(`select length(expected_records)::int n from documents where id = $1`, [d])).rows[0].n === 5000, "no database length limit (the 2,000-character cap is the application's)");
const dn = (await db.query(`select md5(t::text) h from documents t where id = $1`, [d])).rows[0].h;
rec(before !== dn, "(sanity) the row changed only through the new column");
const relChildren = (await db.query(`select count(*)::int n from document_versions`)).rows[0].n + (await db.query(`select count(*)::int n from document_reviews`)).rows[0].n;
rec(relChildren === 0, "no Version or review was touched");
console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
