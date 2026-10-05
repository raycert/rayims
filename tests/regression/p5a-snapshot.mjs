// Phase 5A: fingerprint of the genuine (non-fixture) data. `save` stores it; no arg compares.
import { dbQuery } from "./common.mjs";
import { writeFileSync, readFileSync } from "node:fs";
const REAL = `(select id from projects where name not like 'P5A-ACCEPT-%')`;
const h = (table, where) => `(select md5(coalesce(string_agg(t::text,'|' order by id),'')) from ${table} t ${where})`;
const sql = `select
 ${h("clients", "where name not like 'P5A-ACCEPT-%'")} cl,
 ${h("projects", "where name not like 'P5A-ACCEPT-%'")} proj,
 ${h("sites", "where client_id in (select id from clients where name not like 'P5A-ACCEPT-%')")} st,
 (select md5(coalesce(string_agg(t::text,'|' order by project_id, site_id),'')) from project_sites t where project_id in ${REAL}) ps,
 (select md5(coalesce(string_agg(t::text,'|' order by project_id, framework_id),'')) from project_frameworks t where project_id in ${REAL}) pf,
 ${h("activities", `where project_id in ${REAL}`)} act,
 ${h("verification_items", `where project_id in ${REAL}`)} vi,
 ${h("issues", `where project_id in ${REAL}`)} iss,
 ${h("actions", `where project_id in ${REAL}`)} acts,
 ${h("documents", `where project_id in ${REAL}`)} docs,
 ${h("frameworks", "")} fw,
 ${h("framework_items", "")} fi,
 (select count(*) from activity_types) at,
 (select count(*) from documents)::int documents,
 (select count(*) from document_versions)::int document_versions,
 (select count(*) from document_reviews)::int document_reviews,
 (select count(*) from document_framework_items)::int document_framework_items,
 (select count(*) from attachments where project_id in ${REAL})::int att,
 (select count(*) from files where project_id in ${REAL})::int fil,
 (select count(*) from storage.objects o where bucket_id='rayims-files' and split_part(o.name,'/',1) not in (select id::text from projects where name like 'P5A-ACCEPT-%'))::int obj`;
const now = dbQuery(sql)[0];
const f = process.env.TEMP + "/p5a-before.json";
if (process.argv[2] === "save") { writeFileSync(f, JSON.stringify(now)); console.log("SAVED", JSON.stringify(now)); }
else {
  const b = JSON.parse(readFileSync(f, "utf8"));
  const d = Object.keys(b).filter((k) => String(b[k]) !== String(now[k]));
  console.log("NOW", JSON.stringify(now));
  console.log(d.length ? "DIFF: " + d.join(",") : "GENUINE DATA IDENTICAL TO PRE-FLIGHT");
}
