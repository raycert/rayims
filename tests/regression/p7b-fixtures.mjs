// Phase 7B fixtures (P7B-ACCEPT- only): Documents / Versions / Reviews for the delete, race, one-open-review,
// tie-break and register-status scenarios. One SQL batch (client-generated ids) + real Storage objects.
import { randomUUID } from "node:crypto";
import { dbQuery, http } from "./common.mjs";

export const PFX = "P7B-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export async function cleanupP7b(token) {
  const keys = dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select id::text from projects where client_id in ${CLIENTS})`).map((r) => r.name);
  for (let i = 0; i < keys.length; i += 100) await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
  // Explicit dependency order: since Phase 7B a Document / Version with children can no longer be deleted by cascade.
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

/** Uploads a tiny PDF-looking object to the private bucket (as the signed-in user) and returns its key. */
export async function putObject(token, projectId, name = "doc.pdf") {
  const key = `${projectId}/${randomUUID()}-${name}`;
  const r = await http("POST", `/storage/v1/object/rayims-files/${key}`, { token, raw: true, body: Buffer.from("%PDF-1.4 P7B fixture\n%%EOF\n"), headers: { "content-type": "application/pdf" } });
  if (r.status !== 200) throw new Error(`fixture upload failed: ${r.status} ${r.text.slice(0, 120)}`);
  return key;
}

export async function createP7b(token) {
  await cleanupP7b(token);
  const sql = [];
  const id = () => randomUUID();
  const cA = id(), cB = id(), site = id(), siteB = id(), pP = id(), pQ = id();
  sql.push(`insert into clients (id, name) values ('${cA}', '${PFX}Client A'), ('${cB}', '${PFX}Client B')`);
  sql.push(`insert into sites (id, client_id, name) values ('${site}', '${cA}', '${PFX}Site'), ('${siteB}', '${cB}', '${PFX}Site B')`);
  sql.push(`insert into projects (id, client_id, name, status) values ('${pP}', '${cA}', '${PFX}Project P', 'active'), ('${pQ}', '${cB}', '${PFX}Project Q', 'active')`);
  sql.push(`insert into project_sites (project_id, site_id) values ('${pP}', '${site}'), ('${pQ}', '${siteB}')`);
  sql.push(`insert into project_frameworks (project_id, framework_id) select '${pP}', id from frameworks where code = 'ISO 9001'`);

  const objects = []; // storage keys that must exist in the bucket
  const doc = (project, title, { applicable = true } = {}) => {
    const d = id();
    sql.push(`insert into documents (id, project_id, title, is_applicable, created_by) values ('${d}', '${project}', '${PFX}${q(title)}', ${applicable}, ${ADMIN})`);
    return d;
  };
  const ver = (project, d, no, { object = true } = {}) => {
    const file = id(), v = id();
    const key = `${project}/${id()}-v${no}.pdf`;
    if (object) objects.push(key);
    sql.push(`insert into files (id, project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by) values ('${file}', '${project}', '${key}', 'v${no}.pdf', 'application/pdf', 26, ${ADMIN})`);
    sql.push(`insert into document_versions (id, document_id, version_no, revision, file_id, uploaded_by) values ('${v}', '${d}', ${no}, 'Rev.0${no}', '${file}', ${ADMIN})`);
    return { v, file, key };
  };
  const rev = (v, status, { createdAt = null, rid = id() } = {}) => {
    sql.push(`insert into document_reviews (id, document_version_id, reviewer_id, status, reviewed_at, created_at) values ('${rid}', '${v}', ${ADMIN}, '${status}', ${status === "under_review" ? "null" : "now()"}, ${createdAt ? `'${createdAt}'` : "now()"})`);
    return rid;
  };

  const f = { cA, cB, site, siteB, pP, pQ };
  // --- Document delete
  f.dNoVersion = doc(pP, "Doc without versions");
  sql.push(`insert into document_framework_items (document_id, framework_item_id) select '${f.dNoVersion}', id from framework_items where code = '7.5' and framework_id in (select id from frameworks where code = 'ISO 9001')`);
  f.dWithVersion = doc(pP, "Doc with a version");
  f.vWithVersion = ver(pP, f.dWithVersion, 1);
  // --- Version delete
  f.dVerFree = doc(pP, "Doc: unreviewed latest version");
  f.vFree = ver(pP, f.dVerFree, 1);
  f.dVerConcluded = doc(pP, "Doc: version with concluded review");
  f.vConcluded = ver(pP, f.dVerConcluded, 1);
  f.rConcluded = rev(f.vConcluded.v, "revision_required");
  f.dVerOpen = doc(pP, "Doc: version with open review");
  f.vOpen = ver(pP, f.dVerOpen, 1);
  f.rOpen = rev(f.vOpen.v, "under_review");
  f.dVerOld = doc(pP, "Doc: non-latest version");
  f.vOld1 = ver(pP, f.dVerOld, 1);
  f.vOld2 = ver(pP, f.dVerOld, 2);
  // --- Concurrent start targets (REST + app replay + captured action)
  f.dStartRest = doc(pP, "Doc: concurrent start (REST)");
  f.vStartRest = ver(pP, f.dStartRest, 1);
  f.dStartApp = doc(pP, "Doc: concurrent start (app)");
  f.vStartApp = ver(pP, f.dStartApp, 1);
  f.dStartCapture = doc(pP, "Doc: capture start action");
  f.vStartCapture = ver(pP, f.dStartCapture, 1);
  // --- Delete-race documents (versions are inserted by the test)
  f.dRaceDoc = doc(pP, "Doc: delete race");
  f.dRaceVer = doc(pP, "Doc: version delete race");
  f.vRaceVer = ver(pP, f.dRaceVer, 1);
  f.dCaptureDelete = doc(pP, "Doc: capture delete action");
  f.dCaptureVer = doc(pP, "Doc: capture version delete");
  f.vCaptureVer = ver(pP, f.dCaptureVer, 1);
  // --- Tie-break: two concluded reviews with an identical created_at
  f.dTie = doc(pP, "Doc: review tie");
  f.vTie = ver(pP, f.dTie, 1);
  f.rTieLow = rev(f.vTie.v, "accepted", { createdAt: "2026-10-05T10:00:00Z", rid: "00000000-0000-4000-8000-0000000000aa" });
  f.rTieHigh = rev(f.vTie.v, "revision_required", { createdAt: "2026-10-05T10:00:00Z", rid: "00000000-0000-4000-8000-0000000000bb" });
  // --- Register statuses
  f.sNA = doc(pP, "Status: not applicable", { applicable: false });
  f.sNotReceived = doc(pP, "Status: not received");
  f.sReceived = doc(pP, "Status: received");
  ver(pP, f.sReceived, 1);
  f.sUnder = doc(pP, "Status: under review");
  rev(ver(pP, f.sUnder, 1).v, "under_review");
  f.sRevision = doc(pP, "Status: revision required");
  rev(ver(pP, f.sRevision, 1).v, "revision_required");
  f.sAccepted = doc(pP, "Status: accepted");
  rev(ver(pP, f.sAccepted, 1).v, "accepted");
  // --- Another project (isolation)
  f.dOther = doc(pQ, "Other project doc");
  f.vOther = ver(pQ, f.dOther, 1);

  dbQuery(sql.join(";\n") + ";");
  for (const key of objects) {
    const [project] = key.split("/");
    const r = await http("POST", `/storage/v1/object/rayims-files/${key}`, { token, raw: true, body: Buffer.from("%PDF-1.4 P7B fixture\n%%EOF\n"), headers: { "content-type": "application/pdf" } });
    if (r.status !== 200) throw new Error(`fixture upload failed (${project}): ${r.status}`);
  }
  return f;
}
