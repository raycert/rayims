// Phase 7A fixtures (P7A-ACCEPT- only): Home lists (more than five rows each), Verification deep link,
// Findings / Actions Activity filters, date-only and timestamp probes, cross-project markers.
// All rows are created by ONE SQL batch with client-generated ids (each dbQuery call costs seconds).
import { randomUUID } from "node:crypto";
import { dbQuery, http } from "./common.mjs";

export const PFX = "P7A-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export async function cleanupP7a(token) {
  const keys = dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select id::text from projects where client_id in ${CLIENTS})`).map((r) => r.name);
  for (let i = 0; i < keys.length; i += 100) await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
  dbQuery(`
    delete from attachments where project_id in ${PROJ};
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from document_reviews where document_version_id in (select v.id from document_versions v join documents d on d.id = v.document_id where d.project_id in ${PROJ});
    delete from document_versions where document_id in (select id from documents where project_id in ${PROJ});
    delete from document_framework_items where document_id in (select id from documents where project_id in ${PROJ});
    delete from documents where project_id in ${PROJ};
    delete from files where project_id in ${PROJ};
    delete from activities where project_id in ${PROJ};
    delete from project_frameworks where project_id in ${PROJ};
    delete from project_sites where project_id in ${PROJ};
    delete from projects where client_id in ${CLIENTS};
    delete from sites where client_id in ${CLIENTS};
    delete from clients where name like '${PFX}%';
  `);
  return keys.length;
}

const ADMIN = `(select id from profiles where role='admin' order by created_at limit 1)`;
const q = (s) => s.replace(/'/g, "''");
const lit = (v) => (v === null || v === undefined ? "null" : `'${q(String(v))}'`);
const day = (base, n) => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function createP7a(token) {
  await cleanupP7a(token);
  const today = new Date().toISOString().slice(0, 10);
  const sql = [];
  const id = () => randomUUID();

  const cA = id(), cB = id(), a1 = id(), a2 = id(), sb = id();
  sql.push(`insert into clients (id, name) values ('${cA}', '${PFX}Client A'), ('${cB}', '${PFX}Client B')`);
  sql.push(`insert into sites (id, client_id, name) values ('${a1}', '${cA}', '${PFX}Site A1'), ('${a2}', '${cA}', '${PFX}Site A2'), ('${sb}', '${cB}', '${PFX}Site B')`);
  const proj = (client, name, createdOffsetSeconds = 0) => {
    const p = id();
    sql.push(`insert into projects (id, client_id, name, status, created_at) values ('${p}', '${client}', '${PFX}${name}', 'active', now() + interval '${createdOffsetSeconds} seconds')`);
    return p;
  };
  const pA = proj(cA, "Project A"), pB = proj(cB, "Project B"), pF = proj(cA, "Project F (filters)");
  for (let i = 1; i <= 6; i += 1) proj(cA, `Recent ${i}`, i); // Recent 6 is the newest
  sql.push(`insert into project_sites (project_id, site_id) values ('${pA}', '${a1}'), ('${pA}', '${a2}'), ('${pB}', '${sb}'), ('${pF}', '${a1}')`);

  const act = (project, name, { site = null, status = "planned", start = null, end = null } = {}) => {
    const a = id();
    sql.push(`insert into activities (id, project_id, site_id, name, activity_type_id, mode, status, start_date, end_date, consultant_id)
      values ('${a}', '${project}', ${lit(site)}, '${PFX}${q(name)}', (select id from activity_types where key='site_assessment'), 'on_site', '${status}', ${lit(start)}, ${lit(end)}, ${ADMIN})`);
    return a;
  };
  const action = (project, desc, { due = null, status = "open", activity = null, issue = null, owner = "HSE Manager" } = {}) => {
    const a = id();
    sql.push(`insert into actions (id, project_id, activity_id, issue_id, description, owner_name, priority, status, due_date, completed_at, created_by)
      values ('${a}', '${project}', ${lit(activity)}, ${lit(issue)}, '${PFX}${q(desc)}', '${owner}', 'medium', '${status}', ${lit(due)}, ${status === "closed" ? "now()" : "null"}, ${ADMIN})`);
    return a;
  };
  const finding = (project, title, { activity = null, type = "nonconformity", site = null, createdAt = null } = {}) => {
    const i = id();
    sql.push(`insert into issues (id, project_id, title, finding_type, activity_id, site_id, created_by${createdAt ? ", created_at" : ""})
      values ('${i}', '${project}', '${PFX}${q(title)}', '${type}', ${lit(activity)}, ${lit(site)}, ${ADMIN}${createdAt ? `, '${createdAt}'` : ""})`);
    return i;
  };

  // ---- Home: Upcoming Activities (7 in A + 1 in B) and excluded ones
  const upcoming = [];
  for (let i = 1; i <= 7; i += 1) upcoming.push(act(pA, `Upcoming ${i}`, { site: i % 2 ? a1 : null, start: day(today, i) }));
  const upB = act(pB, "Upcoming B", { site: sb, start: day(today, 1) });
  act(pA, "Completed Future", { status: "completed", start: day(today, 1) });
  act(pA, "Cancelled Future", { status: "cancelled", start: day(today, 1) });

  // ---- Home: Overdue Actions (7 open in A, 1 linked to a Finding, 1 in B) and excluded ones
  const homeFinding = finding(pA, "Home Finding");
  for (let i = 1; i <= 7; i += 1) action(pA, `Overdue ${i}`, { due: day(today, -(11 - i)) });
  const linked = action(pA, "Overdue Linked", { due: day(today, -11), issue: homeFinding });
  const overdueB = action(pB, "Overdue B", { due: day(today, -9), owner: "B Owner" });
  action(pA, "Closed Past Due", { due: day(today, -20), status: "closed" });
  action(pA, "Due Tomorrow", { due: day(today, 1) });

  // ---- Documents with an open Gap Assessment (7 in A + 1 in B) and excluded ones (a concluded one carries the follow-up link)
  const doc = (project, title, { site = null, code = null, review = null, minutesAgo = 5 } = {}) => {
    const d = id();
    sql.push(`insert into documents (id, project_id, site_id, doc_code, title, created_by) values ('${d}', '${project}', ${lit(site)}, ${lit(code)}, '${PFX}${q(title)}', ${ADMIN})`);
    if (review === null) return { doc: d };
    const file = id(), v = id(), r = id();
    sql.push(`insert into files (id, project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by) values ('${file}', '${project}', '${project}/' || gen_random_uuid() || '-doc.pdf', 'Procedure.pdf', 'application/pdf', 1000, ${ADMIN})`);
    sql.push(`insert into document_versions (id, document_id, version_no, revision, file_id, uploaded_by) values ('${v}', '${d}', 1, 'Rev.00', '${file}', ${ADMIN})`);
    sql.push(`insert into document_reviews (id, document_version_id, reviewer_id, status, notes, created_at, reviewed_at)
      values ('${r}', '${v}', ${ADMIN}, '${review}', null, now() - interval '${minutesAgo} minutes', ${review === "under_review" ? "null" : `now() - interval '${minutesAgo - 1} minutes'`})`);
    return { doc: d, version: v, review: r };
  };
  const docs = [];
  for (let i = 1; i <= 7; i += 1) docs.push(doc(pA, `Procedure ${i}`, { site: i % 2 ? a1 : null, code: `QP-0${i}`, review: "under_review", minutesAgo: 60 - i }));
  const docB = doc(pB, "Procedure B", { site: sb, review: "under_review", minutesAgo: 90 });
  doc(pA, "Accepted Procedure", { review: "accepted", minutesAgo: 30 });
  doc(pA, "No Version Procedure");

  // ---- Verification deep link: a Gap Assessment follow-up item far down a long list, + another project's item
  const linkDoc = doc(pA, "Link Document", { site: a1, code: "QP-LINK", review: "revision_required", minutesAgo: 3 });
  const vi = (project, question, { priority = "medium", review = null, site = null } = {}) => {
    const v = id();
    sql.push(`insert into verification_items (id, project_id, site_id, question, priority, document_review_id, created_by)
      values ('${v}', '${project}', ${lit(site)}, '${PFX}${q(question)}', '${priority}', ${lit(review)}, ${ADMIN})`);
    return v;
  };
  for (let i = 1; i <= 25; i += 1) vi(pA, `Filler check ${String(i).padStart(2, "0")}`, { priority: "high" });
  const viTarget = vi(pA, "Is the authority matrix defined? (follow-up of the assessment)", { priority: "low", review: linkDoc.review, site: a1 });
  const viB = vi(pB, "BMARKER cross-project check", { site: sb });
  const viDeleted = id(); // never inserted: a well-formed id that does not exist (a deleted item)

  // ---- Filters (Project F): Activities FA / FB / Midnight, Findings and Actions with and without an Activity
  const FA = act(pF, "Activity FA", { site: a1, start: "2026-10-03", end: "2026-10-03", status: "completed" });
  const FB = act(pF, "Activity FB", { site: a1, start: "2026-09-20", status: "planned" });
  const AM = act(pF, "Activity Midnight", { site: a1, start: "2026-10-03", status: "planned" });
  const fFA1 = finding(pF, "Finding FA1", { activity: FA });
  const fFA2 = finding(pF, "Finding FA2", { activity: FA, type: "observation" });
  const fFB1 = finding(pF, "Finding FB1", { activity: FB });
  // Timestamp probe: recorded at a known UTC moment (16:59 UTC = 23:59 in Ho Chi Minh, 09:59 in Los Angeles).
  const fNone = finding(pF, "Finding Project-wide", { createdAt: "2026-10-03T16:59:00Z" });
  const aFA = action(pF, "Action FA", { activity: FA, due: "2026-10-03" });
  const aFB = action(pF, "Action FB", { activity: FB, due: "2026-10-30" });
  const aNone = action(pF, "Action no Activity", { due: "2026-10-30" });
  const aLinked = action(pF, "Action linked to FA1 without Activity", { issue: fFA1, due: "2026-10-30" });

  dbQuery(sql.join(";\n") + ";");
  return { AM, today, cA, cB, a1, a2, sb, pA, pB, pF, upB, upcoming, linked, overdueB, homeFinding, docs, docB, linkDoc, viTarget, viB, viDeleted, FA, FB, fFA1, fFA2, fFB1, fNone, aFA, aFB, aNone, aLinked };
}
