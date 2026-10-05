import { dbQuery, http } from "./common.mjs";

const PFX = "P5F-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;
const q = (s) => s.replace(/'/g, "''");

export async function cleanupP5f(token) {
  const keys = dbQuery(`select o.name from storage.objects o where o.bucket_id='rayims-files' and split_part(o.name, '/', 1) in (select id::text from projects where client_id in ${CLIENTS})`).map((r) => r.name);
  for (let i = 0; i < keys.length; i += 100) await http("DELETE", "/storage/v1/object/rayims-files", { token, body: { prefixes: keys.slice(i, i + 100) } });
  dbQuery(`
    delete from attachments where project_id in ${PROJ};
    delete from actions where project_id in ${PROJ};
    delete from issues where project_id in ${PROJ};
    delete from verification_items where project_id in ${PROJ};
    delete from document_reviews where document_version_id in (select v.id from document_versions v join documents d on d.id=v.document_id where d.project_id in ${PROJ});
    delete from document_versions where document_id in (select id from documents where project_id in ${PROJ});
    delete from document_framework_items where document_id in (select id from documents where project_id in ${PROJ});
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
export const LONG_COMMENT = [
  "Section 4 – Retention: the procedure does not define retention periods for quality records (ISO 9001 § 7.5.3.2).",
  "Section 5 – Approval: approval responsibilities are unclear; the Document Control matrix lists two approvers & no deputy.",
  "Dòng tiếng Việt: Quy trình chưa quy định thời gian lưu trữ hồ sơ / biểu mẫu (xem điều 7.5).",
  "A".repeat(900),
  "End of comment.",
].join("\n");

export async function createFixtures(token) {
  await cleanupP5f(token);
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  const consultant = `(select id from profiles where role='consultant' order by created_at limit 1)`;
  const clientA = idOf(`insert into clients (name) values ('${PFX}Chinh Long Demo') returning id`);
  const clientB = idOf(`insert into clients (name) values ('${PFX}Other Client') returning id`);
  const vl = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Viet Long') returning id`);
  const la = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Long An') returning id`);
  const bs = idOf(`insert into sites (client_id, name) values ('${clientB}', 'B Site') returning id`);
  const project = (client, name) => idOf(`insert into projects (client_id, name, status) values ('${client}', '${q(name)}', 'active') returning id`);
  const p = project(clientA, `${PFX}ISO Implementation`);
  const pB = project(clientB, `${PFX}Project B`);
  const pE = project(clientA, `${PFX}Empty Project`);
  const pI = project(clientA, `${PFX}Import Project`);
  const pL = project(clientA, `${PFX}Large Project`);
  dbQuery(`insert into project_sites (project_id, site_id) values ('${p}', '${vl}'), ('${p}', '${la}'), ('${pB}', '${bs}'), ('${pI}', '${vl}'), ('${pL}', '${vl}'), ('${pL}', '${la}');
    insert into project_frameworks (project_id, framework_id) select pr.id, f.id from frameworks f, (values ('${p}'::uuid), ('${pI}'::uuid), ('${pL}'::uuid)) pr(id) where f.code in ('ISO 9001', 'ISO 14001', 'ISO 45001');
    insert into project_frameworks (project_id, framework_id) select '${pB}', id from frameworks where code = 'ISO 9001';`);
  const fi = (fw, code) => idOf(`select fi.id from framework_items fi join frameworks f on f.id=fi.framework_id where f.code='${fw}' and fi.code='${code}'`);
  const I = { q61: fi("ISO 9001", "6.1"), q75: fi("ISO 9001", "7.5"), q91: fi("ISO 9001", "9.1"), q102: fi("ISO 9001", "10.2"), q41: fi("ISO 9001", "4.1"), e82: fi("ISO 14001", "8.2"), h82: fi("ISO 45001", "8.2"), e75: fi("ISO 14001", "7.5") };

  const doc = (proj, title, { site = null, items = [], code = null, type = null, owner = null, applicable = true } = {}) => {
    const id = idOf(`insert into documents (project_id, title, site_id, doc_code, document_type, owner_name, is_applicable, created_by)
      values ('${proj}', '${q(title)}', ${site ? `'${site}'` : "null"}, ${code ? `'${q(code)}'` : "null"}, ${type ? `'${q(type)}'` : "null"}, ${owner ? `'${q(owner)}'` : "null"}, ${applicable}, ${admin}) returning id`);
    if (items.length) dbQuery(`insert into document_framework_items (document_id, framework_item_id) values ${items.map((i) => `('${id}', '${i}')`).join(", ")}`);
    return id;
  };
  const version = (proj, docId, no, { revision = "Rev.00", file = `${PFX}v${no}.pdf`, receivedOn = null } = {}) => {
    const fileId = idOf(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
      values ('${proj}', '${proj}/' || gen_random_uuid() || '-fixture.pdf', '${q(file)}', 'application/pdf', 1000, ${admin}) returning id`);
    return idOf(`insert into document_versions (document_id, version_no, revision, file_id, received_on, uploaded_by)
      values ('${docId}', ${no}, ${revision ? `'${q(revision)}'` : "null"}, '${fileId}', ${receivedOn ? `'${receivedOn}'` : "null"}, ${admin}) returning id`);
  };
  /** created = minutes ago; concludedAgo = minutes ago for reviewed_at (default created - 1). */
  const review = (versionId, status, created, notes = null, { reviewer = admin, concludedAgo = created - 1 } = {}) =>
    idOf(`insert into document_reviews (document_version_id, reviewer_id, status, notes, created_at, reviewed_at)
      values ('${versionId}', ${reviewer}, '${status}', ${notes ? `'${q(notes)}'` : "null"}, now() - interval '${created} minutes',
              ${status === "under_review" ? "null" : `now() - interval '${concludedAgo} minutes'`}) returning id`);
  const finding = (proj, title, { reviewId = null, viId = null, status = "open" } = {}) =>
    idOf(`insert into issues (project_id, title, finding_type, document_review_id, verification_item_id, status, created_by)
      values ('${proj}', '${q(title)}', 'observation', ${reviewId ? `'${reviewId}'` : "null"}, ${viId ? `'${viId}'` : "null"}, '${status}', ${admin}) returning id`);
  const vi = (proj, question, reviewId, result = null) =>
    idOf(`insert into verification_items (project_id, question, priority, document_review_id, result, created_by)
      values ('${proj}', '${q(question)}', 'medium', '${reviewId}', ${result ? `'${result}'` : "null"}, ${admin}) returning id`);

  // ----- Project A -----
  const D = {};
  D.notReceived = doc(p, `${PFX}Legal Register`, { items: [I.q61], code: "REG-01", type: "Register", owner: "HSE Manager" });
  D.received = doc(p, `${PFX}Quy trình kiểm soát tài liệu & hồ sơ / ISO-9001 (Rev)`, { items: [I.q75], code: "QT-01", type: "Procedure", owner: "Trưởng phòng QA" });
  D.revision = doc(p, `${PFX}Documented Information Control Procedure`, { items: [I.e75], code: "WI-ISO-01", type: "Procedure", owner: "HSE Manager" });
  D.accepted = doc(p, `${PFX}Quality Manual`, { items: [I.q41], code: "QM-01", type: "Manual", owner: "QA Manager" });
  D.na = doc(p, `${PFX}Radiation Safety Plan`, { items: [I.h82], applicable: false });
  D.reset = doc(p, `${PFX}Waste Management Procedure`, { items: [I.e82], code: "EMS-08" });
  D.open = doc(p, `${PFX}Internal Audit Programme`, { items: [I.q91] });
  D.multi = doc(p, `${PFX}Emergency Response Procedure`, { site: vl, items: [I.e82, I.h82], code: "ERP-01", owner: "Site Manager" });
  D.none = doc(p, `${PFX}Unmapped Site Document`, { site: la, owner: "Long An Admin" });
  D.viToFinding = doc(p, `${PFX}Calibration Procedure`, { items: [I.q75] });
  D.long = doc(p, `${PFX}Record Control Procedure`, { items: [I.q75] });
  D.twoReviews = doc(p, `${PFX}Improvement Procedure`, { items: [I.q102] });

  const V = {}, R = {};
  V.received = version(p, D.received, 1, { file: "Quy trình kiểm soát tài liệu & hồ sơ (v1).pdf", receivedOn: "2026-09-15" });
  V.revision = version(p, D.revision, 1, { revision: "Rev.00", file: "WI-ISO-01 Rev.00.docx", receivedOn: "2026-09-20" });
  R.revision = review(V.revision, "revision_required", 30, "Retention period is missing.");
  V.accepted1 = version(p, D.accepted, 1, { file: "QM-01 draft.pdf" });
  R.accepted1 = review(V.accepted1, "revision_required", 300, "V1 gap: scope statement missing.");
  V.accepted2 = version(p, D.accepted, 2, { revision: "Rev.01", file: "QM-01 Rev.01.pdf", receivedOn: "2026-09-25" });
  R.accepted2 = review(V.accepted2, "accepted", 60, "Updated manual is acceptable.");
  V.na = version(p, D.na, 1, { file: "Radiation plan.pdf", receivedOn: "2026-09-10" });
  R.na = review(V.na, "revision_required", 200, "Gap found before the document became N/A.");
  V.reset1 = version(p, D.reset, 1, { file: "EMS-08 v1.pdf" });
  R.reset1 = review(V.reset1, "revision_required", 240, "V1 COMMENT MUST NOT APPEAR.");
  V.reset2 = version(p, D.reset, 2, { revision: "Rev.02", file: "EMS-08 v2.pdf", receivedOn: "2026-09-28" });
  V.open = version(p, D.open, 1, { file: "Audit programme.xlsx" });
  R.openDone = review(V.open, "accepted", 3000, "Earlier assessment: acceptable.");
  R.openNow = review(V.open, "under_review", 20, "Currently checking signatures.", { reviewer: consultant });
  V.multi = version(p, D.multi, 1, { file: "ERP-01.pdf" });
  R.multi = review(V.multi, "revision_required", 50, "Evacuation roles unclear.");
  V.vf = version(p, D.viToFinding, 1, { file: "Calibration.pdf" });
  R.vf = review(V.vf, "revision_required", 45, "Calibration intervals unclear.");
  V.long = version(p, D.long, 1, { file: "Record control.pdf" });
  R.long = review(V.long, "revision_required", 40, LONG_COMMENT);
  V.two = version(p, D.twoReviews, 1, { file: "Improvement.pdf" });
  // Created earlier but concluded LATER: must not be treated as the latest assessment.
  R.twoOld = review(V.two, "accepted", 120, "Older assessment concluded late.", { concludedAgo: 5 });
  R.twoNew = review(V.two, "revision_required", 60, "Newest assessment by created_at.");

  // Follow-up: 2 direct Findings (1 open, 1 closed) + 3 direct Verification items (2 pending, 1 verified OK)
  const F = {};
  F.rev1 = finding(p, `${PFX}Retention period finding`, { reviewId: R.revision });
  F.rev2 = finding(p, `${PFX}Approval matrix finding`, { reviewId: R.revision, status: "closed" });
  vi(p, `${PFX}Check retention records`, R.revision);
  vi(p, `${PFX}Check approval matrix`, R.revision);
  vi(p, `${PFX}Check archive`, R.revision, "verified_ok");
  // Historical follow-up: Finding from V1 assessment of the (now Accepted) Quality Manual
  F.hist = finding(p, `${PFX}Scope statement finding`, { reviewId: R.accepted1 });
  // N/A document keeps its historical follow-up
  F.na = finding(p, `${PFX}Radiation finding before N/A`, { reviewId: R.na });
  // Review → Verification → Finding: the Finding links to the item only
  const vfItem = vi(p, `${PFX}Check calibration intervals`, R.vf);
  F.fromVi = finding(p, `${PFX}Finding from verification`, { viId: vfItem });

  // ----- Project B (markers must never appear in Project A's export) -----
  const bDoc = doc(pB, `${PFX}BMARKER Secret Document`, { items: [I.q75], code: "BMARKER-01", owner: "BMARKER Owner" });
  const bV = version(pB, bDoc, 1, { file: "BMARKER.pdf" });
  const bR = review(bV, "revision_required", 30, "BMARKER secret comment");
  finding(pB, `${PFX}BMARKER finding`, { reviewId: bR });

  return { clientA, clientB, p, pB, pE, pI, pL, vl, la, bs, I, D, V, R, F, vfItem };
}

/** 260 documents × 4 ISO 9001 mappings (1040 export rows > the 1000-row response cap), mixed sites / statuses. */
export function createLargeProject(pL, vl, la) {
  const admin = `(select id from profiles where role='admin' order by created_at limit 1)`;
  dbQuery(`
    insert into documents (project_id, title, site_id, doc_code, owner_name, is_applicable, created_by)
    select '${pL}', '${PFX}Large Document ' || lpad(g::text, 3, '0'),
           case g % 3 when 0 then null when 1 then '${vl}'::uuid else '${la}'::uuid end,
           'LG-' || g, 'Owner ' || (g % 7), g % 13 <> 0, ${admin}
    from generate_series(1, 260) g;
    insert into document_framework_items (document_id, framework_item_id)
    select d.id, fi.id from documents d
    join lateral (select fi.id from framework_items fi join frameworks f on f.id = fi.framework_id
                  where f.code = 'ISO 9001' and fi.code in ('4.1', '6.1', '7.5', '10.2')) fi on true
    where d.project_id = '${pL}';
    insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
    select '${pL}', '${pL}/' || d.id || '-fixture.pdf', d.doc_code || '.pdf', 'application/pdf', 1000, ${admin}
    from documents d where d.project_id = '${pL}' and split_part(d.doc_code, '-', 2)::int % 3 <> 0;
    insert into document_versions (document_id, version_no, revision, file_id, received_on, uploaded_by)
    select d.id, 1, 'Rev.00', f.id, current_date - 3, ${admin}
    from documents d join files f on f.storage_key = '${pL}/' || d.id || '-fixture.pdf';
    insert into document_reviews (document_version_id, reviewer_id, status, notes, created_at, reviewed_at)
    select v.id, ${admin},
           case split_part(d.doc_code, '-', 2)::int % 4 when 0 then 'accepted' when 1 then 'revision_required' else 'under_review' end,
           'Large review ' || d.doc_code, now() - interval '10 minutes',
           case when split_part(d.doc_code, '-', 2)::int % 4 in (0, 1) then now() - interval '9 minutes' else null end
    from document_versions v join documents d on d.id = v.document_id
    where d.project_id = '${pL}' and split_part(d.doc_code, '-', 2)::int % 5 <> 0;
  `);
}
