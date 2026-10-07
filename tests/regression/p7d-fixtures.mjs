// Phase 7D fixtures (P7D-ACCEPT- only): Documents for the Expected Records scenarios. One SQL batch.
// Document titles carry no prefix (the Client and Project do; cleanup keys off them).
import { randomUUID } from "node:crypto";
import { dbQuery, http } from "./common.mjs";

export const PFX = "P7D-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export async function cleanupP7d(token) {
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

export const SHORT_RECORDS = "Annual training plan\nTraining attendance records\nCompetence evaluation\nTraining effectiveness records";
export const VN_RECORDS = "Kế hoạch đào tạo năm\nDanh sách tham dự\nĐánh giá năng lực\nĐánh giá hiệu quả đào tạo";
/** About 1,900 characters over 25 lines. */
export const LONG_RECORDS = Array.from({ length: 25 }, (_, i) => `Record ${String(i + 1).padStart(2, "0")}: ${"controlled evidence item ".repeat(2).trim()} number ${i + 1} kept for the assessment`).join("\n").slice(0, 1900);

export async function createP7d(token) {
  await cleanupP7d(token);
  const sql = [];
  const id = () => randomUUID();
  const cA = id(), cB = id(), vl = id(), sb = id(), pP = id(), pQ = id();
  sql.push(`insert into clients (id, name) values ('${cA}', '${PFX}Client A'), ('${cB}', '${PFX}Client B')`);
  sql.push(`insert into sites (id, client_id, name) values ('${vl}', '${cA}', 'Viet Long'), ('${sb}', '${cB}', 'Other Site')`);
  sql.push(`insert into projects (id, client_id, name, status) values ('${pP}', '${cA}', '${PFX}Project P', 'active'), ('${pQ}', '${cB}', '${PFX}Project Q', 'active')`);
  sql.push(`insert into project_sites (project_id, site_id) values ('${pP}', '${vl}'), ('${pQ}', '${sb}')`);
  sql.push(`insert into project_frameworks (project_id, framework_id) select '${pP}', id from frameworks where code in ('ISO 9001', 'ISO 14001')`);

  const doc = (project, title, { expected = null, code = null } = {}) => {
    const d = id();
    sql.push(`insert into documents (id, project_id, doc_code, title, expected_records, created_by) values ('${d}', '${project}', ${lit(code)}, '${q(title)}', ${lit(expected)}, ${ADMIN})`);
    return d;
  };
  const version = (project, d, no = 1, name = "client-file.pdf") => {
    const file = id(), v = id();
    sql.push(`insert into files (id, project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by) values ('${file}', '${project}', '${project}/' || gen_random_uuid() || '-fixture.pdf', '${q(name)}', 'application/pdf', 4096, ${ADMIN})`);
    sql.push(`insert into document_versions (id, document_id, version_no, revision, file_id, uploaded_by) values ('${v}', '${d}', ${no}, 'Rev.01', '${file}', ${ADMIN})`);
    return { v, file };
  };
  const f = { cA, cB, vl, sb, pP, pQ };
  // Document with a Version, a concluded assessment (with comments), a review-origin Finding and Verification item:
  // editing its Expected Records must change nothing else.
  f.dv = doc(pP, "History Procedure", { code: "HP-01" });
  f.vv = version(pP, f.dv, 1, "history-procedure.pdf");
  f.rv = id();
  sql.push(`insert into document_reviews (id, document_version_id, reviewer_id, status, notes, reviewed_at) values ('${f.rv}', '${f.vv.v}', ${ADMIN}, 'revision_required', 'Retention period missing.', now())`);
  f.fi = id();
  sql.push(`insert into issues (id, project_id, title, finding_type, document_review_id, created_by) values ('${f.fi}', '${pP}', 'Retention gap', 'nonconformity', '${f.rv}', ${ADMIN})`);
  f.vi = id();
  sql.push(`insert into verification_items (id, project_id, question, priority, document_review_id, created_by) values ('${f.vi}', '${pP}', 'Is retention defined?', 'medium', '${f.rv}', ${ADMIN})`);
  // Gap Assessment context: short and long Expected Records
  f.dg = doc(pP, "Training Procedure Context", { expected: SHORT_RECORDS });
  f.vg = version(pP, f.dg, 1, "training.pdf");
  f.dgl = doc(pP, "Long Records Procedure", { expected: LONG_RECORDS });
  f.vgl = version(pP, f.dgl, 1, "long.pdf");
  f.dgn = doc(pP, "No Records Procedure");
  f.vgn = version(pP, f.dgn, 1, "none.pdf");
  // Another project (isolation)
  f.dq = doc(pQ, "Other Project Procedure", { expected: "SECRET Q record one\nSECRET Q record two" });

  dbQuery(sql.join(";\n") + ";");
  return f;
}
