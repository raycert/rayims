// Phase 5 pre-implementation review: READ-ONLY catalog audit (SELECT only).
import { dbQuery } from "./common.mjs";
const T = `('documents','document_versions','document_framework_items','document_reviews','files','attachments','issues','verification_items','frameworks','framework_items','projects','sites','activities','profiles','project_frameworks','project_sites')`;
const D = `('documents','document_versions','document_framework_items','document_reviews')`;
const out = {};
out.columns = dbQuery(`select table_name t, column_name c, data_type ty, is_nullable n, column_default d
  from information_schema.columns where table_schema='public' and table_name in ${D} order by table_name, ordinal_position`);
out.constraints = dbQuery(`select conrelid::regclass::text t, conname, contype, pg_get_constraintdef(oid) def
  from pg_constraint where connamespace='public'::regnamespace and conrelid::regclass::text in ${D} order by 1,2`);
out.inboundFks = dbQuery(`select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) def
  from pg_constraint where contype='f' and connamespace='public'::regnamespace
  and confrelid::regclass::text in ${D} order by 1,2`);
out.indexes = dbQuery(`select tablename t, indexname, indexdef from pg_indexes where schemaname='public' and tablename in ${D} order by 1,2`);
out.rls = dbQuery(`select c.relname t, c.relrowsecurity rls from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ${T} order by 1`);
out.policies = dbQuery(`select tablename t, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='public' and tablename in ${D} order by 1,2`);
out.grants = dbQuery(`select table_name t, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
  from information_schema.role_table_grants where table_schema='public' and table_name in ('documents','document_versions','document_framework_items','document_reviews','document_register')
  and grantee in ('anon','authenticated','service_role') group by 1,2 order by 1,2`);
out.triggers = dbQuery(`select event_object_table t, trigger_name, action_timing, event_manipulation from information_schema.triggers
  where trigger_schema='public' and event_object_table in ${D} order by 1,2`);
out.view = dbQuery(`select pg_get_viewdef('public.document_register'::regclass, true) def,
  (select reloptions::text from pg_class where oid='public.document_register'::regclass) opts`);
out.counts = dbQuery(`select (select count(*) from documents)::int documents, (select count(*) from document_versions)::int versions,
  (select count(*) from document_framework_items)::int mappings, (select count(*) from document_reviews)::int reviews,
  (select count(*) from issues where document_review_id is not null)::int review_issues,
  (select count(*) from verification_items where document_review_id is not null)::int review_vis,
  (select count(*) from attachments where document_review_id is not null)::int review_attachments,
  (select count(*) from files)::int files, (select count(*) from storage.objects where bucket_id='rayims-files')::int objects`);
out.bucket = dbQuery(`select id, public, file_size_limit, allowed_mime_types::text from storage.buckets where id='rayims-files'`);
out.storagePolicies = dbQuery(`select policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='storage' and tablename='objects' order by 1`);
out.migrations = dbQuery(`select version from supabase_migrations.schema_migrations order by version`);
console.log(JSON.stringify(out, null, 1));
