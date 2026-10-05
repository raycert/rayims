import { dbQuery, http } from "./common.mjs";

export const PFX = "P5G-ACCEPT-";
const CLIENTS = `(select id from clients where name like '${PFX}%')`;
const PROJ = `(select id from projects where client_id in ${CLIENTS})`;
const q = (s) => s.replace(/'/g, "''");

export async function cleanupP5g(token) {
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
const ADMIN = `(select id from profiles where role='admin' order by created_at limit 1)`;
const CONSULTANT = `(select id from profiles where role='consultant' order by created_at limit 1)`;
const today = () => new Date().toISOString().slice(0, 10);

export function fi(fw, code) {
  return idOf(`select fi.id from framework_items fi join frameworks f on f.id=fi.framework_id where f.code='${fw}' and fi.code='${code}'`);
}
export function doc(proj, title, { site = null, items = [], code = null, applicable = true } = {}) {
  const id = idOf(`insert into documents (project_id, title, site_id, doc_code, is_applicable, created_by)
    values ('${proj}', '${q(title)}', ${site ? `'${site}'` : "null"}, ${code ? `'${q(code)}'` : "null"}, ${applicable}, ${ADMIN}) returning id`);
  if (items.length) dbQuery(`insert into document_framework_items (document_id, framework_item_id) values ${items.map((i) => `('${id}', '${i}')`).join(", ")}`);
  return id;
}
/** A version whose file row has NO stored object (fixture). */
export function version(proj, docId, no, { revision = "Rev.00", file = `${PFX}v${no}.pdf` } = {}) {
  const fileId = idOf(`insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
    values ('${proj}', '${proj}/' || gen_random_uuid() || '-fixture.pdf', '${q(file)}', 'application/pdf', 1000, ${ADMIN}) returning id`);
  return idOf(`insert into document_versions (document_id, version_no, revision, file_id, uploaded_by) values ('${docId}', ${no}, '${q(revision)}', '${fileId}', ${ADMIN}) returning id`);
}
/** createdAt / reviewedAt: SQL timestamp expressions. */
export function review(versionId, status, { notes = null, createdAt = "now() - interval '30 minutes'", reviewedAt = null, reviewer = ADMIN } = {}) {
  const concluded = status === "under_review" ? "null" : (reviewedAt ?? `${createdAt} + interval '1 minute'`);
  return idOf(`insert into document_reviews (document_version_id, reviewer_id, status, notes, created_at, reviewed_at)
    values ('${versionId}', ${reviewer}, '${status}', ${notes ? `'${q(notes)}'` : "null"}, ${createdAt}, ${concluded}) returning id`);
}
export function finding(proj, title, { reviewId = null, viId = null, status = "open" } = {}) {
  return idOf(`insert into issues (project_id, title, finding_type, document_review_id, verification_item_id, status, created_by)
    values ('${proj}', '${q(title)}', 'observation', ${reviewId ? `'${reviewId}'` : "null"}, ${viId ? `'${viId}'` : "null"}, '${status}', ${ADMIN}) returning id`);
}
export function vi(proj, question, reviewId, result = null) {
  return idOf(`insert into verification_items (project_id, question, priority, document_review_id, result, created_by)
    values ('${proj}', '${q(question)}', 'medium', '${reviewId}', ${result ? `'${result}'` : "null"}, ${ADMIN}) returning id`);
}

export async function createFixtures(token) {
  await cleanupP5g(token);
  const clientA = idOf(`insert into clients (name) values ('${PFX}Chinh Long Demo') returning id`);
  const clientB = idOf(`insert into clients (name) values ('${PFX}Other Client') returning id`);
  const sA = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Site A') returning id`);
  const sB = idOf(`insert into sites (client_id, name) values ('${clientA}', 'Site B') returning id`);
  const bs = idOf(`insert into sites (client_id, name) values ('${clientB}', 'BMARKER Site') returning id`);
  const project = (client, name) => idOf(`insert into projects (client_id, name, status) values ('${client}', '${q(name)}', 'active') returning id`);
  const P = {
    main: project(clientA, `${PFX}IMS Implementation`),
    edge: project(clientA, `${PFX}Edge Cases`),
    p10: project(clientA, `${PFX}Register 10`),
    p100: project(clientA, `${PFX}Register 100`),
    p300: project(clientA, `${PFX}Register 300`),
    imp: project(clientA, `${PFX}Import 250`),
    empty: project(clientA, `${PFX}Empty Project`),
    b: project(clientB, `${PFX}BMARKER Project`),
  };
  const aProjects = Object.entries(P).filter(([k]) => k !== "b").map(([, id]) => id);
  dbQuery(`insert into project_sites (project_id, site_id) select p, s from unnest(array['${aProjects.join("','")}']::uuid[]) p, unnest(array['${sA}','${sB}']::uuid[]) s;
    insert into project_sites (project_id, site_id) values ('${P.b}', '${bs}');
    insert into project_frameworks (project_id, framework_id) select p, f.id from unnest(array['${aProjects.join("','")}']::uuid[]) p, frameworks f where f.code in ('ISO 9001', 'ISO 14001', 'ISO 45001');
    insert into project_frameworks (project_id, framework_id) select '${P.b}', id from frameworks where code = 'ISO 9001';`);
  const I = { q61: fi("ISO 9001", "6.1"), q75: fi("ISO 9001", "7.5"), q91: fi("ISO 9001", "9.1"), q92: fi("ISO 9001", "9.2"), e75: fi("ISO 14001", "7.5"), e82: fi("ISO 14001", "8.2"), h82: fi("ISO 45001", "8.2") };
  const act = (proj, name, site) =>
    idOf(`insert into activities (project_id, site_id, name, activity_type_id, mode, status, start_date)
      values ('${proj}', ${site ? `'${site}'` : "null"}, '${q(name)}', (select id from activity_types where key='site_assessment'), 'on_site', 'in_progress', '${today()}') returning id`);
  const A = { mainPw: act(P.main, "Document Review Meeting", null), mainA: act(P.main, "Site Assessment – Site A", sA) };

  // Main project: one existing Document (import must skip it, never change it)
  const existing = doc(P.main, `${PFX}Legal Register`, { code: "LR-01" });

  // ----- Edge cases -----
  const E = {};
  // §13 race: three documents with an unreviewed V1
  E.race = [1, 2, 3].map((n) => { const d = doc(P.edge, `${PFX}Race Document ${n}`, { items: [I.q75] }); return { d, v: version(P.edge, d, 1) }; });
  // §14 same created_at, different status
  E.tie = doc(P.edge, `${PFX}Tie Document`, { items: [I.q75] });
  E.tieV = version(P.edge, E.tie, 1);
  const ts = "timestamptz '2026-09-28 03:00:00+00'";
  E.tieR1 = review(E.tieV, "accepted", { notes: "TIE accepted", createdAt: ts });
  E.tieR2 = review(E.tieV, "revision_required", { notes: "TIE revision required", createdAt: ts });
  // §27 concluded at 22:30 UTC = 05:30 the next day in Vietnam
  E.tz = doc(P.edge, `${PFX}Timezone Document`, { items: [I.q61] });
  E.tzV = version(P.edge, E.tz, 1);
  E.tzR = review(E.tzV, "accepted", { notes: "Concluded early morning in Vietnam.", createdAt: "timestamptz '2026-09-29 22:00:00+00'", reviewedAt: "timestamptz '2026-09-29 22:30:00+00'" });
  // §31 missing storage object
  E.missing = doc(P.edge, `${PFX}Missing File Document`, { items: [I.q75] });
  E.missingV = version(P.edge, E.missing, 1, { file: "Missing.pdf" });
  // §36 controlled delete: reviewed V1 + unreviewed V2
  E.del = doc(P.edge, `${PFX}Delete Rules Document`, { items: [I.q75] });
  E.delV1 = version(P.edge, E.del, 1);
  E.delR1 = review(E.delV1, "revision_required", { notes: "V1 gap." });
  E.delV2 = version(P.edge, E.del, 2, { revision: "Rev.01" });
  // §20 counts: V1 assessment with 2 Findings (1 closed) + 2 checks (1 verified) + a check whose Finding came from Verification; V2 accepted with 1 Finding
  E.counts = doc(P.edge, `${PFX}Counts Document`, { items: [I.q75, I.e75] });
  E.cV1 = version(P.edge, E.counts, 1);
  E.cR1 = review(E.cV1, "revision_required", { notes: "V1 gaps.", createdAt: "now() - interval '2 days'" });
  finding(P.edge, `${PFX}Counts F1 open`, { reviewId: E.cR1 });
  finding(P.edge, `${PFX}Counts F2 closed`, { reviewId: E.cR1, status: "closed" });
  vi(P.edge, `${PFX}Counts check pending`, E.cR1);
  const viDone = vi(P.edge, `${PFX}Counts check issue`, E.cR1, "issue_identified");
  finding(P.edge, `${PFX}Counts finding from verification`, { viId: viDone });
  E.cV2 = version(P.edge, E.counts, 2, { revision: "Rev.01" });
  E.cR2 = review(E.cV2, "accepted", { notes: "V2 acceptable." });
  finding(P.edge, `${PFX}Counts F3 on V2`, { reviewId: E.cR2 });
  // §37 detail performance: 3 versions, 10 reviews, follow-ups
  E.heavy = doc(P.p10, `${PFX}Heavy Detail Document`, { items: [I.q75, I.e75, I.h82] });
  // one statement: 3 versions, 3 + 3 + 4 = 10 concluded reviews, one Finding + one check per review
  dbQuery(`
    insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
    select '${P.p10}', '${P.p10}/heavy-v' || v || '-fixture.pdf', 'Heavy v' || v || '.pdf', 'application/pdf', 1000, ${ADMIN} from generate_series(1, 3) v;
    insert into document_versions (document_id, version_no, revision, file_id, uploaded_by)
    select '${E.heavy}', v, 'Rev.0' || v, (select id from files where storage_key = '${P.p10}/heavy-v' || v || '-fixture.pdf'), ${ADMIN} from generate_series(1, 3) v;
    insert into document_reviews (document_version_id, reviewer_id, status, notes, created_at, reviewed_at)
    select dv.id, ${ADMIN}, 'revision_required', 'Heavy V' || dv.version_no || ' review ' || r || ': ' || repeat('detail ', 20),
           now() - ((4 - dv.version_no) * 100 + (5 - r) * 10) * interval '1 minute', now() - ((4 - dv.version_no) * 100 + (5 - r) * 10 - 1) * interval '1 minute'
    from document_versions dv, generate_series(1, 4) r where dv.document_id = '${E.heavy}' and (r <= 3 or dv.version_no = 3);
    insert into issues (project_id, title, finding_type, document_review_id, status, created_by)
    select '${P.p10}', '${PFX}Heavy finding ' || r.id, 'observation', r.id, 'open', ${ADMIN}
    from document_reviews r join document_versions dv on dv.id = r.document_version_id where dv.document_id = '${E.heavy}';
    insert into verification_items (project_id, question, priority, document_review_id, created_by)
    select '${P.p10}', '${PFX}Heavy check ' || r.id, 'medium', r.id, ${ADMIN}
    from document_reviews r join document_versions dv on dv.id = r.document_version_id where dv.document_id = '${E.heavy}';
  `);

  // ----- Project B (markers) -----
  const bDoc = doc(P.b, `${PFX}BMARKER Secret Document`, { site: bs, items: [I.q75], code: "BMARKER-01" });
  const bV = version(P.b, bDoc, 1, { file: "BMARKER.pdf" });
  const bR = review(bV, "revision_required", { notes: "BMARKER secret comment" });
  finding(P.b, `${PFX}BMARKER finding`, { reviewId: bR });
  vi(P.b, `${PFX}BMARKER check`, bR);

  return { clientA, clientB, sA, sB, bs, P, I, A, E, existing, bDoc, bV, bR };
}

/** n documents × 4 mappings, mixed sites; versions for 2/3, reviews for 4/5 of those, follow-up on revision_required. */
export function bulk(proj, n, sA, sB) {
  dbQuery(`
    insert into documents (project_id, title, site_id, doc_code, owner_name, is_applicable, created_by)
    select '${proj}', '${PFX}Bulk Document ' || lpad(g::text, 3, '0'),
           case g % 3 when 0 then null when 1 then '${sA}'::uuid else '${sB}'::uuid end,
           'BK-' || g, 'Owner ' || (g % 7), g % 13 <> 0, ${ADMIN}
    from generate_series(1, ${n}) g;
    insert into document_framework_items (document_id, framework_item_id)
    select d.id, fi.id from documents d
    join lateral (select fi.id from framework_items fi join frameworks f on f.id = fi.framework_id
                  where (f.code = 'ISO 9001' and fi.code in ('6.1', '7.5', '9.1')) or (f.code = 'ISO 14001' and fi.code = '7.5')) fi on true
    where d.project_id = '${proj}' and d.doc_code like 'BK-%';
    insert into files (project_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
    select '${proj}', '${proj}/' || d.id || '-fixture.pdf', d.doc_code || '.pdf', 'application/pdf', 1000, ${ADMIN}
    from documents d where d.project_id = '${proj}' and split_part(d.doc_code, '-', 2)::int % 3 <> 0;
    insert into document_versions (document_id, version_no, revision, file_id, received_on, uploaded_by)
    select d.id, 1, 'Rev.00', f.id, current_date - 3, ${ADMIN}
    from documents d join files f on f.storage_key = '${proj}/' || d.id || '-fixture.pdf';
    insert into document_reviews (document_version_id, reviewer_id, status, notes, created_at, reviewed_at)
    select v.id, ${ADMIN},
           case split_part(d.doc_code, '-', 2)::int % 4 when 0 then 'accepted' when 1 then 'revision_required' else 'under_review' end,
           'Bulk review ' || d.doc_code, now() - interval '10 minutes',
           case when split_part(d.doc_code, '-', 2)::int % 4 in (0, 1) then now() - interval '9 minutes' else null end
    from document_versions v join documents d on d.id = v.document_id
    where d.project_id = '${proj}' and split_part(d.doc_code, '-', 2)::int % 5 <> 0;
    insert into issues (project_id, title, finding_type, document_review_id, status, created_by)
    select '${proj}', '${PFX}Bulk finding ' || r.id, 'observation', r.id, 'open', ${ADMIN}
    from document_reviews r join document_versions v on v.id = r.document_version_id join documents d on d.id = v.document_id
    where d.project_id = '${proj}' and d.doc_code like 'BK-%' and r.status = 'revision_required';
    insert into verification_items (project_id, question, priority, document_review_id, created_by)
    select '${proj}', '${PFX}Bulk check ' || r.id, 'medium', r.id, ${ADMIN}
    from document_reviews r join document_versions v on v.id = r.document_version_id join documents d on d.id = v.document_id
    where d.project_id = '${proj}' and d.doc_code like 'BK-%' and r.status = 'accepted';
  `);
}
export { CONSULTANT };
