import { dbQuery, http } from "./common.mjs";

const PROJ = `(select p.id from projects p join clients c on c.id = p.client_id where c.name like 'P4E6-ACCEPT-%')`;
export async function cleanupP4e6(token) {
  const keys = dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select p.id::text from projects p join clients c on c.id = p.client_id where c.name like 'P4E6-ACCEPT-%')`).map((r) => r.name);
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
    delete from projects where client_id in (select id from clients where name like 'P4E6-ACCEPT-%');
    delete from sites where client_id in (select id from clients where name like 'P4E6-ACCEPT-%');
    delete from clients where name like 'P4E6-ACCEPT-%';
  `);
  return keys.length;
}
const idOf = (sql) => dbQuery(sql)[0].id;
const day = (o) => new Date(Date.now() + o * 86400000).toISOString().slice(0, 10);

export async function createFixtures(token) {
  await cleanupP4e6(token);
  const clientId = idOf(`insert into clients (name, status) values ('P4E6-ACCEPT-Chinh Long Demo', 'active') returning id;`);
  const vl = idOf(`insert into sites (client_id, name) values ('${clientId}', 'Viet Long') returning id;`);
  const la = idOf(`insert into sites (client_id, name) values ('${clientId}', 'Long An') returning id;`);
  const p = idOf(`insert into projects (client_id, name, status) values ('${clientId}', 'P4E6-ACCEPT-ISO 14001 Implementation', 'active') returning id;`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vl}'), ('${p}', '${la}');`);
  dbQuery(`insert into project_frameworks (project_id, framework_id) select '${p}', id from frameworks where code='ISO 14001' and edition='2015';`);
  const act = (name, site, date, time, extra = "") => idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date, start_time, objectives, planned_work)
     values ('${p}', ${site ? `'${site}'` : "null"}, '${name}', (select id from activity_types where key='site_assessment'), 'on_site', 'in_progress', '${date}', ${time ? `'${time}'` : "null"},
     'Assess chemical storage and emergency preparedness', 'Walk-through of warehouse and chemical store') returning id;`);
  const actVL = act("Site Assessment – Viet Long", vl, day(0), "09:00");
  const actFU = act("Follow-up Visit – Viet Long", vl, day(14), null);
  const fi = (code) => idOf(`select fi.id from framework_items fi join frameworks f on f.id=fi.framework_id where f.code='ISO 14001' and fi.code='${code}'`);
  const i81 = fi("8.1"), i82 = fi("8.2"), i75 = fi("7.5");
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const v = (q, { result = null, notes = null, fw = null, prio = "medium", verifiedIn = actVL, target = actVL } = {}) =>
    idOf(`insert into verification_items (project_id, site_id, question, priority, target_activity_id, framework_item_id, result, notes, verified_activity_id, verified_by, verified_at)
      values ('${p}', '${vl}', '${q}', '${prio}', '${target}', ${fw ? `'${fw}'` : "null"}, ${result ? `'${result}'` : "null"}, ${notes ? `'${notes}'` : "null"},
              ${result ? `'${verifiedIn}'` : "null"}, ${result ? admin : "null"}, ${result ? "now()" : "null"}) returning id;`);
  const V = {
    pendingChem: v("Check chemical storage and secondary containment", { fw: i81, prio: "high" }),
    pendingSds: v("Check SDS availability for all chemicals", { fw: i81 }),
    pendingExit: v("Check emergency exit route condition", { fw: i82 }),
    ok: v("Check fire extinguisher inspection tags", { result: "verified_ok", notes: "All tags current.", fw: i82 }),
    follow: v("Check waste segregation records", { result: "follow_up_required", notes: "Records for last month not available." }),
    multi: v("Check spill kit availability", { result: "issue_identified", notes: "Spill kit missing at loading bay; labels faded on two drums.", fw: i81, prio: "high" }),
    elsewhere: v("Check oil separator maintenance", { result: "verified_ok", notes: "Checked during follow-up.", verifiedIn: actFU }),
    docCtrl: v("Check document control of procedures", { fw: i75 }),
  };
  // Two findings already linked to V.multi
  const f = (title, type, extra = {}) => idOf(`insert into issues (project_id, title, description, finding_type, priority, site_id, activity_id, framework_item_id, verification_item_id, correction, root_cause, created_by)
      values ('${p}', '${title}', ${extra.desc ? `'${extra.desc}'` : "null"}, '${type}', '${extra.prio ?? "medium"}', '${vl}', '${actVL}', ${extra.fw ? `'${extra.fw}'` : "null"}, ${extra.v ? `'${extra.v}'` : "null"},
              ${extra.corr ? `'${extra.corr}'` : "null"}, ${extra.rca ? `'${extra.rca}'` : "null"}, ${admin}) returning id;`);
  const F = {
    ncSpill: f("Spill kit missing at loading bay", "nonconformity", { v: V.multi, fw: i81, prio: "high", desc: "No spill kit at the loading bay where drums are handled." }),
    obsLabels: f("Drum labels faded", "observation", { v: V.multi, fw: i81 }),
    // Rich NC for desktop review
    ncChem: f("Chemical containers stored without secondary containment", "nonconformity", {
      fw: i81, prio: "high", desc: "Six 200 L drums stored directly on the warehouse floor.",
      corr: "Containers moved to spill trays.", rca: "Warehouse inspection checklist did not include chemical containment." }),
    ofi: f("Consider digital inspection checklist", "opportunity_for_improvement", {}),
  };
  const a = (desc, { issue = null, owner = null, due = null, status = "open", prio = "medium", notes = null, site = vl } = {}) =>
    idOf(`insert into actions (project_id, issue_id, description, owner_name, due_date, priority, status, completion_notes, completed_at, site_id, activity_id, created_by)
      values ('${p}', ${issue ? `'${issue}'` : "null"}, '${desc}', ${owner ? `'${owner}'` : "null"}, ${due ? `'${due}'` : "null"}, '${prio}', '${status}', ${notes ? `'${notes}'` : "null"},
              ${status === "closed" ? "now()" : "null"}, ${site ? `'${site}'` : "null"}, null, ${admin}) returning id;`);
  const A = {
    proc: a("Revise chemical storage procedure", { issue: F.ncChem, owner: "EHS Manager", due: day(-3), status: "in_progress", prio: "high" }),
    check: a("Update warehouse inspection checklist", { issue: F.ncChem, owner: "Warehouse Manager", due: day(10), status: "pending_review" }),
    train: a("Train warehouse personnel", { issue: F.ncChem, owner: "Nguyen Van A", due: day(-10), status: "closed", notes: "Training held for 12 staff; attendance sheet attached." }),
    standalone: a("Send updated legal register to client", { owner: "Consultant", due: day(5), site: null }),
    ofiAct: a("Evaluate tablet-based checklist tools", { issue: F.ofi, owner: "QA Lead", due: day(30), prio: "low", site: null }),
  };
  return { clientId, p, vl, la, actVL, actFU, V, F, A };
}
