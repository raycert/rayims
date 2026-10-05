// Schema fingerprint for the 6A migration (before / after).
import { dbQuery } from "./common.mjs";
const q = (s) => dbQuery(s);
const out = {
  tables: q(`select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)[0].n,
  issueCols: q(`select string_agg(column_name||':'||data_type||':'||is_nullable, ',' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name='issues'`)[0].c,
  issueConstraints: q(`select string_agg(conname, ',' order by conname) c from pg_constraint where conrelid='public.issues'::regclass`)[0].c,
  issueIndexes: q(`select string_agg(indexname, ',' order by indexname) c from pg_indexes where schemaname='public' and tablename='issues'`)[0].c,
  issuePolicies: q(`select string_agg(policyname||':'||cmd, ',' order by policyname) c from pg_policies where schemaname='public' and tablename='issues'`)[0].c,
  issueGrants: q(`select string_agg(grantee||':'||privilege_type, ',' order by grantee, privilege_type) c from information_schema.role_table_grants where table_schema='public' and table_name='issues' and grantee in ('anon','authenticated')`)[0].c,
  issueTriggers: q(`select string_agg(tgname, ',' order by tgname) c from pg_trigger where tgrelid='public.issues'::regclass and not tgisinternal`)[0].c,
  functions: q(`select string_agg(proname||':'||prosecdef, ',' order by proname) c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)[0].c,
  counterTable: q(`select to_regclass('public.project_finding_counters') is not null e`)[0].e,
  counterRls: q(`select coalesce((select relrowsecurity::text from pg_class where oid=to_regclass('public.project_finding_counters')),'n/a') r`)[0].r,
  counterPolicies: q(`select count(*)::int n from pg_policies where schemaname='public' and tablename='project_finding_counters'`)[0].n,
  counterGrants: q(`select coalesce(string_agg(grantee||':'||privilege_type, ','), '') c from information_schema.role_table_grants where table_schema='public' and table_name='project_finding_counters' and grantee in ('anon','authenticated','public')`)[0].c,
  fnExecute: q(`select coalesce((select string_agg(r, ',') from (select unnest(proacl)::text r from pg_proc where proname='assign_finding_no') x), 'n/a') a`)[0].a,
  rows: q(`select (select count(*) from issues)::int issues, (select count(*) from actions)::int actions, (select count(*) from verification_items)::int vi, (select count(*) from documents)::int documents, (select count(*) from activities)::int activities, (select count(*) from projects)::int projects`)[0],
  migrations: q(`select string_agg(version, ',' order by version) v from supabase_migrations.schema_migrations`)[0].v,
};
console.log(JSON.stringify(out, null, 1));
