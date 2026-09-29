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
- **BR-13** The visit summary (`work_performed`, `next_steps`) is recorded on the
  activity and feeds the visit report.
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
  `completed` or `cancelled` — the same derivation principle as BR-34 for actions.
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
  — the intended work) from **Outcome / Visit Summary** (`work_performed`,
  `next_steps` — what actually happened). Outcome fields are editable at any time,
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
  which sections are shown — Plan, Verification, Activity Evidence and Outcome / Visit Summary
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
  Detail only (not in the register, not searched).
- **BR-126** *(Phase 5C)* **Review result ≠ Finding and ≠ Verification item:** Revision Required creates
  neither; they are separate, explicit actions (Phase 5D). Any review (open or concluded) blocks
  deleting its Version (BR-121). **Backlog / design follow-up:** "Expected Records / Required Evidence"
  per Document (what records must exist) — not stored in Review Comments; to be designed separately.
- **BR-118** *(Phase 5A)* **Controlled Document delete:** only a Document with **no Versions**.
  Its Framework mappings are removed with it (setup data); versions, files and reviews are never
  cascade-deleted by the application — "This document has versions and cannot be deleted."

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
  `due_date < today` and `status <> closed`.
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
- **BR-90** Finding / NC numbering (e.g. NC-001) is **deferred** — a Phase 6 (reporting)
  prerequisite. No `finding_number` / `issue_number` column exists.
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
  workspace; today is the UTC date, see backlog), at most **5**, ordered by due date (oldest
  first), then priority High → Low, then newest created, then id; with the total count, each row's
  description, due date, owner, Finding (or "Standalone") and status, and **View all Actions**
  (Actions workspace pre-filtered to Overdue). Empty state: "No overdue actions." No KPI or chart.

## Access and identity

- **BR-41** V1 users are internal (admin / consultant). Public sign-up is
  disabled; users are created by an admin.
- **BR-42** In V1 any authenticated user can access all data (internal team
  workspace), except that writes to framework reference data are Admin-only (BR-52).
  RLS remains enabled on every table.

## Numbering

- **BR-43** Human-readable numbering (e.g. ACT-014) is **deferred**. Do not add
  `issue_seq` / `action_seq` or numbering triggers unless approved when the
  Issues/Actions feature is implemented. Finding/NC numbering is a Phase 6 prerequisite
  (BR-90, ADR-018).

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
