# 04 — Business Rules

Product behavior that the schema and UI must respect. Database details are in
`03_DATABASE.md`; decisions are in `07_DECISIONS.md`.

## Workflow

- **BR-01** Document Review and Site Visit have **no mandatory fixed order**.
  Internal-audit style (review → preparation → audit → findings) and
  implementation style (training → assessment → review → improvement →
  follow-up) must both be supported. The roadmap's implementation order does not
  imply a product order.
- **BR-02** A site visit is an activity with `mode = on_site`. There is no
  separate visit entity.

## Projects, sites and frameworks

- **BR-03** A client may have multiple projects. A project may have one or more
  sites, one or more frameworks and multiple activities, documents, issues and
  actions.
- **BR-04** Sites are reusable client-level entities. A project uses a subset of
  its client's sites through `project_sites`.
- **BR-05** A site must belong to the project's `project_sites` scope when used by
  project work entities (activities, documents, verification items, issues,
  actions).
- **BR-06** Project-wide work has no site (`site_id` is NULL). This applies to
  activities, documents, verification items, issues and actions.
- **BR-07** A project may use multiple frameworks (`project_frameworks`).
  Framework definitions are shared, never duplicated per project.
- **BR-08** Each framework edition is a separate framework (e.g. ISO 14001:2015
  and a later edition coexist).
- **BR-09** Framework items are client-independent reference data. They never
  hold client-specific values, operational data or per-project state.
- **BR-10** Framework items are not assumed to be ISO clauses; an item may be a
  clause, requirement, scope, category, topic, indicator group, emission
  category or verification area.

## Activities

- **BR-11** Activities may be project-wide (no site) or site-specific.
- **BR-12** Activity type (`activity_type_id`) is Admin-configurable reference data
  enforced by a database FK to `activity_types` (ADR-017), not free text. Modes:
  on-site, online (CHECK). Statuses: Planned, In Progress, Completed, Cancelled
  (CHECK).
- **BR-13** The Activity Summary (`work_performed`, `summary`, `next_steps`,
  `client_participants`) is recorded on the activity and feeds the Activity Report (Phase 6B).
- **BR-148** *(Phase 6B)* **Activity Summary semantics** (consultant-authored; never generated):
  **Work Performed** = what was actually carried out; **Consultant Summary** (`summary`) = the
  consultant's overall conclusion for the Activity — not a Finding digest, approval comment, client
  acceptance or sign-off; **Next Steps** = recommended / agreed next steps (not generated from Actions);
  **Client Participants** = free text, names and roles of client attendees / coordinators (no contacts,
  no participant records, no attendance). Each field is optional, trimmed, blank → NULL.
- **BR-149** *(Phase 6B)* The Activity Summary is edited in its own **Edit Activity Summary** drawer
  (only the four fields); **Edit Activity** edits identity, schedule and Plan only — neither surface
  writes the other's fields. Allowed in every Activity status (Planned, In Progress, Completed,
  Cancelled — no report-specific lock) by Admin and Consultant alike. Saving changes nothing else: no
  status change, no Finding / Action / Verification / Evidence. There is no report status, version,
  submission, review, approval or sign-off — RayIMS V1 is consultant-operated. The fields create no
  reference, so Activity delete rules are unchanged.
- **BR-150** *(Phase 6C)* **Activity Report = Activity metadata + the Activity Summary narrative +
  data derived from the Activity's records, always rendered from the CURRENT state** (a Finding closed
  after the visit shows as Closed). No report table, snapshot, status, version, approval or sign-off;
  the exported file (Phase 6D) is the point-in-time copy. All inclusion, de-duplication and ordering
  rules live in ONE place — `lib/reports/activity-report.ts` (`assembleActivityReport`), fed by
  `getActivityReportData` — and the export must reuse it (never re-implement the rules).
- **BR-151** *(Phase 6C)* **Verification in an Activity Report:** *executed here* =
  `verified_activity_id = A` with a result — counted by result (Verified OK, Issue Identified, Follow-up
  Required) whatever Activity it was planned for; *planned, not completed* = `target_activity_id = A`
  without a result (separate count); *completed in another activity* = `target_activity_id = A` with a
  result executed elsewhere (count only — never a result here). Only executed-here checks with Issue
  Identified / Follow-up Required are listed (question, requirement, result, notes, F-nnn references);
  Verified OK is counted, not listed, and never turned into "positive observations".
- **BR-152** *(Phase 6C)* **Findings in an Activity Report:** `issues.activity_id = A` only, ordered by
  Finding number — a Finding created from a check already carries the executing Activity, so there is
  no second path and no double count; a Finding without an Activity is never inferred into a report
  (no site / framework / date matching). Shown: number, type, title, description, requirement, site,
  priority, status — not the NC response or effectiveness. **Actions:** `actions.activity_id = A` ∪
  Actions of those Findings, **de-duplicated by Action id**; open (Open / In Progress / Pending Review)
  first, then by due date (undated last), description; Closed last; the existing Overdue rule.
- **BR-153** *(Phase 6C)* **Evidence in an Activity Report:** attachments of the Activity, of its
  report checks (executed here or planned here and pending), of its report Findings and of its report
  Actions — each attachment has one parent, so it is counted once; rows of another project are never
  included. **Metadata only, no images** (file name, caption, what it is attached to); View / Download
  use the usual on-click 60 s link.
- **BR-154** *(Phase 6D, ADR-020)* **Export Report** on Activity Detail downloads the Activity Report as an
  editable **.docx**, generated on demand on the server from the **same ActivityReport model** the screen
  shows (`getActivityReportData` → `assembleActivityReport`; the generator `lib/reports/activity-report-docx.ts`
  only lays it out). Only the route ids (and the viewer's time zone, for formatting) come from the
  browser. Admin and Consultant alike; signed out → login; an Activity of another project → 404. Nothing
  is written: no report record, export history, stored copy, status, version or approval — the
  downloaded file is the point-in-time copy (RayIMS does not keep it), the screen stays current state.
- **BR-155** *(Phase 6D)* DOCX content and order: title "{Activity Type label} Report" (no "Report Report");
  1 Project / Activity Information (client, project, activity, type, site or Project-wide, mode, date /
  period, consultant, status, client participants — empty values left out), 2 Objectives & Scope,
  3 Work Performed, 4 Verification Summary (counts; optional counts only when non-zero; table of the
  Issue / Follow-up checks with requirement, question, result, notes, F-nnn), 5 Findings (No., Type,
  Framework Requirement, Finding = title + description, Site, Priority, Status — no NC response),
  6 Actions / Follow-up (Action, Related Finding F-nnn or "—", Owner, Due Date, Priority, Status;
  overdue → "Open — Overdue"), 7 Evidence (Origin, Attached to, Caption, File — metadata only, no images
  or links), 8 Consultant Summary, 9 Recommendations / Next Steps. Empty sections show one line (same
  wording as Activity Detail). Consultant text keeps its line breaks; nothing is translated. File name
  `RayIMS-{Type}-Report-{Project}-{YYYYMMDD of the Activity start date}-{Site|Project-wide}.docx` (no ids,
  accents removed, unsafe characters collapsed).
- **BR-61** The Master Plan is not a database table. It is the Project Workspace's
  Plan view over that project's `activities`, always scoped to one `project_id`; there
  is no global cross-project activities list in V1 (Phase 3B-1).
- **BR-62** Activity date/time: `start_date`/`end_date` record the planning date(s);
  `start_time`/`end_time` (nullable, Phase 3B-1) record time-of-day within a single
  day and order same-day activities; `planned_days` separately records planned
  consulting effort/duration and is never derived from, or used to derive, the times.
  A multi-day activity does not use times.
- **BR-63** An activity is overdue (derived, never stored) when its effective end date
  (`end_date` if set, else `start_date`) is before today and its status is not
  `completed` or `cancelled` — the same derivation principle as BR-34 for actions; `today` is the
  viewer's local calendar day (BR-158).
- **BR-64** Activity date/time validation (Phase 3B-2, server-authoritative — never a
  raw database error): `start_time` requires `start_date`; `end_time` requires some
  date context (`start_date` or `end_date`); when both dates are set, `end_date >=
  start_date`; when the effective end date equals `start_date` (a same-day activity)
  and both times are set, `end_time` must be after `start_time`; a multi-day activity
  (`end_date` differs from `start_date`) never compares times across days.
  `planned_days`, when supplied, must be greater than 0.
- **BR-65** An Activity's `activity_type_id` picker offers only `is_active = true`
  types on create; an inactive type can never be newly selected (create or edit).
  On edit, an Activity's *current* type stays visible/selectable even if it has since
  been deactivated, clearly marked inactive — no other inactive type is ever offered.
  Enforced server-side independent of the picker (ADR-017).
- **BR-66** Activity Detail visually separates **Plan** (`objectives`, `planned_work`
  — the intended work) from **Outcome / Activity Summary** (`work_performed`, `summary`,
  `next_steps`, `client_participants` — what actually happened; Phase 6B). Outcome fields are editable at any time,
  with no restriction tied to the activity's date or status — a consultant may draft
  outcome text before or after the planned date (Phase 3B-2).
- **BR-67** Activities follow the same authorization model as Clients/Projects/Sites,
  not the Framework Administration admin-only model (ADR-016 does not apply here):
  Admin and Consultant have identical full CRUD (create, edit, reassign consultant,
  change status) on any Activity in any project (BR-42). An Activity's `project_id`
  is always taken from trusted route context, never from form input; a request naming
  one project can never read or mutate an Activity belonging to another (Phase 3B-2).
- **BR-68** Activity status changes are manual only; no date or time automatically
  changes a status. Any status may follow any other (e.g. `completed → in_progress`,
  `cancelled → planned`) — V1 has no transition matrix and no workflow engine.
  Activity Detail's one quick status control is the single interaction for
  Planned/In Progress/Completed; **Cancel** (`status = cancelled`) is its own
  explicitly labeled, confirmed action, not offered a second way (Phase 3B-3).
  *(Phase 4E.6)* An Activity has **one current status**: Activity Detail shows it once, as a
  single "Status:" select (not a badge plus three tab-like buttons). Changing it never changes
  which sections are shown — Plan, Verification, Activity Evidence and Outcome / Activity Summary
  always stay visible, in that order. *(Phase 4F)* The Activity-level evidence section is titled
  **General Activity Evidence** ("Files or photos for this activity that are not linked to a
  specific verification check."); evidence on a verification card or Action is unchanged.
- **BR-69** Cancel means `status = cancelled`. It is not delete: identity, schedule,
  Plan, Outcome and every reference to the Activity are preserved unchanged. A
  cancelled Activity remains in the Master Plan (searchable, filterable, openable,
  visually de-emphasized only) and may later be changed back to any other status
  through the normal status control — no `cancelled_at`, no irreversible model
  (Phase 3B-3).
- **BR-70** An Activity may be deleted only while **unreferenced**. Referenced means:
  targeted by `verification_items.target_activity_id`, completed-in via
  `verification_items.verified_activity_id`, the origin of an `issues.activity_id` or
  `actions.activity_id`, or carrying an `attachments.activity_id`. This is an
  application-level check performed *before* the delete runs — never inferred from
  the database's own FK behavior, since `attachments.activity_id` is `ON DELETE
  CASCADE` and would otherwise silently remove evidence. A blocked delete shows a
  friendly business message directing the user to Cancel instead, never a raw FK/DB
  error (Phase 3B-3).
- **BR-71** Project Workspace Overview's "Upcoming Activities" shows at most 3
  activities where `status NOT IN (completed, cancelled)` and `start_date >= today`,
  ordered `start_date → start_time → name`. Undated activities are never "upcoming".
  A compact empty state is shown when none qualify (Phase 3B-3).

## Documents and reviews

- **BR-14** A document is a logical record; each uploaded file is a document
  **version**. Documents may be project-wide or site-specific.
- **BR-15** A document with no versions is a valid expected document with derived
  status **Not Received**.
- **BR-16** One document may map to multiple framework items (including items of
  different frameworks). The mapping is at document level, not version level.
- **BR-17** The latest version of a document is the one with the highest
  `version_no`.
- **BR-18** A review applies to a **document version**. A version may have more
  than one review record; the V1 UI may initially expose a simple/latest-review
  workflow.
- **BR-19** Stored review statuses: Under Review, Revision Required, Accepted.
  *Not Received*, *Received* and *N/A* are never stored on reviews.
- **BR-19a** Review timestamps: `created_at` is when the review record was
  created (and orders review records); `updated_at` is when it was last modified;
  `reviewed_at` is when it reached a completed outcome. While Under Review,
  `reviewed_at` may be empty; when the status becomes Revision Required or
  Accepted, `reviewed_at` should be populated.
- **BR-20** **Document current status is derived, not duplicated** (see
  `03_DATABASE.md`, "Document status derivation"):
  N/A if the document is not applicable; else Not Received if no version; else
  Received if the latest version has no review; else the status of the latest
  review record for the latest document version. "Latest review record" is the
  one with the most recent `created_at`: `under_review` → Under Review,
  `revision_required` → Revision Required, `accepted` → Accepted.
- **BR-21** From a review, the consultant may **create an issue** or **add to
  site verification**. *(Phase 5 review)* Both are **explicit** actions (Phase 5D, approved):
  a review result never creates a Finding or a Verification item on its own. Review Evidence
  (attachments on a review) is **backlog**.
- **BR-113** *(Phase 5A)* A **Document** is the logical controlled document (e.g. "Document
  Control Procedure"), never an uploaded file; files belong to Versions (Phase 5B). Identity:
  **Title** (required, trimmed), optional **Document Code** (`doc_code`, free text, **not
  unique** — duplicates only show a non-blocking hint), optional **Document Type** and **Owner**
  (free text; Owner is the client-side owner, not a user). No description, department,
  required/optional flag or due date in V1.
- **BR-114** *(Phase 5A)* A Document is **Project-wide** (`site_id` NULL) or **site-specific**;
  the site must be in the project's scope (validated on the server and by the
  `(project_id, site_id)` FK).
- **BR-115** *(Phase 5A)* **Applicable** (`is_applicable`, default true). Unticking it makes the
  derived status **Not Applicable**; nothing is deleted and it can be switched back at any time
  (status recomputes; mappings, versions and reviews are kept). No N/A reason in V1. Approved for
  later slices: while Not Applicable, **new Versions and Reviews are refused** (existing history
  stays visible).
- **BR-116** *(Phase 5A)* **Framework Requirements** are mapped at Document level
  (`document_framework_items`, 0..N, across Frameworks) in the Document create / edit form.
  **New** mappings must belong to a Framework currently assigned to the project (server-checked);
  a mapping to a Framework that is later unassigned stays visible as "(not currently assigned)"
  and may be kept or removed, but no other item of that Framework can be added.
- **BR-117** *(Phase 5A)* **Document status is derived only** — from the `document_register` view
  (BR-20). UI labels: Not Applicable, Not Received, Received, Under Review, Revision Required,
  Accepted. A registered document with no version is **Not Received**.
- **BR-119** *(Phase 5B)* A **Version** is one received / uploaded revision of a Document with exactly
  one file. It is **immutable**: file, revision label, received-on date, notes, uploader and time are
  never edited or replaced. A wrong upload is deleted (while eligible, BR-121) and uploaded again; a
  changed file is always a **new** Version.
- **BR-120** *(Phase 5B)* `version_no` is the internal sequence, **assigned by the server** as
  max + 1 and shown as **V1, V2, …**; the optional **Revision** is the client's own label
  (e.g. "Rev.01", "Draft B"), shown as "V2 · Rev.01" and never used for ordering. The **Current**
  version is the highest `version_no` (BR-17). If two uploads race, the server retries once; if it
  still conflicts: "Another version was uploaded at the same time. Please try again." **Received on**
  (optional) is when the client provided it — never copied from the upload time. Version files: PDF,
  DOC/DOCX, XLS/XLSX, PPT/PPTX only (no images, no text), ≤ 10 MB (browser, server on the real stored
  size, and bucket). Uploading a Version makes the derived status **Received** (BR-20).
- **BR-121** *(Phase 5B)* **Controlled Version delete** — only when the Version is the **latest**, has
  **no review** and the Document is **Applicable**. Blockers: "Only the latest unreviewed version can
  be deleted." / "This version has review history and cannot be deleted." / "This document is Not
  Applicable. Make it Applicable before changing version history." Deleting removes the version row,
  its `files` row and the stored object; older versions are never renumbered, so the next upload may
  reuse the deleted (never-reviewed) number. While **Not Applicable**, uploads are refused
  ("Versions cannot be uploaded while this document is Not Applicable.") and existing versions stay
  visible (BR-115).
- **BR-122** *(Phase 5C)* **Gap Assessment** is the UI name for a review of a Version
  (`document_reviews`, table not renamed). Mental model: the **Document** is the required / expected
  controlled document, a **Version** is a file the client supplied, a **Gap Assessment** is the
  consultant's evaluation of that Version against the Document's mapped Framework Requirements (shown
  as context; nothing is copied onto the review). Results: **Under Review** (started, not concluded,
  `reviewed_at` NULL), **Revision Required** (the Version does not fully meet the requirements),
  **Accepted** (acceptable for this assessment — never "Approved"). Consultant feedback is **Review
  Comments** (`notes`, blank → NULL).
- **BR-123** *(Phase 5C)* Assessments start only on the **current (latest) Version** of an
  **Applicable** Document that has a Version ("This version is no longer current. Review the current
  version instead."; "Gap Assessments cannot start while this document is Not Applicable."), and a
  Version has **at most one open (Under Review) assessment** ("A Gap Assessment is already open for this
  version."). All enforced on the server on fresh data. Older Versions and N/A Documents keep their
  history visible, read-only.
- **BR-124** *(Phase 5C)* An open assessment's Review Comments may be edited; it is **completed** once,
  choosing Revision Required or Accepted (no default), which sets `reviewed_at` = server time and
  `reviewer_id` = the **concluding** user (the starter until then). A **concluded assessment is
  immutable** — no edit, no result change, **no delete** (open ones are not deleted either; no cancel
  status). A different conclusion on the same file is a **new assessment** on the same current Version
  (e.g. Revision Required → clarification → Accepted); a **changed file** is a new Version, which starts
  with no assessment (status **Received**) — the old result is never carried forward.
- **BR-125** *(Phase 5C)* Derived status (BR-20) follows the **latest review of the latest Version**,
  ordered **created_at DESC, id DESC** everywhere (never by `reviewed_at`). The register's **Last
  Review** is the most recent **concluded** assessment (`reviewed_at`) of the latest Version — an open
  assessment does not hide it; "—" when none is concluded. Review Comments are shown on Document
  Detail only (not in the register, not searched). *(Phase 5G note)* The `document_register` view
  orders by `created_at DESC` only (no id tie-break); the app adds `id DESC`. They can differ only for
  two assessments of one Version with an identical `created_at` (microseconds), which the app cannot
  produce (a new assessment needs the previous one concluded; simultaneous starts are reconciled,
  BR-140). Adding the tie-break to the view is hardening backlog (needs a migration).
- **BR-126** *(Phase 5C)* **Review result ≠ Finding and ≠ Verification item:** Revision Required creates
  neither; they are separate, explicit actions (Phase 5D). Any review (open or concluded) blocks
  deleting its Version (BR-121). **Backlog / design follow-up:** "Expected Records / Required Evidence"
  per Document (what records must exist) — not stored in Review Comments; to be designed separately.
- **BR-127** *(Phase 5D)* A concluded Gap Assessment (**Revision Required or Accepted** — Accepted may
  still warrant an Observation, an OFI or an onsite check) may lead to follow-up, **only by explicit
  user action**: **Create Finding** (a gap the document already shows) or **Add to Verification** (needs
  onsite confirmation). New follow-up is allowed only from the **latest assessment of the current
  Version** of an **Applicable** Document; an Under Review assessment, an earlier assessment of the same
  Version, any assessment of an older Version and any assessment of a Not Applicable Document cannot
  create new follow-up ("Follow-up cannot be created while this document is Not Applicable."); their
  existing links stay visible, read-only. 0..N
  Findings and 0..N Verification items per assessment. Creating or deleting follow-up never changes the
  review (immutable) or the Document status; Finding and Verification lifecycles stay independent
  (Accepted does not close a Finding; a new Revision Required does not reopen one).
- **BR-128** *(Phase 5D)* **Review → Finding:** the existing Finding form, with the origin shown
  (Document, Version, result). `issues.document_review_id` = the review (server-derived, immutable),
  `verification_item_id` = NULL. Prefill: Description ← Review Comments; Title blank; **Finding Type blank
  (never derived from the result)**; Priority Medium; no Activity (optional, never inferred). Finding
  Detail shows "Created from Document Gap Assessment" with a link back to the Document.
- **BR-129** *(Phase 5D)* **Review → Verification Item:** the existing Verification planning form
  ("Add to Verification"); `verification_items.document_review_id` = the review; planning fields only
  (result, notes, verified_* stay empty); Check blank; Priority Medium; Target Activity chosen by the
  user (optional, as in 4A; a site-specific Target Activity fixes the site, BR-73). The check then
  follows the normal Verification workflow; a Finding created from it links to the **Verification**
  (`verification_item_id`), not to the review — the lineage is Review → Verification → Finding.
- **BR-130** *(Phase 5D)* Follow-up **site**: a site-specific Document fixes the site (server-enforced,
  also on later edits; Activity choices limited to project-wide or same-site Activities); a Project-wide
  Document defaults to Project-wide and allows any project site. **Framework Requirement** (optional):
  exactly one mapped item → prefilled; several → none preselected, the Document's mapped items listed
  first, then the project's assigned items; none → the project's assigned items. The server accepts any
  assigned item or any of the Document's mapped items (historical mappings stay valid).
- **BR-131** *(Phase 5E)* **Required Document Excel Import** creates the project's **required document
  register** only: one logical Document per document identity, starting **Not Received** (or **Not
  Applicable**). It never imports files, versions, Gap Assessment results, Findings, Verification items
  or evidence — those follow the normal lifecycle afterwards. .xlsx only, ≤ 2 MB, ≤ 500 data rows (over
  the limit = file-level error, never truncated); parsed on the server (formulas are read for their
  stored value only, never evaluated).
- **BR-132** *(Phase 5E)* Columns (canonical template headers): **Framework**, **Framework Requirement**,
  **Required Document** (required), **Document Code**, **Document Type**, **Owner**, **Site**, **Applicable**, and since
  Phase 7D the optional **Expected Records** (BR-173). Accepted aliases: Clause / Clause / Requirement / Requirement (= Framework Requirement), Document
  Required / Required Documents (= Required Document), PIC (= Owner). Unknown columns are ignored; a
  missing Required Document column or two columns read as the same field are file-level errors. The
  "Required Documents" sheet is read, otherwise the first sheet. Site: blank = Project-wide, otherwise an
  exact (case-insensitive) name of a site in the project's scope. Applicable: Yes / No / Y / N / True /
  False, blank = Yes. Framework + Framework Requirement: both or neither; the Framework is its identity
  (e.g. ISO 14001:2015) and must be assigned to the project; requirement codes must exist exactly in the
  Framework Library (nothing guessed — e.g. 7.5.2 is refused when the library stops at 7.5). Several codes
  of ONE framework: separated by ";" (6.1; 8.1).
- **BR-133** *(Phase 5E)* **Identity = normalized title + site.** Rows with the same identity become ONE
  Document: their requirements are merged (this is how one document maps to several frameworks — repeat
  the row per framework); blank cells inherit, different non-blank values are an error. A Document that
  already exists in the project with that identity is **skipped, never updated** (import is create-only).
  Repeated Document Codes are a warning (codes are not unique). Merges, skips and repeated codes are
  **warnings that must be confirmed**; any **error blocks the whole import** (nothing is written).
- **BR-134** *(Phase 5E)* Import re-parses and re-validates the file against the project's current state
  (sites, assigned frameworks, items, existing documents); if errors appear, or the warnings differ from
  the ones confirmed, nothing is written and the new preview is shown. Writes: one bulk insert of
  Documents, then one bulk insert of their Framework mappings; if the mappings fail the new Documents are
  deleted again. Result: "Imported: X Documents · Skipped existing: Y · Warnings: Z".
- **BR-135** *(Phase 5F)* **Gap Assessment Excel export** is a read-only, consultant / client-facing register
  of the **whole** project (not the filtered screen): "Export Excel" on the Documents register downloads
  `RayIMS-Gap-Assessment-{Project}-{YYYYMMDD}.xlsx` (project name without accents / invalid characters,
  server date). Admin and Consultant alike; signed-out requests are redirected, unknown projects are 404. Since Phase 7D
  it also carries the Document's Expected Records (BR-174).
  The server loads current data itself — nothing is taken from the browser — and writes nothing.
- **BR-136** *(Phase 5F)* **Row grain:** one row per **Document × Framework Requirement**; a Document with
  several mappings repeats its current state and follow-up counts on every row (counts are never divided); a
  Document without mappings is one row with blank Framework / Requirement. Order: Framework (natural) →
  requirement code (natural: 9.1 before 10.2) → Site (Project-wide first) → Required Document; unmapped
  Documents last. Columns: Framework, Framework Requirement ("7.5 — Documented information"), Required
  Document, Document Code, Document Type, Site ("Project-wide" or the site name), Owner, Applicable (Yes /
  No), Current Version (V2), Current Revision, Current File (original name), Received On, Gap Assessment
  Status, Review Comments, Reviewed By, Last Review, Findings, Verification Items, Follow-up Summary. Human
  labels only: no ids, storage keys, URLs or enum values. Dates are Excel dates (dd/mm/yyyy).
- **BR-137** *(Phase 5F)* **Current-state semantics:** Status is the `document_register` view's derived
  status; Review Comments and Reviewed By come from **the same review that decides the status** (latest
  review of the LATEST version, created_at DESC) — a new version without an assessment shows Received with
  blank comments, never the previous version's comments. Reviewer = display name → email → "Unknown user".
  Last Review keeps the register rule (latest **concluded** review of the latest version), so Under Review
  may show an earlier Last Review date. A Not Applicable Document keeps its latest file / review metadata.
- **BR-138** *(Phase 5F)* **Follow-up counts** are the Document's **history**: Findings and Verification
  items created **directly** from any assessment of any version (`issues.document_review_id`,
  `verification_items.document_review_id`). A Finding raised later from a review-origin Verification item
  links to that item (BR-129) and is **not** counted as a direct Finding. Summary text: "2 Findings (1 Open) ·
  3 Verification Items (2 Pending)" (Pending = no result yet); blank when there is no follow-up. A second
  "Summary" sheet shows project, client, export time and document counts by status, open Findings and
  pending Verification items.
- **BR-139** *(Phase 5G)* **No new Version while an assessment is open:** "Upload New Version" is refused
  while the current Version has an open (Under Review) Gap Assessment — "Complete the current Gap
  Assessment before uploading a new Version." (button disabled with that text; enforced on the server
  when the upload is prepared and again when it is registered, which then removes the uploaded object).
  Otherwise the open assessment would be left on an older Version where it can never be completed.
- **BR-140** *(Phase 5G; database-enforced since Phase 7B, BR-162)* **One open assessment per Version — simultaneous starts:** the rule was
  app-enforced (no database constraint) and two simultaneous "Start Gap Assessment" requests could both
  pass the check (reproduced). After inserting, the server reconciles: if more than one assessment is
  open on the Version, the earliest (created_at, id) is kept and the others — just started, without
  comments, follow-up or evidence — are removed; the losing request reports "A Gap Assessment is
  already open for this version." Concluded assessments are never touched.
- **BR-141** *(Phase 5G)* **Import header row:** the header is searched in the **first 10 rows** of the
  sheet (client workbooks often have a title / project banner above the table): the row with a Required
  Document column (or alias) and the most recognized headers, the earliest on a tie. Rows above it are
  ignored; preview row numbers are the sheet's own. No such row → 'No "Required Document" column was
  found in the first 10 rows of the … sheet.'
- **BR-142** *(Phase 5G)* **Review dates are the viewer's local calendar day** everywhere: Document
  Register "Last Review", Document Detail and the Excel export (the export uses the time zone the
  browser sends — formatting only; unknown → UTC — for Last Review, the Summary's export time, shown
  with its zone, and the file-name date). Plain dates (Received On) are shown as entered.
- **BR-143** *(Phase 5G)* **Large projects:** every register / export / import-catalog read is paged
  with an exact row count, so no response cap (PostgREST `max_rows`, whatever its hosted value) can
  silently cut a list; long id lists are never sent in one URL (import compensation deletes in batches
  of 100).
- **BR-118** *(Phase 5A)* **Controlled Document delete:** only a Document with **no Versions**.
  Its Framework mappings are removed with it (setup data); versions, files and reviews are never
  cascade-deleted by the application — "This document has versions and cannot be deleted." Since Phase 7B the
  database also refuses the delete (BR-163).

## Verification

- **BR-22** A verification item may originate from a document review
  (`document_review_id` set) or be created manually (NULL).
- **BR-23** A verification item may be unscheduled (backlog), or scheduled to a
  target activity.
- **BR-24** **Planned target and actual context are separate.** An item
  scheduled for Activity A (`target_activity_id`) may be verified during
  Activity B (`verified_activity_id`). Both are retained. There is no workflow
  engine.
- **BR-25** A verification item is pending while it has no result. Results:
  Verified OK, Issue Identified, Follow-up Required.
- **BR-26** `verified_activity_id`, `verified_by` and `verified_at` describe how
  the item was completed. While the result is empty, `verified_activity_id`
  should normally be empty; when a result is recorded through an activity,
  `verified_activity_id` should identify that activity. It must never be used as
  a substitute for `target_activity_id`.
- **BR-26a** The application validates that a verification item's target and
  verified activities belong to the same project as the item.
- **BR-27** Result *Issue Identified* can lead to a Finding (an `issues` row) that references
  the verification item — created only by an explicit user action, never automatically
  (BR-91). The item does not store the issue.
- **BR-28** Result *Follow-up Required* leads to carrying the item over to a
  later activity as a new item whose `follows_item_id` references the original.
- **BR-72** Planning fields (`question`, `priority`, `site_id`, `target_activity_id`,
  `framework_item_id`) and execution fields (`result`, `notes`,
  `verified_activity_id`, `verified_by`, `verified_at`) are edited through separate
  mutations (`updateVerificationItem` and `recordVerificationResult`, Phase 4A/4B).
  Neither mutation reads or writes the other's fields, even if a tampered request
  includes them — a planning edit never touches execution data and vice versa.
  Execution does not mutate `site_id` or `framework_item_id` either: recording a
  result in a different-site or unassigned-framework context never rewrites the
  item's planning scope (BR-73/74 continue to apply unchanged during execution).
- **BR-73** If a verification item's `target_activity_id` refers to a **site-specific**
  Activity, `site_id` must equal that Activity's site — enforced server-side, not only
  by the picker. If the target Activity is **project-wide** (`site_id` NULL), the
  item's site is freely chosen (project-wide or any site in the project's scope).
  Removing or changing the Target Activity never silently clears an already-set
  `site_id`; the user's last valid site choice is preserved until they change it.
- **BR-74** `framework_item_id` must belong to a Framework currently assigned to the
  project (`project_frameworks`) when **newly selected**. An existing item whose
  Framework Item's Framework has since been unassigned keeps its current mapping
  (shown, editable-away, never silently cleared) — the same historical-preservation
  principle as ADR-017's inactive Activity Type handling — but that no-longer-assigned
  item is never offered to a *different* record as a new choice.
- **BR-75** Recording a Verification result (Phase 4B) requires an explicit Result —
  a Save with no Result selected is rejected with a friendly error; a pending item
  (`result IS NULL`) is never advanced by anything other than an explicit choice.
  `verified_activity_id`, `verified_by` and `verified_at` are always server-derived
  (the current route's Activity, the session user, the server clock) — never accepted
  as client input, so a request can't backdate a result or attribute it to someone
  else. Re-recording a result (Review/Edit) overwrites the previous result,
  notes, `verified_by` and `verified_at` in place; there is no verification
  history/version table in V1.
- **BR-76** An item may be executed from Activity X only when it is genuinely related
  to X (`target_activity_id = X` or `verified_activity_id = X`) **and** not already
  verified during a *different* activity. An item already completed during Activity B
  can never be re-attributed to Activity A through the execution mutation — enforced
  both by Activity Detail not offering that action and independently server-side.
  Viewing it from Activity A shows it read-only for traceability only ("Completed in
  another activity"); it remains fully editable from Activity B.
- **BR-77** Recording *Issue Identified* or *Follow-up Required* only records the
  Verification result — it does **not** automatically create an Issue, an Action, a
  new Verification Item, or a follow-up Activity. `follows_item_id` remains unused by
  execution. Verification → Issue is Phase 4C.
- **BR-78** Verification Excel import (Phase 4B.5) is **planning-only bulk creation**
  from an `.xlsx` workbook. The data sheet `Verification Items` has exactly six
  supported columns — `Check / Question`, `Priority`, `Site`, `Target Activity`,
  `Framework`, `Framework Item` — matched by header text (case-insensitive, trimmed,
  any order; extra columns ignored; all six headers required). Import never carries
  `result`, `notes`, `verified_activity_id`, `verified_by` or `verified_at`, never
  accepts `created_by` (always the signed-in user), and never creates a Document,
  Evidence, file or attachment: the workbook is transient input and is never stored.
  Imported rows are ordinary `verification_items` (edit, execute, and — in Phase 4F —
  delete exactly like manually created ones). Blank Priority = Medium; Priority
  accepts Low/Medium/High case-insensitively.
- **BR-79** A workbook refers to a Target Activity by its human-readable **identity**,
  built by one shared composer (never a display formatter, never a UUID, never the
  name alone): `YYYY-MM-DD | HH:MM | Site | Name`, omitting `| HH:MM` when the
  Activity has no time; `Undated | Site | Name` when it has no date; the Site slot
  reads `Project-wide` for a project-wide Activity. Only harmless whitespace around
  each `|` part is normalized. No match = *Unknown Target Activity*; two or more
  matches = *Ambiguous Target Activity* — never guessed.
- **BR-80** Site is resolved by case-insensitive exact name among the **project's own**
  sites only (`project_sites`): none = *Unknown Site*, two different sites with the
  same name = *Ambiguous Site*. A site-specific Target Activity with a blank Site
  **infers** that Activity's site (BR-73); an explicit Site that differs from it is an
  error. A project-wide Target Activity never infers a Site — a blank Site stays
  project-wide and an explicit Site is kept.
- **BR-81** Framework and Framework Item are an all-or-nothing pair: both blank (no
  framework requirement), or both populated. Framework only, or Framework Item only,
  is an **error** — a Framework value is never silently discarded (the table has
  `framework_item_id` but no `framework_id`). Framework is matched by the canonical
  `formatFrameworkIdentity` (e.g. `ISO 14001:2015`) among Frameworks **assigned to the
  project** (an existing but unassigned Framework is an error; nothing is auto-assigned);
  Framework Item is matched by `code` **within that Framework only**. Items without a
  code cannot be targeted by import.
- **BR-82** A possible duplicate — same trimmed question, `site_id`,
  `target_activity_id` and `framework_item_id` (priority is not part of the key), either
  within the uploaded workbook or against an existing item of the project — is a
  **warning**, never an error and never silently skipped, merged or updated. When any
  duplicate warning exists the user must tick "I reviewed the duplicate warnings and
  want to import them." before Import enables (UI state only; not persisted, not sent
  as a bypass). Uploading the same workbook twice therefore warns on every row; there
  is no fingerprint, batch id or import history.
- **BR-83** Import is **all-or-nothing**: any error means zero rows are created (no
  "import valid rows"). Preview and Import run the identical server-side validation
  against a freshly loaded project catalog (loaded once per request; no per-row
  queries); Import never trusts a prior preview, so a change between Preview and Import
  (e.g. a Framework unassigned) is caught and nothing is inserted. Rows are created with
  **one** bulk `INSERT` (a single SQL statement: all rows or none), planning columns
  only.
- **BR-84** Import limits and trust boundary: `.xlsx` only (not `.csv`, `.xls`, `.xlsm`,
  `.ods`), 2 MB maximum, 300 data rows maximum (fully blank rows are not counted),
  sheet read **by name** (other sheets ignored). The workbook is untrusted input,
  parsed server-side only; formulas are read as stored values, never evaluated.

## Issues and actions

- **BR-29** An issue — called a **Finding** in the UI (BR-85) — is **not necessarily a
  nonconformity**. Findings support implementation consulting, gap assessment,
  internal audit, site assessment and future verification work; each has a Finding
  Type (BR-85).
- **BR-30** An issue may originate from a document review, verification item or
  activity (explicit references; store the closest origin).
- **BR-31** An issue may have zero or more actions.
- **BR-32** **An action may exist without an issue** (e.g. raised in a meeting or
  site visit).
- **BR-33** Action workflow: Open → In Progress → Pending Review → Closed.
- **BR-34** **Overdue is derived, not stored:** an action is overdue when
  `due_date < today` and `status <> closed`. `today` is the **viewer's local calendar day** (BR-158).
- **BR-35** Open actions must be available to surface as **open actions to follow
  up** in later site visits: actions of the project that are not closed and
  belong to the visited site or are project-wide. (Data model only in V1
  foundations; UI comes later.)
- **BR-36** Owners of actions and documents are free-text names in V1 (no client
  accounts).
- **BR-85** **Finding = database `issues`** (ADR-018); the table is not renamed. Every
  Finding has a required `finding_type` — `nonconformity`, `observation` or
  `opportunity_for_improvement` (UI: Nonconformity, Observation, Opportunity for
  Improvement) — a system-controlled closed set, not master data. The UI never
  preselects a type. The Verification result **Issue Identified** is unchanged and
  never creates a Finding automatically.
- **BR-86** A Finding is created manually (Phase 4C-1) with title (required), description,
  priority (default medium), optional Activity, Site and Framework Requirement; status
  starts Open and `created_by` is the session user. Site follows BR-73: a site-specific
  Activity fixes the Finding's site (server-enforced); a project-wide or absent Activity
  leaves Site free. A newly selected Framework Requirement must belong to an assigned
  Framework (BR-74, with the same historical-preservation rule on edit). Origin links
  (`verification_item_id`, `document_review_id`) are set only from their real context
  (Verification: Phase 4C-2) and are immutable; the generic New Finding form has no
  Verification picker. `activity_id` is observation context and may accompany a
  `verification_item_id`.
- **BR-87** A Finding stays `open | closed`. **Close Finding** / **Reopen Finding** are
  deliberate actions (no status dropdown); `closed_at`, `closed_by` are server-derived. A
  closed Finding is read-only until reopened. **Reopen** returns it to Open, clears
  `closed_at`/`closed_by` **and invalidates the current effectiveness result**
  (`effectiveness_result`, `effectiveness_reviewed_by`, `effectiveness_reviewed_at` → NULL);
  correction, root cause, effectiveness notes and linked actions are preserved. In
  Phase 4C-1 only Observation and Opportunity for Improvement can be closed, and only when
  no linked Action is not Closed; a Nonconformity has no Close action yet.
- **BR-88** *(Implemented in Phase 4D-2 — see BR-99 – BR-101.)* Nonconformity closure:
  **hard blockers** are (A) any linked Corrective Action not Closed and (B)
  `effectiveness_result = not_effective`. A missing Correction, Root Cause Analysis or
  Effectiveness Review is a **warning** the user may explicitly override ("Close Anyway");
  users are never required to type placeholder text such as "N/A". Observation and
  Opportunity for Improvement need no correction, root cause or effectiveness review.
- **BR-89** The lightweight NC response is stored on the Finding (`correction`,
  `root_cause`, and ONE current effectiveness review with reviewer and timestamp); a
  *correction* is not a *corrective action*. Corrective Actions are `actions` rows linked by
  `issue_id` (0..N; standalone actions remain possible); action statuses are unchanged and
  effectiveness is never an action status. There is no effectiveness or reopen history in
  V1: a repeat review overwrites the current one. Workflow progress is derived, not stored.
  The NC response UI is Phase 4D; the columns exist from 4C-1 and are not exposed there.
- **BR-90** *(superseded in Phase 6A by BR-144 – BR-147)* Finding numbering was deferred to Phase 6.
- **BR-91** A Verification **result is not a Finding**. Recording *Issue Identified* or *Follow-up
  Required* never creates a Finding; a Finding is created only by the explicit **Create
  Finding** action on the Verification card in **Activity Detail** (Phase 4C-2) — not from the
  Project Verification workspace. It is offered only where the check was verified
  (`verified_activity_id` = the current Activity) and only for *Issue Identified* (prominent)
  and *Follow-up Required* (secondary); *Verified OK*, *Pending*, and a check completed in a
  different Activity never offer it. The server re-checks all of this (project, Activity,
  verification, `verified_activity_id`, result) and never trusts client-supplied origin.
- **BR-92** A Finding created from a Verification stores `verification_item_id` (immutable
  origin lineage) and `activity_id` (the executing Activity — observation context, not the
  planned Target Activity), plus `created_by` and status Open from the session/server. Prefill:
  Description ← the verification Notes (blank if none; the check question is never substituted),
  Priority ← the check's, Framework Requirement ← the check's; **Title and Finding Type are blank**
  and must be entered (no result implies a type). Site: a site-specific Activity fixes the Site
  (BR-73, server-enforced); for a project-wide Activity the Site starts as the check's Site and
  may be changed to Project-wide or another project Site. The Framework Requirement may be
  changed (BR-74; the check's own item may be inherited unchanged even if its Framework was since
  unassigned). After creation Priority and Framework are **independent** of the check — neither
  is synchronised and the Verification is never modified.
- **BR-93** One Verification may have **0..N** Findings (no uniqueness constraint); every linked
  Finding — open or closed — is counted on the Verification card. For a Finding created from a
  Verification the **Activity is read-only** (server-enforced) while Framework Requirement,
  Priority, Title, Description, Type and (when the Activity is project-wide) Site remain editable
  while Open; a manual Finding keeps its free Activity picker (BR-86).
- **BR-94** **NC Response** (Phase 4D-1, Nonconformity only): **Correction** (`issues.correction`
  — immediate action on the detected problem) and **Root Cause Analysis** (`issues.root_cause`)
  are edited through a dedicated mutation that updates only those two columns, only while the
  Nonconformity is Open. Both are optional (blank → NULL; never a placeholder "N/A"). A
  *correction* is not a *corrective action*. Observation and Opportunity for Improvement show no
  NC response; changing a Finding's type hides but never clears correction, root cause or
  actions.
- **BR-95** **Actions** are `actions` rows. An action created from a Finding is linked
  (`issue_id`), shown as a **Corrective Action** for a Nonconformity and as an **Action**
  otherwise (no stored action type); an action created from the project Actions workspace is
  **standalone** (`issue_id` NULL). `project_id`, `issue_id`, `created_by` and status Open are
  server-derived; the Finding link is **immutable** (never relinked, never set on a standalone
  action, never cleared). Fields: Action (description, required), Owner (free text), Due Date,
  Priority (default medium, independent of the Finding's), Activity and Site — defaulting to
  the Finding's Activity/Site and following BR-73 (a site-specific Activity fixes the Site).
  An action may be added to a Finding only while it is Open.
- **BR-96** Action status: `open | in_progress | pending_review | closed`, changed directly (no
  state machine). Closing sets `completed_at` to the server time and optionally records
  **Completion Notes**; leaving Closed clears `completed_at` and keeps the notes. A Closed action
  is read-only (reopen it first). **Overdue** is derived: `due_date < today` and status not
  Closed (Pending Review can be overdue); nothing is stored.
- **BR-97** A **closed Finding freezes its linked actions**: no new action, no edit and no status
  change until the Finding is reopened (server-enforced). Standalone actions are unaffected.
  Observation / Opportunity for Improvement cannot close while a linked action is not Closed
  (BR-87).
- **BR-98** Workflow progress is derived, never stored: Correction / Root Cause Analysis are
  *Complete* when non-blank after trimming; actions show "N of M Closed" (or "None recorded").
  In Phase 4D-1 a Nonconformity still **cannot be closed**, even with a complete response and
  all actions closed; Effectiveness Review and NC closure are Phase 4D-2 (BR-88). *(Superseded
  by BR-99 – BR-101 in 4D-2: a Nonconformity can now be closed through the closure evaluator.)*
- **BR-99** **Effectiveness Review** (Phase 4D-2, Nonconformity only): ONE current review on the
  Finding — Result **Effective** or **Not Effective** (required; NULL = *Not Reviewed*; no other
  values) and optional Notes (trimmed, blank → NULL). `effectiveness_reviewed_by` (session user)
  and `effectiveness_reviewed_at` (server time) are server-derived; a dedicated mutation updates
  only these four columns, only while the Nonconformity is Open. Each save **replaces** the
  current review — there is no history. Progress shows Effectiveness Review as Not Reviewed /
  Effective / Not Effective (derived). Not shown for Observation / Opportunity for Improvement.
- **BR-100** **Closure** of every Finding type is decided by ONE shared evaluator
  (`evaluateFindingClosure`) run by the server on freshly loaded data (the Finding and its
  linked actions' statuses in one query) — never on client-supplied results. **Hard blockers**
  (no override): any linked action not Closed; and, for a Nonconformity,
  `effectiveness_result = not_effective`. **Warnings** (Nonconformity only, closable after an
  explicit **Close Anyway**): Correction not recorded, Root Cause Analysis not recorded,
  Effectiveness Review not completed. The server closes a Finding with warnings only when the
  request explicitly confirms them (`confirmWarnings`); it re-evaluates every time. **Zero
  linked actions is allowed** (shown as information, not a warning). Closing sets only
  `status`, `closed_at` (server time) and `closed_by` (session user). Observation /
  Opportunity for Improvement ignore the (hidden) NC response and effectiveness fields.
- **BR-101** A **Not Effective** result keeps the Nonconformity Open and blocks closure; nothing is
  created, cleared or archived automatically — the user may revise the root cause, add or reopen
  corrective actions and later record a new review (which replaces the previous one). **Reopen**
  (any type) returns the Finding to Open, clears `closed_at` / `closed_by` and the current
  `effectiveness_result` / `_reviewed_by` / `_reviewed_at`, and keeps effectiveness notes,
  correction, root cause and actions — so an old "Effective" is never reused: after reopening,
  a missing review is again a closure warning. A closed Finding is fully read-only (core fields,
  NC response, effectiveness review, linked actions — BR-97) until reopened.

## Evidence

- **BR-37** Evidence (photos, PDFs, Excel, Word, screenshots) is attached to an
  activity, document review, verification item, issue or action. Each
  attachment links to exactly one of these.
- **BR-38** Binaries live in object storage; the database holds metadata and a
  storage key. Files are served through short-lived signed URLs; permanent
  public URLs are never stored.
- **BR-39** Document version files are recorded in the same files registry.
- **BR-40** Future domain modules keep their evidence links in their own
  junction tables (they do not add columns to `attachments`).
- **BR-102** **Evidence (Phase 4E)** can be added to an **Activity**, a **Verification item**, a
  **Finding** and an **Action** (Document Review: schema only until Phase 5). Each upload creates
  one `files` row (original name, MIME type, size, provider, storage key, uploader) and one
  `attachments` row with **exactly one** parent FK (`attachments_exactly_one_parent`) and an
  optional trimmed caption. There are no evidence categories or stages in V1 (use the caption).
  Evidence never changes a verification result, Finding / Action status, NC progress,
  effectiveness or closure rules.
- **BR-103** Files live only in the **private** bucket; the database holds metadata and a
  server-generated key `{project_id}/{uuid}-{sanitized-name}` (never the original name as the
  path; two files with the same name never collide). **View / Download** use a signed URL valid
  for **60 seconds**, generated only when clicked, never stored. A missing object shows "File is
  unavailable." without breaking the page or deleting metadata.
- **BR-104** File policy: one file at a time, **≤ 10 MB** (the bucket limit, checked in the
  browser, on the server and by the bucket), types JPG / PNG / WebP / PDF / DOC(X) / XLS(X) /
  PPT(X) / TXT by extension (and by MIME when the browser provides one); executables and scripts
  are rejected. Mobile offers **Take Photo** (`accept="image/*"` + `capture`) and **Choose File**
  through the normal file input — no camera API.
- **BR-105** Upload flow: the server validates the parent (exists, in the project, editable) and
  returns the key → the browser uploads directly to the bucket under its session → the server
  re-validates everything, checks the stored object, and inserts `files` then `attachments`. If
  registration fails the object is removed (best effort) and, if only the attachment insert
  failed, the `files` row too; cleanup never removes an object already registered in `files`.
  **Remove Evidence** deletes the attachment and, when no other attachment or document version
  references the file, the `files` row and the stored object. Removing evidence is not deleting
  a business record (Phase 4F).
- **BR-107** *(Phase 4E.6, terminology)* The free-text field recorded with a Verification result
  (`verification_items.notes`) is labelled **"Notes"** everywhere in the UI (execution drawer,
  checklist cards, Create Finding prefill). **"Observation"** is used only as a Finding Type. The
  Verification result label **Issue Identified** is unchanged. A Finding's **Open** status uses a
  neutral badge, like an Action's Open (Open is a normal state, not a warning).
- **BR-106** Evidence editability follows its parent: a **closed Finding** and a **closed Action**
  (or an action of a closed Finding) accept no new evidence and no removal until reopened —
  existing evidence stays viewable; **Verification** and **Activity** evidence stay editable after
  a result is recorded or the Activity is completed. Any authenticated user may add or remove
  evidence where the parent is editable (no uploader-only rule); anon is denied.

## Controlled delete (Phase 4F)

Deletion exists only to remove records created by mistake. Anything that carries work history is
retained; nothing is cascaded, archived or soft-deleted to make a record deletable, and Evidence is
never removed automatically. Rules are application-level (no FK change): each record type has one
shared evaluator (`lib/domain/delete-rules.ts`) that returns *can delete* plus **every** blocker,
used both to show the confirmation and — re-run on freshly loaded data — by the delete mutation
itself. Admin and Consultant have the same rights; anonymous users have none.

- **BR-108** A **Verification item** may be deleted only when it has **no execution history**
  (`result`, `verified_activity_id`, `verified_by`, `verified_at` all empty and `notes` blank),
  **no Finding** references it, and it has **no Evidence**. Blockers: "This verification has
  execution history and cannot be deleted." / "This verification has linked Findings and cannot be
  deleted." / "This verification has Evidence and cannot be deleted." Offered from the row / card
  "…" menu of the Project Verification workspace only (not on Activity cards). Deleting it changes
  no Activity; the Activity's check count simply drops (e.g. 3 checks → 2 checks).
- **BR-109** A **Finding** may be deleted only while **Open**, with **no linked Actions** (of any
  status) and **no Evidence**. A closed Finding shows "Closed Findings are retained as project
  history. Reopen it if you need to continue working on it." Offered from the Finding Detail "…"
  menu ("Delete Finding"). Its Verification item (result, notes, execution) and Activity are never
  changed.
- **BR-110** An **Action** may be deleted only when it is **not Closed**, has **no Evidence**, and
  its Finding (if any) is **not Closed**. Offered from the Action edit drawer (Finding Detail and
  Actions workspace share the same mutation). The Finding is never changed.
- **BR-111** Evidence that was added by mistake is removed with **Remove Evidence** (BR-105)
  first; only then can its parent be deleted. A delete is refused if the record gained history
  after the confirmation opened (the delete statement is also conditioned on the record's state).

## Overdue actions on the Project Overview (Phase 4F)

- **BR-112** The Project Overview shows **Overdue Actions**: the project's actions matching BR-34
  (`due_date` before today, status not Closed — the same `isActionOverdue` rule as the Actions
  workspace; today is the viewer's local calendar day, BR-158), at most **5**, ordered by due date (oldest
  first), then priority High → Low, then newest created, then id; with the total count, each row's
  description, due date, owner, Finding (or "Standalone") and status, and **View all Actions**
  (Actions workspace pre-filtered to Overdue). Empty state: "No overdue actions." No KPI or chart.

## Pilot foundation (Phase 7A)

- **BR-156** *(Phase 7A)* The consultant **Home** (route `/dashboard`, navigation label "Home", the
  post-login page) answers "what do I need to work on next?" across **all Projects the user can read**
  (V1 authorization is authenticated full business access, BR-42 — no tenant filtering is added). Four
  compact sections, **at most 5 rows each**, no charts or KPIs: **Upcoming Activities** (status not
  Completed / Cancelled and `start_date` today or later; soonest first by date, time, name; undated
  Activities never), **Overdue Actions** (BR-34; soonest due first, then priority; the heading shows the
  total; a Finding-linked row opens its Finding, a standalone row the Project's Actions workspace
  filtered to Overdue), **Documents Under Review** (the current Version has an open Gap Assessment:
  `document_reviews.status = under_review`; oldest open first; opens Document Detail — no new Document
  status) and **Recent Projects** (newest created). When the first three are empty the page says "No
  pending work needs your attention." with **View Projects**. Opening Home reads only; it writes nothing.
  It uses a fixed number of queries (no N+1) — see BR-158 for how "today" is decided.
- **BR-157** *(Phase 7A)* **Date-only values** (due date, Activity start / end date, Version received
  date, Project dates) are calendar days, not moments: they print as the **same day in every time zone**
  (parsed and formatted as UTC calendar values, one shared helper `formatDate` /
  `lib/ui/business-date.ts`). **Timestamps** (recorded / closed / reviewed / verified / uploaded at) are
  moments: they are shown in the **viewer's** time zone by the `LocalTime` component (the server renders a
  hidden placeholder, so no server-zone time is ever shown and there is no hydration mismatch).
- **BR-158** *(Phase 7A)* **"Today" for every business-date rule is the viewer's local calendar day** — Action
  overdue (BR-34), Activity overdue (BR-63), the Project Overview and Home lists, Upcoming Activities,
  and the "Overdue" mark in the DOCX (the zone the export is generated for). The rules themselves are
  unchanged. In the browser `useToday()` supplies the day (re-read every minute and when the tab becomes
  visible). The server cannot know the zone, so for Home / Overview it returns the rows that are certain
  plus those of the **two undecided days** (the server's UTC day and the one before; a viewer's local day
  is always within one day of UTC) and the browser decides them; `compareActions` takes `today` the same
  way. No timezone cookie or locale framework exists.
- **BR-159** *(Phase 7A)* **Verification deep link:** `/projects/{projectId}/verification?item={id}`. The
  Gap Assessment follow-up list links its Verification items this way. The workspace looks the id up
  **among this Project's items only**, scrolls that item into view and highlights it for a few seconds
  (table row on desktop, card on phone); filters and search are untouched. A malformed id, another
  Project's item, a deleted item or an over-long value is ignored with a compact, dismissible note —
  nothing from elsewhere is read or shown. There is no Verification detail route.
- **BR-160** *(Phase 7A)* **Findings Activity filter:** "All Activities", "Project-wide / No Activity" and each
  of the Project's Activities. Activity A means `issues.activity_id = A`; Project-wide means
  `activity_id IS NULL`. Never inferred through a Verification item — the same rule as the Activity Report
  (BR-152). It combines with search, Type, Status, Site and Priority; Clear resets it. Client-side, not in the URL.
- **BR-161** *(Phase 7A)* **Actions Activity filter:** "All Activities", "No Activity" and each of the
  Project's Activities. Activity A means `actions.activity_id = A` — **the Action's own Activity only**. A
  Finding-linked Action whose own `activity_id` is NULL is "No Activity" here. The **Activity Report is
  deliberately broader** (BR-152 / BR-153: the Activity's Actions plus the Actions of its Findings); the
  workspace filter describes where the Action itself was recorded. It combines with search, Status
  (including Overdue), Site, Priority and the Finding link filter.

## Document data integrity (Phase 7B)

- **BR-162** *(Phase 7B)* **One open Gap Assessment per Version is a database guarantee:** a partial unique index on
  `document_reviews (document_version_id) WHERE status = 'under_review'`. A second open insert fails with
  23505 and the application answers as before — "A Gap Assessment is already open for this version." — never a
  raw database error. The Phase 5G reconciliation (BR-140) stays as a second line and normally finds one row.
  Concluded assessments are unrestricted (history keeps several); a new open one is possible once the previous
  one is concluded.
- **BR-163** *(Phase 7B)* **Delete protection by the database:** `document_versions.document_id` and
  `document_reviews.document_version_id` are ON DELETE RESTRICT. A Document with Versions and a Version with
  Gap Assessments cannot be physically deleted, whatever the application checked a moment earlier. The
  application rules are unchanged (BR-118: Document without Versions; BR-119 / 5B: the latest unreviewed Version
  of an Applicable Document). When a concurrent change slips between the check and the delete the database
  refuses (reported as a foreign-key violation, SQLSTATE 23503 / 23001) and the user reads: "This document can no
  longer be deleted because a version now exists." / "This version can no longer be deleted because a Gap
  Assessment now exists." Nothing is removed — no Version, Review, Review Evidence, file row or Storage object.
  Project-scope validation happens first, so a foreign id is "not found" and reveals nothing. Other cascades
  (requirement mappings, attachments of their own parent, Project children) are unchanged. There is no Project
  delete path in the application except the rollback of a brand-new Project (no Documents).
- **BR-164** *(Phase 7B)* **Deterministic latest review:** everywhere — application and `document_register` view —
  the latest review of a Version is the one with the highest `created_at`, ties broken by the higher `id`
  (`created_at DESC, id DESC`). The derived Document status (BR-17 / ADR-005) and its values are unchanged.

## Bulk Document Upload (Phase 7C, ADR-021)

- **BR-165** *(Phase 7C)* **Bulk Upload creates Versions, never Documents.** From the Documents workspace, "Bulk Upload"
  opens a page where a consultant selects several files (multi-select or drag and drop; no folder upload) and attaches
  them to existing Required Documents of the Project. Required Documents still come from manual create or the Excel
  import. Admin and Consultant have the same capability; a signed-out visitor is sent to login. No batch, upload
  history or match information is stored — the Versions created are the record.
- **BR-166** *(Phase 7C)* **Limits and file policy:** at most **50 files per batch** (more is blocked before Analyze with
  "Select up to 50 files per batch." — never truncated); the **existing Document Version file policy** (PDF, Word,
  Excel, PowerPoint; 10 MB per file; the same messages) applies per file and an invalid file is shown as Blocked;
  a total over 300 MB only shows a warning. The same file selected twice (name, size, last-modified) is Blocked as a
  duplicate.
- **BR-167** *(Phase 7C)* **Deterministic matching** (`lib/documents/bulk-match.ts`, pure, unit-tested): **Auto-match** =
  the Document Code appears as whole tokens in the file name (separators and case ignored; codes of fewer than 3
  characters never; the longest code wins) and exactly ONE Document has it. **Suggested** (needs the consultant's
  acceptance) = a code shared by several Documents (candidates ranked by Site words in the file name, never
  auto-picked), the file name — after removing the extension, revision tokens (Rev01, Rev.02, Revision 2, V2) and dates
  — equals a Document title (accent, case and separator insensitive; Vietnamese included), or a word overlap of at
  least 80 % of both the title's and the file name's words with at least 2 shared words and a unique candidate.
  Otherwise **No match**. A Site name alone never matches a file. A revision token only **prefills** the optional
  Revision field ("Rev.02", "V2"); it is never a Version number. The original file name is never changed.
- **BR-168** *(Phase 7C)* **Match Review and Confirm:** every file is shown — table on desktop, stacked cards on a phone —
  with its Document (searchable selector: code · title · Site, "Project-wide" when none), Match type, preview of the next
  Version (**preview only**; the server assigns V1 / V2 / V3), Revision and an Include / Skip control. Row states: **Ready**
  (valid file, included, one Applicable Document whose current Version has no open Gap Assessment, accepted),
  **Needs review** (a suggestion not yet accepted), **Unmatched**, **Blocked** (file policy, duplicate, Not Applicable —
  "Versions cannot be uploaded while this document is Not Applicable." — or open Gap Assessment — "Complete the current Gap
  Assessment before uploading a new Version."), **Skipped**, **Conflict**. **One file per Document per batch:** two included
  files targeting one Document are both a Conflict and the batch cannot be confirmed until one is kept, reassigned or
  skipped. "Same file name and size as current Version." is a warning only. Only Ready rows upload; the others do not block
  the Confirm step (except conflicts). Nothing is uploaded before the consultant confirms the summary (Ready / Skipped /
  Blocked / Unmatched).
- **BR-169** *(Phase 7C)* **Upload is per-file atomic and sequential.** Each Ready file runs the existing steps
  `prepareDocumentVersionUpload` → direct upload to the private bucket → `registerDocumentVersion` (BR-119, BR-139), one
  file at a time, showing overall (n / total), the current file and each row's state (Queued, Uploading, Completed, Failed).
  The server revalidates every file on fresh data, so a Document that became Not Applicable or got an open Gap Assessment
  after the Match Review makes only that file fail (with the existing message) while the batch continues. A failed Storage
  upload creates no file row and no Version; a failed registration removes the just-uploaded object (existing cleanup).
  Successful files are never rolled back. **Retry** (per file or all failed) starts again with a fresh prepare — a fresh
  key — and revalidates, so it cannot duplicate a Version.
- **BR-170** *(Phase 7C)* **Result summary and recovery:** when the batch ends the page shows Completed (file, Document and
  the Version the server actually created), Failed (reason, Retry), Skipped and "not uploaded" counts, with Back to
  Documents (the register shows the new state). A batch-level "Received on" date (default: today, editable or empty) is
  applied to every Version of the batch. Leaving the page during an upload asks for confirmation; closing it stops the
  upload. An orphaned object (browser closed between upload and registration) is recovered as for a single upload
  (10_RUNBOOK).

## Expected Records / Required Evidence (Phase 7D, ADR-022)

- **BR-171** *(Phase 7D)* **Expected Records belongs to the Required Document**: `documents.expected_records`, optional
  multiline text — the records or evidence the consultant expects to review for that Document (e.g. for a Training Procedure:
  annual training plan, attendance records, competence evaluation, training effectiveness records), one per line by
  convention. It is **not** a Version field, Review Comment, Finding, Evidence, Framework Item property or mapping
  property, and there is no separate table, checklist or approval. Existing Documents have none (NULL). Surrounding whitespace
  is trimmed, line breaks are kept (stored as \n), whitespace-only is stored as NULL, and the text is limited to **2,000
  characters** — a longer text is refused with "Keep Expected Records under 2,000 characters.", never truncated. Label: "Expected
  Records / Required Evidence" — helper text "Records or evidence the consultant expects to review for this Required Document."
- **BR-172** *(Phase 7D)* **Maintenance and context:** the consultant adds, edits or clears it in Create / Edit Document (Admin
  and Consultant alike). Changing it is reference-data only: it creates no Version, does not affect the current Version, does
  not reopen or change a Gap Assessment, does not change the derived status, mappings, Findings, Verification items, Actions,
  Evidence or Storage — only the Document row changes. Document Detail shows it in a compact card ("No Expected Records
  recorded." when empty). In the **Gap Assessment** it is **read-only context** between the requirement context and the Review
  Comments: expanded when short, collapsed when long (over 240 characters or 4 lines; the same on every screen size), hidden
  when empty; it never fills the Review Comments and is not part of the result (Revision Required / Accepted).
- **BR-173** *(Phase 7D)* **Import:** the Required Document import accepts an optional column **Expected Records** (aliases:
  Required Evidence, Records, Expected Records / Required Evidence); a workbook without it imports exactly as before (NULL).
  Cell line breaks are kept (CRLF → LF); the preview shows the first line and "+n more lines" in its own column; more than
  2,000 characters is a row error (never truncated). Rows of one Document identity (same title + site, BR-133) share ONE
  Expected Records: all blank → NULL; one non-blank + blanks → that value; the same text repeated (compared after trimming and
  line-ending normalization only — lines are never reordered or reworded) → kept once; different non-blank texts → a **conflict
  error** and nothing is imported. A Document mapped to several framework requirements stores one value, not one per mapping.
  Import stays create-only: an existing Document is skipped and its Expected Records are not changed. The server re-parses
  and re-validates on import (BR-134). The template has the column.
- **BR-174** *(Phase 7D)* **Export:** the Gap Assessment export has one extra column, **Expected Records**, immediately before
  **Review Comments**; every other column keeps its meaning. The Document-level text is repeated on every row of the Document
  (the grain stays Document × Framework Requirement), wrapped with its line breaks, in the usual capped row height; no text is
  cut; a Document without it has a blank cell (not "N/A" / "None").
- **BR-175** *(Phase 7D)* **Where it does NOT appear:** not a column of the Documents register and not searched by it; not a
  matching signal or part of the catalog of Bulk Upload (ADR-021); not in the Activity Report; never copied automatically into
  Findings, Verification items, Actions or Evidence.

## Access and identity

- **BR-41** V1 users are internal (admin / consultant). Public sign-up is
  disabled; users are created by an admin.
- **BR-42** In V1 any authenticated user can access all data (internal team
  workspace), except that writes to framework reference data are Admin-only (BR-52).
  RLS remains enabled on every table.

## Numbering

- **BR-43** Human-readable numbering of **Actions** (e.g. ACT-014) stays **deferred**: no
  `action_seq` / action numbers. Findings are numbered since Phase 6A (BR-144 – BR-147, ADR-019).
- **BR-144** *(Phase 6A, ADR-019)* Every **Finding** has a number, **per project**, stored as an integer
  and shown as **F-nnn** (1 → F-001, 10 → F-010, 1000 → F-1000) — one sequence for all Finding Types
  (a type change never changes the reference; there is no NC- / OBS- / OFI- numbering). Project A and
  Project B may both have F-001.
- **BR-145** *(Phase 6A)* The number is assigned by the database **when the Finding is created**, by
  every creation path (manual, from a Verification check, from a Gap Assessment); the browser and the
  application never choose or send it. It **never changes** — editing title, description, type,
  priority, site, framework, status, NC response or effectiveness keeps it — and it is **never
  reused**: deleting a Finding (Phase 4F rules, unchanged) leaves a permanent gap (F-001, F-002,
  F-003 → delete F-003 → next is F-004). Simultaneous creation is safe (database counter, BR-146).
- **BR-146** *(Phase 6A)* Numbering is database-controlled: a per-project counter
  (`project_finding_counters`, internal, unreachable through the API) incremented atomically by the
  `assign_finding_no` trigger. Never `max(finding_no) + 1` in application code.
- **BR-147** *(Phase 6A)* The number is the consultant-facing reference wherever a Finding is named:
  "F-001 · Title" (Finding Detail header, Action form, Actions, Verification links, Gap Assessment
  follow-up), a "No." column on the Findings list (compact "F-001" on phone cards), "View F-001" on a
  Verification card, and "Finding F-001 created." after creation. Search accepts "F-001", "f-1", "001"
  or "1" — a query of that shape also matches the number (a "F-…" query matches only that number;
  bare digits additionally keep the normal text search). RayIMS is consultant-operated: no approval,
  submission or sign-off states exist for Findings (Open → Closed only, ADR-018).

## Reference data

- **BR-44** Seeded framework data contains clause numbers and short titles only,
  not the text of the standards.
- **BR-45** *(Superseded by BR-52 / ADR-016.)* Frameworks are read-only to users in V1.
  This was true until the Phase 2 baseline update.

## Authentication behavior (Phase 1)

- **BR-46** Sign-out ends the session of the **current device only** (local scope). A
  consultant signed in on a laptop and a phone stays signed in on the other device. There
  is no "sign out everywhere" feature in V1.
- **BR-47** After sign-in the user returns to the internal page they originally asked for
  (`next`). Only a **relative internal path** is accepted; absolute URLs, protocol-relative
  paths, backslash/control-character or malformed variants (raw or percent-encoded) and the
  login page itself are rejected and the user lands on `/dashboard`. The value is validated
  again by the sign-in action.
- **BR-48** Sign-in failure messages never reveal account information: wrong password and
  unknown email give the same "Invalid email or password."; every other authentication
  error (network, rate limit, disabled or unconfirmed account, server error) gives one
  generic "couldn't sign you in right now" message.
- **BR-49** There is **no role-aware UI** in V1: admin and consultant see the same
  navigation and pages. The role is stored on `profiles` and is not fetched to render pages.
  Roles are changed only by an administrator through the runbook.
  *(Amended by BR-52: the only exception is the Framework Administration controls, which
  Admins see and consultants do not. The role is read only on framework pages.)*
- **BR-50** Every server entry point that needs a user verifies it itself through
  `requireUser()` / `getCurrentUser()` (`lib/auth/session.ts`); Proxy alone is not relied on.
- **BR-51** Users are provisioned by an administrator (`docs/10_RUNBOOK.md`); there is no
  self-service sign-up, password reset or password change in V1.

## Phase 2 rules (Framework administration, project setup, workspace)

- **BR-52** Frameworks and framework items are reference/master data **administered by
  Admin users**. Consultants can browse and search only. Admins can create, edit and
  delete (under BR-53). Enforced by database RLS (ADR-016); the application also checks
  the role, and hides admin controls from consultants.
- **BR-53** A framework or framework item cannot be deleted while it is **referenced**
  (framework: assigned to a project; item: referenced by documents, verification items or
  issues), and an item **with children** cannot be deleted. Referenced state is the real
  FK state, never "is it seeded". Deleting an unreferenced framework removes only its own
  items, and is blocked if any of them is referenced.
- **BR-54** A new framework edition is a **separate framework** (BR-08). There is no
  framework lifecycle, archive, publication or versioning. Editing a framework or item
  that projects already use changes what those projects show; the UI warns about it.
- **BR-55** A framework item's parent can never be the item itself or one of its
  descendants. The parent picker excludes both, and the server repeats the check.
- **BR-56** A project may be saved with **zero sites** and with **zero frameworks**
  (clarifies BR-03). The UI shows informational guidance, not a validation error.
- **BR-57** A project's client is chosen at creation and is **locked on edit**. Only sites
  of the project's client can be in its scope (validated server-side). "Select All"
  selects the sites currently available; sites added later are **not** added to existing
  projects, and new frameworks are **not** assigned to existing projects automatically.
  Editing a project preserves its existing site and framework assignments.
- **BR-58** Client deletion and project deletion are **not available** in Phase 2 (use
  `inactive` / `archived`), because a project deletion would cascade to its work data.
  A site can be deleted only while it is in no project's scope (existing FK integrity).
- **BR-59** The Project Workspace Overview shows **real data only**: sites and
  frameworks (left), project information (right), and the project header. Upcoming
  activities, verification progress and issues/actions are not shown until their phases,
  and no placeholder or zero values are fabricated. Other workspace tabs are disabled.
- **BR-60** Sites have no status; no per-site status is shown.
