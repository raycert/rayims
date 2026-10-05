import { dbQuery } from "./common.mjs";

// Everything hangs off ONE client whose name starts with P4C1-ACCEPT-. Cleanup only ever touches
// rows reachable from that client — never the genuine Chinh Long / Test 1 data.
const PROJ = `(select p.id from projects p join clients c on c.id = p.client_id where c.name like 'P4C1-ACCEPT-%')`;
export function cleanupP4c1() {
  dbQuery(`
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from activities where project_id in ${PROJ};
    delete from project_frameworks where project_id in ${PROJ};
    delete from project_sites where project_id in ${PROJ};
    delete from projects where client_id in (select id from clients where name like 'P4C1-ACCEPT-%');
    delete from sites where client_id in (select id from clients where name like 'P4C1-ACCEPT-%');
    delete from clients where name like 'P4C1-ACCEPT-%';
  `);
}

const idOf = (sql) => dbQuery(sql)[0].id;

export function createFixtures() {
  cleanupP4c1();
  const clientId = idOf(`insert into clients (name, status) values ('P4C1-ACCEPT-Client', 'active') returning id;`);
  const site = (name) => idOf(`insert into sites (client_id, name) values ('${clientId}', '${name}') returning id;`);
  const vietLong = site("Viet Long");
  const longAn = site("Long An");
  const betaSite = site("Beta Site");
  const project = (name) => idOf(`insert into projects (client_id, name, status) values ('${clientId}', '${name}', 'active') returning id;`);
  const projectA = project("P4C1-ACCEPT-Project-A");
  const projectB = project("P4C1-ACCEPT-Project-B");
  const projectS = project("P4C1-ACCEPT-Project-Sort");

  for (const p of [projectA, projectS]) {
    dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vietLong}'), ('${p}', '${longAn}');`);
  }
  dbQuery(`insert into project_sites (project_id, site_id) values ('${projectB}', '${betaSite}');`);
  // ISO 14001 assigned to A and S; ISO 45001 deliberately NOT assigned anywhere.
  dbQuery(`
    insert into project_frameworks (project_id, framework_id)
    select p, id from frameworks, (values ('${projectA}'::uuid), ('${projectS}'::uuid)) v(p) where code = 'ISO 14001' and edition = '2015';
  `);

  const activity = ({ projectId = projectA, siteId = null, name, date = null, time = null }) =>
    idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date, start_time)
          values ('${projectId}', ${siteId ? `'${siteId}'` : "null"}, '${name}',
                  (select id from activity_types where key = 'site_assessment'), 'on_site', 'planned',
                  ${date ? `'${date}'` : "null"}, ${time ? `'${time}'` : "null"}) returning id;`);
  const act1 = activity({ siteId: vietLong, name: "P4C1-ACCEPT-Site Assessment", date: "2026-10-27", time: "09:00" });
  const act2 = activity({ name: "P4C1-ACCEPT-Online Review", date: "2026-10-28" });
  const actB = activity({ projectId: projectB, siteId: betaSite, name: "P4C1-ACCEPT-Beta Activity" });

  const fi = (code, fw) => idOf(`select fi.id from framework_items fi join frameworks f on f.id = fi.framework_id where f.code='${fw}' and fi.code='${code}' limit 1;`);
  const item14001_81 = fi("8.1", "ISO 14001");
  const item14001_41 = fi("4.1", "ISO 14001");
  const item45001_81 = fi("8.1", "ISO 45001");

  // A verification check on act1 for the "Issue Identified does NOT create a Finding" regression.
  const vItem = idOf(`insert into verification_items (project_id, site_id, question, priority, target_activity_id)
                      values ('${projectA}', '${vietLong}', 'P4C1-ACCEPT-Check chemical storage', 'high', '${act1}') returning id;`);

  // Project B finding (cross-project URL test).
  const findingB = idOf(`insert into issues (project_id, title, finding_type, priority) values ('${projectB}', 'P4C1-ACCEPT-B finding', 'observation', 'medium') returning id;`);

  // Sort/filter/search fixtures in project S (explicit created_at for a deterministic expected order).
  const s = (title, type, priority, created, extra = "") =>
    dbQuery(`insert into issues (project_id, title, finding_type, priority, created_at, status ${extra.startsWith("cols:") ? "" : ""}) values ('${projectS}', '${title}', '${type}', '${priority}', '${created}', 'open');`);
  s("P4C1-ACCEPT-Zeta high older", "nonconformity", "high", "2026-09-01T10:00:00Z");
  s("P4C1-ACCEPT-Alpha high newer", "observation", "high", "2026-09-02T10:00:00Z");
  s("P4C1-ACCEPT-Beta tie", "nonconformity", "high", "2026-09-02T10:00:00Z");
  s("P4C1-ACCEPT-Medium one", "opportunity_for_improvement", "medium", "2026-09-05T10:00:00Z");
  s("P4C1-ACCEPT-Low one", "observation", "low", "2026-09-06T10:00:00Z");
  dbQuery(`insert into issues (project_id, title, finding_type, priority, created_at, status, closed_at) values ('${projectS}', 'P4C1-ACCEPT-Closed high', 'observation', 'high', '2026-09-07T10:00:00Z', 'closed', '2026-09-08T10:00:00Z');`);
  dbQuery(`update issues set site_id='${vietLong}', framework_item_id='${item14001_81}' where title='P4C1-ACCEPT-Zeta high older';`);
  dbQuery(`update issues set site_id='${longAn}' where title='P4C1-ACCEPT-Low one';`);
  dbQuery(`update issues set description='quarterly review notes' where title='P4C1-ACCEPT-Alpha high newer';`);

  return { clientId, vietLong, longAn, betaSite, projectA, projectB, projectS, act1, act2, actB, item14001_81, item14001_41, item45001_81, vItem, findingB };
}
