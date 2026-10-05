import { dbQuery, http } from "./common.mjs";

export const PFX = "P6A-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

/** Removes every fixture; project deletion cascades the projects' Finding counters. */
export async function cleanupP6a(token) {
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
const ADMIN = `(select id from profiles where role='admin' order by created_at limit 1)`;

export async function createFixtures(token) {
  await cleanupP6a(token);
  const clientA = idOf(`insert into clients (name) values ('${PFX}Chinh Long Demo') returning id`);
  const clientB = idOf(`insert into clients (name) values ('${PFX}Other Client') returning id`);
  const sA = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Site A') returning id`);
  const project = (client, name) => idOf(`insert into projects (client_id, name, status) values ('${client}', '${name}', 'active') returning id`);
  const P = {
    a: project(clientA, `${PFX}ISO Implementation`),
    b: project(clientB, `${PFX}Project B`),
    c1: project(clientA, `${PFX}Concurrency 1`),
    c2: project(clientA, `${PFX}Concurrency 2`),
    c3: project(clientA, `${PFX}Concurrency 3`),
    perf: project(clientA, `${PFX}Performance`),
  };
  dbQuery(`insert into project_sites (project_id, site_id) values ('${P.a}', '${sA}');
    insert into project_frameworks (project_id, framework_id) select '${P.a}', id from frameworks where code = 'ISO 9001';`);
  const q75 = idOf(`select fi.id from framework_items fi join frameworks f on f.id=fi.framework_id where f.code='ISO 9001' and fi.code='7.5'`);
  const today = new Date().toISOString().slice(0, 10);
  const act = idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date)
    values ('${P.a}', '${sA}', 'Site Assessment – Site A', (select id from activity_types where key='site_assessment'), 'on_site', 'in_progress', '${today}') returning id`);
  const vi = idOf(`insert into verification_items (project_id, site_id, framework_item_id, question, priority, target_activity_id, verified_activity_id, result, notes, verified_by, verified_at, created_by)
    values ('${P.a}', '${sA}', '${q75}', '${PFX}Are records retained for 3 years?', 'high', '${act}', '${act}', 'issue_identified', 'Records kept for 1 year only.', ${ADMIN}, now(), ${ADMIN}) returning id`);
  const doc = idOf(`insert into documents (project_id, title, created_by) values ('${P.a}', '${PFX}Document Control Procedure', ${ADMIN}) returning id`);
  dbQuery(`insert into document_framework_items (document_id, framework_item_id) values ('${doc}', '${q75}')`);
  const file = idOf(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
    values ('${P.a}', '${P.a}/' || gen_random_uuid() || '-fixture.pdf', 'Procedure.pdf', 'application/pdf', 1000, ${ADMIN}) returning id`);
  const ver = idOf(`insert into document_versions (document_id, version_no, revision, file_id, uploaded_by) values ('${doc}', 1, 'Rev.00', '${file}', ${ADMIN}) returning id`);
  const review = idOf(`insert into document_reviews (document_version_id, reviewer_id, status, notes, created_at, reviewed_at)
    values ('${ver}', ${ADMIN}, 'revision_required', 'Approval matrix missing.', now() - interval '10 minutes', now() - interval '9 minutes') returning id`);
  return { clientA, clientB, sA, P, act, vi, doc, ver, review, q75 };
}
