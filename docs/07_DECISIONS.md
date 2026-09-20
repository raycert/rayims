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
**Status:** Approved

## ADR-014 — V1 access model

**Decision:** Supabase Auth with `profiles`; public sign-up disabled; RLS enabled
on every table with a policy allowing any authenticated user. Every project work
entity carries `project_id`.
**Reason:** Internal-only V1 while keeping a path to project-level access.
**Consequences:** All authenticated users see all data in V1. Future
collaboration adds membership without reshaping tables.
**Status:** Approved

## ADR-015 — Human-readable numbering deferred

**Decision:** No `issue_seq`, `action_seq`, `number` columns or numbering
triggers in the foundation schema. Numbering (e.g. ACT-014) may be added when
Issues/Actions are implemented, if it proves necessary.
**Reason:** Quick-win scope; correction requested during Phase 0A approval.
**Consequences:** Issues and actions are identified by title/description and UUID
until a numbering approach is approved.
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
`project_sites` composite integrity FKs). Full table in `03_DATABASE.md`
(Deletion behavior).

### OI-4 — V1 value lists — RESOLVED

*Question:* enumerated values and `document_reviews.updated_at`.
*Resolution:* value lists fixed for `profiles.role`, `clients.status`,
`projects.status` (includes `on_hold`), `activities.status`,
`document_reviews.status`, `verification_items.result`, `issues.status`,
`actions.status` and `priority` (`low | medium | high`). "Overdue" is derived,
never stored. `updated_at` added to `document_reviews`. See `03_DATABASE.md`
(V1 value lists).