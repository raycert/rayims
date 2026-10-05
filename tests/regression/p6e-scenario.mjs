// Phase 6E scenario fixtures (P6E-ACCEPT- only). Activity A itself is created in the UI by the consultant.
import { dbQuery } from "./common.mjs";
import { cleanupP6e, createPerformanceData } from "./p6e-base.mjs";

export { cleanupP6e, createPerformanceData };
const id1 = (sql) => dbQuery(sql)[0].id;
const ADM = `(select id from profiles where role='admin' order by created_at limit 1)`;
const qq = (s) => s.replace(/'/g, "''");

/** Base: project with sites + frameworks, Activity B, an undated empty Activity, a large Activity, a
 *  document with a concluded Gap Assessment, and a Project B with marker data. */
export async function createBase(token) {
  await cleanupP6e(token);
  const cA = id1(`insert into clients (name) values ('P6E-ACCEPT-Chinh Long Demo') returning id`);
  const cB = id1(`insert into clients (name) values ('P6E-ACCEPT-Other Client') returning id`);
  const vl = id1(`insert into sites (client_id, name) values ('${cA}', 'P6E-ACCEPT-Viet-Long') returning id`);
  const la = id1(`insert into sites (client_id, name) values ('${cA}', 'P6E-ACCEPT-Long-An') returning id`);
  const bs = id1(`insert into sites (client_id, name) values ('${cB}', 'BMARKER Site') returning id`);
  const p = id1(`insert into projects (client_id, name, status) values ('${cA}', 'P6E-ACCEPT-IMS-Implementation', 'active') returning id`);
  const pB = id1(`insert into projects (client_id, name, status) values ('${cB}', 'P6E-ACCEPT-Project B', 'active') returning id`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vl}'), ('${p}', '${la}'), ('${pB}', '${bs}');
    insert into project_frameworks (project_id, framework_id) select '${p}', id from frameworks where code in ('ISO 9001', 'ISO 14001');`);
  const fi = (fw, code) => id1(`select fi.id from framework_items fi join frameworks f on f.id = fi.framework_id where f.code = '${fw}' and fi.code = '${code}'`);
  const e81 = fi("ISO 14001", "8.1"), q75 = fi("ISO 9001", "7.5");
  const act = (proj, name, site, status, date) =>
    id1(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date, consultant_id)
      values ('${proj}', ${site ? `'${site}'` : "null"}, '${qq(name)}', (select id from activity_types where key='site_assessment'), 'on_site', '${status}', ${date ? `'${date}'` : "null"}, ${ADM}) returning id`);
  const B = act(p, "P6E-ACCEPT-Follow-up Visit", vl, "in_progress", "2026-10-28");
  const E = act(p, "P6E-ACCEPT-Empty Activity", null, "planned", null); // undated → filename uses the export date
  const PERF = act(p, "P6E-ACCEPT-Large Assessment", vl, "in_progress", "2026-10-29");
  const XB = act(pB, "P6E-ACCEPT-BMARKER Activity", bs, "completed", "2026-10-27");
  const doc = id1(`insert into documents (project_id, title, created_by) values ('${p}', 'P6E-ACCEPT-Document Control Procedure', ${ADM}) returning id`);
  dbQuery(`insert into document_framework_items (document_id, framework_item_id) values ('${doc}', '${q75}')`);
  const dfile = id1(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by) values ('${p}', '${p}/' || gen_random_uuid() || '-doc.pdf', 'Procedure.pdf', 'application/pdf', 1000, ${ADM}) returning id`);
  const ver = id1(`insert into document_versions (document_id, version_no, revision, file_id, uploaded_by) values ('${doc}', 1, 'Rev.00', '${dfile}', ${ADM}) returning id`);
  const review = id1(`insert into document_reviews (document_version_id, reviewer_id, status, notes, created_at, reviewed_at) values ('${ver}', ${ADM}, 'revision_required', 'Approval matrix missing.', now() - interval '10 minutes', now() - interval '9 minutes') returning id`);
  const fB = id1(`insert into issues (project_id, title, finding_type, activity_id, created_by) values ('${pB}', 'P6E-ACCEPT-BMARKER finding', 'observation', '${XB}', ${ADM}) returning id`);
  const fileB = id1(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by) values ('${pB}', '${pB}/' || gen_random_uuid() || '-b.jpg', 'BMARKER.jpg', 'image/jpeg', 100, ${ADM}) returning id`);
  dbQuery(`insert into attachments (project_id, file_id, caption, activity_id, created_by) values ('${pB}', '${fileB}', 'BMARKER caption', '${XB}', ${ADM})`);
  return { cA, cB, vl, la, bs, p, pB, B, E, PERF, XB, doc, ver, review, fB, e81, q75 };
}

/** A: 4 Verified OK, 2 Issue Identified, 1 Follow-up Required, 1 planned not completed;
 *  1 planned in A but executed in B (Issue Identified). */
export function seedVerification(p, A, B, site, e81) {
  const vi = (q, { verified = A, result = null, notes = null, item = null } = {}) =>
    id1(`insert into verification_items (project_id, site_id, framework_item_id, question, priority, target_activity_id, verified_activity_id, result, notes, verified_by, verified_at, created_by)
      values ('${p}', '${site}', ${item ? `'${item}'` : "null"}, '${qq(q)}', 'medium', '${A}', ${result ? `'${verified}'` : "null"}, ${result ? `'${result}'` : "null"}, ${notes ? `'${qq(notes)}'` : "null"}, ${result ? ADM : "null"}, ${result ? "now()" : "null"}, ${ADM}) returning id`);
  return {
    ok1: vi("P6E-ACCEPT-Are SDS available?", { result: "verified_ok" }),
    ok2: vi("P6E-ACCEPT-Is PPE available?", { result: "verified_ok" }),
    ok3: vi("P6E-ACCEPT-Are extinguishers inspected?", { result: "verified_ok" }),
    ok4: vi("P6E-ACCEPT-Are drains protected?", { result: "verified_ok" }),
    issue1: vi("P6E-ACCEPT-Is secondary containment provided?", { result: "issue_identified", notes: "Không có bờ bao tại kho chứa thùng phuy.", item: e81 }),
    issue2: vi("P6E-ACCEPT-Are chemical labels legible?", { result: "issue_identified", notes: "Labels faded on 3 drums." }),
    follow: vi("P6E-ACCEPT-Are waste records complete?", { result: "follow_up_required", notes: "Two months missing." }),
    pending: vi("P6E-ACCEPT-Is the emergency drill recorded?", {}),
    elsewhere: vi("P6E-ACCEPT-Are permits displayed at the gate?", { verified: B, result: "issue_identified", notes: "Permit expired." }),
  };
}

/** Standalone Action of A (B) and a Closed Action of A (D). */
export function seedActions(p, A) {
  const a = (desc, status) =>
    id1(`insert into actions (project_id, activity_id, description, owner_name, priority, status, completed_at, created_by)
      values ('${p}', '${A}', '${qq(desc)}', 'HSE Manager', 'medium', '${status}', ${status === "closed" ? "now()" : "null"}, ${ADM}) returning id`);
  return {
    standalone: a("P6E-ACCEPT-Send visit notes to the client", "open"),
    closed: a("P6E-ACCEPT-Confirm the next visit date", "closed"),
  };
}

/** Evidence on the Activity, a check, a Finding and an Action of A (+ one on the elsewhere check). */
export function seedEvidence(p, { A, viIssue, finding, action, viElsewhere }) {
  const file = (name) => id1(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by) values ('${p}', '${p}/' || gen_random_uuid() || '-fixture.jpg', '${qq(name)}', 'image/jpeg', 2048, ${ADM}) returning id`);
  const att = (col, parent, name, caption) => id1(`insert into attachments (project_id, file_id, caption, ${col}, created_by) values ('${p}', '${file(name)}', '${qq(caption)}', '${parent}', ${ADM}) returning id`);
  return {
    activity: att("activity_id", A, "kho-chua-thung-phuy-toan-canh-anh-chup-tai-hien-truong-ngay-27-10-2026.jpg", "Toàn cảnh kho chứa"),
    verification: att("verification_item_id", viIssue, "no-bund.jpg", "No bund"),
    finding: att("issue_id", finding, "containment-nc.jpg", "NC evidence"),
    action: att("action_id", action, "training-sheet.jpg", "Training sheet"),
    elsewhere: att("verification_item_id", viElsewhere, "permits.jpg", "Permits (Activity B)"),
  };
}
