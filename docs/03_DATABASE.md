# 03 — Database (Approved V1 Core Schema)

This document describes the approved V1 Core schema. It is the strict basis for
the initial migration. Open Items OI-1 to OI-4 raised during Phase 0B were
**resolved** and are reflected here (history in `07_DECISIONS.md`).

## Conventions

- PostgreSQL via Supabase. Table names are plural `snake_case`.
- Primary keys are `uuid` (`gen_random_uuid()`), except pure junction tables
  (composite primary keys).
- `created_at timestamptz` on all tables; `updated_at timestamptz` on mutable
  tables, maintained by one shared trigger.
- Work entities have `created_by → profiles`.
- Planned dates are `date`; events are `timestamptz`.
- **No native Postgres enums.** Stable workflow states use `text + CHECK`.
  Taxonomies (activity type, document type, item type, framework category,
  project type) are free `text` validated in the application (ADR-012).
- **Row Level Security is enabled on every table** (ADR-014).
- Foreign keys everywhere; every FK column is indexed.
- Value lists (CHECK constraints) are listed in **V1 value lists** below.
- Delete behavior follows the principles in **Deletion behavior** below.
- Database constraints are used where simple and maintainable; same-project
  relationships that would need a large network of composite FKs are validated in
  the application (see **Cross-entity consistency**).
- No JSON blobs for business data, no ISO-specific columns in generic tables,
  no permanent file URLs, no binaries in PostgreSQL.
- **No numbering columns or triggers** (`issue_seq`, `action_seq`, `number`):
  human-readable numbering is deferred (ADR-015).

## Table list (18)

```
Identity & structure : profiles, clients, sites, projects, project_sites
Framework reference  : frameworks, framework_items, project_frameworks
Planning             : activities
Documents            : documents, document_versions, document_framework_items,
                       document_reviews
Verification & work  : verification_items, issues, actions
Evidence             : files, attachments
```

## Relationship diagram

```
profiles ·· referenced by created_by / consultant_id / reviewer_id / uploaded_by / verified_by

clients ─1─*─ projects ─1─*─ project_sites ─*─1─ sites ─*─1─ clients
                │
                ├─1─*─ project_frameworks ─*─1─ frameworks ─1─*─ framework_items ─┐ parent_id
                │                                                     ▲   ▲   ▲    │ (self)
                ├─1─*─ activities (site_id?)                          │   │   │
                │        ▲   ▲                                        │   │   │
                │        │   └─────────── verified_activity_id?       │   │   │
                │        └─────────────── target_activity_id?         │   │   │
                │                                                     │   │   │
                ├─1─*─ documents (site_id?) ─1─*─ document_framework_items ┘   │   │
                │          └─1─*─ document_versions ─*─1─ files                │   │
                │                      └─1─*─ document_reviews                 │   │
                │                                    ▲                         │   │
                ├─1─*─ verification_items ───────────┘ document_review_id?     │   │
                │        (framework_item_id?, target_activity_id?,             │   │
                │         verified_activity_id?, follows_item_id? → self)  ────┘   │
                │             ▲                                                    │
                ├─1─*─ issues ┘ verification_item_id?, document_review_id?,        │
                │        │      activity_id?, framework_item_id? ──────────────────┘
                │        ▲
                ├─1─*─ actions ── issue_id? (standalone allowed), activity_id?
                │
                └─1─*─ files ─1─*─ attachments ──► exactly ONE of:
                                                   activity | document_review |
                                                   verification_item | issue | action
                document_versions.file_id ──► files
```

`(site_id?)` = nullable site, constrained by project scope (see Site integrity).

## Tables

### profiles
- **Purpose:** application-side user record linked to Supabase Auth.
- **Fields:** `id` (PK, FK → `auth.users`), `display_name`, `email`,
  `role` (CHECK `admin | consultant`), `created_at`, `updated_at`.
- **Notes:** created by a trigger on `auth.users` insert. All `created_by`,
  `consultant_id`, `reviewer_id`, `uploaded_by` and `verified_by` columns
  reference `profiles`, not `auth.users`.
- **Delete:** cascades from `auth.users`. References *to* profiles are SET NULL
  (see Deletion behavior).

### clients
- **Purpose:** the organization a consultant works for.
- **Fields:** `id`, `name`, `notes`, `status` (CHECK `active | inactive`),
  timestamps.
- **Relationships:** 1 client → N projects; 1 client → N sites.

### sites
- **Purpose:** a reusable, **client-level** location (ADR-003).
- **Fields:** `id`, `client_id` (FK → clients, NOT NULL), `name`, `address`,
  `notes`, timestamps.
- **Delete:** `client_id` NO ACTION (blocked while the client has sites).

### projects
- **Purpose:** a unit of work for a client; the root of most entities.
- **Fields:** `id`, `client_id` (FK, NOT NULL), `name`, `project_type` (free
  text, e.g. `ims_implementation`, for future module routing), `status`
  (CHECK `planning | active | on_hold | completed | archived`),
  `start_date`, `end_date`, `created_by`, timestamps.
- **Delete:** `client_id` NO ACTION (a client with projects cannot be deleted).
  Project-owned children CASCADE.
- **Not present:** `issue_seq`, `action_seq` (ADR-015).

### project_sites
- **Purpose:** which of the client's sites are in scope for a project.
  Also the anchor for site integrity.
- **Fields:** PK `(project_id, site_id)`, `notes`, `created_at`.
- **Delete:** `project_id` CASCADE; `site_id` NO ACTION (a site in a project's
  scope cannot be deleted). Removing a row that is still referenced by project
  work is blocked (see Site integrity).

### frameworks
- **Purpose:** a structured reference system (ISO 9001:2015, GHG Protocol,
  ISO 14064-1, ESG assessment framework, EU CBAM, …). Client-independent.
- **Fields:** `id`, `code` (e.g. "ISO 14001"), `edition` (e.g. "2015"), `name`,
  `category` (free text), `description`, timestamps.
- **Constraints:** UNIQUE `(code, edition)`. Each edition is its own row.
- **Notes:** reference/master data, seeded by migration (four ISO frameworks).
  Readable by every authenticated user; **writable by Admins only** (ADR-016). A seeded
  framework is an ordinary row: there is no `is_seeded` / `is_system` concept, and
  deletability depends only on actual references.

### framework_items
- **Purpose:** the hierarchical tree of a framework (ADR-001).
- **Fields:** `id`, `framework_id` (FK, NOT NULL), `parent_id` (self-FK,
  nullable), `code` (nullable), `title`, `description`, `item_type` (free text,
  default `item`), `sort_order`, timestamps.
- **Constraints:**
  - UNIQUE `(framework_id, id)` (target of the composite FK below).
  - Composite FK `(framework_id, parent_id) → framework_items (framework_id, id)`
    guarantees a parent belongs to the same framework.
  - UNIQUE `(framework_id, code)` where `code IS NOT NULL`.
- **Delete:** `framework_id` CASCADE; `parent_id` NO ACTION (blocked while it has children); items referenced elsewhere cannot be deleted (NO ACTION on the referencing FKs).
- **Index:** `(framework_id, parent_id, sort_order)`.
- See **Framework hierarchy** below.
- **Notes:** Admin-only writes (ADR-016). `sort_order` is not exposed in the design; the
  application assigns the next value for new items.

### project_frameworks
- **Purpose:** many-to-many between projects and frameworks. Framework
  definitions are never duplicated per project.
- **Fields:** PK `(project_id, framework_id)`, `created_at`.
- **Delete:** `project_id` CASCADE; `framework_id` NO ACTION (a framework in use
  cannot be deleted).

### activity_types
- **Purpose:** dedicated, Admin-configurable reference data for `activities.activity_type_id`
  (ADR-017, Phase 3A). Not the generic `master_data_sets`/`master_data_options` mechanism
  considered and rejected in ADR-017.
- **Fields:** `id`, `key` (text, UNIQUE, stable — immutable after creation by application
  convention, not a DB constraint), `label` (text, Admin-editable), `description`
  (nullable), `sort_order`, `is_active boolean NOT NULL DEFAULT true`, timestamps.
- **Seed (8 rows, Phase 3A):** `training`, `site_assessment`, `document_review`,
  `document_support`, `consulting`, `online_support`, `internal_audit`, `follow_up`.
  Admin may add more; being a starting value carries no special protection (no
  `is_seeded`/`is_system` concept — same principle as Frameworks, ADR-016).
- **Delete:** a row referenced by any `activities` row cannot be deleted (NO ACTION).
  Normal retirement is `is_active = false`, not delete. An inactive type stays valid and
  visible on any Activity that already uses it; it is excluded from new-entry pickers
  (Phase 3B).
- **Historical labels:** not snapshotted — a label rename is visible immediately on every
  Activity that uses that type (ADR-017; matches how every other status/label in RayIMS
  already resolves).
- **RLS:** `authenticated read`; Admin-only insert/update/delete (`profiles.role = 'admin'`),
  the same shape as Framework Administration (ADR-016).

### activities
- **Purpose:** project work (the master plan). A "site visit" is an activity with
  `mode = on_site`; there is no separate visits table.
- **Fields:**
  - `id`, `project_id` (FK, NOT NULL), `site_id` (**nullable**)
  - `activity_type_id` (FK → `activity_types`, NOT NULL) — Admin-configurable
    reference data (ADR-017, Phase 3A). Replaces the originally-planned free-text
    `activity_type` column; there is no Activity list/create UI yet (Phase 3B).
  - `name`, `start_date`, `end_date`
  - `mode` (CHECK `on_site | online`), `planned_days numeric(4,1)`
  - `consultant_id → profiles`, `objectives`, `planned_work`
  - `status` (CHECK `planned | in_progress | completed | cancelled`)
  - `work_performed`, `next_steps` (visit summary fields, ADR-013)
  - `created_by`, timestamps
- **Site integrity:** composite FK `(project_id, site_id) → project_sites`.
- **Nullable:** `site_id` (project-wide activity), `consultant_id`.
- **Index:** `(project_id, start_date)`.
- **Not present:** drag-and-drop scheduling data, timesheets, actual days.

### documents
- **Purpose:** the **logical** document (identity), not a file.
- **Fields:** `id`, `project_id` (FK, NOT NULL), `site_id` (nullable),
  `doc_code` (client's own number, nullable), `title`, `document_type` (free
  text), `owner_name` (client-side owner, free text),
  `is_applicable boolean NOT NULL DEFAULT true`, `created_by`, timestamps.
- **Site integrity:** composite FK `(project_id, site_id) → project_sites`.
- **No status column.** Current status is derived (see below).
- A document with zero versions is a valid "expected document" (Not Received).

### document_versions
- **Purpose:** an actual uploaded revision of a document.
- **Fields:** `id`, `document_id` (FK, NOT NULL), `version_no int` (immutable
  ordering), `revision text` (client's label, e.g. "Rev.02"), `file_id`
  (FK → files, NOT NULL), `received_on date`, `notes`, `uploaded_by`,
  `created_at`.
- **Constraints:** UNIQUE `(document_id, version_no)`.
- **Ordering rule:** the latest version is the highest `version_no`, never the
  `revision` text.
- **Delete:** `document_id` CASCADE; `file_id` NO ACTION (a file referenced by a
  version cannot be deleted).

### document_framework_items
- **Purpose:** which framework items a document supports (document level, not
  version level).
- **Fields:** PK `(document_id, framework_item_id)`.
- **Delete:** `document_id` CASCADE; `framework_item_id` NO ACTION (a framework
  item in use cannot be deleted).
- **Index:** reverse lookup on `framework_item_id`.

### document_reviews
- **Purpose:** a review record for one document version.
- **Fields:** `id`, `document_version_id` (FK, NOT NULL), `reviewer_id →
  profiles`, `status` (CHECK `under_review | revision_required | accepted`),
  `reviewed_at`, `notes`, `created_at`, `updated_at`.
- **Constraints:** **`document_version_id` is NOT unique.** A version may have
  multiple review records (ADR-004). V1 UI may initially expose only a
  simple/latest-review workflow, but the database must not prevent multiple
  reviews of the same version.
- **Timestamp semantics:**
  - `created_at` — when the review record was created. It is the deterministic
    ordering key among the review records of a version.
  - `updated_at` — when the review record was last modified.
  - `reviewed_at` — when the review reached a completed outcome. While
    `status = under_review` it may be NULL; when status becomes
    `revision_required` or `accepted` it should be populated (application
    rule; not a database constraint).
- **Delete:** `document_version_id` CASCADE.
- **Related framework items:** none stored on the review; gaps become issues or
  verification items with their own `framework_item_id`.
- **Index:** `(document_version_id, created_at DESC)`.

### verification_items
- **Purpose:** something to be checked during an activity/site visit.
- **Fields:**
  - `id`, `project_id` (FK, NOT NULL), `site_id` (nullable)
  - `framework_item_id` (nullable), `question`, `priority`
  - `document_review_id` (nullable — source; NULL means manual)
  - `target_activity_id` (nullable — **planned** activity)
  - `verified_activity_id` (nullable — **actual** activity in which the item was
    completed)
  - `follows_item_id` (nullable self-FK — carry-over lineage)
  - `result` (nullable, CHECK `verified_ok | issue_identified |
    follow_up_required`)
  - `notes`, `verified_by`, `verified_at`, `created_by`, timestamps
- **Planned vs actual (ADR-006):** `target_activity_id` records planning intent;
  `verified_activity_id` records execution context. They are independent: an
  item scheduled for Activity A may be completed in Activity B. The model is
  not a workflow engine.
- **No `status` column:** `result IS NULL` means pending. An item with no
  `target_activity_id` sits in the project's verification backlog.
- **Site integrity:** composite FK `(project_id, site_id) → project_sites`.
- **Verification context rules (application-validated):**
  - `verified_activity_id` must not be used as a substitute for
    `target_activity_id`.
  - Both activities must belong to the same project as the verification item.
  - While `result IS NULL`, `verified_activity_id` should normally be NULL.
  - When a result is recorded through an activity, `verified_activity_id` should
    identify that activity.
- **Delete:** `target_activity_id` SET NULL (returns item to backlog);
  `verified_activity_id` SET NULL; `document_review_id` SET NULL;
  `follows_item_id` SET NULL; `framework_item_id` NO ACTION.
- **Direction of links:** issues reference verification items; a verification
  item never stores an `issue_id`.

### issues
- **Purpose:** a generic finding/problem — not necessarily a nonconformity.
- **Fields:** `id`, `project_id` (FK, NOT NULL), `site_id` (nullable), `title`,
  `description`, `framework_item_id` (nullable), origin FKs (all nullable):
  `activity_id`, `verification_item_id`, `document_review_id`; `priority`,
  `status` (CHECK `open | closed`), `closed_at`, `created_by`, timestamps.
  `priority` uses CHECK `low | medium | high`.
- **Origin:** expressed by explicit nullable FKs; there is no `source_type`
  column. Store only the closest origin (do not copy `document_review_id` onto
  an issue that already has `verification_item_id`).
- **Site integrity:** composite FK `(project_id, site_id) → project_sites`.
- **Delete:** `activity_id`, `verification_item_id`, `document_review_id` SET NULL
  (optional origin context; the issue survives); `framework_item_id` NO ACTION.
- **Not present:** NC / Observation / OFI classification, root cause, `number`.

### actions
- **Purpose:** a trackable unit of follow-up. May exist without an issue.
- **Fields:** `id`, `project_id` (FK, NOT NULL), `site_id` (nullable),
  `issue_id` (**nullable**), `activity_id` (nullable — where it was raised),
  `description`, `owner_name` (free text), `due_date`, `priority`, `status`
  (CHECK `open | in_progress | pending_review | closed`), `completion_notes`,
  `completed_at`, `created_by`, timestamps.
- **Site integrity:** composite FK `(project_id, site_id) → project_sites`.
- **Delete:** `issue_id` NO ACTION (an issue with linked actions cannot be
  deleted until its actions are removed or detached; actions are never silently
  deleted); `activity_id` SET NULL.
- **Overdue is not a column** — it is derived (see Business Rules).
- **Index:** partial `(project_id, site_id) WHERE status <> 'closed'`, serving
  "open actions to follow up".
- **Not present:** `number`.

### files
- **Purpose:** provider-independent registry of stored binaries (ADR-008).
- **Fields:** `id`, `project_id` (FK, NOT NULL), `storage_provider` (default
  `supabase`), `storage_key` (relative object key), `original_name`,
  `mime_type`, `size_bytes`, `uploaded_by`, `created_at`.
- **Constraints:** UNIQUE `storage_key`.
- **Delete:** `project_id` CASCADE (registry rows only — see the storage rule
  below). A file referenced by a document version or attachment cannot be
  deleted (NO ACTION on the referencing FKs).
- **File storage rule:** metadata only. No binary content, **no permanent public
  URL**, no bucket name in rows. See `02_ARCHITECTURE.md`.
  **Deleting objects in object storage is never a database cascade.** Removing a
  `files` row (or a project) does not remove the stored object; objects are
  removed by the application/cleanup script through `lib/storage`, and orphans
  can be found by key prefix (`{project_id}/…`).

### attachments
- **Purpose:** links a file to exactly one Core entity (ADR-009).
- **Fields:** `id`, `project_id` (FK, NOT NULL), `file_id → files`, `caption`,
  `created_by`, `created_at`, and five explicit nullable FKs:
  `activity_id`, `document_review_id`, `verification_item_id`, `issue_id`,
  `action_id`.
- **Constraint:** `CHECK (num_nonnulls(activity_id, document_review_id,
  verification_item_id, issue_id, action_id) = 1)`.
- **Delete:** parent FKs CASCADE (deleting a parent removes its attachment rows;
  the `files` row and stored object may remain until the orphan cleanup script
  runs); `file_id` NO ACTION.
- **Indexes:** each FK column (partial `WHERE col IS NOT NULL`).
- **Extension rule (architectural):**
  - Core attachments **may** link to Core entities only: activity, document
    review, verification item, issue, action.
  - Future domain modules (Carbon, ESG, CBAM) **MUST NOT** keep adding
    domain-specific nullable FK columns to `attachments`.
  - Future modules **must** create their own evidence/file junction tables
    referencing `files`.
  - `files` remains the shared, provider-independent registry.

## Document status derivation

Document status is **derived and never stored** (ADR-005). There is no
`status` column on `documents` or `document_versions`. The document register is
served by a view (`document_register`, `security_invoker = true` so RLS still
applies) that derives status from:

```
documents.is_applicable
  + latest document version (highest version_no)
  + latest review record for the latest document version
```

"Latest review record" means the review record with the most recent
`created_at` among the reviews of the latest version.

Evaluation order:

| Step | Condition                                               | Derived status   |
| ---- | ------------------------------------------------------- | ---------------- |
| 1    | `documents.is_applicable = false`                       | **N/A**          |
| 2    | No document version exists                              | **Not Received** |
| 3    | Latest version has no review record                     | **Received**     |
| 4    | Otherwise, the status of the most recently created review record of the latest version | `under_review` → **Under Review**; `revision_required` → **Revision Required**; `accepted` → **Accepted** |

The view exposes the derived status as one of `n_a`, `not_received`,
`received`, `under_review`, `revision_required`, `accepted`.

Rules:

- Only `under_review`, `revision_required`, `accepted` are stored (on
  `document_reviews`). *Not Received*, *Received* and *N/A* are derived only.
- When a new version arrives, the document reverts to **Received** until that
  version is reviewed; earlier versions' reviews remain as history.
- A version may have several review records. Only the most recently created one
  (by `created_at`) determines the derived status; earlier records remain as
  history. `reviewed_at` is not used for ordering.

## Site integrity

- Sites belong to clients; projects use a subset via `project_sites`.
- Every project work entity with a nullable `site_id` (`activities`, `documents`,
  `verification_items`, `issues`, `actions`) carries a composite FK
  `(project_id, site_id) → project_sites (project_id, site_id)`.
- The FK is `MATCH SIMPLE`: when `site_id` is NULL (project-wide work) the check
  is skipped; when set, the site **must** be in the project's scope.
- Removing a `project_sites` row that is still referenced by project work is
  blocked. The composite FKs use **NO ACTION, DEFERRABLE INITIALLY DEFERRED**
  (not RESTRICT) so that deleting a whole project correctly cascades to its
  `project_sites` rows and its project-owned work at the same time (see Deletion
  behavior).

## Framework hierarchy

- `framework_items.parent_id` is a self-reference forming a tree per framework
  (adjacency list; recursive query; no `ltree` in V1).
- Items are **not** assumed to be ISO clauses. `item_type` (free text) may
  represent clause, requirement, scope, category, topic, indicator group,
  emission category, verification area, etc.
- Items may be referenced at any level of the tree by documents, verification
  items and issues.
- `framework_items` are client-independent reference data. They must **not**
  hold activity data, emissions, calculations, products, installations, ESG
  metrics or CBAM operational data. Test: *if the row would be identical for
  every client and project, it may be a framework item; otherwise it belongs in
  a domain table.*
- Per-project or per-site state ("6.1.2 assessed at Viet Long") is not stored on
  framework items.
- Seed data uses clause numbers and short titles only (ISO text is copyrighted).
- **Cycle prevention is application-level (ADR-016).** The database does **not** block an
  item being its own parent or a re-parent that creates a cycle (verified). The
  application must exclude the item itself and all its descendants from the parent
  picker, repeat the check server-side, and build trees cycle-safely. A database trigger
  is deferred (backlog).


## V1 value lists

| Column                              | Values (CHECK)                                             |
| ----------------------------------- | ---------------------------------------------------------- |
| `profiles.role`                     | `admin`, `consultant`                                      |
| `clients.status`                    | `active`, `inactive`                                       |
| `projects.status`                   | `planning`, `active`, `on_hold`, `completed`, `archived`   |
| `activities.status`                 | `planned`, `in_progress`, `completed`, `cancelled`         |
| `activities.mode`                   | `on_site`, `online`                                        |
| `document_reviews.status`           | `under_review`, `revision_required`, `accepted`            |
| `verification_items.result`         | NULL, `verified_ok`, `issue_identified`, `follow_up_required` |
| `issues.status`                     | `open`, `closed`                                           |
| `actions.status`                    | `open`, `in_progress`, `pending_review`, `closed`          |
| `priority` (verification items, issues, actions) | `low`, `medium`, `high`                       |

**Overdue is derived** from `actions.due_date` and `actions.status`; it is never
stored as a status.

**Column defaults** (initial state; used by the migration): `profiles.role` =
`consultant`; `clients.status` = `active`; `projects.status` = `planning`;
`activities.status` = `planned`; `issues.status` = `open`; `actions.status` =
`open`; `priority` = `medium` on verification items, issues and actions;
`documents.is_applicable` = `true`; `framework_items.item_type` = `item`;
`files.storage_provider` = `supabase`. `activities.mode` and
`document_reviews.status` have no default.

## Deletion behavior

Principles:

- **CASCADE** only when the child has no independent business meaning without the
  parent.
- **NO ACTION** (deletion blocked while referenced) for historical or business
  records and referenced reference data, where silent deletion would destroy
  useful history.
- **SET NULL** for optional planning/context relationships and for user
  references, where the child should survive deletion of the referenced record.
- Object storage deletion is **never** a database cascade.

**NO ACTION vs RESTRICT.** Both block deletion while referenced. RESTRICT is
checked immediately and can wrongly block a whole-project delete when
project-owned siblings reference each other (actions → issues,
document versions / attachments → files, project work → `project_sites`).
NO ACTION is checked at the end of the statement, and Postgres runs each
cascade step as its own statement, so even plain NO ACTION can fire before a
sibling cascade has removed its rows (found by testing the migration). The FKs
**between project-owned tables** are therefore declared
`NO ACTION DEFERRABLE INITIALLY DEFERRED`: the check runs at commit, after the
whole project delete has finished, while a stand-alone delete of a referenced row
is still rejected (at commit). These are: the composite `(project_id, site_id)`
site-integrity FKs, `actions.issue_id`, `document_versions.file_id` and
`attachments.file_id`. Other blocking FKs (client, site, framework and framework
item references) use plain NO ACTION because the referenced row is not
project-owned.

| Relationship                                                        | On delete   |
| ------------------------------------------------------------------- | ----------- |
| `profiles.id` → `auth.users`                                        | CASCADE     |
| All user references (`created_by`, `consultant_id`, `reviewer_id`, `uploaded_by`, `verified_by`) → `profiles` | SET NULL |
| `sites.client_id`, `projects.client_id` → `clients`                 | NO ACTION   |
| Project-owned children `project_id` → `projects` (`project_sites`, `project_frameworks`, `activities`, `documents`, `verification_items`, `issues`, `actions`, `files`, `attachments`) | CASCADE |
| `project_sites.site_id` → `sites`                                   | NO ACTION   |
| `project_frameworks.framework_id` → `frameworks`                    | NO ACTION   |
| `activities.activity_type_id` → `activity_types` (ADR-017)          | NO ACTION   |
| `framework_items.framework_id` → `frameworks`                       | CASCADE     |
| `framework_items` self-reference (`parent_id`)                      | NO ACTION   |
| `document_framework_items.framework_item_id`, `verification_items.framework_item_id`, `issues.framework_item_id` → `framework_items` | NO ACTION |
| Composite `(project_id, site_id)` → `project_sites` (all work entities) | NO ACTION |
| `document_versions.document_id` → `documents`                       | CASCADE     |
| `document_framework_items.document_id` → `documents`                | CASCADE     |
| `document_reviews.document_version_id` → `document_versions`        | CASCADE     |
| `document_versions.file_id`, `attachments.file_id` → `files`        | NO ACTION   |
| `verification_items.target_activity_id`, `.verified_activity_id` → `activities` | SET NULL |
| `verification_items.document_review_id`, `.follows_item_id`         | SET NULL    |
| `issues.activity_id`, `.verification_item_id`, `.document_review_id` | SET NULL   |
| `actions.activity_id` → `activities`                                | SET NULL    |
| `actions.issue_id` → `issues`                                       | NO ACTION   |
| `attachments` parent-entity FKs (activity, review, item, issue, action) | CASCADE |

Notes:

- Deleting a client is blocked while it has projects or sites.
- Deleting a project cascades to all project-owned data. Its stored objects
  remain in object storage until removed by the application/cleanup script.
- `NULL` on the profile-reference columns is permitted; none of them is
  structurally required.

## Framework administration (ADR-016)

Frameworks and framework items stay reference/master data and gain **no new columns,
indexes, FKs or triggers**. Migration `20260921000100_framework_admin_write.sql` only adds authorization:

- `grant insert, update, delete` on both tables to `authenticated`, and
- six **admin-only** policies (INSERT, UPDATE, DELETE on each table; UPDATE has both
  `USING` and `WITH CHECK`) that require `profiles.role = 'admin'` for the current user.
  The existing `authenticated read` (SELECT) policies are unchanged.

| Operation | Consultant | Admin | Anon |
| --------- | ---------- | ----- | ---- |
| SELECT | allowed | allowed | denied |
| INSERT | denied (RLS, `42501`) | allowed | denied |
| UPDATE | 0 rows affected | allowed | denied |
| DELETE | 0 rows affected | allowed, subject to FK integrity | denied |

Deletion safety is the existing FK behavior, not policy: a framework assigned to a project
(`project_frameworks`) cannot be deleted; an item referenced by `document_framework_items`,
`verification_items` or `issues` cannot be deleted; an item with children cannot be
deleted; deleting an **unreferenced** framework cascades only to its own items, and is
blocked if any of them is referenced. Editions are separate rows (`UNIQUE (code, edition)`).

## Data API grants

Grants decide whether a role can reach an object at all; RLS decides which rows.
Both are required. Supabase no longer grants privileges on new `public` tables to
the Data API roles automatically (new projects since 2026-05-30, all projects from
2026-10-30), so they are explicit in migration `20260920000500_data_api_grants.sql`:

- Starts with `revoke all on all tables in schema public from anon, authenticated`
  so the result does not depend on the project's "automatically expose new
  tables" setting.
- **`anon`: no privileges** on any table or view (fails closed with `42501`).
- **`authenticated`:** `select, insert, update, delete` on the 15 work tables;
  `select` on `frameworks` and `framework_items` (from Phase 2, migration
  `20260921000100_framework_admin_write.sql` also grants `insert, update, delete`, and Admin-only RLS policies decide who
  may use them; see "Framework administration"); `select, update` on
  `profiles` (RLS also locks `role`); `select` on `document_register`.
- `service_role` is not used by RayIMS in V1 and is not granted.
- Every future migration that adds a table must include its own grants and RLS.

## Indexes (summary)

- Index every FK column.
- `framework_items (framework_id, parent_id, sort_order)`
- `activities (project_id, start_date)`
- `actions (project_id, site_id) WHERE status <> 'closed'`
- `document_versions (document_id, version_no)` (unique)
- `document_reviews (document_version_id, created_at DESC)`
- `document_framework_items (framework_item_id)`
- Partial index per `attachments` FK column
- `files (storage_key)` (unique)

## Cross-entity consistency

Principle: use **database constraints** for important relationships where they
remain simple and maintainable; use **application validation** where database
enforcement would significantly complicate the schema. There is deliberately no
large network of composite foreign keys merely to enforce every same-project
relationship.

Enforced by the database:

- Project/site integrity (composite FKs to `project_sites`) — see Site integrity.
- Framework parent in the same framework (composite self-FK).
- Attachments link to exactly one Core entity (CHECK).
- Value lists (CHECK) and uniqueness constraints above.

Validated by the application:

- A verification item's `target_activity_id` and `verified_activity_id` belong to
  the same project as the verification item (and `verified_activity_id` is not
  a substitute for `target_activity_id`; see verification context rules).
- An issue's origin references (`activity_id`, `verification_item_id`,
  `document_review_id`) and an action's `issue_id` / `activity_id` belong to the
  same project.
- An attachment's parent entity and `files.project_id` match the attachment's
  `project_id`.
- A referenced framework item belongs to a framework used by the project
  (`project_frameworks`).
- A site added to a project's scope (`project_sites`) belongs to the project's
  client (BR-04, BR-57). Not database-enforced.
- A project's `client_id` is not changed after creation (BR-57); the edit screen locks
  it. Not database-enforced.
- A framework item's parent is neither itself nor one of its descendants (BR-55).
- `reviewed_at` is populated when a review reaches `revision_required` or
  `accepted`.
