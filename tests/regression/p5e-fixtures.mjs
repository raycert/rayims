import { dbQuery, http } from "./common.mjs";

const PFX = "P5E-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export async function cleanupP5e(token) {
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
export async function createFixtures(token) {
  await cleanupP5e(token);
  const clientA = idOf(`insert into clients (name) values ('${PFX}Chinh Long Demo') returning id`);
  const clientB = idOf(`insert into clients (name) values ('${PFX}Other Client') returning id`);
  const vl = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Viet Long') returning id`);
  const la = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Long An') returning id`);
  const bs = idOf(`insert into sites (client_id, name) values ('${clientB}', 'B Site') returning id`);
  const p = idOf(`insert into projects (client_id, name, status) values ('${clientA}', '${PFX}ISO Implementation', 'active') returning id`);
  const pB = idOf(`insert into projects (client_id, name, status) values ('${clientB}', '${PFX}Project B', 'active') returning id`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vl}'), ('${p}', '${la}'), ('${pB}', '${bs}');
    insert into project_frameworks (project_id, framework_id) select '${p}', id from frameworks where code in ('ISO 9001', 'ISO 14001', 'ISO 45001');
    insert into project_frameworks (project_id, framework_id) select '${pB}', id from frameworks where code in ('ISO 9001', 'ISO 50001');`);
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const existingDoc = idOf(`insert into documents (project_id, title, doc_code, owner_name, created_by) values ('${p}', '${PFX}Existing Legal Register', 'REG-01', 'Legal Officer', ${admin}) returning id`);
  const act = idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date)
    values ('${p}', null, 'Document Review Meeting', (select id from activity_types where key='document_review'), 'online', 'in_progress', '${new Date().toISOString().slice(0, 10)}') returning id`);
  return { clientA, clientB, p, pB, vl, la, bs, existingDoc, act };
}
