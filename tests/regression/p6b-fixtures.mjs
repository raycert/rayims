import { dbQuery, http } from "./common.mjs";

export const PFX = "P6B-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export async function cleanupP6b(token) {
  const keys = dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select id::text from projects where client_id in ${CLIENTS})`).map((r) => r.name);
  for (let i = 0; i < keys.length; i += 100) await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
  dbQuery(`
    delete from attachments where project_id in ${PROJ};
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from files where project_id in ${PROJ};
    delete from activities where project_id in ${PROJ};
    delete from project_sites where project_id in ${PROJ};
    delete from projects where client_id in ${CLIENTS};
    delete from sites where client_id in ${CLIENTS};
    delete from clients where name like '${PFX}%';
  `);
  return keys.length;
}

const idOf = (sql) => dbQuery(sql)[0].id;
export async function createFixtures(token) {
  await cleanupP6b(token);
  const clientA = idOf(`insert into clients (name) values ('${PFX}Chinh Long Demo') returning id`);
  const clientB = idOf(`insert into clients (name) values ('${PFX}Other Client') returning id`);
  const sA = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Viet Long') returning id`);
  const pA = idOf(`insert into projects (client_id, name, status) values ('${clientA}', '${PFX}ISO Implementation', 'active') returning id`);
  const pB = idOf(`insert into projects (client_id, name, status) values ('${clientB}', '${PFX}Project B', 'active') returning id`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${pA}', '${sA}')`);
  const today = new Date().toISOString().slice(0, 10);
  const act = (p, name, status, extra = "") =>
    idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date, objectives, planned_work${extra ? ", " + extra.split("=")[0] : ""})
      values ('${p}', ${p === pA ? `'${sA}'` : "null"}, '${PFX}${name}', (select id from activity_types where key='site_assessment'), 'on_site', '${status}', '${today}',
              'Assess operational controls.', 'Site walk; interviews.'${extra ? ", " + extra.split("=").slice(1).join("=") : ""}) returning id`);
  const A = {
    planned: act(pA, "Planned Assessment", "planned"),
    progress: act(pA, "In Progress Assessment", "in_progress"),
    completed: act(pA, "Completed Assessment", "completed"),
    cancelled: act(pA, "Cancelled Assessment", "cancelled"),
    deletable: act(pA, "Deletable Assessment", "planned"),
    b: act(pB, "BMARKER Activity", "completed", "summary='BMARKER secret summary'"),
  };
  dbQuery(`update activities set work_performed = 'BMARKER work', next_steps = 'BMARKER next', client_participants = 'BMARKER Person' where id = '${A.b}'`);
  return { clientA, clientB, sA, pA, pB, A };
}
