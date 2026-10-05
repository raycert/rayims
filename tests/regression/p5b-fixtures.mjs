import { dbQuery, http } from "./common.mjs";

const PFX = "P5B-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export function fixtureObjects() {
  return dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select id::text from projects where client_id in ${CLIENTS})`).map((r) => r.name);
}

export async function cleanupP5b(token) {
  const keys = fixtureObjects();
  for (let i = 0; i < keys.length; i += 100) await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
  dbQuery(`
    delete from issues where project_id in ${PROJ};
    delete from document_reviews where document_version_id in (select v.id from document_versions v join documents d on d.id=v.document_id where d.project_id in ${PROJ});
    delete from document_versions where document_id in (select id from documents where project_id in ${PROJ});
    delete from document_framework_items where document_id in (select id from documents where project_id in ${PROJ});
    delete from documents where project_id in ${PROJ};
    delete from attachments where project_id in ${PROJ};
    delete from files where project_id in ${PROJ};
    delete from project_frameworks where project_id in ${PROJ};
    delete from project_sites where project_id in ${PROJ};
    delete from projects where client_id in ${CLIENTS};
    delete from sites where client_id in ${CLIENTS};
    delete from clients where name like '${PFX}%';
  `);
  return keys.length;
}

const idOf = (sql) => dbQuery(sql)[0].id;

export async function createFixtures(token) {
  await cleanupP5b(token);
  const clientA = idOf(`insert into clients (name) values ('${PFX}Chinh Long Demo') returning id`);
  const clientB = idOf(`insert into clients (name) values ('${PFX}Other Client') returning id`);
  const vl = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Viet Long') returning id`);
  const bs = idOf(`insert into sites (client_id, name) values ('${clientB}', 'B Site') returning id`);
  const p = idOf(`insert into projects (client_id, name, status) values ('${clientA}', '${PFX}ISO Implementation', 'active') returning id`);
  const pB = idOf(`insert into projects (client_id, name, status) values ('${clientB}', '${PFX}Project B', 'active') returning id`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vl}'), ('${pB}', '${bs}');
    insert into project_frameworks (project_id, framework_id) select '${p}', id from frameworks where code = 'ISO 9001';
    insert into project_frameworks (project_id, framework_id) select '${pB}', id from frameworks where code = 'ISO 9001';`);
  const q75 = idOf(`select fi.id from framework_items fi join frameworks f on f.id=fi.framework_id where f.code='ISO 9001' and fi.code='7.5'`);
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const doc = (project, title, { applicable = true, items = [] } = {}) => {
    const id = idOf(`insert into documents (project_id, title, is_applicable, created_by) values ('${project}', '${title}', ${applicable}, ${admin}) returning id`);
    if (items.length) dbQuery(`insert into document_framework_items (document_id, framework_item_id) values ${items.map((i) => `('${id}', '${i}')`).join(", ")}`);
    return id;
  };
  /** DB-only version (file row, no Storage object unless the test uploads one). */
  const version = (project, docId, no, revision = null, name = `${PFX}fixture-v${no}.pdf`) => {
    const file = idOf(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
      values ('${project}', '${project}/' || gen_random_uuid() || '-fixture.pdf', '${name}', 'application/pdf', 1000, ${admin}) returning id`);
    return idOf(`insert into document_versions (document_id, version_no, revision, file_id, uploaded_by)
      values ('${docId}', ${no}, ${revision ? `'${revision}'` : "null"}, '${file}', ${admin}) returning id`);
  };
  const D = {
    proc: doc(p, `${PFX}Procedure`, { items: [q75] }),
    del: doc(p, `${PFX}Delete Flow`, { items: [q75] }),
    single: doc(p, `${PFX}Single Version`),
    reviewed: doc(p, `${PFX}Reviewed Version`),
    missing: doc(p, `${PFX}Missing Object`),
    na: doc(p, `${PFX}Not Applicable Doc`, { applicable: false }),
    types: doc(p, `${PFX}File Types`),
    dup: doc(p, `${PFX}Duplicate Filename`),
    consultant: doc(p, `${PFX}Consultant Doc`),
    bDoc: doc(pB, `${PFX}B Secret Document`),
  };
  const vReviewed = version(p, D.reviewed, 1, "Rev.00");
  const reviewId = idOf(`insert into document_reviews (document_version_id, reviewer_id, status, reviewed_at) values ('${vReviewed}', ${admin}, 'revision_required', now()) returning id`);
  const issueId = idOf(`insert into issues (project_id, title, finding_type, document_review_id, created_by) values ('${p}', '${PFX}Finding from review', 'observation', '${reviewId}', ${admin}) returning id`);
  const vMissing = version(p, D.missing, 1, "Rev.00", `${PFX}missing.pdf`);
  const vNa = version(p, D.na, 1, "Rev.00");
  const vB = version(pB, D.bDoc, 1, "Rev.00", `${PFX}B-secret.pdf`);
  return { clientA, clientB, p, pB, vl, q75, D, vReviewed, reviewId, issueId, vMissing, vNa, vB };
}
