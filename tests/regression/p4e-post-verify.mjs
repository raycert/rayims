import { dbQuery, signIn } from "./common.mjs";
import { cleanupP4e } from "./p4e-fixtures.mjs";
const BEFORE = {"act":"cf46d5ecebfcf4893de137e202661dbb","atypes":8,"cl":"7680801320d6ed76daa46a3babf1ef6b","frameworks":4,"items":149,"proj":"5ed860ed2a34d844694ec8f829814936","st":"2e95d4b8cdab3c01bbe5f31bc2aed86e","vi":"22e540108527ce398c918fecf1eb9201"};
const admin = await signIn("admin");
const removed = await cleanupP4e(admin.token);
console.log("storage objects removed by cleanup:", removed);
const after = dbQuery(`select
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.verification_items t) as vi,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.activities t) as act,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.projects t) as proj,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.clients t) as cl,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.sites t) as st,
  (select count(*) from public.frameworks) as frameworks, (select count(*) from public.framework_items) as items,
  (select count(*) from public.activity_types) as atypes`)[0];
const diffs = Object.keys(BEFORE).filter((k) => String(BEFORE[k]) !== String(after[k]));
console.log(diffs.length === 0 ? "REAL DATA IDENTICAL (hashes of all verification_items/activities/projects/clients/sites + seed counts)" : "DIFFERENCES: " + diffs.join(", "));
console.log(JSON.stringify(dbQuery(`select (select count(*) from issues) issues, (select count(*) from actions) actions, (select count(*) from attachments) attachments, (select count(*) from files) files,
  (select count(*) from storage.objects where bucket_id='rayims-files') objects, (select count(*) from clients where name like 'P4E-ACCEPT-%') fixture_clients,
  (select count(*) from clients) clients, (select count(*) from projects) projects, (select count(*) from sites) sites, (select count(*) from activities) activities, (select count(*) from verification_items) vi,
  (select public from storage.buckets where id='rayims-files') bucket_public, (select file_size_limit from storage.buckets where id='rayims-files') bucket_limit`)[0]));
