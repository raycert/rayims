# 07 — Architecture Decision Log

Approved decisions from the Phase 0A architecture review (approved with
corrections on 2026-09-20). Architectural changes must be added here **only after
approval**. Details live in `03_DATABASE.md` and `02_ARCHITECTURE.md`.

Open items raised during Phase 0B (OI-1 to OI-4) are recorded at the end with
their resolutions; they are **not** ADRs. All four are **RESOLVED**.

---

## ADR-001 — Framework architecture

**Decision:** Model reference systems as `frameworks → hierarchical
framework_items` (self-referencing `parent_id`), not `standard → clause`. Each
framework edition is its own `frameworks` row. `item_type` is free text.
**Reason:** RayIMS must support ISO, GHG, ESG and CBAM structures, whose nodes
are not necessarily clauses.
**Consequences:** Framework items are client-independent reference data and must
never become a catch-all for activity data, emissions, calculations, products,
installations, ESG metrics or CBAM operational data. Per-project state lives
elsewhere. Frameworks are seeded and read-only in V1.
*(Superseded in part by ADR-016: the read-only consequence no longer holds; Admin users
can administer frameworks. The rest of this decision stands.)*
**Status:** Approved

## ADR-002 — PostgreSQL + Supabase

**Decision:** PostgreSQL on Supabase, with Supabase Auth and Supabase Storage,
as the only platform. Next.js 16 (App Router) on Vercel later. No additional
infrastructure.
**Reason:** Quick-win MVP and low operating cost; one managed platform covers
database, auth and storage.
**Consequences:** RLS is required on all tables. No Redis, queues, search engine,
separate backend, realtime or separate auth provider. Storage stays replaceable
(ADR-008).
**Status:** Approved

## ADR-003 — Client-level sites + project_sites

**Decision:** `sites` belong to a `client`; projects use a subset through the
`project_sites` junction. Project work entities with a nullable `site_id` use a
composite FK `(project_id, site_id) → project_sites`.
**Reason:** Sites are reused across a client's projects; project-owned sites would
force an expensive merge later. Nullable `site_id` supports project-wide work.
**Consequences:** A site must be in project scope when used; NULL means
project-wide. One small junction table.
**Status:** Approved

## ADR-004 — Document / version / review model

**Decision:** `documents` (logical identity) → `document_versions` (uploaded
revision, file via `files`) → `document_reviews` (review of a specific version).
Documents map to framework items through `document_framework_items` at document
level. **`document_reviews.document_version_id` is not unique**: a version may
have multiple review records.
**Reason:** Feedback applies to a specific revision; the database must not
prevent multiple reviews of the same version, while V1 UI may expose a simple or
latest-review workflow.
**Consequences:** "Latest review record" is the review with the most recent
`created_at` (resolved as OI-1). `document_reviews` has `created_at`,
`updated_at` and `reviewed_at`. Reviews do not carry their own framework item
links.
**Status:** Approved

## ADR-005 — Derived document status

**Decision:** Document current status is never stored. It is derived from
`documents.is_applicable`, the latest document version and the latest review
record for the latest document version, in a view.
**Reason:** Avoid duplicated state and drift.
**Consequences:** Only review outcomes (`under_review`, `revision_required`,
`accepted`) are stored; Not Received, Received and N/A are derived. Uses a view
with `security_invoker = true`.
**Status:** Approved

## ADR-006 — Verification target vs actual activity

**Decision:** `verification_items` keeps `target_activity_id` (planned) separate
from `verified_activity_id` (activity in which it was actually completed). No
`status` column: pending is `result IS NULL`. `follows_item_id` records
carry-over lineage. Source is an explicit nullable `document_review_id` (NULL =
manual), not a polymorphic source.
**Reason:** An item scheduled for Activity A may be completed in Activity B; both
planning intent and execution context must be retained without a workflow engine.
**Consequences:** Two nullable FKs to `activities`. Issues reference verification
items (one direction only).
**Status:** Approved

## ADR-007 — Generic Issue + optional Action relationship

**Decision:** `issues` are generic (not necessarily nonconformities). `actions`
may optionally reference an issue (`issue_id` nullable); an issue may have many
actions.
**Reason:** Issue/Action must serve implementation, gap assessment, internal
audit and future GHG/ESG/CBAM verification; consultants also raise standalone
actions in meetings and visits.
**Consequences:** Specialized classification (NC / Observation / OFI), CAPA and
root cause are future additive columns or 1:1 extension tables, not Core V1.
**Status:** Approved

## ADR-008 — Shared files registry

**Decision:** A `files` table is the provider-independent registry of stored
binaries: `storage_provider` + `storage_key`, name, mime type, size, uploader.
PostgreSQL stores metadata only; binaries live in object storage. No permanent
public URLs. Document versions and attachments reference `files`.
**Reason:** Storage-provider portability and one place for storage accounting and
orphan detection.
**Consequences:** A provider swap touches `files`, `lib/storage` and
configuration only. Signed URLs are generated on demand. Orphan objects are
cleaned manually.
**Status:** Approved

## ADR-009 — Core attachment strategy

**Decision:** `attachments` links a file to exactly one Core entity using
explicit nullable FKs (activity, document review, verification item, issue,
action) plus an exactly-one CHECK. **Future domain modules (Carbon, ESG, CBAM)
must not keep adding domain-specific nullable FK columns to Core `attachments`;
they must create their own evidence/file junction tables referencing `files`.**
**Reason:** Explicit FKs keep integrity and cascades without polymorphism, while
the rule stops the Core table from coupling to future modules.
**Consequences:** Adding a new Core entity type to attachments is an approved
schema change; module evidence is modelled in module-owned tables.
**Status:** Approved

## ADR-010 — Future domain module boundary

**Decision:** The Core stays generic. Domain modules add their own
prefixed tables (`carbon_*`, `esg_*`, `cbam_*`) linked through `project_id`,
`site_id`, `framework_item_id` and `files`. Module-specific issue data uses 1:1
extension tables. `framework_items` does not replace domain data models.
**Reason:** Allow Carbon, ESG and CBAM later without redesigning the Core.
**Consequences:** No domain tables or calculation engines in V1. The Core has no
ISO-specific columns.
**Status:** Approved

## ADR-011 — No AI / realtime / complex infrastructure in V1

**Decision:** V1 excludes AI/LLM, automatic document analysis, realtime, offline
sync, billing, client portal, complex multi-tenancy/RBAC, complex approval
workflows, electronic signatures, full CAPA, GHG/ESG/CBAM engines, drag-and-drop
calendar, microservices, Redis and background job infrastructure.
**Reason:** Quick-win MVP; minimize cost and complexity.
**Consequences:** These may appear only as future considerations; adding any
requires explicit approval and an ADR.
**Status:** Approved

## ADR-012 — No native enums; `text + CHECK` and free-text taxonomies

**Decision:** No native Postgres enum types. Stable workflow states (activity
status and mode, action status, review status, verification result, issue
status, priority) use `text + CHECK`. Taxonomies (activity type, document type,
item type, framework category, project type) are free `text` validated in the
application.
**Reason:** Enums are hard to change; taxonomies differ by module.
**Consequences:** A lookup table can be introduced later without changing stored
values.
**Status:** Approved

## ADR-013 — No `visit_notes` table in V1

**Decision:** The initially proposed `visit_notes` table is removed. The visit
summary is stored on `activities` (`work_performed`, `next_steps`); observations
go on verification item notes; photos are captioned attachments on activities.
**Reason:** Challenge of the initial proposal; not needed for the quick-win
scope.
**Consequences:** A notes table can be added later without reshaping existing
data.
**Note (Phase 6B):** the activity summary on `activities` now also has `summary` (consultant
conclusion) and `client_participants` (free text); still no notes / report table.
**Status:** Approved

## ADR-014 — V1 access model

**Decision:** Supabase Auth with `profiles`; public sign-up disabled; RLS enabled
on every table with a policy allowing any authenticated user. Every project work
entity carries `project_id`.
**Reason:** Internal-only V1 while keeping a path to project-level access.
**Consequences:** All authenticated users see all data in V1. Future
collaboration adds membership without reshaping tables.
*(Clarified by ADR-016: writes to frameworks and framework items are Admin-only.)*
**Status:** Approved

## ADR-015 — Human-readable numbering deferred

**Decision:** No `issue_seq`, `action_seq`, `number` columns or numbering
triggers in the foundation schema. Numbering (e.g. ACT-014) may be added when
Issues/Actions are implemented, if it proves necessary.
**Reason:** Quick-win scope; correction requested during Phase 0A approval.
**Consequences:** Issues and actions are identified by title/description and UUID
until a numbering approach is approved.
**Status:** Approved

## ADR-016 — Framework administration by Admins

**Decision:** Frameworks and Framework Items remain **reference/master data**
(client-independent, no project implementation data) but are administered in the app by
**Admin** users. **Consultants are read-only** (browse and search). **Admins** (`profiles.role
= 'admin'`) can create, edit and delete under controlled rules. This is enforced in the
database by Admin-only INSERT / UPDATE / DELETE RLS policies (migration
`20260921000100_framework_admin_write.sql`); the application also checks the role.
Deletion is controlled by the existing FK integrity: a **referenced** framework or item
cannot be deleted, an item **with children** cannot be deleted, and deleting an
**unreferenced** framework cascades only to **its own** items (and is blocked if one of
them is referenced). A new edition is a **separate Framework record**. There is **no
`is_seeded` / `is_system` concept** (seeded frameworks are ordinary rows), and no
framework lifecycle, archive, publication, approval or versioning system. Hierarchy-cycle
prevention is **application-level in Phase 2** (the parent picker excludes the item and
its descendants and the server repeats the check); a database trigger is **deferred**.
**Reason:** Real consulting work needs new frameworks and editions and corrections without
a migration per change. The schema already supports it; only authorization changed, so
no columns, indexes, FKs or triggers were added.
**Consequences:** Supersedes the "seeded and read-only" consequence of ADR-001 and BR-45,
and amends BR-49 (Admin-only framework controls). Promoting a user to admin now also
grants framework write power (see the runbook). Admins can edit content that projects
already use (the UI warns). An accidentally deleted seeded framework is restorable only by
SQL or a migration. The database does not prevent hierarchy cycles created by a direct API
write (backlog trigger). A consultant's UPDATE or DELETE affects 0 rows (no error), so
server code treats 0 rows as forbidden.
**Status:** Approved

## ADR-017 — Activity Type as Dedicated FK-Referenced Master Data

**Context:** Phase 2 is closed. The `activities` table already exists in the Core schema
(created in Phase 0C/0D) with `activity_type text not null` — free text, validated only
in the application (ADR-012) — and **zero Activity rows currently exist** (Phase 3 has
not been implemented). ADR-012 allowed taxonomies to stay free text and explicitly
anticipated that "a lookup table can be introduced later without changing stored
values." Activity Type is now required to be Admin-configurable from Phase 3's first
implementation (Master Data Design/Audit checkpoint, `06_ROADMAP.md`). Three designs
were evaluated: (A) a stable text key validated against a generic Master Data catalog;
(B) an FK to a generic `master_data_options` table; (C) an FK to a dedicated
`activity_types` table. Design B's plain FK cannot guarantee a referenced option
actually belongs to the `activity_type` set (a `document_type` option would satisfy the
same FK) — closing that gap needs a composite FK or a trigger, both of which are more
complex than simply not needing to close the gap. A dedicated table (C) gives direct
referential *and* semantic integrity with the least mechanism.

**Decision:** Introduce a dedicated table, `activity_types`, conceptually:
`id uuid PK`, `key text UNIQUE NOT NULL`, `label text NOT NULL`,
`description text` (nullable), `sort_order integer`, `is_active boolean NOT NULL`,
`created_at`, `updated_at`. Change the existing `activities` table from
`activity_type text NOT NULL` to `activity_type_id uuid NOT NULL REFERENCES
activity_types(id) ON DELETE NO ACTION`. This is a **future, not-yet-implemented**
change to an existing column — no migration has been written yet (Phase 3A).

**Key vs. label:** `key` is the stable machine identity, set once at creation and not
editable through the normal Admin UI afterward (an application convention, not a DB
constraint — the same pattern already used for BR-57's immutable project client).
`label` is user-facing business vocabulary, freely Admin-editable at any time; changing
it never changes an Activity's identity or any stored `activity_type_id`.

**Active / inactive:** `is_active = true` options are offered when creating or editing
an Activity. `is_active = false` options are **not** offered for new assignment, but any
existing Activity that already references an inactive type remains valid and continues
to display it normally.

**Delete:** a referenced `activity_types` row cannot be hard-deleted (`ON DELETE NO
ACTION`, the same convention already used for `project_frameworks.framework_id →
frameworks`). An unreferenced row may be hard-deleted. The normal retirement path is
**deactivate, not delete**.

**Historical label semantics:** RayIMS V1 does **not** snapshot Activity Type labels.
An Activity always displays the *current* label from `activity_types` — if an Admin
renames "Site Assessment" to "On-site Assessment," every existing Activity that used
that type immediately shows the new label. This matches how every other status/label in
RayIMS already resolves (no per-row snapshot exists anywhere in the current schema) and
avoids denormalization or a label-version-history table that nothing in V1 scope
justifies. If the *meaning* of a type materially changes (not just its wording), the
correct action is a **new key** plus deactivating the old one — never repurposing an
existing key's meaning.

**Authorization:** read is available to every authenticated user (needed to render
existing Activities); Admin may create, edit label/description/sort order,
activate/deactivate, and delete (only when unreferenced); Consultant is read-only. This
follows the established Framework Administration authorization/RLS shape (ADR-016) —
`authenticated read` plus Admin-only write policies gated on `profiles.role = 'admin'`.
RLS is not implemented by this ADR; it is recorded here as the intended shape for the
future Phase 3A migration.

**Initial Activity Types (seed candidates for Phase 3A, not yet seeded):** `training`
(Training), `site_assessment` (Site Assessment), `document_review` (Document Review),
`document_support` (Document Support), `consulting` (Consulting), `online_support`
(Online Support), `internal_audit` (Internal Audit), `follow_up` (Follow-up). These are
ordinary reference values, not system-controlled workflow states — Admin may add more
later.

**System-state boundary:** this decision does **not** make any workflow state
configurable. `profiles.role`, `clients.status`, `projects.status`,
`activities.status`, `activities.mode`, `document_reviews.status`,
`verification_items.result`, `issues.status`, `priority` (issues/actions/verification
items), and `actions.status` remain exactly as specified in `03_DATABASE.md`, controlled
by application/database business logic, `text + CHECK`, unaffected by this ADR.

**Generic Master Data boundary:** RayIMS is **not** introducing a generic
`master_data_sets` / `master_data_options` mechanism at this time. Activity Type is
currently the only concrete configurable taxonomy Phase 3 needs, and a dedicated table
gives simpler, stronger integrity than a generic one would without additional machinery
(§ analysis above). `documents.document_type`, `frameworks.category`, and
`framework_items.item_type` are **not** changed by this ADR and remain free text under
ADR-012. Future concepts such as Issue Category, Evidence Type, or Report Type remain
undecided until their modules require them — no schema is created for them here. If
several similar configurable taxonomies later create real, observed duplication, RayIMS
may revisit a generic mechanism through a **separate** future ADR; this ADR does not
pre-decide that outcome.

**Domain boundary:** this mechanism must never become a catch-all for future Carbon
(emission sources, activity data, emission factors, GHG results), ESG (indicators,
metrics, targets), or CBAM (installations, production processes, goods, precursors,
embedded emissions) concepts — those require dedicated domain models (ADR-010) when
implemented, not a row in a small lookup table.

**Reason:** A plain FK to a generic options table cannot, by itself, prove a referenced
option belongs to the correct set; every way to close that gap (composite FK, trigger)
costs more than a dedicated table, which closes it for free and matches the one
reference-data pattern RayIMS already uses (Frameworks: a dedicated table, not a generic
one).

**Consequences:** Establishes RayIMS's first small dedicated-lookup-table pattern
(distinct from Frameworks' hierarchical one). A future second field of the same shape
(`document_type`, Phase 5) should default to the same dedicated-table pattern unless a
later ADR finds real cause to generalize. This **refines** ADR-012 for the single
`activity_type` field — exercising ADR-012's own anticipated "a lookup table can be
introduced later" allowance — without superseding ADR-012 globally: stable workflow
states and every other current free-text taxonomy remain governed by ADR-012 unchanged.
No schema, migration, RLS, or application code exists yet; this ADR records the decision
for the future Phase 3A implementation.
**Status:** Approved

## ADR-018 — Findings on `issues` with a lightweight NC response

**Context:** the Phase 4 model was Verification → Issue → Action. The intended consulting /
internal-audit workflow is a practical nonconformity response: a finding, the correction of
it, the root cause, corrective actions, a review of their effectiveness, and closure.

**Decision:** RayIMS V1 supports a **lightweight**

    Finding → Correction → Root Cause → Corrective Actions → Effectiveness Review → Closure

recorded on the existing `issues` and `actions` tables. This is **not** a full CAPA
management system.

- **Table / terminology.** The table stays **`issues`** (no rename migration). The
  application/UI term is **Finding** ("Findings & Actions"): *UI Finding = database
  `issues`*. Routes: `/projects/[projectId]/findings` and `…/findings/[findingId]`. The
  Verification result value/label **Issue Identified** is unchanged and remains only a
  result — it never creates a Finding automatically.
- **Finding Type.** `issues.finding_type` — a system-controlled closed set enforced by a
  CHECK (ADR-012; not master data): `nonconformity | observation |
  opportunity_for_improvement`. Required in the application with **no preselected value**;
  the migration's `DEFAULT 'observation'` exists only for safe backfill.
- **Correction ≠ Corrective Action.** A *correction* is the immediate containment of the
  detected problem; a *corrective action* addresses the cause and prevents recurrence.
  Correction (`correction`), root cause (`root_cause`) and the effectiveness review are
  stored **on the issue**; Corrective Actions are **`actions`** rows linked by `issue_id`
  (0..N per Finding; standalone actions remain possible). No `corrective_actions` table.
- **One current effectiveness review** on the issue (`effectiveness_result`
  `effective | not_effective`, NULL = not reviewed; `effectiveness_notes`,
  `effectiveness_reviewed_by`, `effectiveness_reviewed_at`). **No effectiveness history** in
  V1 — a repeat review overwrites the current one. No separate review table.
- **Status stays `open | closed`.** Workflow progress (correction / root cause recorded,
  "N of M actions closed", effectiveness state) is **derived**, never stored. Closure is a
  deliberate **Close Finding** / **Reopen Finding** action (`closed_at` + new `closed_by`),
  not a status dropdown; closed Findings are read-only until reopened.
- **Reopen invalidates the current effectiveness result** (`effectiveness_result`,
  `effectiveness_reviewed_by`, `effectiveness_reviewed_at` reset to NULL) so a reopened
  Finding never keeps an old "Effective" as its current state; correction, root cause,
  effectiveness notes and actions are preserved.
- **Closure rules.** Observation / Opportunity for Improvement: closable while no linked
  Action is not Closed. **Nonconformity (Phase 4D-2):** hard blockers are (A) any linked
  Corrective Action not Closed and (B) `effectiveness_result = not_effective`; a missing
  Correction, Root Cause or Effectiveness Review is a **warning** the user may explicitly
  override ("Close Anyway") — the software never forces fake "N/A" text. (This overrides the
  design review's proposal to hard-block on those three.) Nonconformity cannot be closed in
  4C-1.
- **`activity_id` is observation context.** `verification_item_id` /
  `document_review_id` remain the origin *lineage* ("store the closest origin"); a Finding may
  also carry `activity_id` (where it was observed) alongside a `verification_item_id`.
- **Finding number is deferred** (ADR-015 stands): stable Finding/NC numbering is a **Phase 6
  prerequisite**, not solved now.
- **Still excluded:** CAPA workflow engine, configurable approval workflow, escalation
  engine, RCA methodology tooling (5 Why, Fishbone), revision/history engine, e-signatures,
  AI root-cause analysis, enterprise CAPA automation. Not added: target closure date,
  Finding owner, Major/Minor, correction date, reopen history fields, `updated_by`,
  evidence category.

**Reason:** the Core already had the right shape (an issue with many actions, origin links
and site integrity); the NC response is a handful of nullable columns and one closed-set
CHECK, not a new subsystem. ISO 9001/14001/45001 §10.2 require reacting to a nonconformity,
evaluating the need for action to eliminate the cause, and reviewing the effectiveness of
action taken — recording those on the Finding, without prescribing a software sequence, is
enough for V1.

**Consequences:** one additive migration in 4C-1 establishes the final schema once (8
`issues` columns, 2 CHECKs, 2 FK indexes; no new table, no RLS or grant change), so Phase 4D
builds the response workflow without another `issues` migration. Slicing: **4C-1** Finding
foundation, **4C-2** Verification → Finding, **4D-1** NC response and Corrective Actions,
**4D-2** Effectiveness Review, NC closure rules and Reopen for Nonconformity, **4E**
Evidence, **4F** controlled delete, overdue-actions overview and Phase 4 acceptance.
**Amends / refines:** ADR-007 (its "additive columns or 1:1 extension tables" consequence is
exercised here, as additive columns), ADR-011 and the V1 scope exclusion "Full CAPA /
root-cause analysis" (now: full CAPA *management system* and RCA *methodology tooling*),
the `CLAUDE.md` / `03_DATABASE.md` "no NC/OFI classification in Core" statements (the Core
stays free of ISO clause columns; the finding type is a generic audit-finding taxonomy) and
the `05_UI_UX_GUIDELINES.md` terminology line ("Finding", not "Issue"). ADR-015 is
unchanged.
**Status:** Approved

---

## Open Items (history)

Raised while writing the Phase 0B documentation baseline and **all RESOLVED**
before Phase 0C. The originals are kept for history. No ADR was changed by these
resolutions apart from the clarifications noted in ADR-004 and ADR-005.

### OI-1 — Document review ordering — RESOLVED

*Question:* what is the "latest applicable document review", now that a version
may have several review records?
*Resolution:*
- Order review records by `created_at` (deterministic). The phrase "latest
  applicable document review" is retired; the rule is "**latest review record
  for the latest document version**".
- For the latest version: no review → Received; otherwise the most recently
  created review: `under_review` → Under Review, `revision_required` → Revision
  Required, `accepted` → Accepted.
- Timestamp semantics: `created_at` = record created; `updated_at` = last
  modified; `reviewed_at` = a completed outcome was reached (may be NULL while
  `under_review`; should be populated for `revision_required` / `accepted`).
- `updated_at` added to `document_reviews`.
*Documented in:* `03_DATABASE.md` (document_reviews, status derivation),
`04_BUSINESS_RULES.md` (BR-19a, BR-20).

### OI-2 — Cross-project integrity — RESOLVED

*Question:* database or application enforcement of same-project relationships?
*Resolution:* use database constraints where simple and maintainable; **no large
network of composite FKs**. The approved project/site integrity rule stays.
Application validation covers the rest, notably that a verification item's
`target_activity_id` and `verified_activity_id` belong to the item's project.
`verified_activity_id` must not substitute for `target_activity_id`; it is
normally NULL while `result` is NULL and identifies the activity in which the
result was recorded. No workflow engine.
*Documented in:* `03_DATABASE.md` (verification_items, Cross-entity
consistency), `04_BUSINESS_RULES.md` (BR-26, BR-26a).

### OI-3 — Delete behavior — RESOLVED

*Question:* deletion behavior for unspecified foreign keys.
*Resolution:* CASCADE only where the child has no independent meaning; NO ACTION
(blocked) for historical/business records and referenced reference data; SET NULL
for optional planning/context links and user references. Object storage deletion
is never a database cascade. Blocking relationships use **NO ACTION rather than
RESTRICT** so a whole-project delete cascades correctly (including the
`project_sites` composite integrity FKs). *Implementation finding (Phase 0C):*
testing the migration showed plain NO ACTION is still checked per cascade step,
so the FKs between project-owned tables (composite site FKs, `actions.issue_id`,
`document_versions.file_id`, `attachments.file_id`) are declared
`NO ACTION DEFERRABLE INITIALLY DEFERRED`. Same behavior (blocked while
referenced), checked at commit. Full table in `03_DATABASE.md` (Deletion
behavior).

### OI-4 — V1 value lists — RESOLVED

*Question:* enumerated values and `document_reviews.updated_at`.
*Resolution:* value lists fixed for `profiles.role`, `clients.status`,
`projects.status` (includes `on_hold`), `activities.status`,
`document_reviews.status`, `verification_items.result`, `issues.status`,
`actions.status` and `priority` (`low | medium | high`). "Overdue" is derived,
never stored. `updated_at` added to `document_reviews`. See `03_DATABASE.md`
(V1 value lists).

## ADR-019 — Finding Numbering

**Context:** RayIMS V1 is consultant-operated: the consultant records Findings and discusses them with
the client, in follow-up and — from Phase 6 — in Activity Reports and exported deliverables. UUIDs are
not usable references. ADR-015 deferred human-readable numbering until an approach was approved; the
Phase 6 pre-implementation review made Finding numbers a Phase 6 prerequisite.
**Decision:**
- Every Finding has a number **per project**, stored as `issues.finding_no integer NOT NULL` with
  `UNIQUE (project_id, finding_no)`, and displayed as **F-nnn** (zero-padded to 3 digits, growing to
  F-1000). The display string is never stored.
- One sequence for all Finding Types (the type may change before closure; the reference must not) —
  no NC- / OBS- / OFI- sequences.
- Assigned **at INSERT** by the database: a `BEFORE INSERT OR UPDATE` trigger
  (`assign_finding_no`, `SECURITY DEFINER`, `search_path = ''`) increments an internal per-project
  counter (`project_finding_counters`) with an atomic upsert, which locks the project's counter row and
  serializes simultaneous inserts. No `max() + 1` in application code; the browser never sends it.
- **Immutable** (the trigger keeps the old value on UPDATE) and **never reused** — a deleted Finding
  (Phase 4F rules, unchanged) leaves a gap; the counter is never decremented or reset.
- The counter table has RLS with no policies and no grants; the function's EXECUTE is revoked from
  `public`, `anon` and `authenticated`. Both are internal infrastructure, not exposed in the UI.
- **Actions are not numbered** (ADR-015 still applies to them). No approval, submission or sign-off
  workflow is introduced: a Finding stays Open → Closed under ADR-018.
**Reason:** a stable, short, per-project reference for consultant / client communication that every
creation path gets automatically, safe under concurrent creation without application locking.
**Consequences:** one additive migration (`20261002000100_finding_numbering.sql`): one internal table,
one column with a deterministic backfill (per project by `created_at, id`), one unique constraint, one
trigger function and trigger; no change to `issues` RLS or grants. The generated Insert type lists
`finding_no` as required, so the application inserts Findings through one helper that omits it
(`lib/mutations/finding-insert.ts`). Reports and exports read `finding_no` directly.
**Supersedes:** ADR-015 for Findings only.
**Status:** Approved (Phase 6A)
