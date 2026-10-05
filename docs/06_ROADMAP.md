# 06 — Roadmap

| Phase | Name                                        | Status        |
| ----- | ------------------------------------------- | ------------- |
| 0A    | Architecture Review                         | **COMPLETED** |
| 0B    | Documentation Baseline                      | **COMPLETED** |
| 0C    | Foundation Implementation                   | **COMPLETED** |
| 0D    | Supabase Integration & Backend Verification | **COMPLETED** |
| 1     | Authentication & App Shell                  | **COMPLETED** |
| 2     | Client / Project / Site / Frameworks        | **COMPLETED** |
| 3A    | Activity Type Foundation                    | **COMPLETED** |
| 3B    | Master Plan / Activities                    | **COMPLETED** |
| — 3B-1 | Foundation + Master Plan (read)            | **COMPLETED** |
| — 3B-2 | Create / Edit + Activity Detail            | **COMPLETED** |
| — 3B-3 | Status / Cancel / Delete + final 3B acceptance | **COMPLETED** |
| 4     | Verification / Issues / Actions             | **COMPLETED / CLOSED** |
| — 4A  | Verification foundation + workspace        | **COMPLETED** |
| — 4B  | Activity verification + mobile execution   | **COMPLETED** |
| — 4B.5 | Verification Excel import                 | **COMPLETED** |
| — 4C-1 | Finding foundation                        | **COMPLETED** |
| — 4C-2 | Verification → Finding integration        | **COMPLETED** |
| — 4D-1 | NC response & Corrective Actions          | **COMPLETED** |
| — 4D-2 | Effectiveness Review, NC closure & Reopen | **COMPLETED** |
| — 4E  | Evidence / Attachments                     | **COMPLETED** |
| — 4E.6 | UX polish                                 | **COMPLETED** |
| — 4F  | Controlled delete, overdue-actions overview, Phase 4 final acceptance | **COMPLETED** |
| 5     | Documents / Versions / Reviews              | **COMPLETED / CLOSED** |
| — 5A  | Document Register foundation                | **COMPLETED** |
| — 5B  | Document Versions                           | **COMPLETED** |
| — 5C  | Document Gap Assessment (reviews)           | **COMPLETED** |
| — 5D  | Review → Finding / Verification Item        | **COMPLETED** |
| — 5E  | Required Document Excel Import              | **COMPLETED** |
| — 5F  | Gap Assessment Export                       | **COMPLETED** |
| — 5G  | Phase 5 final acceptance                    | **COMPLETED** |
| 6     | Visit Summary / Reporting (Activity Report) | **COMPLETED / CLOSED** |
| — 6A  | Finding numbering                           | **COMPLETED** |
| — 6B  | Activity Report narrative                   | **COMPLETED** |
| — 6C  | Activity Report data integration            | **COMPLETED** |
| — 6D  | Activity Report DOCX export                 | **COMPLETED** |
| — 6E  | Phase 6 final acceptance                    | **COMPLETED** |
| 7     | Dashboard / Polish / Pilot readiness        | **IN PROGRESS** (7A completed; 7B next) |

> **The product workflow remains flexible.** The implementation order above does
> **not** imply that Document Review must occur after Site Verification. Phase 4
> (Verification / Issues / Actions) precedes Phase 5 (Documents / Versions /
> Reviews) only as an implementation strategy to prove the mobile site-work loop
> early. Verification items can be created manually without documents, and
> Document Review may occur before or after Site Assessment depending on the
> project (BR-01).

## Phase 0A — Architecture Review [COMPLETED]

Architecture review of the initial proposal, approved with corrections
(recorded in `07_DECISIONS.md`).

## Phase 0B — Documentation Baseline [COMPLETED]

Made the approved architecture the repository source of truth: `CLAUDE.md` and
`docs/00`–`09`. Open Items OI-1 to OI-4 were resolved and the documentation
updated. Committed as the documentation baseline.

## Phase 0C — Foundation Implementation [COMPLETED]

Delivered (foundation only; no feature CRUD):

- Next.js 16 (TypeScript, App Router, Tailwind) initialized; foundation
  dependencies only (`@supabase/supabase-js`, `@supabase/ssr`, `zod`,
  `lucide-react`, `clsx`); folder structure per `02_ARCHITECTURE.md`
- `.env.example` (placeholders only); no secrets committed
- Supabase browser/server clients and `proxy.ts` session handling
- Initial migrations for the approved Core schema, RLS foundations, private
  storage bucket, and framework seed data (`supabase/migrations/`)
- `lib/storage` provider abstraction, value-list constants, domain types
- Design tokens and the responsive shell (desktop sidebar, mobile navigation,
  page container, empty dashboard placeholder); login foundation without sign-up
- Lint, typecheck and production build pass

The hosted project, migrations and real login round trip were handled in Phase 0D.

## Phase 0D — Supabase Integration & Backend Verification [COMPLETED]

Connect the foundation to a real hosted Supabase project and verify Next.js, Auth,
PostgreSQL, RLS and Storage. Results are in `08_TESTING.md` (TC-P0D-*).

Done: five migrations applied (including explicit Data API grants), schema / RLS /
grants / storage / auth / session behavior verified on the hosted project, database
types generated (`types/database.ts`), lint / typecheck / build pass.

**Result: 36 PASS, 1 FAIL, 1 NOTE** (see `08_TESTING.md`). Public sign-up was found
enabled on the first run, the owner disabled it in the dashboard, and TC-P0D-AUTH-001
then passed.

**Test results vs accepted limitations.** Phase 0D distinguishes test PASS results from
owner-accepted platform limitations. TC-P0D-STO-006 remains a **FAIL** and is **not**
counted as a pass; its disposition is: *Accepted platform limitation – Supabase CDN cache invalidation after object deletion may take up to approximately 60 seconds. Database metadata is removed immediately, new/unfetched access is denied, but a previously fetched object using the same cached authorization context may remain retrievable until CDN invalidation propagates.*

## Backlog / future hardening

Not scheduled and not implemented:

- Evaluate a shorter `cacheControl` for uploaded RayIMS evidence/documents if stronger post-delete revocation is required. **Not implemented; no change to the storage architecture in Phase 0D.** (from TC-P0D-STO-006; see `08_TESTING.md`)
- Consider a shorter access-token lifetime, or `getUser()`, if copied-cookie replay after
  sign-out (TC-P0D-AUTH-013) becomes a concern; this trades cost for immediacy.
- In-app password change / reset screen (V1 relies on the runbook procedure).
- Skip-to-content link and showing the signed-in user in the mobile top bar (optional polish).
- Full Content-Security-Policy and HSTS review (Phase 7 hardening; HSTS is normally set by
  the hosting platform). Do not add a Permissions-Policy that blocks the camera.
- A repeatable browser test script would need a dev dependency and credentials; not added
  in Phase 1 by decision.
- "Sign out everywhere" is intentionally **not** planned for V1.

## Phase 1 — Authentication & App Shell [COMPLETED]

Login (no public sign-up), session handling, responsive shell (sidebar / mobile
navigation). Built on the Phase 0C foundation; Phase 1 closed the gaps found in the Gap
Review. Results: 17 PASS, 0 FAIL, 2 NOT TESTED (`08_TESTING.md`, TC-P1-*).

Delivered:

- Sign-out for the current device only (BR-46); pending state on the button
- Safe `next` return path through sign-in (BR-47); no open redirect
- Accurate sign-in errors without account enumeration (BR-48); `aria-invalid` /
  `aria-describedby`; 16 px mobile inputs and email input attributes
- `lib/auth/session.ts` (`getCurrentUser`, `requireUser`) used by the workspace layout and
  ready for Phase 2 Server Actions (BR-50)
- Branded not-found, workspace error boundary and global error fallback; title template
- Minimal security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`); no CSP yet
- Operations runbook (`docs/10_RUNBOOK.md`)

Placeholders that intentionally remain until their phase: dashboard metrics (Phase 7);
Clients / Projects / Frameworks navigation (disabled, Phase 2).

## Phase 2 — Client / Project / Site / Frameworks [COMPLETED]

Scope: Clients, Sites (client-level), Projects, Project Setup (identity, site scope,
framework assignment; full page), Project Workspace **Overview with real data only**
(sites, frameworks, project information), Framework Library and Detail for everyone,
and **Framework Administration for Admins** (create, edit, controlled delete; ADR-016).
UI references: `docs/phase-2/`. The other workspace tabs (Plan, Documents,
Verification, Issues & Actions, Reports) are disabled until their phases.

**Baseline update:** ADR-016 and the document amendments; migration
`20260921000100_framework_admin_write.sql` (Admin-only framework writes) applied and
verified on the hosted project; approved design set reduced to the final files.

**Delivered (three slices + UI polish):**

- Clients and Sites (client-level, reusable across projects)
- Project Setup: identity, Site Scope, Framework Assignment (shared create/edit form)
- Project Workspace: real data only (sites, frameworks, project information)
- Framework Library and Framework Detail (hierarchy browser)
- Framework hierarchy administration (Admin create/edit/controlled delete, cycle-safe
  parent picker enforced client- and server-side)
- Admin / Consultant framework authorization (ADR-016; RLS-backed, not UI-only)
- Responsive Phase 2 UX across every screen (desktop table ⇄ mobile card/full-screen
  patterns)
- Sticky desktop App Shell (fixed sidebar, independently scrolling content)
- Sticky Framework Detail work header (compact, desktop only)
- Sticky Project Setup action footer (desktop and mobile, above the bottom nav)

**Integration / Acceptance review (2026-09-23): PASS.** 157/157 acceptance checks
(hosted Supabase, production build, Playwright/Edge, 1280×800 and 390/412px), 0 P0
findings, 0 P1 findings. Full results: `08_TESTING.md`. Seed Framework catalog (4
frameworks / 149 items) and existing user data verified unchanged before and after.

Intentionally deferred from Phase 2 (backlog, not blockers — still open): DB trigger
against framework hierarchy cycles; atomic `save_project` function; DB guards for
site/client consistency and immutable project client; client and project deletion;
"duplicate framework as new edition"; site status; full framework lifecycle /
versioning / archive (excluded by design — ADR-016, not merely deferred).

> **Pre-Phase-3 Master Data Design/Audit: COMPLETE.** Reviewed every current and
> planned V1 status/taxonomy field against system-state vs. configurable-Master-Data
> vs. dedicated-reference-data criteria. **Decision (ADR-017):** Activity Type will be
> Admin-configurable from Phase 3's first implementation, via a **dedicated
> `activity_types` reference table** with an FK from the existing `activities` table
> (`activity_type_id uuid REFERENCES activity_types(id)`), not a generic
> `master_data_sets`/`master_data_options` mechanism. Every other current
> status/taxonomy field stays exactly as it is (`03_DATABASE.md`, `04_BUSINESS_RULES.md`
> unchanged). See ADR-017 for the full analysis and reasoning. **No schema, migration,
> RLS or application code exists yet** — this is a recorded decision, not an
> implementation.

## Phase 3A — Activity Type Foundation [COMPLETED]

Delivered (per ADR-017): the `activity_types` table, seeded with the 8 documented
starting values (training, site_assessment, document_review, document_support,
consulting, online_support, internal_audit, follow_up); Admin-only write /
authenticated-read RLS mirroring Framework Administration (ADR-016); the existing
`activities.activity_type` (free text) replaced by `activity_type_id` (FK, NO ACTION —
safe because `activities` had zero rows); an "Activity Types" list screen (search,
create, edit label/description/sort order, activate/deactivate, controlled delete) with
key immutable after creation both in the UI and the server-side update path; navigation
entry (`Tags` icon) alongside Frameworks on desktop sidebar and mobile bottom nav (5
items fit both 390px and 412px without overflow).

**Verified (2026-09-24): 60/60 acceptance checks** (hosted Supabase, production build,
Playwright/Edge, 1280×800, 390px, 412px) — Admin CRUD, Consultant read-only, direct RLS
probes (insert/update/delete blocked, anon denied at the grant layer), referenced-delete
blocked / unreferenced-delete allowed (temporary fixtures only), responsive, Phase 2
regression. Full results: `08_TESTING.md`.

**Finding fixed during acceptance (P1, in-scope):** the new `activity_types` table
initially inherited full default privileges for `anon` at creation time (a legacy
per-table default on this project, unlike every other table which went through an
explicit revoke-then-grant). RLS already blocked all anon access throughout — no data
was exposed — but the grant layer didn't match the project's documented "anon gets
nothing" model. Fixed with a follow-up migration
(`20260924000200_activity_types_anon_revoke.sql`); verified `anon` now gets the exact
same `401 permission denied` as `frameworks`.

Out of scope (unchanged): Document Type, Issue Category, Evidence Type, Report Type,
multilingual labels, organization-specific options, bulk import, drag-and-drop ordering,
audit log, label version history, approval workflow.

## Phase 3B — Master Plan / Activities [IN PROGRESS]

Activity planning and list/detail views; project-wide and site-specific activities; no
drag-and-drop. `activities.activity_type_id` references the Phase 3A `activity_types`
table (no further schema change needed for the Activity Type side of this phase).

### Phase 3B-1 — Foundation + Master Plan (read) [COMPLETED]

Delivered: `activities.start_time` / `end_time` (nullable, additive migration, no
backfill); `listActivities(projectId)` (Project-scoped, no global route);
`/projects/[projectId]/plan` — the Master Plan is now a live Project Workspace tab
alongside Overview (Documents/Verification/Issues & Actions/Reports stay inert); a
shared `ProjectWorkspaceHeader` so Overview and Plan present identical project
identity; desktop table / mobile cards with search and Site/Type/Status filters;
default order `start_date` → `start_time` → `name`, undated last; a subtle "Overdue"
indicator (derived, not stored). No create/edit/status-change/delete UI — this slice is
read-only by design; no new RLS or grants were needed (`activities` already had full
authenticated CRUD since Phase 0C/0D).

**Verified (2026-09-24): 54/54 acceptance checks** (hosted Supabase, production build,
Playwright/Edge, 1280×800, 390px, 412px) — ordering (including same-time tiebreak by
name), project-scope isolation between two temporary projects, site integrity
(cross-project site rejected), ADR-017 regression (an activity referencing a now-
inactive type still displays correctly), Admin/Consultant read parity, responsive,
Phase 2/3A regression. Full results: `08_TESTING.md`.

### Phase 3B-2 — Create / Edit + Activity Detail [COMPLETED]

Delivered: Activity create/edit (shared drawer/full-screen form, desktop/mobile) from
the Master Plan's `+ New Activity` and from Activity Detail's `Edit Activity`; the
dedicated `/projects/[projectId]/activities/[activityId]` route (Master Plan rows/cards
now navigate there); server-side date/time validation (BR-64); Activity Type picker
behavior — active-only on create, current-inactive-preserved on edit, no other inactive
type ever offered (BR-65); Activity Detail's Plan/Outcome separation with unrestricted
Outcome editing (BR-66); `createActivity`/`updateActivity` Server Actions using
`requireUser()` (not `requireAdmin()` — Activities follow the Clients/Projects/Sites
authorization model, not Framework Administration's, BR-67), with `project_id` always
taken from trusted route context and re-verified against the existing row on update, so
a Project A update request can never reach a Project B Activity.

**Verified (2026-09-24): 68/68 acceptance checks** (hosted Supabase, production build,
Playwright/Edge, 1280×800, 390px, 412px) — create/edit for every combination in the
approved review's fixture set (project-wide/site-specific, on-site/online,
unassigned/assigned consultant, same-day and multi-day schedules, planned_days,
Objectives/Planned Work, Outcome editing), all listed date/time and reference-integrity
validations rejected with friendly messages (including three injected past the UI
picker — inactive type, out-of-scope site, nonexistent consultant — server-side defense
in depth), the full inactive-Activity-Type-on-edit regression (§26 of the review),
cross-project protection, Admin/Consultant parity, Master Plan reflecting create/edit
(including re-ordering after a schedule change), responsive, Phase 2/3A/3B-1
regression. Full results: `08_TESTING.md`.

**Findings:** one real validation bug found and fixed during this slice (P1, in-scope —
`z.coerce.number()` on an empty `planned_days` field coerced to `0`, not `undefined`,
before ever reaching the "not provided" branch, since `Number("")` is `0` in
JavaScript; fixed with `z.preprocess` so the empty-string case is intercepted before
coercion runs). One pre-existing, cross-cutting platform behavior noted as BACKLOG, not
fixed in this slice: `notFound()` returns HTTP 200 (not 404) with the not-found page
rendered — confirmed identical on the pre-existing Framework/Client/Project detail
routes, not something Activity Detail introduced; no data is exposed either way. One
report-only typo from the Phase 3B-1 report was confirmed harmless (a multi-day fixture
example was mistakenly written "29 Sep 2026 – 31 Sep 2026" in that report's prose; the
actual fixture data and UI both used the real, valid range 29–31 **Oct** 2026 — no code
or data defect).

### Phase 3B-3 — Status / Cancel / Delete + final Phase 3B acceptance [COMPLETED]

Delivered: a single quick-change status control on Activity Detail (Planned/In
Progress/Completed — Cancel is deliberately not one of these buttons, so cancelling is
never offered two competing ways); **Cancel Activity** as its own confirmed action
(`status = cancelled`, no data touched, reversible through the normal status control —
no `cancelled_at`); **Delete Activity** as a controlled, application-level delete —
blocked whenever the Activity is referenced by `verification_items
.target_activity_id`/`.verified_activity_id`, `issues.activity_id`,
`actions.activity_id` or `attachments.activity_id` (checked *before* the delete runs,
not inferred from the database's own CASCADE/SET NULL behavior — `attachments` is
CASCADE and would otherwise silently remove evidence), with a friendly business
message, never a raw FK error; both actions live in Activity Detail's overflow menu
next to Edit, keeping the header to one primary button on mobile. Master Plan now
shows a restrained overdue badge and de-emphasizes (not hides) cancelled rows, both
already established in Phase 3B-1/3B-2 and re-verified here across a full overdue
matrix. Project Workspace Overview gained a small **Upcoming Activities** widget
(`status NOT IN (completed, cancelled) AND start_date >= today`, ordered
`start_date → start_time → name`, limit 3, scoped query — not the whole Master Plan)
with a "View Plan" link and a compact empty state. No schema change, no new RLS/grants.

**Verified (2026-09-24): 76/78 acceptance checks on the live run** (hosted Supabase,
production build, Playwright/Edge, 1280×800, 390px, 412px) — the full Chinh Long IMS
end-to-end scenario (3 activities, chronological ordering, Outcome editing,
planned→in_progress→completed→planned, Cancel with confirmation and reactivation,
unreferenced delete, all 5 reference paths individually blocked with the reference
rows verified intact at the database level afterward), the full 7-point overdue
matrix, cancelled-row display/filter/search, Project A/B cross-project protection
(content-based, consistent with the pre-existing app-wide `notFound()` behavior),
Upcoming Activities (inclusion/exclusion rules, limit, empty state), Admin/Consultant
parity, anon denial, responsive, full regression. The 2 non-passes were both confirmed
as test-script bugs (a stray hyphen in a SQL `LIKE` pattern, and a locator counting the
"View Plan" link alongside the 3 activity rows it was scoped over) — independently
re-verified correct by direct query against the same live data immediately afterward:
all 5 referenced Activities intact, and the Upcoming Activities query confirmed
returning exactly 3 rows. Full results: `08_TESTING.md`.

## Phase 3B — Master Plan / Activities: CLOSED

All three slices (3B-1 read foundation, 3B-2 create/edit/detail, 3B-3 status/cancel/
delete + Overview integration) are complete and verified against the real hosted
project. `activities` now supports the full V1-scope planning/execution lifecycle
described in `01_V1_SCOPE.md` item 6, with no schema beyond the Phase 3B-1
`start_time`/`end_time` addition and no new RLS/grants beyond what `activities`
already had since Phase 0C/0D.

## Phase 4 — Verification / Issues / Actions [COMPLETED / CLOSED]

Verification items (manual, scheduled, completed with result, carry-over),
issues, actions, open-action surfacing data. First evidence upload and
attachments (files registry, storage integration) land here.

### Phase 4A — Verification foundation + Project Verification workspace [COMPLETED]

Delivered (per the Phase 4 pre-implementation review): no schema change —
`verification_items` already supported the full V1 planning/execution model. The
Project Workspace's inert "Verification" tab is now live
(`/projects/[projectId]/verification`); desktop table / mobile cards with search and
Site/Target Activity/Result/Framework filters; deterministic planning order (pending
before completed, then Target Activity date/time, then priority, then question —
applied in application code, since it orders by a related table's columns that
PostgREST cannot express in one query's `.order()`); Create/Edit for **planning
fields only** (`question`, `priority`, `site_id`, `target_activity_id`,
`framework_item_id`) — Result is read-only in 4A, execution is Phase 4B, and the
planning mutation never touches `result`/`notes`/`verified_activity_id`/
`verified_by`/`verified_at` even under a tampered request (BR-72). The approved
site-inheritance rule (BR-73) is enforced both in the UI (the Site field is replaced
by a locked read-only box while a site-specific Target Activity is selected) and
server-side (independent of what the picker sent). Framework Requirement is optional,
scoped to the project's currently assigned Frameworks, with historical preservation
for an item whose Framework was since unassigned (BR-74) — the workspace-level
catalog resolves every framework item actually referenced across the whole list, not
just one record, since (unlike Activity Detail) a list page can have many different
"current" historical values at once.

**Verified (2026-09-24): 73/73 acceptance checks** (hosted Supabase, production
build, Playwright/Edge, 1280×800, 390px, 412px) — full Create/Edit matrix (project-
wide, site-specific, target-site-specific with locked site, target-project-wide with
both scope options, framework-mapped), the exact deterministic ordering verified
against an 11-row fixture set (not just a spec example), execution-field preservation
proven at the database level after a planning-only edit, the full historical-Framework
regression (current item preserved/marked/re-selectable, no other unassigned item
offered), project-scope isolation, Admin/Consultant parity, anon denial, and
regression across Clients/Projects/Frameworks/Activity Types/Overview/Master Plan.
Full results: `08_TESTING.md`.

**Finding fixed during acceptance (in-scope):** the initial `getVerificationFormCatalog`
design took a single "current framework item" parameter (mirroring Activity Detail's
per-record catalog) — but the Verification workspace is a *list* page, where different
rows can each reference a *different* historically-unassigned Framework Item at the
same time. Fixed by deriving the full set of historically-referenced-but-unassigned
Framework Items from the project's actual verification items in one query, instead of
one parameterized value.

### Phase 4B — Activity verification + mobile execution [COMPLETED]

Delivered: a new **Verification** section on Activity Detail, between Plan and
Outcome (the two-column Plan/Outcome grid became a vertical stack to fit it in that
exact order); items shown are `target_activity_id = this Activity` OR
`verified_activity_id = this Activity`, de-duplicated by id, so a check planned here
but completed elsewhere (or vice versa) still appears, labeled "Completed in another
activity" / "Planned for another activity" (BR-76) — with no execute/edit action
offered for the former, so execution context can never be silently reassigned between
Activities. **+ Add Check** reuses the exact 4A planning form/mutation with the
Target Activity preset (and Site pre-locked when the Activity is site-specific, per
the existing 4A rule) — no second planning form. A hybrid execution drawer (Result —
Verified OK / Issue Identified / Follow-up Required, as full-width stacked buttons
for reliable readability at any width — plus an optional Observation) records the
result in place on the same row; Result is required to save (BR-75), and neither
*Issue Identified* nor *Follow-up Required* creates anything beyond the Verification
result itself (BR-77) — Phase 4C-2 owns Verification → Finding. `recordVerificationResult`
derives `verified_activity_id`/`verified_by`/`verified_at` entirely server-side and
never touches planning fields (BR-72).

**Verified (2026-09-25): 74/74 acceptance checks** (hosted Supabase, production
build, Playwright/Edge, 1280×800, 390px, 412px) — a 9-check density scenario on one
Activity (the real Chinh Long 3-check scenario plus filler/cross-activity items);
execution acceptance for all three results including the explicit "no Issue/Action/
new item auto-created" checks; Result-required validation; re-edit preloading and
overwrite semantics; the full cross-activity traceability matrix (both directions);
Add Check from both a site-specific and a project-wide Activity; cross-project
protection; Admin/Consultant parity and anon denial; responsive; Project Verification
workspace and Phase 3B Activity regression. Full results: `08_TESTING.md`.

No database migration, no RLS/grant change — `verification_items` already supported
this model (Phase 4 pre-implementation review). During this slice's acceptance, real
user-created data was found in the hosted project for the first time (a "Chinh Long"
client/project the user had created manually while trying Phase 4A, matching the
task brief's own example scenario) — confirmed as genuine data, not test residue, and
left untouched throughout; all `P4B-ACCEPT-*` fixtures used a separate, distinctly
prefixed client so the two could never collide.

### Phase 4B.5 — Verification Excel import [COMPLETED]

Delivered: **Project → Verification → Import Excel** — bulk creation of Verification
*planning* items from an `.xlsx` workbook (BR-78 – BR-84). A project-specific template
is generated server-side by a Route Handler (`Download Template`; sheets `Verification
Items` with the six approved headers and `Instructions` with examples plus the
project's Sites / Target Activity identities / Frameworks); a dedicated full-width page
(`/projects/[projectId]/verification/import`) uploads, validates and previews the file;
Import re-validates everything against the project's current state and creates all rows
with **one** bulk `INSERT` — all or nothing. Target Activities are referenced by a
deterministic human-readable identity (`date | time | site | name`, BR-79), never a UUID
or a bare name; a Framework/Framework Item pair is both-or-neither (BR-81); possible
duplicates are warnings that need an explicit confirmation (BR-82). The workbook is
parsed server-side only and never stored (no `files`/`attachments` row). Imported items
are ordinary `verification_items`.

**Verified (2026-09-26): 149/149 acceptance checks** (hosted Supabase, production build,
Playwright/Edge, 1280×800, 390px, 412px, Admin and Consultant, anon) — see
`08_TESTING.md`. **No database migration, no RLS/grant change**: the atomic bulk insert
needed no RPC. One new dependency (`exceljs`); `serverActions.bodySizeLimit` raised from
the 1 MB default to 3 MB in `next.config.ts` so a legitimate ≤ 2 MB workbook reaches the
server. Not in this slice: import history, undo/delete of an import (Phase 4F owns
delete), Verification export, checklist library.

### Phase 4C-1 — Finding foundation [COMPLETED]

Approved by the Phase 4C/4D design review and **ADR-018** (a lightweight NC response on
the existing `issues`/`actions` tables — *not* a full CAPA system). Delivered: the
Project tab is now **Findings & Actions** (UI *Finding* = database `issues`, no rename),
routed to `/projects/[projectId]/findings` and `…/findings/[findingId]`; one additive
migration (`20260927000100_finding_foundation.sql`: `finding_type` with a CHECK
`nonconformity | observation | opportunity_for_improvement`, plus `correction`,
`root_cause`, `effectiveness_result`/`_notes`/`_reviewed_by`/`_reviewed_at` and
`closed_by` — the final 8-column Finding-ready schema, established once; no new table, no
RLS/grant change; the response and effectiveness columns are **not** exposed in this slice);
the Findings list (search, Type/Status/Site/Priority filters, deterministic order: Open first
→ priority → newest → title; desktop table, mobile cards); **+ New Finding** (Finding Type
required with no preselection, Title, Description, Priority, Activity/Site with the BR-73 lock,
Framework Requirement with BR-74 historical preservation, no Verification picker); Finding
Detail (header, Finding, Origin — no placeholder sections); Edit while Open (origin links
immutable); **Close / Reopen for Observation and Opportunity for Improvement only** (blocked
while a linked Action is not Closed; Reopen also invalidates the current effectiveness
result); a Nonconformity has no Close action yet.

**Verified (2026-09-27): 160/160 acceptance checks** (hosted Supabase, production build,
Playwright/Edge, 1280×800, 390px, 412px) — see `08_TESTING.md`. Not in this slice:
Verification → Create Finding (4C-2), Correction/RCA/Effectiveness UI and Corrective
Actions (4D), Evidence (4E), delete (4F). **Finding/NC numbering is a Phase 6 prerequisite** *(done — 6A)*.

### Phase 4C-2 — Verification → Finding integration [COMPLETED]

Delivered: an explicit **Create Finding** action on the Verification card in **Activity
Detail** (not the Project Verification workspace), offered only where the check was verified
and only for *Issue Identified* (primary) and *Follow-up Required* (secondary) — a result
never creates a Finding by itself (BR-91). The shared Finding form opens with a compact origin
box, the Activity fixed to the executing Activity, Site locked for a site-specific Activity (or
prefilled from the check and editable for a project-wide one), Description ← Observation,
Priority and Framework ← the check, Title and Type blank (BR-92). One Verification may have
0..N Findings; the card shows "N Finding(s)" with **View Finding** / an inline **View Findings**
list and **Add another Finding** (BR-93). Finding Detail shows "Created from Verification" with
the check, Activity (linked), Site and Framework. A verification-linked Finding's Activity is
read-only on edit (server-enforced). Linked findings come from one embedded relationship in the
existing Activity Verification query — no per-item query. No schema, RLS or grant change.

**Verified (2026-09-27): 155/155 acceptance checks** — see `08_TESTING.md`.

### Phase 4D — NC response and Corrective Actions [COMPLETED]

- **4D-1 [COMPLETED]:** Finding Detail gains, for a Nonconformity, a derived **Progress** panel
  (Correction / Root Cause Analysis Complete–Pending, "N of M Closed"), the **NC Response**
  (Correction, Root Cause Analysis — optional, edited via **Edit NC Response**) and **Corrective
  Actions**; Observation / OFI show **Actions** only. One shared Action form (description, owner,
  due date, priority, Activity/Site with the BR-73 lock) serves Finding-linked and standalone
  actions; the Finding link is immutable. Compact status control (Open / In Progress / Pending
  Review / Closed, optional Completion Notes on close; `completed_at` server-set on close,
  cleared on reopen); derived Overdue. A closed Finding freezes its linked actions. New
  **Findings | Actions** sub-navigation and the project **Actions** workspace
  (`/projects/[projectId]/actions`: linked and standalone actions, search, Status / Overdue /
  Site / Priority / Linked-vs-Standalone filters, default order overdue → open → due date →
  priority → newest, **+ New Action** for standalone actions). A Nonconformity still cannot close.
  No schema, RLS or grant change. **Verified (2026-09-27): 145/145** — see `08_TESTING.md`.
- **4D-2 [COMPLETED]:** Effectiveness Review on a Nonconformity (Effective / Not Effective +
  notes; reviewer and time server-derived; one current review, no history) shown after the
  Corrective Actions and in Progress; **Close Finding** for every type through ONE shared closure
  evaluator run server-side on fresh data — hard blockers (a linked action not Closed; Not
  Effective) with no override, warnings (missing correction / root cause / effectiveness) closable
  only via an explicit **Close Anyway**, zero corrective actions allowed; closed Findings fully
  read-only; Reopen clears the current effectiveness result (notes kept). This completes the
  lightweight NC workflow of ADR-018. No schema, RLS or grant change. **Verified (2026-09-27):
  122/122** — see `08_TESTING.md`.

### Phase 4E — Evidence / Attachments [COMPLETED]

Delivered: Evidence on **Finding** (section after the workflow content, before Origin),
**Action** (compact "Evidence (N)" drawer from the action card and the Actions table),
**Verification item** (compact entry on the Activity Detail checklist card — the onsite flow) and
**Activity** (separate "Activity Evidence" section). Single-file upload with **Take Photo**
(`image/*` + capture) / **Choose File**, optional caption, ≤ 10 MB, allowlisted types; files in the
private bucket under a server-generated key, one `files` + one `attachments` row (exactly one
parent); View / Download through 60-second signed URLs generated on click; Remove deletes the
attachment and, when unreferenced, the file row and object. Closed Findings and closed Actions
freeze their evidence (viewable, not changeable) until reopened; Verification / Activity evidence
stays editable. Document Review evidence waits for Phase 5 (schema only). No schema, RLS, grant or
Storage-policy change. **Verified (2026-09-27): 122/122** — see `08_TESTING.md`.

### Phase 4E.5 / 4E.6 — UX review and polish [COMPLETED]

4E.5 reviewed the whole Phase 4 flow (390 / 412 / 1280 px). 4E.6 applied the approved fixes: one
**Status:** select on Activity Detail (no tab-like buttons, no duplicate badge); section order
Plan → Verification → Activity Evidence → Outcome; Verification card actions before the Evidence
link (and on one row at 390 px), 36 px "View Finding(s)" tap area; Verification "Observation" →
**"Notes"**; neutral Finding "Open" badge; toast at the top on phones; compact "Not reviewed yet."
effectiveness state; no repeated Finding title; editable actions show status once; Actions
table Finding titles clamped to two lines; Findings Site column does not wrap; fuller NC reopen
wording; Owner / Due Date stacked on phones. No schema or rule change. **Verified (2026-09-27):
65/65** — see `08_TESTING.md`. Backlog: hide inert tabs on mobile, collapsible mobile filters,
Finding origin in the header.

### Phase 4F — Controlled delete, overdue actions, Phase 4 final acceptance [COMPLETED]

Controlled delete for Verification items, Findings and Actions (BR-108 – BR-111): one shared
evaluator per record type listing every blocker, re-checked by the delete mutation on fresh data;
no FK, migration, RLS, grant or Storage change, Evidence never auto-deleted. Verification delete
from the Verification workspace "…" menu; Finding delete from the Finding Detail "…" menu; Action
delete from the Action edit drawer. **Overdue Actions** on the Project Overview (BR-112, top 5 +
total + "View all Actions" → Overdue filter). Activity evidence section renamed **General Activity
Evidence** with a helper line. Phase 4 final acceptance — see `08_TESTING.md`.

## Phase 4 — Verification / Issues / Actions: CLOSED

Planning (manual + Excel import), mobile onsite execution, Verification → Finding, NC response,
Corrective Actions, effectiveness review, closure / reopen, Observation and OFI, standalone
actions, Evidence, controlled delete and the overdue-actions overview are complete and verified
against the hosted project. Backlog carried forward: "today" for overdue is the UTC date
(timezone handling — fixed in Phase 7A), hide inert tabs on mobile, collapsible mobile filters, Finding origin in the
header.

## Phase 5 — Documents / Versions / Reviews [COMPLETE / CLOSED]

Document register, versions and uploads, framework mapping, reviews, derived
status view, review → issue / verification. The Phase 5 pre-implementation review confirmed the
Phase 0C schema covers all of it: **no migration, no RLS / grant change, no new ADR**. Approved
decisions: Document = logical record; version files immutable; derived status only; review →
Finding and review → Verification Item are explicit (5D); Review Evidence, N/A reason, required flag,
due date and an Overview summary are backlog. *(Revised after 5C)* Required Document Excel Import (5E)
and Gap Assessment Export (5F) are now planned Phase 5 slices; "Expected Records / Required Evidence"
per Document is a design follow-up (backlog).

### Phase 5A — Document Register foundation [COMPLETED]

Documents tab (`/projects/[projectId]/documents`) with the register (Document / Site /
Framework Requirements / Latest Version / Status / Last Review; cards on phones), search (title,
code, type, owner), Status / Site / Framework filters, Title A–Z order; + New Document and Edit
(Title, Document Code, Document Type, Owner, Project-wide / site, Applicable, Framework
Requirements multi-select) in one save; Document Detail (information, requirements, read-only
Versions area — "No versions received yet."); status from `document_register`; controlled
Document delete (no versions). See `08_TESTING.md`.

### Phase 5B — Document Versions [COMPLETED]

Upload New Version (same flow for V1 and later; browser → private bucket → server registers `files`
+ `document_versions`), server-assigned V{n} + optional client Revision, Received on, Notes;
immutable versions; newest-first list with Current badge and "Show earlier versions"; View (PDF) /
Download via 60-second signed URLs on click; controlled delete of the latest unreviewed version of an
Applicable document; uploads refused while Not Applicable. Shared file infrastructure extracted from
Evidence (`lib/files/policy`, `lib/files/server`) with Evidence behaviour unchanged. No schema, RLS,
grant or Storage change. See `08_TESTING.md`.

### Phase 5C — Document Gap Assessment [COMPLETED]

Gap Assessment of the current Version (`document_reviews`): Start Gap Assessment (Under Review) →
Edit Review Comments → Complete as Revision Required or Accepted (immutable afterwards) → Start New
Assessment; one open assessment per version, latest version only, refused while Not Applicable; older
versions and their Assessment History read-only; status and Last Review derived (latest review by
created_at, id; Last Review = latest concluded). No schema, RLS, grant or Storage change. See
`08_TESTING.md`.

### Phase 5D — Review → Finding / Verification Item [COMPLETED]

Explicit **Create Finding** and **Add to Verification** from the latest concluded Gap Assessment of the
current Version (existing forms with an origin box; site / framework prefill rules; server-derived
`document_review_id`); linked follow-ups listed on every assessment; Finding Detail and Verification
workspace show the review origin; lineage Document → Version → Assessment → Finding, and → Verification
→ Finding. No schema, RLS, grant or Storage change. See `08_TESTING.md`.

### Phase 5E — Required Document Excel Import [COMPLETED]

Import the project's required document register from Excel (template with this project's frameworks and
sites; header aliases Clause / PIC / Required Documents): server-side parse and validation, preview with
errors and confirmable warnings (merge by title + site, skip existing, repeated codes), create-only
all-or-nothing import, imported documents start Not Received / Not Applicable and follow the normal
Version → Gap Assessment → follow-up lifecycle. No schema, RLS, grant or Storage change. See
`08_TESTING.md`.

### Phase 5F — Gap Assessment Export [COMPLETED]

"Export Excel" on the Documents register: the whole project as a consultant / client-facing Gap
Assessment Register (.xlsx) — one row per Document × Framework Requirement, current version / file /
derived status / latest assessment comments and reviewer, Last Review, direct Finding and Verification
counts with a short follow-up summary, plus a Summary sheet. Read-only; no schema, RLS, grant or Storage
change. See `08_TESTING.md`.

### Phase 5G — Phase 5 final acceptance [COMPLETED]

The whole consultant workflow accepted end to end through the UI (import a client register → V1 →
Gap Assessment → Finding / Verification → V2 → Accepted → export). Hardening: Upload New Version blocked
while an assessment is open (BR-139); simultaneous assessment starts reconciled (BR-140); import header
found in the first 10 rows (BR-141); review dates = viewer's local day in register, detail and export
(BR-142); exact-count paging, paged import catalog, batched import compensation (BR-143). No schema,
RLS, grant or Storage change. See `08_TESTING.md`.

**Phase 5 backlog (classified in 5G):**

- *Hardening backlog:* id tie-break in the `document_register` view (migration); database-level
  one-open-assessment constraint (partial unique index) to replace the app reconciliation; Version and
  Document delete races (check-then-delete, same class as BR-140); import as one database transaction
  (RPC) instead of compensation.
- *Accepted for V1:* Excel stores a numeric clause 8.10 as 8.1 (template columns are text — use them);
  Framework must be written with its edition (no guessing); 10 MB per file; repeated Document Codes are a
  warning only; not-found pages are streamed (HTTP 200 with "Page not found", nothing revealed).

**Phase 7 backlog (from Phase 5):** Expected Records / Required Evidence as Document-level requirement
context (not Review Comments); review-origin Verification items link to the Verification workspace, not
the item; server-rendered dates use the server's time zone before hydration (set the deployment time
zone or render dates client-side when deploying).


## Phase 6 — Visit Summary / Reporting [COMPLETE / CLOSED]

Activity Summary on activities and an Activity Report generated from structured data, exported as an
editable DOCX (ADR-020). Phase 6 pre-implementation review (2026-10-02): one **Activity Report** per Activity,
rendered from current data; narrative stays on `activities` (ADR-013) plus `summary` and
`client_participants` (6B); report scope = checks executed in the Activity, Findings with
`issues.activity_id`, Actions of the Activity or of those Findings; no images in V1; no report status,
versioning or approval. Export format: **DOCX** (owner decision for 6D, ADR-020 — supersedes the
printable-HTML direction for Activity Reports). RayIMS stays a consultant workspace — no approval / sign-off workflow.

### Phase 6A — Finding numbering [COMPLETED]

Per-project Finding numbers **F-001** (integer `issues.finding_no`, ADR-019): assigned by a database
trigger from an internal counter at INSERT (race-safe, every creation path), immutable, never reused
(delete gaps), one sequence for all Finding Types; shown on the Findings list, Finding Detail, Actions,
Verification links, Gap Assessment follow-up and the creation toast; searchable as "F-001" / "001" /
"1". One migration (`20261002000100_finding_numbering.sql`). See `08_TESTING.md`.

### Phase 6B — Activity Report narrative [COMPLETED]

Consultant-authored Activity Summary on `activities` (ADR-013): new `summary` (Consultant Summary) and
`client_participants` beside `work_performed` / `next_steps`; Outcome / Activity Summary section with
empty / partial states and a focused **Edit Activity Summary** drawer (Edit Activity keeps identity,
schedule and Plan). Any status, Admin = Consultant, no approval / report status. One migration
(`20261003000100_activity_summary_fields.sql`). See `08_TESTING.md`.

### Phase 6C — Activity Report data integration [COMPLETED]

The system-derived side of the Activity Report: one report model (`lib/reports/activity-report.ts`,
the single source of report rules) loaded by `getActivityReportData` and shown as the **Activity Report
Summary** on Activity Detail — Verification counts (executed here / planned, not completed / completed
elsewhere) and issue checks, the Activity's Findings (F-nnn), Actions (union, de-duplicated) and
Evidence (metadata). Current state; no export, snapshot or approval; no schema change. See
`08_TESTING.md`.

### Phase 6D — Activity Report DOCX export [COMPLETED]

**Export Report** on Activity Detail → an editable .docx generated on demand from the 6C report model
(`lib/reports/activity-report-docx.ts`, presentation only; route
`/projects/[projectId]/activities/[activityId]/report`). One built-in template, A4 portrait, nine
sections, no images / links / stored copy / export history / approval. New dependency: `docx`. No
schema change. ADR-020. See `08_TESTING.md`.

### Phase 6E — Phase 6 final acceptance [COMPLETED]

The whole consultant flow accepted end to end (plan an Activity → execute Verification → raise Findings
F-nnn through all three paths → manage Actions → capture Evidence → write the Activity Summary → review the
Activity Report Summary → export the DOCX), with screen / DOCX parity, current-state semantics, isolation,
authorization, mobile / desktop, time-zone and large-Activity checks. **Phase 6 — COMPLETE / CLOSED.** See
`08_TESTING.md`.

**Phase 7 backlog (from Phase 6):** photos in the Activity Report (needs an explicit "include in report"
choice); per-client / branded report templates (logo, colours); optional retention of exported report
files.


## Phase 7 — Dashboard / Polish / Demo / Deployment [IN PROGRESS]

Minimal dashboard, polish, demo data, deployment to Vercel (Polish / productivity / pilot readiness).

**Phase 7 slices (order approved by the product owner after the Phase 7 pre-implementation review):**

| Slice | Name | Status |
| --- | --- | --- |
| 7A | Pilot Foundation + regression harness preservation | **COMPLETED** |
| 7B | Data-integrity hardening (one migration, approved in principle: Document → Version and Version → Review delete FKs RESTRICT; one-open-review partial unique index; deterministic latest-review tie-break in `document_register`) | **NEXT** |
| 7C | Bulk Document Upload (multi-select, deterministic match review, per-file atomic, no migration) | Planned |
| 7D | Expected Records / Required Evidence (`documents.expected_records`, import, Gap Assessment, export) | Planned |
| 7E | Deployment readiness + pilot dry-run | Planned |

### Phase 7A — Pilot Foundation [COMPLETED]

Consultant Home (replaces the placeholder Dashboard), date-only and timestamp correctness, the viewer's
local "today" for every overdue / upcoming rule, the Gap Assessment → Verification deep link, Activity
filters on Findings and Actions, a small copy sweep, mobile / desktop acceptance, and the regression
harness preserved in `tests/` (see `tests/README.md`). No migration, RLS, grant or Storage change; no ADR.
BR-156 – BR-161. Results in `08_TESTING.md`.

**Consolidated Phase 7 backlog (recorded at Phase 6 close — none of it is scheduled or approved):**

- *Document productivity:* Bulk Document Upload with match suggestions and folder upload; External
  Document Source (Google Drive / Google Docs, SharePoint / OneDrive) and "Snapshot for Assessment";
  Expected Records / Required Evidence as Document-level context (not Review Comments).
- *Reporting:* photos in the Activity Report (explicit "include in report" choice); branded / custom report
  templates; report export retention / an issued-report register.
- *Navigation / polish:* ~~review-origin Verification items link to the item~~ and ~~server-rendered dates use
  the server's time zone~~ — **done in 7A**.
- *Hardening (needs approved migrations):* document / version delete races; a database partial unique
  index for one open review per version; a deterministic latest-review tie-break in the `document_register`
  view (`id`); import as one database transaction.

**Document workflow backlog (recorded 2026-10-02 — not scheduled, not part of Phase 6; no schema, no
SDKs, no change to Document upload behaviour until approved):**

- **Bulk Document Upload** — *Phase 7 / productivity backlog.* Documents → Bulk Upload → select
  multiple files (or a folder, if the browser supports it cleanly) → auto-match **suggestions** → user
  confirmation → Document Versions created in bulk. Principles: it uploads **files / Versions only** —
  Required Documents still come from manual create or the Required Document Excel Import; matching uses
  deterministic hints only (Document Code in the file name, exact / normalized title, site context; no
  AI filename matching); a match is a suggestion the user confirms before upload; unmatched files stay
  unresolved, never silently attached; no Version yet → V1, otherwise the next Version; a Document whose
  current Version has an open Gap Assessment still cannot take a new Version (BR-139); a failure must
  not leave partial database / file state.
- **External Document Source** — *Phase 7 / storage-integration backlog.* A Document Version (or
  document source) may reference external storage (Google Drive, Google Docs, SharePoint, OneDrive).
  Principles: internal upload to RayIMS stays the default — it is the controlled assessment snapshot;
  an external link is supplementary, never a replacement for Version history; a live Drive / Docs URL
  alone is not a stable snapshot; a future integration may store provider, external file id, external
  revision / version id and source URL; a future "snapshot for assessment" step may copy a specific
  external revision into RayIMS Storage.
