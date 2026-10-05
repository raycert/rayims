import { dbQuery } from "./common.mjs";
import { cleanupP4b5 } from "./p4b5-fixtures.mjs";

const BEFORE = {"act":"cf46d5ecebfcf4893de137e202661dbb","actions":0,"attachments":0,"atypes":8,"cl":"7680801320d6ed76daa46a3babf1ef6b","files":0,"frameworks":4,"issues":0,"items":149,"pf":"9e1a4328dfc7010cdc7bf1a1518da206","proj":"5ed860ed2a34d844694ec8f829814936","st":"2e95d4b8cdab3c01bbe5f31bc2aed86e","vi":"22e540108527ce398c918fecf1eb9201"};

cleanupP4b5();

const residue = dbQuery(`select
  (select count(*) from clients where name like 'P4B5-ACCEPT-%') as clients,
  (select count(*) from projects where name like 'P4B5-ACCEPT-%') as projects,
  (select count(*) from verification_items where question like 'P4B5-ACCEPT-%') as items,
  (select count(*) from activities where project_id not in (select id from projects)) as orphan_activities,
  (select count(*) from sites where name in ('Dup Site','Beta Site')) as fixture_sites`)[0];
console.log("RESIDUE", JSON.stringify(residue));

const after = dbQuery(`select
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.verification_items t where project_id in (select id from public.projects where name not like 'P4B5-ACCEPT-%')) as vi,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.activities t where project_id in (select id from public.projects where name not like 'P4B5-ACCEPT-%')) as act,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.projects t where name not like 'P4B5-ACCEPT-%') as proj,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.clients t where name not like 'P4B5-ACCEPT-%') as cl,
  (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.sites t where client_id in (select id from public.clients where name not like 'P4B5-ACCEPT-%')) as st,
  (select md5(coalesce(string_agg(t::text,'|' order by project_id, framework_id),'')) from public.project_frameworks t where project_id in (select id from public.projects where name not like 'P4B5-ACCEPT-%')) as pf,
  (select count(*) from public.frameworks) as frameworks,
  (select count(*) from public.framework_items) as items,
  (select count(*) from public.activity_types) as atypes,
  (select count(*) from public.issues) as issues,
  (select count(*) from public.actions) as actions,
  (select count(*) from public.attachments) as attachments,
  (select count(*) from public.files) as files`)[0];
console.log("AFTER", JSON.stringify(after));
const diffs = Object.keys(BEFORE).filter((k) => String(BEFORE[k]) !== String(after[k]));
console.log(diffs.length === 0 ? "REAL DATA + COUNTS IDENTICAL BEFORE vs AFTER" : "DIFFERENCES: " + diffs.join(", "));
console.log(dbQuery(`select (select count(*) from clients) clients, (select count(*) from projects) projects, (select count(*) from sites) sites, (select count(*) from activities) activities, (select count(*) from verification_items) verification_items`)[0]);
