import { dbQuery } from "./common.mjs";

// Everything hangs off ONE client whose name starts with P4B5-ACCEPT-. Cleanup only ever
// touches rows reachable from that client — never the genuine Chinh Long / Test 1 data.
export function cleanupP4b5() {
  dbQuery(`
    delete from verification_items where project_id in (select p.id from projects p join clients c on c.id = p.client_id where c.name like 'P4B5-ACCEPT-%');
    delete from activities where project_id in (select p.id from projects p join clients c on c.id = p.client_id where c.name like 'P4B5-ACCEPT-%');
    delete from project_frameworks where project_id in (select p.id from projects p join clients c on c.id = p.client_id where c.name like 'P4B5-ACCEPT-%');
    delete from project_sites where project_id in (select p.id from projects p join clients c on c.id = p.client_id where c.name like 'P4B5-ACCEPT-%');
    delete from projects where client_id in (select id from clients where name like 'P4B5-ACCEPT-%');
    delete from sites where client_id in (select id from clients where name like 'P4B5-ACCEPT-%');
    delete from clients where name like 'P4B5-ACCEPT-%';
  `);
}

const idOf = (sql) => dbQuery(sql)[0].id;

export function createFixtures() {
  cleanupP4b5();
  const clientId = idOf(`insert into clients (name, status) values ('P4B5-ACCEPT-Client', 'active') returning id;`);
  const site = (name) => idOf(`insert into sites (client_id, name) values ('${clientId}', '${name}') returning id;`);
  const vietLong = site("Viet Long");
  const longAn = site("Long An");
  const dupSite1 = site("Dup Site");
  const dupSite2 = site("Dup Site");
  const betaSite = site("Beta Site");

  const project = (name) => idOf(`insert into projects (client_id, name, status) values ('${clientId}', '${name}', 'active') returning id;`);
  const projectA = project("P4B5-ACCEPT-Project-A");
  const projectB = project("P4B5-ACCEPT-Project-B");

  for (const s of [vietLong, longAn, dupSite1, dupSite2]) {
    dbQuery(`insert into project_sites (project_id, site_id) values ('${projectA}', '${s}');`);
  }
  dbQuery(`insert into project_sites (project_id, site_id) values ('${projectB}', '${betaSite}');`);

  // ISO 14001 and ISO 9001 assigned to A; ISO 45001 deliberately NOT assigned.
  dbQuery(`
    insert into project_frameworks (project_id, framework_id)
    select '${projectA}', id from frameworks where (code = 'ISO 14001' and edition = '2015') or (code = 'ISO 9001' and edition = '2015');
  `);

  const activity = ({ projectId = projectA, siteId = null, name, date = null, time = null }) =>
    idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date, start_time)
          values ('${projectId}', ${siteId ? `'${siteId}'` : "null"}, '${name}',
                  (select id from activity_types where key = 'consulting'), 'on_site', 'planned',
                  ${date ? `'${date}'` : "null"}, ${time ? `'${time}'` : "null"}) returning id;`);
  const EN = "–";
  const act1 = activity({ siteId: vietLong, name: `Site Assessment ${EN} Viet Long`, date: "2026-10-27", time: "09:00" });
  const act2 = activity({ siteId: vietLong, name: "Follow-up Visit", date: "2026-10-28" });
  const act3 = activity({ name: "Document Review", date: "2026-10-28" });
  const act4 = activity({ siteId: longAn, name: "Consulting" });
  const act5 = activity({ name: "Online Support" });
  const amb1 = activity({ siteId: longAn, name: "Amb Twin", date: "2026-11-01", time: "10:00" });
  const amb2 = activity({ siteId: longAn, name: "Amb Twin", date: "2026-11-01", time: "10:00" });
  const actB = activity({ projectId: projectB, siteId: betaSite, name: "Beta Assessment", date: "2026-10-27", time: "09:00" });

  // One existing item in A, for the "duplicate against existing" test.
  const existingId = idOf(`insert into verification_items (project_id, question, priority)
                           values ('${projectA}', 'P4B5-ACCEPT-Existing check', 'medium') returning id;`);

  return { clientId, vietLong, longAn, dupSite1, dupSite2, betaSite, projectA, projectB, act1, act2, act3, act4, act5, amb1, amb2, actB, existingId };
}
