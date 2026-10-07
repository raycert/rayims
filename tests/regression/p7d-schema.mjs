// Phase 7D schema / RLS / grant / Storage fingerprint (read-only).
import { dbQuery } from "./common.mjs";
const T = ["activities", "verification_items", "issues", "actions", "attachments", "files", "project_finding_counters"];
const list = `(${T.map((t) => `'${t}'`).join(",")})`;
const out = {
  migrations: dbQuery(`select string_agg(version, ',' order by version) v, count(*)::int n from supabase_migrations.schema_migrations`)[0],
  tables: dbQuery(`select count(*)::int n, string_agg(table_name, ',' order by table_name) t from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)[0],
  columns: Object.fromEntries(dbQuery(`select table_name, string_agg(column_name||':'||data_type||':'||is_nullable, ',' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name in ${list} group by table_name`).map((r) => [r.table_name, r.c])),
  rls: Object.fromEntries(dbQuery(`select c.relname, c.relrowsecurity::text r from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ${list}`).map((r) => [r.relname, r.r])),
  policies: Object.fromEntries(dbQuery(`select tablename, string_agg(policyname||':'||cmd||':'||array_to_string(roles, '/'), ',' order by policyname) p from pg_policies where schemaname='public' and tablename in ${list} group by tablename`).map((r) => [r.tablename, r.p])),
  grants: Object.fromEntries(dbQuery(`select table_name, string_agg(grantee||':'||privilege_type, ',' order by grantee, privilege_type) g from information_schema.role_table_grants where table_schema='public' and table_name in ${list} and grantee in ('anon','authenticated') group by table_name`).map((r) => [r.table_name, r.g])),
  counterGrants: dbQuery(`select has_table_privilege('authenticated','public.project_finding_counters','select') s, has_table_privilege('anon','public.project_finding_counters','select') a, has_function_privilege('authenticated','public.assign_finding_no()','execute') f`)[0],
  functions: dbQuery(`select string_agg(proname||':'||prosecdef, ',' order by proname) f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)[0].f,
  triggers: dbQuery(`select string_agg(tgrelid::regclass::text||'.'||tgname, ',' order by 1) t from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'issues' or (not tgisinternal and tgrelid::regclass::text in ('activities','actions','verification_items'))`)[0].t,
  bucket: dbQuery(`select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='rayims-files'`)[0],
  storagePolicies: dbQuery(`select string_agg(policyname||':'||cmd, ',' order by policyname) p from pg_policies where schemaname='storage' and tablename='objects'`)[0].p,
  docIntegrity: {
    fks: dbQuery(`select conrelid::regclass::text t, conname, confdeltype d, condeferrable df, pg_get_constraintdef(oid) def from pg_constraint where contype='f' and confrelid in ('public.documents'::regclass,'public.document_versions'::regclass) order by 1,2`),
    reviewIndexes: dbQuery(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename='document_reviews' order by 1`),
    view: dbQuery(`select pg_get_viewdef('public.document_register'::regclass, true) v, (select reloptions from pg_class where oid='public.document_register'::regclass) o`)[0],
    viewColumns: dbQuery(`select string_agg(column_name||':'||data_type, ',' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name='document_register'`)[0].c,
    viewGrants: dbQuery(`select string_agg(grantee||':'||privilege_type, ',' order by grantee, privilege_type) g from information_schema.role_table_grants where table_schema='public' and table_name='document_register'`)[0].g,
  },
  objects: dbQuery(`select count(*)::int n from storage.objects where bucket_id='rayims-files'`)[0].n,
};
console.log(JSON.stringify(out, null, 1));
