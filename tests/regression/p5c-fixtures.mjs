import { dbQuery, http } from "./common.mjs";

const PFX = "P5C-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export function fixtureObjects() {
  return dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select id::text from projects where client_id in ${CLIENTS})`).map((r) => r.name);
}

export async function cleanupP5c(token) {
  const keys = fixtureObjects();
  for (let i = 0; i < keys.length; i += 100) await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
  dbQuery(`
    delete from document_reviews where document_version_id in (select v.id from document_versions v join documents d on d.id=v.document_id where d.project_id in ${PROJ});
    delete from document_versions where document_id in (select id from documents where project_id in ${PROJ});
    delete from document_framework_items where document_id in (select id from documents where project_id in ${PROJ});
    delete from documents where project_id in ${PROJ};
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
  await cleanupP5c(token);
  const clientA = idOf(`insert into clients (name) values ('${PFX}Chinh Long Demo') returning id`);
  const clientB = idOf(`insert into clients (name) values ('${PFX}Other Client') returning id`);
  const vl = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Viet Long') returning id`);
  const bs = idOf(`insert into sites (client_id, name) values ('${clientB}', 'B Site') returning id`);
  const p = idOf(`insert into projects (client_id, name, status) values ('${clientA}', '${PFX}ISO Implementation', 'active') returning id`);
  const pB = idOf(`insert into projects (client_id, name, status) values ('${clientB}', '${PFX}Project B', 'active') returning id`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vl}'), ('${pB}', '${bs}');
    insert into project_frameworks (project_id, framework_id) select '${p}', id from frameworks where code = 'ISO 9001';
    insert into project_frameworks (project_id, framework_id) select '${pB}', id from frameworks where code = 'ISO 9001';`);
  const fi = (code) => idOf(`select fi.id from framework_items fi join frameworks f on f.id=fi.framework_id where f.code='ISO 9001' and fi.code='${code}'`);
  const q75 = fi("7.5"), q61 = fi("6.1");
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const doc = (project, title, { applicable = true, items = [] } = {}) => {
    const id = idOf(`insert into documents (project_id, title, is_applicable, created_by) values ('${project}', '${title}', ${applicable}, ${admin}) returning id`);
    if (items.length) dbQuery(`insert into document_framework_items (document_id, framework_item_id) values ${items.map((i) => `('${id}', '${i}')`).join(", ")}`);
    return id;
  };
  const version = (project, docId, no, revision = "Rev.00") => {
    const file = idOf(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
      values ('${project}', '${project}/' || gen_random_uuid() || '-fixture.pdf', '${PFX}v${no}.pdf', 'application/pdf', 1000, ${admin}) returning id`);
    return idOf(`insert into document_versions (document_id, version_no, revision, file_id, uploaded_by) values ('${docId}', ${no}, '${revision}', '${file}', ${admin}) returning id`);
  };
  /** status + minutes ago (created_at); concluded reviews get reviewed_at = created_at + 1 min. */
  const review = (versionId, status, minutesAgo, notes = null) =>
    idOf(`insert into document_reviews (document_version_id, reviewer_id, status, notes, created_at, reviewed_at)
      values ('${versionId}', ${admin}, '${status}', ${notes ? `'${notes}'` : "null"}, now() - interval '${minutesAgo} minutes',
              ${status === "under_review" ? "null" : `now() - interval '${minutesAgo - 1} minutes'`}) returning id`);

  const D = {
    flow: doc(p, `${PFX}Document Control Procedure`, { items: [q75, q61] }),
    noVersion: doc(p, `${PFX}Status Not Received`),
    received: doc(p, `${PFX}Status Received`),
    under: doc(p, `${PFX}Status Under Review`),
    revision: doc(p, `${PFX}Status Revision Required`),
    accepted: doc(p, `${PFX}Status Accepted`),
    na: doc(p, `${PFX}Status Not Applicable`, { applicable: false }),
    lastOpen: doc(p, `${PFX}Last Review With Open Assessment`),
    bDoc: doc(pB, `${PFX}B Secret Document`),
  };
  const V = {
    received: version(p, D.received, 1),
    under: version(p, D.under, 1),
    revision: version(p, D.revision, 1),
    accepted: version(p, D.accepted, 1),
    na: version(p, D.na, 1),
    lastOpen: version(p, D.lastOpen, 1),
    b: version(pB, D.bDoc, 1),
  };
  const R = {
    under: review(V.under, "under_review", 30),
    revision: review(V.revision, "revision_required", 30, "Scope section incomplete."),
    accepted: review(V.accepted, "accepted", 30, "Content acceptable."),
    na: review(V.na, "accepted", 60, "Accepted before the document became N/A."),
    lastOpenConcluded: review(V.lastOpen, "accepted", 3 * 24 * 60, "Accepted three days ago."),
    lastOpenOpen: review(V.lastOpen, "under_review", 10),
    b: review(V.b, "under_review", 20, "B secret review comment"),
  };
  return { clientA, clientB, p, pB, q75, q61, D, V, R };
}
