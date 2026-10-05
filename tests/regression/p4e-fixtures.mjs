import { dbQuery, http } from "./common.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const PROJ = `(select p.id from projects p join clients c on c.id = p.client_id where c.name like 'P4E-ACCEPT-%')`;

/** Removes every stored object under the fixture projects' key prefixes, then all fixture rows. */
export async function cleanupP4e(token) {
  const keys = dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select p.id::text from projects p join clients c on c.id = p.client_id where c.name like 'P4E-ACCEPT-%')`).map((r) => r.name);
  if (keys.length) {
    for (let i = 0; i < keys.length; i += 100) {
      await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
    }
  }
  dbQuery(`
    delete from attachments where project_id in ${PROJ};
    delete from files where project_id in ${PROJ};
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from activities where project_id in ${PROJ};
    delete from project_sites where project_id in ${PROJ};
    delete from projects where client_id in (select id from clients where name like 'P4E-ACCEPT-%');
    delete from sites where client_id in (select id from clients where name like 'P4E-ACCEPT-%');
    delete from clients where name like 'P4E-ACCEPT-%';
  `);
  return keys.length;
}

export function fixtureObjectCount() {
  return dbQuery(`select count(*) n from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select p.id::text from projects p join clients c on c.id = p.client_id where c.name like 'P4E-ACCEPT-%')`)[0].n;
}

const idOf = (sql) => dbQuery(sql)[0].id;

export async function createFixtures(token) {
  await cleanupP4e(token);
  const clientId = idOf(`insert into clients (name, status) values ('P4E-ACCEPT-Client', 'active') returning id;`);
  const vietLong = idOf(`insert into sites (client_id, name) values ('${clientId}', 'Viet Long') returning id;`);
  const betaSite = idOf(`insert into sites (client_id, name) values ('${clientId}', 'Beta Site') returning id;`);
  const projectA = idOf(`insert into projects (client_id, name, status) values ('${clientId}', 'P4E-ACCEPT-Project-A', 'active') returning id;`);
  const projectB = idOf(`insert into projects (client_id, name, status) values ('${clientId}', 'P4E-ACCEPT-Project-B', 'active') returning id;`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${projectA}', '${vietLong}'), ('${projectB}', '${betaSite}');`);
  const actVL = idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date)
     values ('${projectA}', '${vietLong}', 'P4E-ACCEPT-Site Assessment', (select id from activity_types where key='site_assessment'), 'on_site', 'planned', '2026-10-27') returning id;`);
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const v = (q, result) => idOf(`insert into verification_items (project_id, site_id, question, priority, target_activity_id, result, notes, verified_activity_id, verified_by, verified_at)
     values ('${projectA}', '${vietLong}', 'P4E-ACCEPT-${q}', 'high', '${actVL}', ${result ? `'${result}'` : "null"}, ${result ? "'Onsite note'" : "null"}, ${result ? `'${actVL}'` : "null"}, ${result ? admin : "null"}, ${result ? "now()" : "null"}) returning id;`);
  const vIssue = v("Q-issue", "issue_identified");
  const vPending = v("Q-pending", null);
  const vM390 = v("Q-m390", null);
  const vM412 = v("Q-m412", null);
  const f = (title, type = "observation", projectId = projectA) =>
    idOf(`insert into issues (project_id, title, finding_type, activity_id, site_id) values ('${projectId}', 'P4E-ACCEPT-${title}', '${type}', ${projectId === projectA ? `'${actVL}'` : "null"}, ${projectId === projectA ? `'${vietLong}'` : "null"}) returning id;`);
  const fNC = f("NC evidence", "nonconformity");
  const fObs = f("Obs to close");
  const fMobile = f("Mobile finding", "nonconformity");
  const fB = f("B secret finding", "observation", projectB);
  const a = (desc, issueId, projectId = projectA) =>
    idOf(`insert into actions (project_id, issue_id, description, owner_name) values ('${projectId}', ${issueId ? `'${issueId}'` : "null"}, 'P4E-ACCEPT-${desc}', 'Owner') returning id;`);
  const aNC = a("Update checklist", fNC);
  const aMobile = a("Mobile action", fMobile);
  const aB = a("B secret action", fB, projectB);
  return { clientId, projectA, projectB, actVL, vIssue, vPending, vM390, vM412, fNC, fObs, fMobile, fB, aNC, aMobile, aB };
}

/** Local test files (content only needs the right extension/size; Storage does not inspect it). */
export function makeFiles(dir) {
  mkdirSync(dir, { recursive: true });
  const w = (name, buf) => { const p = path.join(dir, name); writeFileSync(p, buf); return p; };
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 1), Buffer.from([0xff, 0xd9])]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1024, 2)]);
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(512, 3)]);
  mkdirSync(path.join(dir, "a"), { recursive: true });
  mkdirSync(path.join(dir, "b"), { recursive: true });
  return {
    jpg: w("site-photo.jpg", jpeg),
    png: w("diagram.png", png),
    pdf: w("attendance.pdf", pdf),
    xlsx: w("checklist.xlsx", zip),
    docx: w("procedure.docx", zip),
    photoA: w("a/photo.jpg", jpeg),
    photoB: w("b/photo.jpg", jpeg),
    bigOk: w("big-ok.pdf", Buffer.concat([pdf, Buffer.alloc(Math.floor(9.5 * 1024 * 1024), 4)])),
    bigOver: w("big-over.pdf", Buffer.concat([pdf, Buffer.alloc(Math.floor(10.5 * 1024 * 1024), 5)])),
    exe: w("tool.exe", Buffer.from("MZ" + "x".repeat(200))),
    sh: w("run.sh", Buffer.from("#!/bin/sh\necho hi\n")),
    fakeJpgExe: w("virus.exe.jpg", jpeg),
  };
}
