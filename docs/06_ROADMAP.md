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
| 4     | Verification / Issues / Actions             | Planned — NEXT |
| 5     | Documents / Versions / Reviews              | Planned       |
| 6     | Visit Summary / Reporting                   | Planned       |
| 7     | Dashboard / Polish / Demo / Deployment      | Planned       |

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

## Phase 4 — Verification / Issues / Actions

Verification items (manual, scheduled, completed with result, carry-over),
issues, actions, open-action surfacing data. First evidence upload and
attachments (files registry, storage integration) land here.

## Phase 5 — Documents / Versions / Reviews

Document register, versions and uploads, framework mapping, reviews, derived
status view, review → issue / verification.

## Phase 6 — Visit Summary / Reporting

Visit summary on activities and a printable visit report generated from
structured data.

## Phase 7 — Dashboard / Polish / Demo / Deployment

Minimal dashboard, polish, demo data, deployment to Vercel.
