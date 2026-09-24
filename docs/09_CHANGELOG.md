# 09 — Changelog

Records what has been completed per phase. **No feature CRUD exists yet**; the
application has authentication, the responsive shell and the schema only.

## Phase 3B-1 — Foundation + Master Plan (read) (2026-09-24)

First implementation slice of Phase 3B. **Result: 54/54 acceptance checks, 0 P0/P1
findings.** Full result in `08_TESTING.md`; roadmap status in `06_ROADMAP.md`. Phase
3B-2 (Create/Edit + Activity Detail) has not started.

### Added

- **`activities.start_time` / `end_time`** (migration
  `20260924000300_activities_time_fields.sql`): nullable `time` columns, purely
  additive — no backfill, no change to existing dates, `activity_type_id`, FK
  behavior, RLS or grants. Applied safely regardless of row count (the migration does
  not assume `activities` is empty, unlike Phase 3A's one-time column swap).
- **`listActivities(projectId)`** (`lib/queries/activities.ts`): Project-scoped only —
  no global activities query or route exists. Two queries (activities + the project's
  sites), not N+1: `activities.site_id` has no direct FK to `sites` (only the
  composite FK to `project_sites`), so the site name is resolved the same way
  `getProjectWorkspace` already resolves it for the Overview tab. Default order:
  `start_date` → `start_time` → `name`, nulls last.
- **Master Plan** (`/projects/[projectId]/plan`): the Project Workspace's Plan tab is
  now live, showing a read-only desktop table / mobile cards over the project's
  Activities, with search (name/type/site/consultant) and Site/Type/Status filters.
  Documents/Verification/Issues & Actions/Reports remain inert. A shared
  `ProjectWorkspaceHeader` component (extracted from the former inline Overview
  header) keeps Overview and Plan visually identical apart from the active tab and the
  content below.
- **Display conventions:** project-wide activities show "Project-wide" (never blank);
  `mode`/`status` show humanized labels, never raw `on_site`/`planned`; a multi-day
  date range shows dates only (no times, avoiding an unreadable string); Activity Type
  label is resolved live from `activity_types` (ADR-017 — no snapshot), so an activity
  referencing a now-inactive type still displays correctly and is never hidden.
- **Overdue indicator:** derived only (`effective end date < today AND status NOT IN
  (completed, cancelled)`, effective end date = `end_date` if set else `start_date`) —
  never stored, no fifth status.
- **No new RLS or grants:** `activities` already had `for all to authenticated using
  (true) with check (true)` and full CRUD grants since Phase 0C/0D. Admin and
  Consultant have identical read access to the Master Plan, the same as
  Clients/Projects/Sites — confirmed by direct REST probes, not assumed.
- **Intentionally deferred to Phase 3B-2 (by design, not oversight):** Activity
  create/edit, Activity Detail screen, status change, cancel/delete, Visit Summary
  editing. Rows are not clickable and no "New Activity" button is shown — a dead link
  to a route that doesn't exist yet would be worse than no link.

### Verified

Hosted Supabase, production build, Playwright/Edge, 1280×800 desktop, 390px/412px
mobile: ordering (a 10-row fixture set, not just the sort spec's 4-point example, with
a verified same-time tiebreak by name); project-scope isolation between two temporary
projects; site integrity (cross-project site rejected); ADR-017 inactive-type
regression; display conventions; the Overdue indicator (shown and correctly
suppressed); search/filters; Admin/Consultant read parity; responsive; Phase 2/3A
regression. `npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff
--check` clean. All `P3B1-ACCEPT-*` fixtures removed and confirmed at zero residue;
Test 1, the 4/149 Framework seed and the 8 Activity Type seeds confirmed unchanged; the
real `activities` table remained empty throughout, matching its pre-existing state.

### Not done (intentionally)

Activity create/edit, Activity Detail, status change, cancel/delete, Visit Summary
editing, calendar view, drag/drop scheduling, recurrence, reminders, notifications,
multi-consultant assignment, `activity_frameworks` junction — all Phase 3B-2 or later
per the approved Phase 3B pre-implementation review.

## Phase 3A — Activity Type Foundation (2026-09-24)

Implements ADR-017. **Result: 60/60 acceptance checks, 0 P0, 1 P1 (found and fixed
during acceptance).** Full result in `08_TESTING.md`; roadmap status in
`06_ROADMAP.md`. Phase 3B (Master Plan / Activities) has not started.

### Added

- **`activity_types` table** (migration `20260924000100_activity_type_foundation.sql`):
  dedicated reference table — `id`, unique `key`, `label`, nullable `description`,
  `sort_order`, `is_active` (default `true`), timestamps. Seeded with exactly the 8
  documented values (training, site_assessment, document_review, document_support,
  consulting, online_support, internal_audit, follow_up), all active. RLS mirrors
  Framework Administration (ADR-016): authenticated read; Admin-only insert/update/
  delete; consultant writes blocked at the RLS layer, not just hidden in the UI.
- **`activities.activity_type_id`** replaces the old `activity_type` free-text column
  in the same migration statement (`activities` had zero rows, verified immediately
  beforehand) — FK to `activity_types(id)`, `NO ACTION`, matching the codebase's
  existing implicit-default FK convention.
- **Activity Types admin screen** (`/activity-types`): list (search over label/key/
  description; default order `sort_order` then `label`), Admin-only "+ New Activity
  Type" and row actions (Edit / Activate–Deactivate / Delete); consultant sees the
  list with all admin controls absent, not disabled. Create/Edit uses the established
  drawer (desktop) / full-screen (mobile) pattern.
- **Key immutability:** Key is editable only at create (with a live label→key
  auto-suggestion the Admin can review before saving); the Edit form shows Key
  read-only, and the server-side update action has no `key` field in its schema at
  all, so a changed key can never be written regardless of client input.
- **Controlled delete:** an Activity Type referenced by an Activity is blocked with a
  friendly message (23503 mapped, never a raw Postgres error); an unreferenced type
  (including the 8 seeds, since no Activities exist yet) can be deleted. No
  `is_seeded`/`is_system`/`protected` flag — deletability is purely reference-state
  driven, identical philosophy to Framework Administration.
- Nav: `Activity Types` (`Tags` icon) added alongside `Frameworks` on the desktop
  sidebar and mobile bottom nav; 5 items verified to fit both 390px and 412px without
  overflow.

### Fixed (found during acceptance, P1, in-scope)

- `activity_types` initially inherited full default `anon` privileges at table-creation
  time (a legacy per-table default on this hosted project; every other table had gone
  through an explicit revoke-then-grant that a table created later doesn't inherit).
  RLS already blocked all anon access — no data was ever exposed — but the grant layer
  didn't match the project's documented "anon gets nothing" model. Fixed with
  `20260924000200_activity_types_anon_revoke.sql`; verified `anon` now gets the same
  `401 permission denied` response as `frameworks`, and `authenticated`'s grant set now
  exactly matches (select/insert/update/delete only).

### Verified

Hosted Supabase, production build, Playwright/Edge, 1280×800 desktop, 390px and 412px
mobile: Admin CRUD, key-format and duplicate-key validation, key preserved on edit,
activate/deactivate, referenced-delete blocked using a temporary `P3A-ACCEPT-` fixture
(Activity Type → Client → Project → Activity) then fully cleaned up, unreferenced-delete
allowed; consultant read-only UI and direct RLS probes (insert/update/delete blocked,
zero rows affected); anon access; responsive layouts; Phase 2 regression (Clients,
Projects, Framework Library/Detail/Admin, consultant framework read-only, sticky App
Shell). `npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check`
clean. Test 1 data, the 4/149 Framework seed, and the 8 Activity Type seeds confirmed
unchanged before and after; zero `P3A-ACCEPT` residue left in the hosted project.

### Not done (intentionally)

Activities list, Master Plan, Activity create/edit, scheduling, calendar, Activity
filters, Activity Type selection inside an Activity form, visit planning, verification
linkage, Activity reporting — all Phase 3B. Generic Master Data mechanism (deferred per
ADR-017, not decided).

## Pre-Phase 3 — Master Data Design/Audit & ADR-017 (2026-09-23)

Architecture-decision checkpoint, documentation only — **no application or schema
change**. Completed the pre-Phase-3 Master Data Design/Audit (`06_ROADMAP.md`) and
recorded **ADR-017**: Activity Type will be Admin-configurable from Phase 3's first
implementation via a **dedicated `activity_types` reference table**, FK-referenced from
the existing `activities` table — not a generic `master_data_sets`/`master_data_options`
mechanism. Generic Master Data is explicitly deferred (revisit only if real duplication
appears across future similar fields). Every other current status/taxonomy field is
unchanged. No migration, RLS, or application code has been written yet; Phase 3A
(Activity Type Foundation) and Phase 3B (Master Plan / Activities) remain not started.

## Phase 2 — COMPLETE (2026-09-23)

Phase 2 (Client / Project / Site / Frameworks) is formally closed after passing
Integration / Acceptance review: **157/157 acceptance checks, 0 P0 findings, 0 P1
findings.** Full result in `08_TESTING.md`; roadmap status in `06_ROADMAP.md`.

- Clients & Sites completed (Slice 1)
- Projects and Project Workspace completed (Slice 2)
- Framework Library and Framework Administration completed (Slice 3)
- Phase 2 responsive/sticky UI polish completed (desktop App Shell, Framework Detail
  work header, Project Setup action footer)
- Integration acceptance: PASS — verified the full Client → Site → Project →
  Framework workflow, Admin and Consultant authorization, hierarchy integrity, RLS,
  responsive behavior, and data integrity against the real hosted project
- Seed Framework catalog (4 frameworks / 149 items) and existing user data confirmed
  unchanged before and after acceptance testing
- No database, migration or RLS change during acceptance or this close

**Phase 3 (Master Plan / Activities) has not started.** A Master Data Design/Audit
checkpoint is planned before Phase 3 implementation begins (`06_ROADMAP.md`).

## Phase 2 UI polish — Project Setup sticky actions (2026-09-23)

`components/projects/project-setup-form.tsx` only. Create and Edit Project (the shared
Project Setup form) now share a sticky action footer (Cancel / Create Project or Save
Changes): on desktop the actions stay available while scrolling a long form; on mobile
they stay visible just above the fixed bottom navigation, never overlapping it. The
breadcrumb, page title and Project Identity header remain non-sticky, unchanged. No
database, migration or RLS change.

## Phase 2 Slice 3 — Framework Administration (2026-09-23)

Framework Library, Framework Detail and Admin Framework/Framework Item CRUD implemented.
**All Phase 2 implementation slices (Clients & Sites, Projects Workspace, Framework
Administration) are now complete, but Phase 2 acceptance/integration review is still
pending — Phase 2 is not yet marked complete.** No database, migration or RLS change;
the 4 seeded frameworks and their 149 seeded framework_items are unchanged.

### Added

- **Framework Library** (`/frameworks`): search (code/edition/name/category), real item
  counts, canonical `CODE:EDITION` identity everywhere via the shared
  `formatFrameworkIdentity()`. Admin sees `+ New Framework` and a per-row overflow
  (Edit/Delete); consultant sees neither — absent, not disabled.
- **Framework Detail / hierarchy browser** (`/frameworks/[frameworkId]`): breadcrumb,
  identity header, category, real item count, recursive expand/collapse tree (root
  sections start expanded), item search that flattens to a match list with an
  ancestor-path breadcrumb. No invented ISO text — every string comes from the existing
  seeded rows.
- **Consultant read-only experience:** browse and search only; every admin control is
  absent (not disabled) in the Library, Detail and tree rows. Enforced by RLS
  (ADR-016), not just hidden UI — a direct `POST /rest/v1/frameworks` as consultant
  returns 403.
- **Admin Framework CRUD:** create/edit via the existing right-side drawer (desktop) /
  full-screen (mobile) pattern; a new `requireAdmin()` helper
  (`lib/auth/session.ts`) backs every mutation. Duplicate `(code, edition)` maps to a
  friendly message, never a raw Postgres error. A new edition is verified to create a
  separate row, never overwrite an existing one.
- **Admin Framework Item CRUD:** Add root item, Add Sub-item (parent pre-filled), Edit,
  Delete — all through the same drawer pattern; `sort_order` is assigned by the app.
- **Controlled deletion (BR-53):** a framework assigned to a project, or an item
  referenced by document/verification/issue data or with children, cannot be deleted —
  real FK-backed checks, never a demo `referenced` flag. Deleting an unreferenced
  framework cascades only its own remaining items.
- **Hierarchy integrity (BR-55):** an item's parent can never be itself or one of its
  descendants, and never an item from a different framework. Enforced in the parent
  picker and independently re-checked server-side (verified by bypassing the picker's
  own filtering).
- **Framework category humanization:** category is displayed as `Management System`
  everywhere (Library, Detail) while the stored value stays `management_system`
  (`humanizeCategory()`, `lib/ui/format.ts`). The Create/Edit Framework drawer's
  Category field is a select sourced from the catalog's existing distinct values
  (`listFrameworkCategories()` — no enum, no taxonomy table, no migration), with an
  "Other…" option for a new value.
- **Simplified Framework Item form:** Item Type removed from the normal Add/Edit Item
  UI. New items always get `item_type = "item"` server-side; editing an item never
  writes `item_type` at all, so a seeded item's real type (e.g. `"clause"`) is never
  silently overwritten.
- **Desktop sticky sidebar** (`components/layout/app-shell.tsx`): the shell is pinned to
  the viewport height at `md:` and up, so the sidebar (brand, nav, user, sign out) stays
  in place while a long page's content scrolls independently. Mobile is unchanged
  (whole-page scroll, fixed bottom navigation).
- **Compact sticky Framework Detail work header:** identity, admin Edit/overflow,
  search and `+ Add Item` stay reachable while scrolling a long hierarchy (desktop
  only — `md:sticky`); breadcrumb, the large heading, category and item count scroll
  away normally. Not sticky on mobile, so it never consumes extra viewport height there.
- Nav: `Frameworks` enabled in the sidebar/bottom nav.

### Verified

114 Playwright checks across three passes against the hosted project (production
build): navigation, consultant experience and RLS, admin Framework/Item CRUD, hierarchy
integrity (self/descendant/cross-framework, bypassing the UI picker), controlled delete
(referenced framework, referenced item, item-with-children, leaf item), category
humanization and form behavior, item-type preservation on edit, responsive layouts
(390–412px), the sticky App Shell (sidebar position/height unchanged and the page never
scrolls after a 3000px scroll of a 42-item hierarchy; mobile bottom nav stays fixed),
and regression of Clients/Projects/Project Framework Assignment/Project Workspace
identity. `npm run lint`, `npm run typecheck`, `npm run build` all pass. All temporary
`SLICE3-TEST-*` fixtures were removed after each pass; the 4 seeded frameworks and 149
seeded framework_items were confirmed byte-identical before and after.

### Not done (intentionally)

Framework lifecycle/publication/archive, `is_seeded`/`is_system`, duplicate-as-new-
edition workflow, GRI/ESG/GHG/CBAM frameworks; project-specific compliance status or
implementation assessment; Activities, Documents/Evidence, Verification, Issues &
Actions, Reports; Phase 3+.

## Phase 2 Slice 2 — Projects Workspace (2026-09-23)

Projects List, Project Setup and Project Workspace Overview implemented. **Phase 2 is
not complete**: Framework Administration UI and Activities/Documents/Verification/
Issues & Actions/Reports remain unbuilt. No database, migration or RLS change; framework
seed data unchanged.

### Added

- **Projects List** (`/projects`): search by project or client name, live Site Scope
  (`n of {client's current site total}`, not a frozen snapshot), framework count,
  status badge, single "Edit Project" action via overflow menu (per the approved
  design).
- **Project Setup** (`components/projects/project-setup-form.tsx`): one shared
  create/edit form across three entry modes — global create (`/projects/new`), create
  from Client Detail (`/projects/new?clientId=`, client locked and prefilled) and edit
  (`/projects/[projectId]/edit`, client immutable per BR-57).
- **Site Scope:** checkbox list of the selected client's sites, Select all/Clear all,
  live "n of total selected" count; changing the client during create clears the
  selection (sites belong to the previous client); zero sites is valid and shown as
  informational text, never an error (BR-56).
- **Framework Assignment** (section renamed from "Frameworks" after UI review): catalog
  grouped by category, each row showing the canonical `CODE:EDITION` identity (e.g.
  `ISO 9001:2015`) with the descriptive name as secondary text; zero frameworks is
  valid and informational only (BR-56).
- **Create Project from Client Detail:** `+ New Project` added to the Client Detail
  Projects section; project rows there now link to the project's Workspace.
- **Project Workspace Overview** (`/projects/[projectId]`): breadcrumb, status, real
  site count and real framework identities in the header; Sites and Frameworks cards
  (no per-site status badge — no such column exists); a real "Project" info card
  (client, status, start/end date). The five non-Overview tabs (Plan, Documents,
  Verification, Issues & Actions, Reports) are visible but inert placeholders — no
  route, no navigation, no "CONCEPT" label shipped. No fabricated future-domain data
  (verification progress, issues/actions counts, upcoming activities) was added, per
  BR-59.
- **Responsive behavior:** Projects List (table ⇄ cards), Workspace (two-column ⇄
  single-column grid at 860px) and Setup verified at mobile and desktop widths.
- **Framework identity normalization:** every screen renders framework identity as
  `CODE:EDITION` via one shared helper (`formatFrameworkIdentity` in
  `lib/ui/format.ts`), replacing inconsistent code-only / name-only / no-edition
  displays found in UI review.
- **Native date-picker interaction:** Start/End date fields call the native
  `showPicker()` where supported (feature-detected, try/catch) so clicking anywhere in
  the field opens the picker, not only the calendar icon; no dependency added, no
  custom calendar; keyboard interaction and the stored `YYYY-MM-DD` format are
  unchanged.
- Nav: `Projects` enabled in the sidebar/bottom nav.

### Verified

Playwright checks against the hosted project (production build) covering: create
(global and from Client Detail), edit with add/remove site and framework assignments,
client-side and server-side validation, zero-scope states, responsive layouts, the UI
review fixes above, and regression of Clients List/Detail, auth and framework RLS
(ADR-016 — consultants still cannot write frameworks). `npm run lint`,
`npm run typecheck`, `npm run build` all pass. Temporary test fixtures were removed
after each pass; framework seed data confirmed unchanged before/after.

### Not done (intentionally)

Framework Administration UI; Activities, Documents, Verification, Issues & Actions,
Reports; project/client deletion; Phase 3+.

## Phase 2 baseline update (2026-09-21)

Baseline before Phase 2 implementation. **No Phase 2 screen or application code was implemented.**

### Changed

- **ADR-016 (new): framework administration by Admins.** Frameworks and framework items stay
  reference data; consultants read-only, admins controlled CRUD. ADR-001 and ADR-014 carry
  pointers; BR-45 is marked superseded (history kept).
- **Migration `20260921000100_framework_admin_write.sql`:** grants `insert, update, delete` on `frameworks` and
  `framework_items` to `authenticated` and adds six admin-only RLS policies
  (`profiles.role = 'admin'`). No columns, indexes, FKs, triggers or functions. Applied to the
  hosted project; regenerated types are identical.
- **Docs:** `CLAUDE.md` (design path is `docs/phase-2/`; approved set; framework rule),
  `01_V1_SCOPE`, `02_ARCHITECTURE`, `03_DATABASE`, `04_BUSINESS_RULES` (BR-52 to BR-60,
  BR-42/45/49 amended), `05_UI_UX_GUIDELINES` (Phase 2 UI patterns), `06_ROADMAP`,
  `07_DECISIONS`, `08_TESTING` (Phase 2 baseline results and test specification),
  `10_RUNBOOK`.
- **Design references:** `docs/phase-2/` now holds only the five final approved files; the
  superseded Project Workspace Overview variant was removed. `Project Workspace Overview
  v1.dc.html` is the approved workspace reference. No `.dc.html` file was edited.

### Verified on the hosted project (see `08_TESTING.md`, TC-P2B-*)

Consultant, admin and anon framework access; referenced and parent-item deletes blocked by FK
integrity; unreferenced deletes allowed; editions and uniqueness; Phase 0D regression
(anon 9/9, database behavior 66/66, auth/RLS/storage 53/53, catalog 37/41 with 4 intended
differences).

### Incident (recorded, resolved)

The old Phase 0D step-2 test script attempted framework writes as admin expecting denial.
Under ADR-016 they succeeded and modified seeded data (ISO 9001 name, a stray framework `X`,
four item titles). The data was restored and verified identical to the seed baseline (only
`updated_at` on six rows differs). The regression copy no longer writes to framework tables.

### Not done (intentionally)

Phase 2 implementation; application-level Phase 2 tests (specified only). Backlog: DB
hierarchy-cycle trigger; atomic `save_project`; DB guards for site/client consistency and
immutable project client; client and project deletion; duplicate-as-new-edition; site status.

## Phase 1 — Authentication & App Shell (2026-09-21)

Completed: 17 PASS, 0 FAIL, 2 NOT TESTED (see `08_TESTING.md`). No database, RLS or framework change.

### Added / changed

- **Sign-out is local:** `signOut({ scope: "local" })` ends only the current device's
  session (the Gap Review showed the default global scope logged out the phone when the
  laptop signed out). Sign-out button shows a pending state.
- **Return path:** `lib/auth/redirect.ts` `safeNextPath()`; the proxy adds `?next=` for
  protected deep links, the login page and the sign-in action validate it, and a signed-in
  user opening `/login?next=` is redirected safely. Relative internal paths only.
- **Login errors:** `lib/auth/errors.ts`; only `invalid_credentials` shows "Invalid email or
  password."; everything else gets one generic message. The form keeps the email, and sets
  `aria-invalid` / `aria-describedby`.
- **Mobile inputs:** 16 px on small screens (no iOS focus-zoom); email
  `inputMode`/`autoCapitalize`/`autoCorrect`/`spellCheck` attributes.
- **`lib/auth/session.ts`:** request-cached `getCurrentUser()` and `requireUser()`
  (`getClaims()`); the workspace layout uses it.
- **Error experience:** `app/not-found.tsx`, `app/(workspace)/error.tsx`,
  `app/global-error.tsx` (uses the Next.js 16 `retry` prop), title template `%s · RayIMS`,
  `buttonClasses()` and `MessagePanel` helpers.
- **Security headers** in `next.config.ts`: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
  No CSP, no Permissions-Policy (camera must stay available).
- **Docs:** `docs/10_RUNBOOK.md` (new), `CLAUDE.md` index and rules, BR-46 to BR-51,
  `02_ARCHITECTURE.md`, roadmap and testing.

### Not changed

Accepted Phase 0D limitations (CDN deletion lag, stateless JWT after sign-out) are unchanged.
No browser-test script or dependency was added to the repository.

## Phase 0D — Supabase Integration & Real Backend Verification (2026-09-21)

Completed: 36 PASS, 1 FAIL (accepted platform limitation), 1 informational note.

### Added / changed

- Migration `20260920000500_data_api_grants.sql`: explicit Data API grants (Supabase no
  longer auto-grants privileges on new `public` tables). Revokes everything from
  `anon` / `authenticated` first (the hosted project still had legacy default
  privileges), then grants least-privilege: `anon` nothing; `authenticated` CRUD on
  work tables, SELECT on frameworks, SELECT+UPDATE on profiles, SELECT on
  `document_register`. Documented in `03_DATABASE.md` ("Data API grants").
- `types/database.ts` generated from the hosted schema; browser/server/proxy Supabase
  clients are typed with `Database`. Hand-written `types/domain.ts` is kept (CHECK
  columns are `string` in generated types).
- `supabase/config.toml` and `supabase/.gitignore` from `supabase init`.
- `docs/03_DATABASE.md`: repaired a double-encoding defect (garbled characters) that
  had been introduced in the baseline commit; one wording fix.
- `docs/02_ARCHITECTURE.md`: generated-types statement updated.

### Verified on the hosted project (see `08_TESTING.md`)

36 PASS, 1 FAIL, 1 informational note: schema, RLS, grants, seed, derived document
status, profile role lock, authenticated CRUD, real browser login / session refresh /
sign-out / forged cookie, private Storage (signed URLs, size limit, `lib/storage`),
sign-up disabled at Supabase level, lint / typecheck / build.

Public sign-up was found **enabled** on the first run (TC-P0D-AUTH-001 failed). The owner
disabled it in the dashboard and the re-run passed (`disable_signup = true`, sign-up
attempts rejected with `signup_disabled`, still exactly 2 users).

### Accepted limitations, notes and backlog

- **Storage deletion vs CDN (TC-P0D-STO-006, stays FAIL): decided by the owner.** Accepted platform limitation – Supabase CDN cache invalidation after object deletion may take up to approximately 60 seconds. Database metadata is removed immediately, new/unfetched access is denied, but a previously fetched object using the same cached authorization context may remain retrievable until CDN invalidation propagates.
  The storage architecture is unchanged in Phase 0D. Backlog: Evaluate a shorter `cacheControl` for uploaded RayIMS evidence/documents if stronger post-delete revocation is required. **Not implemented; no change to the storage architecture in Phase 0D.**
- **Sign-out and stolen cookies:** `getClaims()` verifies the JWT locally, so a copied
  pre-sign-out cookie works until the access token expires (default 1 h); the refresh
  token is revoked on sign-out. Shorter JWT expiry or `getUser()` would trade cost for
  immediacy.
- **Do not run `supabase config push`:** the local `config.toml` template differs from
  the hosted project on 13 auth/db settings and would overwrite them.

## Phase 0C — Foundation Implementation (2026-09-20)

Foundation only; no feature CRUD.

### Added

- Next.js 16.3.5 app (TypeScript, App Router, Tailwind 4) with
  `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `lucide-react`, `clsx`.
- Folder structure: `app/`, `components/`, `lib/`, `types/`, `supabase/`.
- `.env.example` (placeholders only) and a `.gitignore` that excludes env files.
- Supabase clients (browser, server) and `proxy.ts` session handling using
  `getClaims()`.
- Migrations: `20260920000100_core_schema.sql` (18 tables + `document_register`
  view), `20260920000200_rls_policies.sql`, `20260920000300_storage_bucket.sql`,
  `20260920000400_seed_frameworks.sql` (ISO 9001:2015, 14001:2015, 45001:2018,
  50001:2018; item numbers and short labels only).
- `lib/storage` (provider interface, Supabase implementation, key builder),
  value-list constants, activity type list, domain types.
- Responsive shell (desktop sidebar, mobile top bar and bottom navigation, page
  container), empty dashboard placeholder, login page and sign-in / sign-out
  server actions. No sign-up UI.
- `AGENTS.md` (generated by Next.js) referenced from `CLAUDE.md`.
- `npm run typecheck` script.

### Changed (documentation)

- Foreign keys between project-owned tables (composite site FKs,
  `actions.issue_id`, `document_versions.file_id`, `attachments.file_id`) are
  `NO ACTION DEFERRABLE INITIALLY DEFERRED`; found when testing whole-project
  delete. Recorded in `03_DATABASE.md` and OI-3.
- `03_DATABASE.md`: column defaults, derived status codes, and the application
  rule that a project site belongs to the project's client.
- `02_ARCHITECTURE.md`: "items to verify" replaced by what was verified.

### Verified

- `npm run lint`, `npm run typecheck`, `npm run build`: pass.
- Production server: unauthenticated `/`, `/dashboard` and other routes redirect
  to `/login`; `/login` renders; no sign-up UI.
- Migrations applied in order to an in-memory Postgres (PGlite) with stubbed
  Supabase `auth` / `storage` / roles: 101 ad-hoc checks passed (site integrity,
  hierarchy, CHECKs, attachments constraint, multiple reviews, derived document
  status, delete behavior incl. whole-project cascade, RLS for anon and
  authenticated). This script is not part of the repository.

### Not verified

- Migrations against a real Supabase project (none exists yet).
- A real login round trip and real Supabase Storage behavior.

## Phase 0B — Documentation Baseline (2026-09-20)

### Open Items resolved (baseline approved)

- OI-1: review ordering by `created_at`; rule is "latest review record for the
  latest document version"; `updated_at` added to `document_reviews`; timestamp
  semantics documented.
- OI-2: database constraints where simple; application validation for
  same-project verification target/verified activities and similar links.
- OI-3: final delete behavior (CASCADE / NO ACTION / SET NULL principles;
  NO ACTION instead of RESTRICT so whole-project deletes cascade).
- OI-4: V1 value lists fixed (`projects.status` includes `on_hold`).
- Roadmap: 0B marked completed, 0C current.

### Initial baseline

- Created `CLAUDE.md` and `docs/00`–`09` as the repository source of truth.
- Applied the Phase 0A approval corrections:
  - Per-project numbering deferred (no `issue_seq` / `action_seq` / triggers).
  - `document_reviews.document_version_id` is not unique.
  - `verification_items` separate `target_activity_id` (planned) from
    `verified_activity_id` (actual).
  - Core attachment rule recorded: future modules must not add domain FK columns
    to `attachments`; they create their own junction tables to `files`.
  - `files` registry, derived document status, client-level sites and the
    framework model recorded as approved.
- Recorded Open Items (OI-1 to OI-4) in `07_DECISIONS.md`.
- No application code, packages, migrations or Supabase resources were created.

## Phase 0A — Architecture Review (2026-09-20)

- Architecture review completed and approved with corrections.
- Repository check: the folder was empty and not a git repository.
