import { dbQuery, http } from "./common.mjs";

const PFX = "P5D-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export async function cleanupP5d(token) {
  const keys = dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select id::text from projects where client_id in ${CLIENTS})`).map((r) => r.name);
  for (let i = 0; i < keys.length; i += 100) await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
  dbQuery(`
    delete from attachments where project_id in ${PROJ};
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from document_reviews where document_version_id in (select v.id from document_versions v join documents d on d.id=v.document_id where d.project_id in ${PROJ});
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

const idOf = (sql) => dbQuery(sql)[0].id;
const day = (o) => new Date(Date.now() + o * 86400000).toISOString().slice(0, 10);

export async function createFixtures(token) {
  await cleanupP5d(token);
  const clientA = idOf(`insert into clients (name) values ('${PFX}Chinh Long Demo') returning id`);
  const clientB = idOf(`insert into clients (name) values ('${PFX}Other Client') returning id`);
  const vl = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Viet Long') returning id`);
  const la = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Long An') returning id`);
  const bs = idOf(`insert into sites (client_id, name) values ('${clientB}', 'B Site') returning id`);
  const p = idOf(`insert into projects (client_id, name, status) values ('${clientA}', '${PFX}ISO Implementation', 'active') returning id`);
  const pB = idOf(`insert into projects (client_id, name, status) values ('${clientB}', '${PFX}Project B', 'active') returning id`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vl}'), ('${p}', '${la}'), ('${pB}', '${bs}');
    insert into project_frameworks (project_id, framework_id) select '${p}', id from frameworks where code in ('ISO 9001', 'ISO 14001');
    insert into project_frameworks (project_id, framework_id) select '${pB}', id from frameworks where code = 'ISO 9001';`);
  const fi = (fw, code) => idOf(`select fi.id from framework_items fi join frameworks f on f.id=fi.framework_id where f.code='${fw}' and fi.code='${code}'`);
  const I = { q75: fi("ISO 9001", "7.5"), q61: fi("ISO 9001", "6.1"), e82: fi("ISO 14001", "8.2"), n41: fi("ISO 50001", "4.1") };
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const act = (project, name, site) =>
    idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date)
      values ('${project}', ${site ? `'${site}'` : "null"}, '${name}', (select id from activity_types where key='site_assessment'), 'on_site', 'in_progress', '${day(0)}') returning id`);
  const A = {
    vl: act(p, "Site Assessment – Viet Long", vl),
    pw: act(p, "Project Review Meeting", null),
    la: act(p, "Site Assessment – Long An", la),
    b: act(pB, "B Secret Activity", bs),
  };
  const doc = (project, title, { site = null, items = [] } = {}) => {
    const id = idOf(`insert into documents (project_id, title, site_id, created_by) values ('${project}', '${title}', ${site ? `'${site}'` : "null"}, ${admin}) returning id`);
    if (items.length) dbQuery(`insert into document_framework_items (document_id, framework_item_id) values ${items.map((i) => `('${id}', '${i}')`).join(", ")}`);
    return id;
  };
  const version = (project, docId, no, revision = "Rev.00") => {
    const file = idOf(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
      values ('${project}', '${project}/' || gen_random_uuid() || '-fixture.pdf', '${PFX}v${no}.pdf', 'application/pdf', 1000, ${admin}) returning id`);
    return idOf(`insert into document_versions (document_id, version_no, revision, file_id, uploaded_by) values ('${docId}', ${no}, '${revision}', '${file}', ${admin}) returning id`);
  };
  const review = (versionId, status, minutesAgo, notes = null) =>
    idOf(`insert into document_reviews (document_version_id, reviewer_id, status, notes, created_at, reviewed_at)
      values ('${versionId}', ${admin}, '${status}', ${notes ? `'${notes}'` : "null"}, now() - interval '${minutesAgo} minutes',
              ${status === "under_review" ? "null" : `now() - interval '${minutesAgo - 1} minutes'`}) returning id`);

  const D = {
    pw: doc(p, `${PFX}Document Control Procedure`, { items: [I.q75, I.q61] }),
    site: doc(p, `${PFX}Emergency Plan Viet Long`, { site: vl, items: [I.e82] }),
    none: doc(p, `${PFX}No Mapping Document`),
    hist: doc(p, `${PFX}Historical Assessment Document`),
    old: doc(p, `${PFX}Older Version Document`),
    open: doc(p, `${PFX}Open Assessment Document`),
    b: doc(pB, `${PFX}B Secret Document`),
  };
  const V = {
    pw: version(p, D.pw, 1),
    site: version(p, D.site, 1),
    none: version(p, D.none, 1),
    hist: version(p, D.hist, 1),
    old1: version(p, D.old, 1),
    open: version(p, D.open, 1),
    b: version(pB, D.b, 1),
  };
  const R = {
    pw: review(V.pw, "revision_required", 30, "Retention period is not defined."),
    site: review(V.site, "revision_required", 30, "Evacuation roles unclear."),
    none: review(V.none, "accepted", 30, "Content acceptable."),
    hist1: review(V.hist, "accepted", 120, "First assessment: acceptable."),
    hist2: review(V.hist, "revision_required", 60, "Second assessment: signatures missing."),
    old1: review(V.old1, "revision_required", 120, "Old version gap."),
    open: review(V.open, "under_review", 20),
    b: review(V.b, "revision_required", 30, "B secret review comment"),
  };
  V.old2 = version(p, D.old, 2, "Rev.01");
  // Existing follow-ups on historical assessments (must stay visible, read-only)
  const histFinding = idOf(`insert into issues (project_id, title, finding_type, document_review_id, created_by) values ('${p}', '${PFX}Finding from first assessment', 'observation', '${R.hist1}', ${admin}) returning id`);
  // Not Applicable document with a concluded assessment and one existing follow-up
  D.na = idOf(`insert into documents (project_id, title, is_applicable, created_by) values ('${p}', '${PFX}Not Applicable Document', false, ${admin}) returning id`);
  V.na = version(p, D.na, 1);
  R.na = review(V.na, "revision_required", 40, "Gap found before the document became N/A.");
  const naFinding = idOf(`insert into issues (project_id, title, finding_type, document_review_id, created_by) values ('${p}', '${PFX}Finding before N/A', 'observation', '${R.na}', ${admin}) returning id`);
  const oldVerification = idOf(`insert into verification_items (project_id, question, priority, document_review_id, created_by) values ('${p}', '${PFX}Check from old version assessment', 'medium', '${R.old1}', ${admin}) returning id`);
  return { clientA, clientB, p, pB, vl, la, bs, I, A, D, V, R, histFinding, oldVerification, naFinding };
}
