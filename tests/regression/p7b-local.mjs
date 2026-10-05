// Phase 7B local migration test (PGlite, stubbed Supabase auth/roles + Supabase-like default grants) for
// 20261005000100_document_integrity_hardening.sql. Applies the real migrations in order (the storage
// migration is skipped: no storage schema locally). Needs @electric-sql/pglite, which is NOT a dependency
// of this repository (see tests/README.md): run it from a folder where that package is installed, with
// RAYIMS_MIGRATIONS pointing at supabase/migrations/ when the script is copied there.
import { PGlite } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

const MIG = (process.env.RAYIMS_MIGRATIONS ?? fileURLToPath(new URL("../../supabase/migrations/", import.meta.url))).replace(/\\/g, "/").replace(/\/?$/, "/");
const SEVEN_B = "20261005000100_document_integrity_hardening.sql";
let pass = 0;
let fail = 0;
const rec = (ok, m) => { console.log(`${ok ? "PASS" : "FAIL"}  ${m}`); ok ? pass++ : fail++; };
const err = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

async function base() {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated; grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  for (const f of readdirSync(MIG).sort()) { if (f.includes("storage_bucket") || f === SEVEN_B) continue; await db.exec(readFileSync(MIG + f, "utf8")); }
  return db;
}
const one = async (db, sql, p = []) => (await db.query(sql, p)).rows[0];
async function seed(db) {
  const c = (await one(db, `insert into clients (name) values ('C') returning id`)).id;
  const p = (await one(db, `insert into projects (client_id, name) values ($1, 'P') returning id`, [c])).id;
  const mkDoc = async (t) => (await one(db, `insert into documents (project_id, title) values ($1, $2) returning id`, [p, t])).id;
  const mkVer = async (d, n) => {
    const f = (await one(db, `insert into files (project_id, storage_key, original_name) values ($1, gen_random_uuid()::text, 'f.pdf') returning id`, [p])).id;
    return (await one(db, `insert into document_versions (document_id, version_no, file_id) values ($1, $2, $3) returning id`, [d, n, f])).id;
  };
  return { c, p, mkDoc, mkVer };
}
const def = (db, name) => one(db, `select confdeltype d, condeferrable df from pg_constraint where conname = $1`, [name]);
const ownerFk = async (db) => (await db.query(`select conname, confdeltype from pg_constraint where contype = 'f' and confrelid in ('public.documents'::regclass, 'public.document_versions'::regclass) order by conname`)).rows;

// ---- precondition: duplicates stop the migration, nothing changes
{
  const db = await base();
  const s = await seed(db);
  const d = await s.mkDoc("Dup");
  const v = await s.mkVer(d, 1);
  await db.query(`insert into document_reviews (document_version_id, status) values ($1, 'under_review'), ($1, 'under_review')`, [v]);
  const before = JSON.stringify(await ownerFk(db));
  const e = await err(() => db.exec(readFileSync(MIG + SEVEN_B, "utf8")));
  rec(!!e && /precondition failed: 1 Document Version/.test(e.message), `duplicate open reviews: the migration stops with a clear message (${e?.message?.slice(0, 90)})`);
  rec(JSON.stringify(await ownerFk(db)) === before && (await one(db, `select count(*)::int n from pg_indexes where indexname = 'document_reviews_one_open_per_version_idx'`)).n === 0, "duplicate open reviews: nothing was changed (FKs still cascade, no index)");
  rec((await one(db, `select count(*)::int n from document_reviews`)).n === 2, "duplicate open reviews: no row was chosen or deleted");
}

// ---- clean data: apply and verify
const db = await base();
const s = await seed(db);
const viewColsBefore = JSON.stringify((await db.query(`select column_name, data_type, ordinal_position from information_schema.columns where table_name = 'document_register' order by ordinal_position`)).rows);
const viewGrantsBefore = JSON.stringify((await db.query(`select grantee, privilege_type from information_schema.role_table_grants where table_name = 'document_register' order by 1, 2`)).rows);
const dKeep = await s.mkDoc("Existing document with history");
const vKeep = await s.mkVer(dKeep, 1);
await db.query(`insert into document_reviews (document_version_id, status, created_at) values ($1, 'revision_required', now() - interval '1 day'), ($1, 'under_review', now())`, [vKeep]);
const rowsBefore = JSON.stringify([(await one(db, `select count(*)::int n from document_versions`)).n, (await one(db, `select count(*)::int n from document_reviews`)).n]);
const fkBefore = await ownerFk(db);
rec(fkBefore.filter((r) => r.confdeltype === "c").length === 3, "before: the three FKs of documents / document_versions cascade");
await db.exec(readFileSync(MIG + SEVEN_B, "utf8"));
const fkAfter = Object.fromEntries((await ownerFk(db)).map((r) => [r.conname, r.confdeltype]));
rec(fkAfter.document_versions_document_id_fkey === "r" && (await def(db, "document_reviews_document_version_id_fkey")).d === "r", "Document -> Version and Version -> Review are now RESTRICT");
rec(fkAfter.document_framework_items_document_id_fkey === "c", "the mapping FK (document_framework_items) still cascades — setup data, unchanged");
rec(!(await def(db, "document_versions_document_id_fkey")).df && !(await def(db, "document_reviews_document_version_id_fkey")).df, "both FKs are still not deferrable (same style as before)");
rec(rowsBefore === JSON.stringify([(await one(db, `select count(*)::int n from document_versions`)).n, (await one(db, `select count(*)::int n from document_reviews`)).n]), "existing rows are untouched by the migration");
const idx = await one(db, `select indexdef from pg_indexes where indexname = 'document_reviews_one_open_per_version_idx'`);
rec(/UNIQUE INDEX/.test(idx.indexdef) && /\(document_version_id\)/.test(idx.indexdef) && /status = 'under_review'/.test(idx.indexdef), `partial unique index created (${idx.indexdef.replace(/^.*ON /, "")})`);
rec(JSON.stringify((await db.query(`select column_name, data_type, ordinal_position from information_schema.columns where table_name = 'document_register' order by ordinal_position`)).rows) === viewColsBefore, "document_register: same columns, types and order");
rec(JSON.stringify((await db.query(`select grantee, privilege_type from information_schema.role_table_grants where table_name = 'document_register' order by 1, 2`)).rows) === viewGrantsBefore, "document_register: grants unchanged");
const opts = (await one(db, `select reloptions o from pg_class where relname = 'document_register'`)).o;
rec(JSON.stringify(opts) === JSON.stringify(["security_invoker=true"]), "document_register keeps security_invoker");
rec(/r\.created_at DESC, r\.id DESC/.test((await one(db, `select pg_get_viewdef('public.document_register'::regclass, true) v`)).v), "document_register orders the latest review by created_at DESC, id DESC");
rec((await one(db, `select status from document_register where document_id = $1`, [dKeep])).status === "under_review", "register status unchanged for existing data (open review is the latest)");

// ---- delete protection
const dPlain = await s.mkDoc("No versions");
await db.query(`insert into document_framework_items (document_id, framework_item_id) select $1, id from framework_items limit 1`, [dPlain]);
const e1 = await err(() => db.query(`delete from documents where id = $1`, [dKeep]));
rec(!!e1 && ["23001", "23503"].includes(e1.code) && (await one(db, `select count(*)::int n from document_versions where id = $1`, [vKeep])).n === 1, "Document with a Version: delete refused (restrict_violation), Version and reviews survive");
await db.query(`delete from documents where id = $1`, [dPlain]);
rec((await one(db, `select count(*)::int n from documents where id = $1`, [dPlain])).n === 0 && (await one(db, `select count(*)::int n from document_framework_items where document_id = $1`, [dPlain])).n === 0, "Document without Versions: deletes, its mappings still cascade");
const f1 = (await one(db, `select id from files limit 1`)).id;
const att = (await one(db, `insert into attachments (project_id, file_id, document_review_id) select $1, $2, id from document_reviews where document_version_id = $3 and status = 'under_review' returning id`, [s.p, f1, vKeep])).id;
const e2 = await err(() => db.query(`delete from document_versions where id = $1`, [vKeep]));
rec(!!e2 && ["23001", "23503"].includes(e2.code), "Version with Gap Assessments: delete refused (restrict_violation, SQLSTATE 23001)");
rec((await one(db, `select count(*)::int n from document_reviews where document_version_id = $1`, [vKeep])).n === 2 && (await one(db, `select count(*)::int n from attachments where id = $1`, [att])).n === 1 && (await one(db, `select count(*)::int n from files where id = $1`, [f1])).n === 1, "refused Version delete keeps both reviews, the review Evidence attachment and its file row");
const vFree = await s.mkVer(await s.mkDoc("Unreviewed"), 1);
await db.query(`delete from document_versions where id = $1`, [vFree]);
rec((await one(db, `select count(*)::int n from document_versions where id = $1`, [vFree])).n === 0, "Version without reviews: still deletes");

// ---- one open review
const v2 = await s.mkVer(await s.mkDoc("Reviews"), 1);
await db.query(`insert into document_reviews (document_version_id, status) values ($1, 'accepted'), ($1, 'revision_required'), ($1, 'accepted')`, [v2]);
rec((await one(db, `select count(*)::int n from document_reviews where document_version_id = $1`, [v2])).n === 3, "multiple concluded reviews of one Version are still allowed");
await db.query(`insert into document_reviews (document_version_id, status) values ($1, 'under_review')`, [v2]);
const e3 = await err(() => db.query(`insert into document_reviews (document_version_id, status) values ($1, 'under_review')`, [v2]));
rec(!!e3 && e3.code === "23505" && /one_open_per_version/.test(e3.message), "a second open review of the same Version is refused (23505)");
await db.query(`update document_reviews set status = 'accepted', reviewed_at = now() where document_version_id = $1 and status = 'under_review'`, [v2]);
await db.query(`insert into document_reviews (document_version_id, status) values ($1, 'under_review')`, [v2]);
rec((await one(db, `select count(*)::int n from document_reviews where document_version_id = $1 and status = 'under_review'`, [v2])).n === 1, "a new open review is possible once the previous one is concluded");
const v3 = await s.mkVer(await s.mkDoc("Other"), 1);
await db.query(`insert into document_reviews (document_version_id, status) values ($1, 'under_review')`, [v3]);
rec(true, "an open review on a different Version is independent");

// ---- deterministic tie-break
const dTie = await s.mkDoc("Tie");
const vTie = await s.mkVer(dTie, 1);
const T = "2026-10-05T10:00:00Z";
await db.query(`insert into document_reviews (id, document_version_id, status, created_at) values ('00000000-0000-4000-8000-0000000000aa', $1, 'accepted', $2), ('00000000-0000-4000-8000-0000000000bb', $1, 'revision_required', $2)`, [vTie, T]);
let r = await one(db, `select latest_review_id, status from document_register where document_id = $1`, [dTie]);
rec(r.latest_review_id === "00000000-0000-4000-8000-0000000000bb" && r.status === "revision_required", "identical created_at: the higher id decides the register status (revision_required)");
await db.query(`delete from document_reviews where id = '00000000-0000-4000-8000-0000000000bb'`);
await db.query(`insert into document_reviews (id, document_version_id, status, created_at) values ('00000000-0000-4000-8000-0000000000cc', $1, 'accepted', $2)`, [vTie, T]);
r = await one(db, `select latest_review_id from document_register where document_id = $1`, [dTie]);
rec(r.latest_review_id === "00000000-0000-4000-8000-0000000000cc", "identical created_at again: the highest id wins (cc over aa)");
const sample = await db.query(`select status from document_register`);
rec(sample.rows.every((x) => ["n_a", "not_received", "received", "under_review", "revision_required", "accepted"].includes(x.status)), "register statuses stay within the existing six values");

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
