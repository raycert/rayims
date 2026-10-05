import { dbQuery, http } from "./common.mjs";

export const PFX = "P6D-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;

export async function cleanupP6d(token) {
  const keys = dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select id::text from projects where client_id in ${CLIENTS})`).map((r) => r.name);
  for (let i = 0; i < keys.length; i += 100) await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
  dbQuery(`
    delete from attachments where project_id in ${PROJ};
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from document_reviews where document_version_id in (select v.id from document_versions v join documents d on d.id = v.document_id where d.project_id in ${PROJ});
    delete from document_versions where document_id in (select id from documents where project_id in ${PROJ});
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
const ADMIN = `(select id from profiles where role='admin' order by created_at limit 1)`;
const q = (s) => s.replace(/'/g, "''");

export async function createFixtures(token) {
  await cleanupP6d(token);
  const clientA = idOf(`insert into clients (name) values ('${PFX}Chinh Long Demo') returning id`);
  const clientB = idOf(`insert into clients (name) values ('${PFX}Other Client') returning id`);
  const vl = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Viet Long') returning id`);
  const la = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Long An') returning id`);
  const bs = idOf(`insert into sites (client_id, name) values ('${clientB}', 'BMARKER Site') returning id`);
  const p = idOf(`insert into projects (client_id, name, status) values ('${clientA}', '${PFX}ISO Implementation', 'active') returning id`);
  const pB = idOf(`insert into projects (client_id, name, status) values ('${clientB}', '${PFX}Project B', 'active') returning id`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vl}'), ('${p}', '${la}'), ('${pB}', '${bs}');
    insert into project_frameworks (project_id, framework_id) select '${p}', id from frameworks where code in ('ISO 14001', 'ISO 9001');`);
  const fi = (fw, code) => idOf(`select fi.id from framework_items fi join frameworks f on f.id = fi.framework_id where f.code = '${fw}' and fi.code = '${code}'`);
  const e81 = fi("ISO 14001", "8.1"), q75 = fi("ISO 9001", "7.5");
  const today = new Date().toISOString().slice(0, 10);
  const act = (proj, name, site, status = "in_progress") =>
    idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date, consultant_id, work_performed, summary, next_steps, client_participants)
      values ('${proj}', ${site ? `'${site}'` : "null"}, '${PFX}${q(name)}', (select id from activity_types where key='site_assessment'), 'on_site', '${status}', '${today}', ${ADMIN},
              'Reviewed controls.', 'Controls mostly implemented.', 'Follow up on retention.', 'Nguyen Van A — HSE Manager') returning id`);
  const A = act(p, "Site Assessment – Viet Long", vl);
  dbQuery(`update activities set objectives = 'Đánh giá việc kiểm soát vận hành và hồ sơ môi trường.', planned_work = E'Walk-through of the drum store and waste area.
Interviews with the HSE Manager.',
    work_performed = E'Đã đánh giá hiện trạng tài liệu và kiểm tra điều kiện tại hiện trường.

Reviewed operational controls, waste records and emergency arrangements with the site team.',
    summary = E'Controls are generally implemented.

Document retention and secondary containment require improvement before the follow-up visit. ' || repeat('The consultant recommends prioritising the containment work. ', 6),
    next_steps = E'Install bunding at the drum store.
Define record retention periods.
Verify implementation during the follow-up visit.',
    client_participants = E'Nguyễn Văn A — Trưởng phòng Chất lượng
Tran Thi B — QA Supervisor', start_date = '2026-10-27', start_time = '08:30', end_time = '16:00' where id = '${A}'`);
  const B = act(p, "Follow-up Visit – Viet Long", vl);
  const E = act(p, "Empty Activity", null, "planned");
  dbQuery(`update activities set objectives = null, planned_work = null, work_performed = null, summary = null, next_steps = null, client_participants = null where id = '${E}'`);
  const PERF = act(p, "Large Assessment", vl);
  const XB = act(pB, "BMARKER Activity", bs, "completed");

  const vi = (proj, question, { target = null, verified = null, result = null, notes = null, site = null, item = null } = {}) =>
    idOf(`insert into verification_items (project_id, site_id, framework_item_id, question, priority, target_activity_id, verified_activity_id, result, notes, verified_by, verified_at, created_by)
      values ('${proj}', ${site ? `'${site}'` : "null"}, ${item ? `'${item}'` : "null"}, '${q(question)}', 'medium', ${target ? `'${target}'` : "null"}, ${verified ? `'${verified}'` : "null"},
              ${result ? `'${result}'` : "null"}, ${notes ? `'${q(notes)}'` : "null"}, ${result ? ADMIN : "null"}, ${result ? "now()" : "null"}, ${ADMIN}) returning id`);
  const V = {
    issue: vi(p, `${PFX}Is secondary containment provided?`, { target: A, verified: A, result: "issue_identified", notes: "No bund at drum store.", site: vl, item: e81 }),
    ok1: vi(p, `${PFX}Are SDS available?`, { target: A, verified: A, result: "verified_ok", site: vl }),
    ok2: vi(p, `${PFX}Is the spill kit stocked?`, { target: B, verified: A, result: "verified_ok", site: vl }), // planned for B, done in A
    follow: vi(p, `${PFX}Are waste records complete?`, { target: A, verified: A, result: "follow_up_required", notes: "Two months missing.", site: vl }),
    pending: vi(p, `${PFX}Is the emergency drill recorded?`, { target: A, site: vl }),
    elsewhere: vi(p, `${PFX}Are permits displayed?`, { target: A, verified: B, result: "issue_identified", site: vl }), // planned A, done in B
    ok3: vi(p, `${PFX}Are fire extinguishers inspected?`, { target: A, verified: A, result: "verified_ok", site: vl }),
    ok4: vi(p, `${PFX}Is PPE available?`, { target: A, verified: A, result: "verified_ok", site: vl }),
    ok5: vi(p, `${PFX}Are drains protected?`, { target: A, verified: A, result: "verified_ok", site: vl }),
    ok6: vi(p, `${PFX}Are eyewash stations working?`, { target: A, verified: A, result: "verified_ok", site: vl }),
  };
  const finding = (proj, no, title, { activity = null, vItem = null, review = null, site = null, item = null, type = "observation", priority = "medium", status = "open", description = null } = {}) =>
    idOf(`insert into issues (project_id, title, description, finding_type, priority, status, site_id, activity_id, verification_item_id, document_review_id, framework_item_id, created_by)
      values ('${proj}', '${q(title)}', ${description ? `'${q(description)}'` : "null"}, '${type}', '${priority}', '${status}', ${site ? `'${site}'` : "null"}, ${activity ? `'${activity}'` : "null"}, ${vItem ? `'${vItem}'` : "null"}, ${review ? `'${review}'` : "null"}, ${item ? `'${item}'` : "null"}, ${ADMIN}) returning id`);
  const F = {
    fromCheck: finding(p, 0, `${PFX}No secondary containment at drum store`, { activity: A, vItem: V.issue, site: vl, item: e81, type: "nonconformity", priority: "high", description: "Drums stored without bunding." }),
    manual: finding(p, 0, `${PFX}Chưa kiểm soát đầy đủ hồ sơ theo yêu cầu.`, { activity: A, site: la, description: 'Hồ sơ đào tạo và hồ sơ quan trắc không được lưu giữ đầy đủ. ' + 'Long description sentence for wrapping checks. '.repeat(10) }),
    fromElsewhere: finding(p, 0, `${PFX}Permits not displayed`, { activity: B, vItem: V.elsewhere, site: vl }),
    noActivity: finding(p, 0, `${PFX}Project-wide observation`, {}),
  };
  // Gap Assessment-origin Finding with Activity A selected (F-005)
  const docId = idOf(`insert into documents (project_id, title, created_by) values ('${p}', '${PFX}Document Control Procedure', ${ADMIN}) returning id`);
  const docFile = idOf(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by) values ('${p}', '${p}/' || gen_random_uuid() || '-doc.pdf', 'Procedure.pdf', 'application/pdf', 1000, ${ADMIN}) returning id`);
  const ver = idOf(`insert into document_versions (document_id, version_no, file_id, uploaded_by) values ('${docId}', 1, '${docFile}', ${ADMIN}) returning id`);
  const review = idOf(`insert into document_reviews (document_version_id, reviewer_id, status, notes, reviewed_at) values ('${ver}', ${ADMIN}, 'revision_required', 'Approval matrix missing.', now()) returning id`);
  F.fromReview = finding(p, 0, `${PFX}Approval matrix missing`, { activity: A, review, item: q75 });
  const act2 = (proj, desc, { issue = null, activity = null, status = "open", due = null, owner = null } = {}) =>
    idOf(`insert into actions (project_id, issue_id, activity_id, description, owner_name, due_date, priority, status, created_by)
      values ('${proj}', ${issue ? `'${issue}'` : "null"}, ${activity ? `'${activity}'` : "null"}, '${q(desc)}', ${owner ? `'${q(owner)}'` : "null"}, ${due ? `'${due}'` : "null"}, 'medium', '${status}', ${ADMIN}) returning id`);
  const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const AC = {
    findingOnly: act2(p, `${PFX}Install bund at drum store`, { issue: F.fromCheck, due: past, owner: "Plant Manager" }), // I (overdue)
    both: act2(p, `${PFX}Train storekeepers on containment`, { issue: F.fromCheck, activity: A, owner: "HSE Manager" }), // J
    standalone: act2(p, `${PFX}Send visit notes to client`, { activity: A, status: "closed" }), // H
    longOne: act2(p, `${PFX}Prepare a detailed corrective action plan covering bunding, labelling, spill response equipment and training records for both warehouses`, { activity: A, owner: "Nguyễn Văn A", due: "2026-12-15" }),
    unrelated: act2(p, `${PFX}Display permits at gate`, { issue: F.fromElsewhere, activity: B }), // not in A
  };
  const file = (proj, name) =>
    idOf(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
      values ('${proj}', '${proj}/' || gen_random_uuid() || '-fixture.jpg', '${q(name)}', 'image/jpeg', 2048, ${ADMIN}) returning id`);
  const att = (proj, parentCol, parentId, name, caption) =>
    idOf(`insert into attachments (project_id, file_id, caption, ${parentCol}, created_by) values ('${proj}', '${file(proj, name)}', '${q(caption)}', '${parentId}', ${ADMIN}) returning id`);
  const EV = {
    activity: att(p, "activity_id", A, "site-overview-photo-with-a-very-long-file-name-for-wrapping-checks.jpg", "Drum store overview"),
    verification: att(p, "verification_item_id", V.issue, "drum-store-no-bund.jpg", "No bund"),
    finding: att(p, "issue_id", F.fromCheck, "containment-nc.jpg", "NC evidence"),
    action: att(p, "action_id", AC.both, "training-attendance.jpg", "Training sheet"),
    elsewhere: att(p, "verification_item_id", V.elsewhere, "permits.jpg", "Permits (Activity B)"),
    projectB: att(pB, "activity_id", XB, "BMARKER.jpg", "BMARKER caption"),
  };
  // Project B: Finding + Action with markers
  const fB = finding(pB, 0, `${PFX}BMARKER finding`, { activity: XB });
  act2(pB, `${PFX}BMARKER action`, { issue: fB, activity: XB });
  return { clientA, clientB, vl, la, p, pB, A, B, E, PERF, XB, V, F, AC, EV, e81, q75 };
}

/** 50 checks, 20 Findings, 30 Actions, 40 Evidence attachments on one Activity (one statement each). */
export function createPerformanceData(p, act, site) {
  const ADMIN_ = ADMIN;
  dbQuery(`
    insert into verification_items (project_id, site_id, question, priority, target_activity_id, verified_activity_id, result, notes, verified_by, verified_at, created_by)
    select '${p}', '${site}', '${PFX}Perf check ' || lpad(g::text, 2, '0'), 'medium', '${act}', '${act}',
           (array['verified_ok','issue_identified','follow_up_required'])[1 + g % 3], 'Perf notes ' || g, ${ADMIN_}, now(), ${ADMIN_}
    from generate_series(1, 50) g;
    insert into issues (project_id, title, description, finding_type, priority, status, site_id, activity_id, created_by)
    select '${p}', '${PFX}Perf finding ' || lpad(g::text, 2, '0'), 'Perf description ' || g, 'observation', 'medium', 'open', '${site}', '${act}', ${ADMIN_}
    from generate_series(1, 20) g;
    insert into actions (project_id, issue_id, activity_id, description, owner_name, due_date, priority, status, created_by)
    select '${p}', (select id from issues where project_id = '${p}' and title = '${PFX}Perf finding ' || lpad((1 + g % 20)::text, 2, '0')),
           case when g % 2 = 0 then '${act}'::uuid else null end, '${PFX}Perf action ' || lpad(g::text, 2, '0'), 'Owner ' || g, current_date + g, 'medium', 'open', ${ADMIN_}
    from generate_series(1, 30) g;
    insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
    select '${p}', '${p}/perf-' || g || '-fixture.jpg', 'perf-' || lpad(g::text, 2, '0') || '.jpg', 'image/jpeg', 1000, ${ADMIN_} from generate_series(1, 40) g;
    insert into attachments (project_id, file_id, caption, activity_id, verification_item_id, issue_id, action_id, created_by)
    select '${p}', (select id from files where storage_key = '${p}/perf-' || g || '-fixture.jpg'), 'Perf evidence ' || g,
           case when g % 4 = 0 then '${act}'::uuid end,
           case when g % 4 = 1 then (select id from verification_items where project_id = '${p}' and question = '${PFX}Perf check ' || lpad(g::text, 2, '0')) end,
           case when g % 4 = 2 then (select id from issues where project_id = '${p}' and title = '${PFX}Perf finding ' || lpad((1 + g % 20)::text, 2, '0')) end,
           case when g % 4 = 3 then (select id from actions where project_id = '${p}' and description = '${PFX}Perf action ' || lpad((1 + g % 30)::text, 2, '0')) end,
           ${ADMIN_}
    from generate_series(1, 40) g;
  `);
}
