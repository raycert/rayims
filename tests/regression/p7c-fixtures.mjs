// Phase 7C fixtures (P7C-ACCEPT- only): Documents for the Bulk Upload scenarios. One SQL batch (client-generated ids).
// Versions created by the fixtures carry file rows but no Storage object (only batches uploaded by the test do).
import { randomUUID } from "node:crypto";
import { dbQuery, http } from "./common.mjs";

export const PFX = "P7C-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export async function cleanupP7c(token) {
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

export async function createP7c(token) {
  await cleanupP7c(token);
  const sql = [];
  const id = () => randomUUID();
  const cA = id(), cB = id(), vl = id(), la = id(), sb = id(), pP = id(), pQ = id();
  sql.push(`insert into clients (id, name) values ('${cA}', '${PFX}Client A'), ('${cB}', '${PFX}Client B')`);
  sql.push(`insert into sites (id, client_id, name) values ('${vl}', '${cA}', 'Viet Long'), ('${la}', '${cA}', 'Long An'), ('${sb}', '${cB}', 'Other Site')`);
  sql.push(`insert into projects (id, client_id, name, status) values ('${pP}', '${cA}', '${PFX}Project P', 'active'), ('${pQ}', '${cB}', '${PFX}Project Q', 'active')`);
  sql.push(`insert into project_sites (project_id, site_id) values ('${pP}', '${vl}'), ('${pP}', '${la}'), ('${pQ}', '${sb}')`);

  const doc = (project, title, { code = null, site = null, applicable = true, versions = 0, fileName = null, fileSize = 2048, review = null } = {}) => {
    const d = id();
    sql.push(`insert into documents (id, project_id, site_id, doc_code, title, is_applicable, created_by) values ('${d}', '${project}', ${lit(site)}, ${lit(code)}, '${q(title)}', ${applicable}, ${ADMIN})`);
    const vs = [];
    for (let n = 1; n <= versions; n += 1) {
      const file = id(), v = id();
      sql.push(`insert into files (id, project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by) values ('${file}', '${project}', '${project}/' || gen_random_uuid() || '-fixture.pdf', ${lit(n === versions && fileName ? fileName : `existing-v${n}.pdf`)}, 'application/pdf', ${n === versions ? fileSize : 100}, ${ADMIN})`);
      sql.push(`insert into document_versions (id, document_id, version_no, revision, file_id, uploaded_by) values ('${v}', '${d}', ${n}, 'Rev.0${n}', '${file}', ${ADMIN})`);
      vs.push(v);
    }
    let r = null;
    if (review && vs.length) {
      r = id();
      sql.push(`insert into document_reviews (id, document_version_id, reviewer_id, status, reviewed_at) values ('${r}', '${vs[vs.length - 1]}', ${ADMIN}, '${review}', ${review === "under_review" ? "null" : "now()"})`);
    }
    return { id: d, versions: vs, review: r };
  };
  // NOTE: Document titles are chosen so that no file name of another scenario overlaps them (title matching is word based).
  const f = { cA, cB, vl, la, sb, pP, pQ };
  // ---- mixed batch
  f.m1 = doc(pP, "Document Control Procedure", { code: "P7C-PR-01", site: vl });
  f.m2vl = doc(pP, "Training Record Form", { code: "P7C-FM-05", site: vl });
  f.m2la = doc(pP, "Training Record Form", { code: "P7C-FM-05", site: la });
  f.m3 = doc(pP, "Records Control Procedure");
  f.m5 = doc(pP, "Oversize Document", { code: "P7C-PR-02" });
  f.m8 = doc(pP, "Open Assessment Document", { code: "P7C-PR-04", versions: 1, review: "under_review" });
  f.m9 = doc(pP, "Not Applicable Document", { code: "P7C-PR-05", applicable: false });
  f.m10 = doc(pP, "Same File Document", { code: "P7C-PR-06", versions: 1, fileName: "P7C-PR-06.pdf", fileSize: 2048 });
  f.m11 = doc(pP, "Manual Target Document");
  f.m12 = doc(pP, "Skipped Document", { code: "P7C-PR-07" });
  // ---- next-version previews
  f.nv1 = doc(pP, "Version Zero Document", { code: "P7C-NV-1" });
  f.nv2 = doc(pP, "Version One Document", { code: "P7C-NV-2", versions: 1 });
  f.nv3 = doc(pP, "Version Two Document", { code: "P7C-NV-3", versions: 2 });
  // ---- Vietnamese
  f.vn1 = doc(pP, "Quy trình kiểm soát tài liệu");
  f.vn2 = doc(pP, "Hồ sơ đào tạo");
  // ---- realistic 30-file batch
  f.b30 = [];
  for (let i = 1; i <= 30; i += 1) f.b30.push(doc(pP, `Batch Document ${String(i).padStart(3, "0")}`, { code: `P7C-B-${String(i).padStart(3, "0")}`, site: i % 2 ? vl : null }));
  // ---- failure scenarios
  f.pf = [1, 2, 3, 4].map((n) => doc(pP, `Partial Failure Document ${n}`, { code: `P7C-F-${n}` }));
  f.rf = doc(pP, "Register Failure Document", { code: "P7C-RF-1", versions: 1 });
  f.sc = [1, 2, 3].map((n) => doc(pP, `State Change Document ${n}`, { code: `P7C-SC-${n}`, versions: n === 2 ? 1 : 0 }));
  f.cf = doc(pP, "Conflict Document", { code: "P7C-CF-1" });
  f.mob = [1, 2, 3].map((n) => doc(pP, `Mobile Document ${n}`, { code: `P7C-MB-${n}` }));
  // ---- another project (isolation)
  f.other = doc(pQ, "Other Project Document", { code: "P7C-OT-1" });

  dbQuery(sql.join(";\n") + ";");
  return f;
}
