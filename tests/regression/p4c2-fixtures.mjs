import { dbQuery } from "./common.mjs";

const PROJ = `(select p.id from projects p join clients c on c.id = p.client_id where c.name like 'P4C2-ACCEPT-%')`;
export function cleanupP4c2() {
  dbQuery(`
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from activities where project_id in ${PROJ};
    delete from project_frameworks where project_id in ${PROJ};
    delete from project_sites where project_id in ${PROJ};
    delete from projects where client_id in (select id from clients where name like 'P4C2-ACCEPT-%');
    delete from sites where client_id in (select id from clients where name like 'P4C2-ACCEPT-%');
    delete from clients where name like 'P4C2-ACCEPT-%';
  `);
}

const idOf = (sql) => dbQuery(sql)[0].id;
export const q = (s) => `P4C2-ACCEPT-${s}`;
export const NOTE = "Chemical containers have no secondary containment.";

export function createFixtures() {
  cleanupP4c2();
  const clientId = idOf(`insert into clients (name, status) values ('P4C2-ACCEPT-Client', 'active') returning id;`);
  const site = (name) => idOf(`insert into sites (client_id, name) values ('${clientId}', '${name}') returning id;`);
  const vietLong = site("Viet Long");
  const longAn = site("Long An");
  const betaSite = site("Beta Site");
  const project = (name) => idOf(`insert into projects (client_id, name, status) values ('${clientId}', '${name}', 'active') returning id;`);
  const projectA = project("P4C2-ACCEPT-Project-A");
  const projectB = project("P4C2-ACCEPT-Project-B");
  dbQuery(`insert into project_sites (project_id, site_id) values ('${projectA}', '${vietLong}'), ('${projectA}', '${longAn}'), ('${projectB}', '${betaSite}');`);
  dbQuery(`insert into project_frameworks (project_id, framework_id) select '${projectA}', id from frameworks where code = 'ISO 14001' and edition = '2015';`);

  const activity = ({ projectId = projectA, siteId = null, name, date = null, time = null }) =>
    idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date, start_time)
          values ('${projectId}', ${siteId ? `'${siteId}'` : "null"}, '${name}',
                  (select id from activity_types where key = 'site_assessment'), 'on_site', 'planned',
                  ${date ? `'${date}'` : "null"}, ${time ? `'${time}'` : "null"}) returning id;`);
  const actVL = activity({ siteId: vietLong, name: "P4C2-ACCEPT-Site Assessment", date: "2026-10-27", time: "09:00" });
  const actB2 = activity({ siteId: vietLong, name: "P4C2-ACCEPT-Follow-up Visit", date: "2026-11-10" });
  const actPW = activity({ name: "P4C2-ACCEPT-Online Review", date: "2026-10-28" });
  const actB = activity({ projectId: projectB, siteId: betaSite, name: "P4C2-ACCEPT-Beta Activity" });

  const fi = (code, fw) => idOf(`select fi.id from framework_items fi join frameworks f on f.id = fi.framework_id where f.code='${fw}' and fi.code='${code}' limit 1;`);
  const item81 = fi("8.1", "ISO 14001");
  const item82 = fi("8.2", "ISO 14001");
  const item45001_81 = fi("8.1", "ISO 45001");
  const item45001_41 = fi("4.1", "ISO 45001");

  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const verif = ({ projectId = projectA, question, siteId = null, priority = "medium", target = null, verifiedIn = null, result = null, notes = null, framework = null }) =>
    idOf(`insert into verification_items (project_id, site_id, question, priority, target_activity_id, framework_item_id, result, notes, verified_activity_id, verified_by, verified_at)
          values ('${projectId}', ${siteId ? `'${siteId}'` : "null"}, '${q(question)}', '${priority}', ${target ? `'${target}'` : "null"}, ${framework ? `'${framework}'` : "null"},
                  ${result ? `'${result}'` : "null"}, ${notes ? `'${notes}'` : "null"}, ${verifiedIn ? `'${verifiedIn}'` : "null"}, ${result ? admin : "null"}, ${result ? "now()" : "null"}) returning id;`);

  const v = {};
  v.issue = verif({ question: "Q-issue", siteId: vietLong, priority: "high", target: actVL, verifiedIn: actVL, result: "issue_identified", notes: NOTE, framework: item81 });
  v.follow = verif({ question: "Q-follow", siteId: vietLong, priority: "medium", target: actVL, verifiedIn: actVL, result: "follow_up_required", notes: "Latest SDS could not be confirmed." });
  v.ok = verif({ question: "Q-ok", siteId: vietLong, target: actVL, verifiedIn: actVL, result: "verified_ok", notes: "All good." });
  v.pending = verif({ question: "Q-pending", siteId: vietLong, target: actVL });
  v.nonotes = verif({ question: "Q-nonotes", priority: "low", target: actVL, verifiedIn: actVL, result: "issue_identified" });
  v.hist = verif({ question: "Q-hist", siteId: vietLong, target: actVL, verifiedIn: actVL, result: "issue_identified", framework: item45001_81 });
  v.cross = verif({ question: "Q-cross", siteId: vietLong, priority: "medium", target: actVL, verifiedIn: actB2, result: "issue_identified", notes: "Seen at the follow-up visit." });
  v.exec1 = verif({ question: "Q-exec1", siteId: vietLong, target: actVL });
  v.exec2 = verif({ question: "Q-exec2", siteId: vietLong, target: actVL });
  v.m390 = verif({ question: "Q-m390", siteId: vietLong, priority: "high", target: actVL, framework: item81 });
  v.m412 = verif({ question: "Q-m412", siteId: vietLong, priority: "high", target: actVL, framework: item81 });
  v.cons = verif({ question: "Q-cons", siteId: vietLong, target: actVL, verifiedIn: actVL, result: "issue_identified", notes: "Consultant observation" });
  v.pw = verif({ question: "Q-pw", siteId: vietLong, priority: "medium", target: actPW, verifiedIn: actPW, result: "issue_identified", notes: "PW note" });
  v.b = verif({ projectId: projectB, question: "Q-projB", siteId: betaSite, target: actB, verifiedIn: actB, result: "issue_identified", notes: "B note" });

  return { clientId, vietLong, longAn, betaSite, projectA, projectB, actVL, actB2, actPW, actB, item81, item82, item45001_81, item45001_41, v };
}
