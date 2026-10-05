import { dbQuery } from "./common.mjs";

const PROJ = `(select p.id from projects p join clients c on c.id = p.client_id where c.name like 'P4D1-ACCEPT-%')`;
export function cleanupP4d1() {
  dbQuery(`
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from activities where project_id in ${PROJ};
    delete from project_frameworks where project_id in ${PROJ};
    delete from project_sites where project_id in ${PROJ};
    delete from projects where client_id in (select id from clients where name like 'P4D1-ACCEPT-%');
    delete from sites where client_id in (select id from clients where name like 'P4D1-ACCEPT-%');
    delete from clients where name like 'P4D1-ACCEPT-%';
  `);
}
const idOf = (sql) => dbQuery(sql)[0].id;
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
export const DAYS = { yesterday: day(-1), today: day(0), tomorrow: day(1), future: day(30), later: day(60) };

export function createFixtures() {
  cleanupP4d1();
  const clientId = idOf(`insert into clients (name, status) values ('P4D1-ACCEPT-Client', 'active') returning id;`);
  const site = (n) => idOf(`insert into sites (client_id, name) values ('${clientId}', '${n}') returning id;`);
  const vietLong = site("Viet Long"), longAn = site("Long An"), betaSite = site("Beta Site");
  const project = (n) => idOf(`insert into projects (client_id, name, status) values ('${clientId}', '${n}', 'active') returning id;`);
  const projectA = project("P4D1-ACCEPT-Project-A"), projectB = project("P4D1-ACCEPT-Project-B"), projectS = project("P4D1-ACCEPT-Project-Sort");
  dbQuery(`insert into project_sites (project_id, site_id) values ('${projectA}', '${vietLong}'), ('${projectA}', '${longAn}'), ('${projectS}', '${vietLong}'), ('${projectS}', '${longAn}'), ('${projectB}', '${betaSite}');`);
  dbQuery(`insert into project_frameworks (project_id, framework_id) select '${projectA}', id from frameworks where code='ISO 14001' and edition='2015';`);
  const activity = ({ projectId = projectA, siteId = null, name, date = null }) =>
    idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date)
          values ('${projectId}', ${siteId ? `'${siteId}'` : "null"}, '${name}', (select id from activity_types where key='site_assessment'), 'on_site', 'planned', ${date ? `'${date}'` : "null"}) returning id;`);
  const actVL = activity({ siteId: vietLong, name: "P4D1-ACCEPT-Site Assessment", date: "2026-10-27" });
  const actPW = activity({ name: "P4D1-ACCEPT-Online Review", date: "2026-10-28" });
  const actS = activity({ projectId: projectS, siteId: longAn, name: "P4D1-ACCEPT-Sort Visit" });
  const actB = activity({ projectId: projectB, siteId: betaSite, name: "P4D1-ACCEPT-Beta Activity" });

  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const vIssue = idOf(`insert into verification_items (project_id, site_id, question, priority, target_activity_id, result, notes, verified_activity_id, verified_by, verified_at)
     values ('${projectA}', '${vietLong}', 'P4D1-ACCEPT-Q-issue', 'high', '${actVL}', 'issue_identified', 'Containers without spill trays', '${actVL}', ${admin}, now()) returning id;`);
  const vExec = idOf(`insert into verification_items (project_id, site_id, question, priority, target_activity_id) values ('${projectA}', '${vietLong}', 'P4D1-ACCEPT-Q-exec', 'medium', '${actVL}') returning id;`);

  const findingB = idOf(`insert into issues (project_id, title, finding_type) values ('${projectB}', 'P4D1-ACCEPT-B finding', 'nonconformity') returning id;`);
  const actionB = idOf(`insert into actions (project_id, issue_id, description, owner_name) values ('${projectB}', '${findingB}', 'P4D1-ACCEPT-B secret action', 'B Owner') returning id;`);

  // Sort / overdue / search fixtures in project S.
  const sFinding = idOf(`insert into issues (project_id, title, finding_type) values ('${projectS}', 'P4D1-ACCEPT-Sort finding', 'observation') returning id;`);
  const a = (desc, { due = null, status = "open", priority = "medium", created, site = null, activityId = null, owner = null, linked = false }) =>
    dbQuery(`insert into actions (project_id, issue_id, description, owner_name, due_date, priority, status, completed_at, site_id, activity_id, created_at)
      values ('${projectS}', ${linked ? `'${sFinding}'` : "null"}, 'P4D1-ACCEPT-${desc}', ${owner ? `'${owner}'` : "null"}, ${due ? `'${due}'` : "null"}, '${priority}', '${status}', ${status === "closed" ? "now()" : "null"},
              ${site ? `'${site}'` : "null"}, ${activityId ? `'${activityId}'` : "null"}, '${created}');`);
  a("S overdue open", { due: DAYS.yesterday, status: "open", priority: "low", created: "2026-09-01T00:00:00Z", owner: "Nguyen Van A" });
  a("S overdue review", { due: DAYS.yesterday, status: "pending_review", priority: "high", created: "2026-09-02T00:00:00Z", linked: true });
  a("S closed yesterday", { due: DAYS.yesterday, status: "closed", priority: "high", created: "2026-09-03T00:00:00Z" });
  a("S due today", { due: DAYS.today, status: "open", priority: "medium", created: "2026-09-04T00:00:00Z", site: vietLong });
  a("S due tomorrow high", { due: DAYS.tomorrow, status: "in_progress", priority: "high", created: "2026-09-05T00:00:00Z", site: longAn, activityId: actS });
  a("S due tomorrow low", { due: DAYS.tomorrow, status: "open", priority: "low", created: "2026-09-06T00:00:00Z", owner: "EHS Team" });
  a("S no due", { due: null, status: "open", priority: "high", created: "2026-09-07T00:00:00Z" });

  return { clientId, vietLong, longAn, betaSite, projectA, projectB, projectS, actVL, actPW, actS, actB, vIssue, vExec, findingB, actionB, sFinding };
}
