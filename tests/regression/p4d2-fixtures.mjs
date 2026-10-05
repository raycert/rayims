import { dbQuery } from "./common.mjs";

const PROJ = `(select p.id from projects p join clients c on c.id = p.client_id where c.name like 'P4D2-ACCEPT-%')`;
export function cleanupP4d2() {
  dbQuery(`
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from activities where project_id in ${PROJ};
    delete from project_frameworks where project_id in ${PROJ};
    delete from project_sites where project_id in ${PROJ};
    delete from projects where client_id in (select id from clients where name like 'P4D2-ACCEPT-%');
    delete from sites where client_id in (select id from clients where name like 'P4D2-ACCEPT-%');
    delete from clients where name like 'P4D2-ACCEPT-%';
  `);
}
const idOf = (sql) => dbQuery(sql)[0].id;
const q = (s) => s.replace(/'/g, "''");

export function createFixtures() {
  cleanupP4d2();
  const clientId = idOf(`insert into clients (name, status) values ('P4D2-ACCEPT-Client', 'active') returning id;`);
  const vietLong = idOf(`insert into sites (client_id, name) values ('${clientId}', 'Viet Long') returning id;`);
  const betaSite = idOf(`insert into sites (client_id, name) values ('${clientId}', 'Beta Site') returning id;`);
  const projectA = idOf(`insert into projects (client_id, name, status) values ('${clientId}', 'P4D2-ACCEPT-Project-A', 'active') returning id;`);
  const projectB = idOf(`insert into projects (client_id, name, status) values ('${clientId}', 'P4D2-ACCEPT-Project-B', 'active') returning id;`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${projectA}', '${vietLong}'), ('${projectB}', '${betaSite}');`);
  const actVL = idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date)
     values ('${projectA}', '${vietLong}', 'P4D2-ACCEPT-Site Assessment', (select id from activity_types where key='site_assessment'), 'on_site', 'planned', '2026-10-27') returning id;`);
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;

  const vIssue = idOf(`insert into verification_items (project_id, site_id, question, priority, target_activity_id, result, notes, verified_activity_id, verified_by, verified_at)
     values ('${projectA}', '${vietLong}', 'P4D2-ACCEPT-Q-issue', 'high', '${actVL}', 'issue_identified', 'No spill trays', '${actVL}', ${admin}, now()) returning id;`);
  const vExec = idOf(`insert into verification_items (project_id, site_id, question, priority, target_activity_id) values ('${projectA}', '${vietLong}', 'P4D2-ACCEPT-Q-exec', 'medium', '${actVL}') returning id;`);

  /** actions: array of statuses; eff: null | effective | not_effective */
  const nc = (title, { type = "nonconformity", correction = null, rootCause = null, eff = null, effNotes = null, reviewer = "admin", actions = [], verification = null, projectId = projectA }) => {
    const reviewedBy = eff ? (reviewer === "admin" ? admin : "null") : "null";
    const id = idOf(`insert into issues (project_id, title, finding_type, correction, root_cause, effectiveness_result, effectiveness_notes, effectiveness_reviewed_by, effectiveness_reviewed_at, activity_id, site_id, verification_item_id)
       values ('${projectId}', 'P4D2-ACCEPT-${q(title)}', '${type}', ${correction ? `'${q(correction)}'` : "null"}, ${rootCause ? `'${q(rootCause)}'` : "null"},
               ${eff ? `'${eff}'` : "null"}, ${effNotes ? `'${q(effNotes)}'` : "null"}, ${reviewedBy}, ${eff ? "now()" : "null"},
               ${projectId === projectA ? `'${actVL}'` : "null"}, ${projectId === projectA ? `'${vietLong}'` : "null"}, ${verification ? `'${verification}'` : "null"}) returning id;`);
    actions.forEach((st, i) =>
      dbQuery(`insert into actions (project_id, issue_id, description, status, completed_at) values ('${projectId}', '${id}', 'P4D2-ACCEPT-${q(title)} action ${i + 1}', '${st}', ${st === "closed" ? "now()" : "null"});`));
    return id;
  };
  const C = "Containers moved to spill trays.", R = "Warehouse inspection checklist did not include chemical containment.";
  const F = {
    openAction: nc("NC open action", { correction: C, rootCause: R, eff: "effective", actions: ["open"] }),
    notEffective: nc("NC not effective", { correction: C, rootCause: R, eff: "not_effective", actions: ["closed"] }),
    noCorrection: nc("NC no correction", { rootCause: R, eff: "effective", actions: ["closed"] }),
    noRca: nc("NC no rca", { correction: C, eff: "effective", actions: ["closed"] }),
    noEff: nc("NC no effectiveness", { correction: C, rootCause: R, actions: ["closed"] }),
    all3: nc("NC all warnings", {}),
    all3m: nc("NC all warnings mobile", {}),
    zeroEff: nc("NC zero actions effective", { correction: C, rootCause: R, eff: "effective" }),
    zeroNotEff: nc("NC zero actions not effective", { eff: "not_effective" }),
    unknownReviewer: nc("NC unknown reviewer", { eff: "effective", reviewer: "none" }),
    typeChange: nc("NC type change", { correction: C, rootCause: R, eff: "effective", effNotes: "Kept notes", actions: ["closed"] }),
    m390: nc("NC mobile 390", { correction: C, rootCause: R, actions: ["closed"] }),
    m412: nc("NC mobile 412", { correction: C, rootCause: R, actions: ["closed"] }),
    cons: nc("NC consultant", { correction: C, rootCause: R, actions: ["closed"] }),
    clean: nc("NC clean tamper target", { correction: C, rootCause: R, eff: "effective", actions: ["closed"] }),
    obsNone: nc("Obs no actions", { type: "observation" }),
    obsOpen: nc("Obs open action", { type: "observation", actions: ["open"] }),
    ofiOpen: nc("OFI open action", { type: "opportunity_for_improvement", actions: ["in_progress"] }),
    obsSmuggle: nc("Obs smuggle target", { type: "observation" }),
    linked: nc("NC from verification", { correction: C, rootCause: R, eff: "effective", verification: vIssue }),
    projB: nc("B secret NC", { projectId: projectB, effNotes: "B secret notes", actions: ["open"] }),
  };
  return { clientId, vietLong, projectA, projectB, actVL, vIssue, vExec, F, C, R };
}
