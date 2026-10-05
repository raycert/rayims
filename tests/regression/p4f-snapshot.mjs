import { dbQuery } from "./common.mjs";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
const sql = `select
 (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from verification_items t where project_id in (select id from projects where name not like 'P4F-ACCEPT-%')) vi,
 (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from activities t where project_id in (select id from projects where name not like 'P4F-ACCEPT-%')) act,
 (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from projects t where name not like 'P4F-ACCEPT-%') proj,
 (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from clients t where name not like 'P4F-ACCEPT-%') cl,
 (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from sites t where client_id in (select id from clients where name not like 'P4F-ACCEPT-%')) st,
 (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from issues t where project_id in (select id from projects where name not like 'P4F-ACCEPT-%')) iss,
 (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from actions t where project_id in (select id from projects where name not like 'P4F-ACCEPT-%')) act2,
 (select count(*) from attachments where project_id in (select id from projects where name not like 'P4F-ACCEPT-%')) att,
 (select count(*) from files where project_id in (select id from projects where name not like 'P4F-ACCEPT-%')) fil,
 (select count(*) from storage.objects o where bucket_id='rayims-files' and split_part(o.name,'/',1) not in (select p.id::text from projects p where p.name like 'P4F-ACCEPT-%')) obj,
 (select count(*) from frameworks) fw, (select count(*) from framework_items) fi, (select count(*) from activity_types) at`;
const now = dbQuery(sql)[0];
const f = process.env.TEMP + "/p4f-before.json";
if (process.argv[2] === "save") { writeFileSync(f, JSON.stringify(now)); console.log("SAVED", JSON.stringify(now)); }
else { const b = JSON.parse(readFileSync(f, "utf8")); const d = Object.keys(b).filter((k) => String(b[k]) !== String(now[k])); console.log("NOW", JSON.stringify(now)); console.log(d.length ? "DIFF: " + d.join(",") : "GENUINE DATA IDENTICAL TO PRE-FLIGHT"); }
