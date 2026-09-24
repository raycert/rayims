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
  site verification**.

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
- **BR-27** Result *Issue Identified* leads to creating an issue that references
  the verification item. The item does not store the issue.
- **BR-28** Result *Follow-up Required* leads to carrying the item over to a
  later activity as a new item whose `follows_item_id` references the original.

## Issues and actions

- **BR-29** An issue is **not necessarily a nonconformity**. Issues support
  implementation consulting, gap assessment, internal audit, site assessment
  and future verification work. Specialized classifications belong to future
  modules.
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

## Access and identity

- **BR-41** V1 users are internal (admin / consultant). Public sign-up is
  disabled; users are created by an admin.
- **BR-42** In V1 any authenticated user can access all data (internal team
  workspace), except that writes to framework reference data are Admin-only (BR-52).
  RLS remains enabled on every table.

## Numbering

- **BR-43** Human-readable numbering (e.g. ACT-014) is **deferred**. Do not add
  `issue_seq` / `action_seq` or numbering triggers unless approved when the
  Issues/Actions feature is implemented.

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
