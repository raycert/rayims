// Phase 7C unit test of lib/documents/bulk-match.ts (deterministic matching + row states). No server, no database.
const M = await import(new URL("../../lib/documents/bulk-match.ts", import.meta.url).href);

let pass = 0;
let fail = 0;
const rec = (ok, m) => { console.log(`${ok ? "PASS" : "FAIL"}  ${m}`); ok ? pass++ : fail++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const doc = (id, o = {}) => ({ id, docCode: null, title: "T", siteId: null, siteName: null, isApplicable: true, latestVersionNo: null, latestFileName: null, latestFileSize: null, hasOpenAssessment: false, ...o });
const D1 = doc("D1", { docCode: "PR-QMS-01", title: "Document Control Procedure", siteName: "Viet Long" });
const D2 = doc("D2", { docCode: "PR-QMS-02", title: "Records Control Procedure" });
const D3 = doc("D3", { docCode: "FM-HR-05", title: "Training Record Form", siteName: "Viet Long" });
const D4 = doc("D4", { docCode: "FM-HR-05", title: "Training Record Form", siteName: "Long An" });
const D5 = doc("D5", { title: "Internal Audit Procedure", siteName: "Viet Long" });
const D6 = doc("D6", { title: "Internal Audit Procedure", siteName: "Long An" });
const D7 = doc("D7", { title: "Quy trình kiểm soát tài liệu" });
const D8 = doc("D8", { title: "Hồ sơ đào tạo" });
const D9 = doc("D9", { docCode: "QP-01", title: "Quality Policy" });
const D10 = doc("D10", { docCode: "QP-01-A", title: "Quality Policy Annex" });
const D11 = doc("D11", { title: "Waste Management Plan" });
const D12 = doc("D12", { title: "Waste Management Plan Annex" });
const D13 = doc("D13", { docCode: "A1", title: "Short Code Document" });
const CAT = [D1, D2, D3, D4, D5, D6, D7, D8, D9, D10, D11, D12, D13];
const m = (name) => M.matchFileName(name, CAT);

// ---- normalization
rec(M.foldText("Đào tạo Quy trình") === "dao tao quy trinh", "foldText folds Vietnamese accents and đ");
rec(M.normalizeCode("PR-QMS-01") === "prqms01" && M.normalizeCode("pr_qms.01") === "prqms01", "normalizeCode ignores case and separators");
rec(M.normalizeWords("PR-QMS_01.v2  final") === "pr qms 01 v2 final", "normalizeWords: separators become single spaces");
rec(M.cleanedStemWords("Document Control Procedure_Rev.03.pdf") === "document control procedure", "cleaned stem: extension and Rev.03 removed");
rec(M.cleanedStemWords("Document Control Procedure 2026-10-01.pdf") === "document control procedure" && M.cleanedStemWords("Document Control Procedure 20261001.pdf") === "document control procedure" && M.cleanedStemWords("Document Control Procedure 01.10.2026.pdf") === "document control procedure", "cleaned stem: ISO, compact and dotted dates removed");
rec(M.cleanedStemWords("Hồ sơ đào tạo 2026.xlsx") === "ho so dao tao 2026", "a bare year is NOT removed (meaningful digits are kept)");

// ---- revision hint
rec(M.revisionHint("QMS-01_Rev.02.pdf") === "Rev.02" && M.revisionHint("QMS-01 Rev02.pdf") === "Rev.02", "revision hint: Rev.02 / Rev02 -> Rev.02");
rec(M.revisionHint("x Revision 3.docx") === "Rev.3" && M.revisionHint("x_V2.pdf") === "V2" && M.revisionHint("x_v2.1.pdf") === "V2.1", "revision hint: Revision 3 -> Rev.3, V2 -> V2, v2.1 -> V2.1");
rec(M.revisionHint("a_rev1_rev2.pdf") === "Rev.2" && M.revisionHint("Div2.pdf") === null && M.revisionHint("Reverse.pdf") === null && M.revisionHint("plain.pdf") === null, "revision hint: the last token wins; words that merely contain rev / v are not hints");

// ---- Document Code
let r = m("PR-QMS-01_rev02.pdf");
rec(r.kind === "auto" && r.reason === "code" && r.documentId === "D1" && r.revisionHint === "Rev.02", "exact unique Document Code -> AUTO (D1), revision hint Rev.02");
rec(m("PR_QMS_01 final.pdf").documentId === "D1" && m("PR_QMS_01 final.pdf").kind === "auto", "code with other separators (PR_QMS_01) -> AUTO");
rec(m("PRQMS01.pdf").documentId === "D1" && m("pr.qms.01-signed.pdf").documentId === "D1", "code written without / with dots -> AUTO");
r = m("PR-QMS-010.pdf");
rec(r.kind === "none", "PR-QMS-010 does not match code PR-QMS-01 (whole tokens only)");
r = m("FM-HR-05.xlsx");
rec(r.kind === "suggested" && r.reason === "code-duplicate" && r.documentId === null && eq(r.candidates.map((c) => c.documentId).sort(), ["D3", "D4"]), "same code on two Sites -> SUGGESTED, no pre-selection, both candidates");
r = m("FM-HR-05 Long An.xlsx");
rec(r.kind === "suggested" && r.documentId === "D4" && r.candidates[0].documentId === "D4" && r.candidates[0].siteHint === true, "site words in the file name rank / pre-select the matching candidate (still SUGGESTED, never AUTO)");
r = m("FM-HR-05 Viet Long.xlsx");
rec(r.kind === "suggested" && r.documentId === "D3", "…the other Site pre-selects the other candidate");
rec(m("QP-01-A_rev1.pdf").documentId === "D10" && m("QP-01-A_rev1.pdf").kind === "auto", "when two codes appear the longest (most specific) wins: QP-01-A -> D10");
rec(m("QP-01.pdf").documentId === "D9" && m("QP-01.pdf").kind === "auto", "QP-01 -> D9 (QP-01-A is not contained)");
rec(m("A1 something.pdf").kind === "none", "a code shorter than 3 characters is never searched for");

// ---- title
r = m("Document Control Procedure_Rev.03.pdf");
rec(r.kind === "suggested" && r.reason === "title" && r.documentId === "D1" && r.revisionHint === "Rev.03", "exact title (Rev suffix removed) -> SUGGESTED, never AUTO");
rec(m("Document Control Procedure 2026-10-01.pdf").documentId === "D1" && m("document-control-procedure_20261001.docx").documentId === "D1", "date suffixes removed for title matching");
r = m("Internal Audit Procedure.pdf");
rec(r.kind === "suggested" && r.reason === "title-duplicate" && r.documentId === null && r.candidates.length === 2, "the same title on two Sites -> SUGGESTED, choose");
r = m("Quy trinh kiem soat tai lieu Rev.02.pdf");
rec(r.kind === "suggested" && r.documentId === "D7" && r.revisionHint === "Rev.02", "Vietnamese title written without accents -> SUGGESTED (D7)");
rec(m("Quy trình kiểm soát tài liệu Rev.02.pdf").documentId === "D7", "Vietnamese title with accents -> SUGGESTED (D7)");
r = m("Hồ sơ đào tạo 2026.xlsx");
rec(r.kind === "suggested" && r.reason === "title-tokens" && r.documentId === "D8", "title words with a year (overlap 4/5 >= 0.8) -> SUGGESTED by word overlap (D8)");
r = m("Waste Management Plan Annex A.pdf");
rec(r.kind === "suggested" && r.reason === "title-tokens" && r.documentId === "D12", "high overlap with exactly one title -> SUGGESTED (D12)");
rec(m("Waste Management Plan.pdf").documentId === "D11" && m("Waste Management Plan.pdf").reason === "title", "exact title wins over a longer similar title (D11)");
rec(m("Waste plan.pdf").kind === "none", "low overlap -> no match");
rec(m("Scan0001.pdf").kind === "none" && m("Random vendor invoice.pdf").kind === "none", "unrelated file names -> NO MATCH");
rec(m("Viet Long notes.pdf").kind === "none" && m("Long An.pdf").kind === "none", "a Site name alone never matches a file");
rec(eq(m("PR-QMS-01_rev02.pdf"), m("PR-QMS-01_rev02.pdf")) && eq(m("Hồ sơ đào tạo 2026.xlsx"), m("Hồ sơ đào tạo 2026.xlsx")), "deterministic: the same input always gives the same result");
rec(M.TOKEN_OVERLAP_THRESHOLD === 0.8 && M.MIN_SHARED_TOKENS === 2 && M.MIN_CODE_LENGTH === 3 && M.MAX_BATCH_FILES === 50, "thresholds are the documented constants (0.8, 2 shared words, 3-character codes, 50 files)");

// ---- batch / duplicates
const F = (name, size = 1000, lastModified = 1, error = null) => ({ key: M.fileKey({ name, size, lastModified }), name, size, lastModified, error });
const files = [F("a.pdf"), F("b.pdf"), F("a.pdf"), F("a.pdf", 1000, 2), F("bad.exe", 10, 1, "This file type isn't supported")];
const d = M.duplicateOf(files);
rec(eq(d, [null, null, 0, null, null]), "the same file selected twice: the later one points at the first (a different lastModified is a different file)");
const mb = M.matchBatch([F("PR-QMS-01.pdf"), F("PR-QMS-01.exe", 5, 1, "unsupported")], CAT);
rec(mb[0].match.kind === "auto" && mb[1].match.kind === "none", "invalid files are not matched");

// ---- row states
const doc2 = (o) => doc("X", { title: "X", ...o });
const row = (file, documentId, o = {}) => ({ file, duplicateOf: null, documentId, accepted: true, included: true, ...o });
const ev = (rows, cat) => M.evaluateRows(rows, cat);
let e = ev([row(F("a.pdf"), "X")], [doc2({})]);
rec(e[0].status === "ready" && e[0].nextVersionNo === 1 && e[0].blocker === null, "Ready: valid file, one Applicable Document, no Version yet -> preview V1");
e = ev([row(F("a.pdf"), "X")], [doc2({ latestVersionNo: 1 })]);
rec(e[0].nextVersionNo === 2, "preview V2 after V1");
e = ev([row(F("a.pdf"), "X")], [doc2({ latestVersionNo: 2 })]);
rec(e[0].nextVersionNo === 3, "preview V3 after V1 + V2");
e = ev([row(F("a.pdf"), "X", { accepted: false })], [doc2({})]);
rec(e[0].status === "needs-review", "a SUGGESTED row stays Needs Review until accepted");
e = ev([row(F("a.pdf"), null)], [doc2({})]);
rec(e[0].status === "unmatched", "no Document -> Unmatched");
e = ev([row(F("a.pdf"), "X", { included: false })], [doc2({})]);
rec(e[0].status === "skipped", "Skip -> Skipped");
e = ev([row(F("a.pdf"), "X")], [doc2({ isApplicable: false })]);
rec(e[0].status === "blocked" && e[0].blocker === M.NOT_APPLICABLE_MESSAGE, "Not Applicable Document -> Blocked (existing wording)");
e = ev([row(F("a.pdf"), "X")], [doc2({ hasOpenAssessment: true, latestVersionNo: 1 })]);
rec(e[0].status === "blocked" && e[0].blocker === "Complete the current Gap Assessment before uploading a new Version.", "open Gap Assessment -> Blocked (existing wording)");
e = ev([row(F("big.pdf", 1, 1, "File must be 10 MB or smaller."), "X")], [doc2({})]);
rec(e[0].status === "blocked" && /10 MB/.test(e[0].blocker), "file-policy error -> Blocked with the policy message");
e = ev([row(F("a.pdf"), "X", { duplicateOf: 0 })], [doc2({})]);
rec(e[0].status === "blocked" && e[0].blocker === M.DUPLICATE_FILE_MESSAGE, "duplicate selected file -> Blocked");
e = ev([row(F("a.pdf"), "X", { accepted: true })], []);
rec(e[0].status === "blocked" && e[0].blocker === M.DOCUMENT_GONE_MESSAGE, "a Document that is not in the catalog -> Blocked");
e = ev([row(F("a.pdf", 10, 1), "X"), row(F("b.pdf", 10, 1), "X")], [doc2({})]);
rec(e[0].status === "conflict" && e[1].status === "conflict" && e[0].blocker === M.CONFLICT_MESSAGE, "two files for one Document -> both Conflict");
e = ev([row(F("a.pdf", 10, 1), "X"), row(F("b.pdf", 10, 1), "X", { included: false })], [doc2({})]);
rec(e[0].status === "ready" && e[1].status === "skipped", "skipping one resolves the conflict");
e = ev([row(F("a.pdf", 10, 1), "X"), row(F("b.pdf", 10, 1), "X", { documentId: "Y" })], [doc2({}), doc("Y", { title: "Y" })]);
rec(e[0].status === "ready" && e[1].status === "ready", "reassigning one resolves the conflict");
e = ev([row(F("a.pdf", 10, 1), "X"), row(F("b.pdf", 10, 1, "unsupported"), "X")], [doc2({})]);
rec(e[0].status === "ready" && e[1].status === "blocked", "a blocked row does not make its Document's other row a conflict");
e = ev([row(F("Procedure.pdf", 2048), "X")], [doc2({ latestVersionNo: 1, latestFileName: "Procedure.pdf", latestFileSize: 2048 })]);
rec(e[0].status === "ready" && e[0].warning === M.SAME_AS_CURRENT_WARNING, "same file name and size as the current Version -> warning only, still Ready");
e = ev([row(F("Procedure.pdf", 2049), "X")], [doc2({ latestVersionNo: 1, latestFileName: "Procedure.pdf", latestFileSize: 2048 })]);
rec(e[0].warning === null, "a different size is not warned about");
const s = M.summarize(ev([row(F("a.pdf", 1, 1), "X"), row(F("b.pdf", 2, 1), "Y", { accepted: false }), row(F("c.pdf", 3, 1), null), row(F("d.pdf", 4, 1), "Z", { included: false }), row(F("e.pdf", 5, 1, "bad"), "X")], [doc2({}), doc("Y", { title: "Y" }), doc("Z", { title: "Z" })]));
rec(s.ready === 1 && s.needsReview === 1 && s.unmatched === 1 && s.skipped === 1 && s.blocked === 1 && s.conflicts === 0, `summary counts (${JSON.stringify(s)})`);
rec(M.documentLabel(D1) === "PR-QMS-01 · Document Control Procedure · Viet Long" && M.documentLabel(D7) === "Quy trình kiểm soát tài liệu · Project-wide", "Document label: code · title · site (Project-wide when none)");

// ---- performance: 50 files against 300 Documents
const big = Array.from({ length: 300 }, (_, i) => doc(`B${i}`, { docCode: `DOC-${String(i).padStart(3, "0")}`, title: `Procedure number ${i} for process control ${i % 17}`, siteName: i % 3 ? "Viet Long" : null }));
const names = Array.from({ length: 50 }, (_, i) => (i % 3 === 0 ? `DOC-${String(i * 5).padStart(3, "0")}_rev${i % 4}.pdf` : i % 3 === 1 ? `Procedure number ${i} for process control ${i % 17}.pdf` : `unrelated file ${i}.pdf`));
const t0 = performance.now();
const out = M.matchBatch(names.map((n, i) => F(n, 1000 + i, i)), big);
const ms = performance.now() - t0;
console.log(`INFO  matching 50 files against 300 Documents took ${ms.toFixed(1)} ms (${out.filter((o) => o.match.kind === "auto").length} auto, ${out.filter((o) => o.match.kind === "suggested").length} suggested, ${out.filter((o) => o.match.kind === "none").length} none)`);
rec(ms < 1000, "matching 50 files against 300 Documents is far below a second");

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
