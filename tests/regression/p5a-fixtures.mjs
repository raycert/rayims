import { dbQuery, http } from "./common.mjs";

const PFX = "P5A-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export async function cleanupP5a(token) {
  const keys = dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select id::text from projects where client_id in ${CLIENTS})`).map((r) => r.name);
  for (let i = 0; i < keys.length; i += 100) await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
  dbQuery(`
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
export const item = (fw, code) =>
  idOf(`select fi.id from framework_items fi join frameworks f on f.id=fi.framework_id where f.code='${fw}' and fi.code='${code}'`);

export async function createFixtures(token) {
  await cleanupP5a(token);
  const clientA = idOf(`insert into clients (name) values ('${PFX}Chinh Long Demo') returning id`);
  const clientB = idOf(`insert into clients (name) values ('${PFX}Other Client') returning id`);
  const vl = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Viet Long') returning id`);
  const la = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Long An') returning id`);
  const bs = idOf(`insert into sites (client_id, name) values ('${clientB}', 'B Secret Site') returning id`);
  const p = idOf(`insert into projects (client_id, name, status) values ('${clientA}', '${PFX}ISO Implementation', 'active') returning id`);
  const pB = idOf(`insert into projects (client_id, name, status) values ('${clientB}', '${PFX}Project B', 'active') returning id`);
  const pEmpty = idOf(`insert into projects (client_id, name, status) values ('${clientA}', '${PFX}Empty Project', 'active') returning id`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vl}'), ('${p}', '${la}'), ('${pB}', '${bs}'), ('${pEmpty}', '${vl}');
    insert into project_frameworks (project_id, framework_id) select '${p}', id from frameworks where code in ('ISO 9001', 'ISO 14001', 'ISO 45001');
    insert into project_frameworks (project_id, framework_id) select '${pB}', id from frameworks where code = 'ISO 9001';`);
  const I = {
    q75: item("ISO 9001", "7.5"),
    q61: item("ISO 9001", "6.1"),
    e82: item("ISO 14001", "8.2"),
    e612: item("ISO 14001", "6.1.2"),
    h82: item("ISO 45001", "8.2"),
    h612: item("ISO 45001", "6.1.2"),
    n41: item("ISO 50001", "4.1"),
  };
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const doc = (project, title, { code = null, site = null, applicable = true, items = [] } = {}) => {
    const id = idOf(`insert into documents (project_id, title, doc_code, site_id, is_applicable, created_by)
      values ('${project}', '${title}', ${code ? `'${code}'` : "null"}, ${site ? `'${site}'` : "null"}, ${applicable}, ${admin}) returning id`);
    if (items.length) dbQuery(`insert into document_framework_items (document_id, framework_item_id) values ${items.map((i) => `('${id}', '${i}')`).join(", ")}`);
    return id;
  };
  // A file row without a Storage object is enough for DB-level status fixtures (no UI reads the object in 5A).
  const version = (docId, no, revision = null) => {
    const file = idOf(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
      values ('${p}', '${p}/' || gen_random_uuid() || '-fixture.pdf', '${PFX}v${no}.pdf', 'application/pdf', 1000, ${admin}) returning id`);
    return idOf(`insert into document_versions (document_id, version_no, revision, file_id, uploaded_by)
      values ('${docId}', ${no}, ${revision ? `'${revision}'` : "null"}, '${file}', ${admin}) returning id`);
  };
  const review = (versionId, status, offsetMin) =>
    dbQuery(`insert into document_reviews (document_version_id, reviewer_id, status, reviewed_at, created_at)
      values ('${versionId}', ${admin}, '${status}', ${status === "under_review" ? "null" : `now() - interval '${offsetMin} minutes'`}, now() - interval '${offsetMin} minutes')`);

  // Status tone fixtures (DB only, no 5B/5C UI)
  const D = {
    received: doc(p, `${PFX}Status Received`, { code: "ST-01" }),
    underReview: doc(p, `${PFX}Status Under Review`, { code: "ST-02" }),
    revision: doc(p, `${PFX}Status Revision Required`, { code: "ST-03" }),
    accepted: doc(p, `${PFX}Status Accepted`, { code: "ST-04", items: [I.q75] }),
    na: doc(p, `${PFX}Status Not Applicable`, { code: "ST-05", applicable: false }),
    deleteMe: doc(p, `${PFX}Delete Me – Empty With Mappings`, { code: "DEL-01", items: [I.q61, I.e612] }),
    blocked: doc(p, `${PFX}Blocked – Has Version`, { code: "DEL-02" }),
    tamperSrc: doc(p, `${PFX}Tamper Source – Deletable`),
    consultantDel: doc(p, `${PFX}Consultant Deletes This`),
    bDoc: doc(pB, `${PFX}B Secret Document`, { code: "B-SECRET-01", site: bs, items: [item("ISO 9001", "4.1")] }),
  };
  version(D.received, 1, "Rev.00");
  const vUR = version(D.underReview, 1);
  review(vUR, "under_review", 5);
  const v1 = version(D.revision, 1, "Rev.00");
  review(v1, "accepted", 60); // older version accepted...
  const v2 = version(D.revision, 2, "Rev.01");
  review(v2, "accepted", 30);
  review(v2, "revision_required", 10); // ...latest review of latest version wins (case E)
  const vA = version(D.accepted, 1, "Rev.02");
  review(vA, "revision_required", 40);
  review(vA, "accepted", 20); // case D
  const vBlocked = version(D.blocked, 1, "Rev.00");
  return { clientA, clientB, p, pB, pEmpty, vl, la, bs, I, D, vBlocked };
}
