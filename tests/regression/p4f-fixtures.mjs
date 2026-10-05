import { dbQuery, http } from "./common.mjs";

const PFX = "P4F-ACCEPT-";
const PROJ = `(select p.id from projects p join clients c on c.id = p.client_id where c.name like '${PFX}%')`;
export async function cleanupP4f(token) {
  const keys = dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select p.id::text from projects p join clients c on c.id = p.client_id where c.name like '${PFX}%')`).map((r) => r.name);
  for (let i = 0; i < keys.length; i += 100) await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
  dbQuery(`
    delete from attachments where project_id in ${PROJ};
    delete from files where project_id in ${PROJ};
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from activities where project_id in ${PROJ};
    delete from project_frameworks where project_id in ${PROJ};
    delete from project_sites where project_id in ${PROJ};
    delete from projects where client_id in (select id from clients where name like '${PFX}%');
    delete from sites where client_id in (select id from clients where name like '${PFX}%');
    delete from clients where name like '${PFX}%';
  `);
  return keys.length;
}
const idOf = (sql) => dbQuery(sql)[0].id;
export const day = (o) => new Date(Date.now() + o * 86400000).toISOString().slice(0, 10);

export async function createFixtures(token) {
  await cleanupP4f(token);
  const clientId = idOf(`insert into clients (name, status) values ('${PFX}Chinh Long Demo', 'active') returning id;`);
  const vl = idOf(`insert into sites (client_id, name) values ('${clientId}', 'Viet Long') returning id;`);
  const la = idOf(`insert into sites (client_id, name) values ('${clientId}', 'Long An') returning id;`);
  const p = idOf(`insert into projects (client_id, name, status) values ('${clientId}', '${PFX}ISO 14001 Implementation', 'active') returning id;`);
  const pEmpty = idOf(`insert into projects (client_id, name, status) values ('${clientId}', '${PFX}Empty Project', 'active') returning id;`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vl}'), ('${p}', '${la}'), ('${pEmpty}', '${vl}');`);
  dbQuery(`insert into project_frameworks (project_id, framework_id) select '${p}', id from frameworks where code='ISO 14001' and edition='2015';`);
  const act = (name, site, date) => idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date)
     values ('${p}', ${site ? `'${site}'` : "null"}, '${name}', (select id from activity_types where key='site_assessment'), 'on_site', 'in_progress', '${date}') returning id;`);
  const actVL = act("Site Assessment – Viet Long", vl, day(0));
  const actProg = act("Progress Check – Long An", la, day(1));
  const fi = (code) => idOf(`select fi.id from framework_items fi join frameworks f on f.id=fi.framework_id where f.code='ISO 14001' and fi.code='${code}'`);
  const i81 = fi("8.1");
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const v = (q, { result = null, notes = null, target = actVL, site = vl, executed = !!result } = {}) =>
    idOf(`insert into verification_items (project_id, site_id, question, priority, target_activity_id, framework_item_id, result, notes, verified_activity_id, verified_by, verified_at)
      values ('${p}', '${site}', '${q}', 'medium', '${target}', '${i81}', ${result ? `'${result}'` : "null"}, ${notes ? `'${notes}'` : "null"},
              ${executed ? `'${target}'` : "null"}, ${executed ? admin : "null"}, ${executed ? "now()" : "null"}) returning id;`);
  const V = {
    delOk: v("P4F delete me – unused planning check"),
    delCancel: v("P4F keep me – cancel the delete"),
    executed: v("P4F executed check – Verified OK", { result: "verified_ok", notes: "All fine." }),
    notesOnly: v("P4F notes only check", { notes: "Draft note written onsite.", executed: false }),
    evidenceOnly: v("P4F pending check with evidence"),
    multi: v("P4F spill kit check – issue identified", { result: "issue_identified", notes: "Spill kit missing." }),
    issueSingle: v("P4F drum label check – issue identified", { result: "issue_identified", notes: "Labels faded." }),
    tamperOk: v("P4F tamper source – unused check"),
    consultantDel: v("P4F consultant deletes this check"),
    prog1: v("P4F progress check 1", { target: actProg, site: la }),
    prog2: v("P4F progress check 2", { target: actProg, site: la }),
    prog3: v("P4F progress check 3", { target: actProg, site: la }),
  };
  const evidence = (parentCol, parentId, name) => {
    const file = idOf(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
      values ('${p}', '${p}/' || gen_random_uuid() || '-${name}', '${name}', 'image/jpeg', 1000, ${admin}) returning id;`);
    dbQuery(`insert into attachments (project_id, file_id, ${parentCol}, created_by) values ('${p}', '${file}', '${parentId}', ${admin});`);
  };
  const f = (title, type, { vItem = null, status = "open" } = {}) =>
    idOf(`insert into issues (project_id, title, finding_type, priority, site_id, activity_id, framework_item_id, verification_item_id, status, closed_at, closed_by, created_by)
      values ('${p}', '${title}', '${type}', 'medium', '${vl}', ${vItem ? `'${actVL}'` : "null"}, '${i81}', ${vItem ? `'${vItem}'` : "null"}, '${status}',
              ${status === "closed" ? "now()" : "null"}, ${status === "closed" ? admin : "null"}, ${admin}) returning id;`);
  const F = {
    multiA: f("P4F spill kit missing", "nonconformity", { vItem: V.multi }),
    multiB: f("P4F spill kit sign faded", "observation", { vItem: V.multi }),
    bare: f("P4F drum labels faded – mistaken finding", "observation", { vItem: V.issueSingle }),
    withAction: f("P4F finding with an action", "nonconformity"),
    closed: f("P4F closed finding", "observation", { status: "closed" }),
    withEvidence: f("P4F finding with evidence", "observation"),
    tamperOk: f("P4F tamper source finding", "observation"),
    consultantDel: f("P4F consultant deletes this finding", "observation"),
  };
  const a = (desc, { issue = null, owner = null, due = null, status = "open", prio = "medium", created = "now()" } = {}) =>
    idOf(`insert into actions (project_id, issue_id, description, owner_name, due_date, priority, status, completed_at, site_id, created_by, created_at)
      values ('${p}', ${issue ? `'${issue}'` : "null"}, '${desc}', ${owner ? `'${owner}'` : "null"}, ${due ? `'${due}'` : "null"}, '${prio}', '${status}',
              ${status === "closed" ? "now()" : "null"}, null, ${admin}, ${created}) returning id;`);
  const A = {
    onWithAction: a("P4F corrective action on NC", { issue: F.withAction, owner: "EHS Manager", due: day(20) }),
    delOk: a("P4F standalone action to delete", { owner: "Consultant", due: day(15) }),
    evidence: a("P4F action with evidence", { owner: "QA Lead", due: day(12) }),
    closed: a("P4F closed action", { status: "closed", due: day(-40) }),
    tamperOk: a("P4F tamper source action", { due: day(25) }),
    consultantDel: a("P4F consultant deletes this action", { due: day(26) }),
    // Overdue set (6 overdue, 3 not overdue)
    od1: a("P4F overdue A – oldest, low", { issue: F.multiA, owner: "Warehouse Manager", due: day(-30), prio: "low" }),
    od2: a("P4F overdue B – 10 days, high", { owner: "EHS Manager", due: day(-10), prio: "high" }),
    od3: a("P4F overdue C – 10 days, low", { owner: "QA Lead", due: day(-10), prio: "low", status: "in_progress" }),
    od4: a("P4F overdue D – 5 days, medium", { issue: F.multiA, due: day(-5), prio: "medium", status: "pending_review" }),
    od5: a("P4F overdue E – yesterday, medium", { owner: "Nguyen Van A", due: day(-1), prio: "medium" }),
    od6: a("P4F overdue F – 2 days, high", { owner: "Plant Manager", due: day(-2), prio: "high" }),
    today: a("P4F due today – not overdue", { due: day(0) }),
    noDue: a("P4F no due date – not overdue", {}),
  };
  evidence("verification_item_id", V.evidenceOnly, "pending-photo.jpg");
  evidence("verification_item_id", V.multi, "spill-kit.jpg");
  evidence("issue_id", F.withEvidence, "finding-photo.jpg");
  evidence("action_id", A.evidence, "action-photo.jpg");
  return { clientId, p, pEmpty, vl, la, actVL, actProg, V, F, A };
}
