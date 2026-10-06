# 08 — Testing Strategy and Template

This document defines **how** RayIMS is tested and holds the test-case template and
the recorded results. Results exist for Phase 0D and Phase 1 (below); other phases have no
results yet. A test case is never marked PASS unless it was actually executed and
observed.

## Strategy

- Test each phase against the acceptance behavior in `01_V1_SCOPE.md`,
  `03_DATABASE.md` and `04_BUSINESS_RULES.md`.
- Prefer simple, repeatable checks: type-check, lint, build, database-level
  checks (constraints, RLS, derived views), and manual UI walkthroughs on desktop
  and mobile widths.
- Database rules that must be verified include site integrity, the attachment
  exactly-one constraint, framework hierarchy integrity, multiple reviews per
  document version, derived document status, and RLS (an unauthenticated client
  cannot read data).
- Add automated tests only where they pay for themselves (Quick-Win principle).
- When a test fails, record it as FAIL with the actual result; do not edit the
  expected result to match.
- **Streaming routes:** when a route streams through `loading.tsx` (Next.js 16
  Suspense), a visibility assertion right after navigation can run before the real
  content replaces the skeleton. Wait for the expected UI state (e.g. `waitFor({state:
  "visible"})` on the specific element) rather than an immediate `isVisible()` check,
  which does not retry.

## Test case ID convention

`TC-<phase>-<feature>-<nnn>`

- `<phase>`: `P0C`, `P1`, `P2`, … matching `06_ROADMAP.md`
- `<feature>`: short code, e.g. `AUTH`, `SHELL`, `CLIENT`, `PROJ`, `SITE`,
  `FWK`, `ACT`, `VER`, `ISS`, `ACN`, `DOC`, `REV`, `EVD`, `RPT`, `DASH`, `RLS`,
  `SCHEMA`
- `<nnn>`: three-digit sequence within the feature

Example: `TC-P4-VER-003`

## Template

| Field               | Content                                                    |
| ------------------- | ---------------------------------------------------------- |
| **ID**              | `TC-<phase>-<feature>-<nnn>`                               |
| **Phase**           | Roadmap phase                                              |
| **Feature**         | Feature under test                                         |
| **Precondition**    | State/data required before the steps                       |
| **Steps**           | Numbered actions                                           |
| **Expected result** | What should happen                                         |
| **Actual result**   | What happened (blank until executed)                       |
| **Status**          | `PASS` / `FAIL` / `BLOCKED` (blank until executed)         |
| **Notes**           | Environment, defects, links, blocker reason                |

Status meaning:

- **PASS** — executed; actual result matches expected.
- **FAIL** — executed; actual result differs from expected.
- **BLOCKED** — could not be executed (state the blocker in Notes).
- *(blank)* — not yet executed.

### Blank case

```
ID:
Phase:
Feature:
Precondition:
Steps:
  1.
Expected result:
Actual result:
Status:
Notes:
```

### Register table

| ID | Phase | Feature | Precondition | Steps | Expected result | Actual result | Status | Notes |
| -- | ----- | ------- | ------------ | ----- | --------------- | ------------- | ------ | ----- |

## Placeholders by phase

Test cases are defined when a phase starts. Lists below are candidate focus areas
only — **they are not test cases and carry no results**.

### Phase 0C — Foundation Implementation
No formal test cases were recorded. During the phase, lint, typecheck and build were
run, and the migrations were checked with ad-hoc scripts against an in-memory Postgres
(PGlite, stubbed Supabase). That is **not** a substitute for hosted verification; see
Phase 0D.

### Phase 0D — Supabase Integration & Real Backend Verification

Executed against the **hosted Supabase project** (PostgreSQL 17, Auth, Storage) and the
production build in a real browser (Edge). The earlier PGlite checks (Phase 0C) are
**not** part of this record. Cases are recorded in condensed form (the method is in the
title and expected columns). Status: PASS / FAIL / BLOCKED / NOT TESTED / NOTE
(informational). A FAIL may carry a **disposition** decided by the project owner (for
example *Accepted platform limitation*); a disposition never turns a FAIL into a PASS.

Verification scripts were ad-hoc and are **not** part of the repository (they need
test credentials and the Supabase CLI); test accounts live in the git-ignored
`.env.test.local`. A few first runs failed because of mistakes in my own test code
(noted per case); no expected result was weakened to make a case pass.

**Final tally: 36 PASS, 1 FAIL, 1 NOTE.**

- **The 1 FAIL is TC-P0D-STO-006**, kept as FAIL because immediate post-delete
  inaccessibility was the original expectation. Owner disposition: *Accepted platform limitation – Supabase CDN cache invalidation after object deletion may take up to approximately 60 seconds. Database metadata is removed immediately, new/unfetched access is denied, but a previously fetched object using the same cached authorization context may remain retrievable until CDN invalidation propagates.*
  It is an accepted limitation, **not** a pass and not counted among the 36.
- **TC-P0D-AUTH-001** failed on the first run (sign-up was still enabled), was fixed by the
  owner in the dashboard, and **passed** on the re-run.
- The NOTE is TC-P0D-AUTH-013 (copied pre-sign-out cookie), informational only.
- **Phase 0D is complete**: every case passes except the one accepted platform limitation.

| ID | Feature | Expected | Actual | Status | Notes |
| -- | ------- | -------- | ------ | ------ | ----- |
| TC-P0D-SCHEMA-001 | Migrations apply to the hosted project | `supabase db push --linked` applies 5 migrations in order, no errors | 5 applied; history has 5 rows | **PASS** |  |
| TC-P0D-SCHEMA-002 | 18 Core tables + `document_register`; RLS on all | 18 tables (no others), RLS enabled on all, view is `security_invoker` | As expected | **PASS** | Catalog query |
| TC-P0D-SCHEMA-003 | Required indexes exist | All 47 named indexes; partial indexes have WHERE; review index `(document_version_id, created_at DESC)` | As expected | **PASS** |  |
| TC-P0D-SCHEMA-004 | CHECK constraints + no native enums | All V1 value-list CHECKs, attachments exactly-one, `size_bytes >= 0`; 0 enum types | As expected | **PASS** |  |
| TC-P0D-SCHEMA-005 | FK delete behavior and DEFERRABLE rules | All 55 FKs match `03_DATABASE.md`; site FKs, `actions.issue_id`, `*.file_id` deferrable | As expected | **PASS** | No unique index on `document_reviews.document_version_id` (first check wrongly counted the PK; corrected) |
| TC-P0D-SCHEMA-006 | Behavior suite on the hosted DB (rolled back) | Site integrity (5 tables), hierarchy, multiple reviews per version, derived status incl. created_at ordering, delete rules, whole-project cascade | 66/66 | **PASS** | First run 65/66: my fixture expected 2 items but the query legitimately matched 3; expectation corrected. Nothing persisted |
| TC-P0D-SEED-001 | Framework seed | 4 frameworks; 149 items (9001: 35, 14001: 37, 45001: 42, 50001: 35); 28 roots; no cross-framework parents; no business data | As expected | **PASS** |  |
| TC-P0D-RLS-001 | Anonymous access denied | SELECT on 18 tables + view, and INSERT/UPDATE/DELETE on core/reference/profile tables, all denied (`42501`) | All denied | **PASS** | Grants migration leaves `anon` no privileges |
| TC-P0D-RLS-002 | Authenticated privileges are least-privilege | Work tables full CRUD; frameworks/items SELECT; profiles SELECT+UPDATE; view SELECT | As expected | **PASS** |  |
| TC-P0D-RLS-003 | Framework reference data read-only for users | Admin and consultant read 4 frameworks / 149 items; insert/update/delete denied; data unchanged | As expected | **PASS** |  |
| TC-P0D-RLS-004 | Consultant cannot promote self to admin | PATCH own `role='admin'` fails; DB role unchanged | HTTP 403 `42501`; role still `consultant` | **PASS** |  |
| TC-P0D-RLS-005 | Other profile edits / insert / delete blocked | Cannot edit another profile (0 rows), cannot insert/delete profiles; even admin cannot change role via API | As expected | **PASS** | Role changes only via SQL |
| TC-P0D-RLS-006 | Authenticated CRUD on work tables (API) | Insert/update/delete client, site, project, activity; CHECK violation `23514`; out-of-scope site `23503`; admin sees consultant's rows; whole-project delete cascades | As expected | **PASS** | Temporary rows removed; tables empty afterwards |
| TC-P0D-DOC-001 | `document_register` through the API | not_received, received, under_review, accepted (most recent review by `created_at` wins); anon denied | As expected | **PASS** |  |
| TC-P0D-AUTH-001 | Public sign-up disabled at Supabase level | Auth settings report `disable_signup = true`; a sign-up attempt is rejected | Re-run after the owner disabled it: `disable_signup = true`; sign-up attempt rejected with HTTP 422 `signup_disabled`; still exactly 2 users | **PASS** | First run **FAILED** (`disable_signup = false`, checked repeatedly): the setting was still enabled until the owner turned it off in the dashboard. My earlier sign-up probes could not prove anything because they used an email domain rejected by validation before the sign-up check; the re-run's attempt reached the sign-up check |
| TC-P0D-AUTH-002 | Anonymous sign-ins disabled | Rejected | `anonymous_provider_disabled` | **PASS** |  |
| TC-P0D-AUTH-003 | `auth.users` to `profiles` trigger | Profile row for both users, `role = consultant` by default, email mirrored | As expected | **PASS** | 2 users exist; no stray sign-ups |
| TC-P0D-AUTH-004 | Admin role setup | Exactly one `admin` (the intended account) set via SQL | As expected | **PASS** |  |
| TC-P0D-AUTH-005 | Unauthenticated redirects | `/`, `/dashboard`, `/clients` redirect to `/login` | As expected | **PASS** | Real browser (Edge) |
| TC-P0D-AUTH-006 | No sign-up UI | No sign-up/register/create-account text or links on `/login` | None found | **PASS** | UI only; see AUTH-001 for the Supabase setting |
| TC-P0D-AUTH-007 | Admin login | `/login` to `/dashboard`; dashboard renders; email shown; session cookie set; `/login` and `/` redirect to `/dashboard`; reload keeps session | As expected | **PASS** |  |
| TC-P0D-AUTH-008 | Consultant login and sign-out | Lands on `/dashboard`; sign-out clears session | As expected | **PASS** |  |
| TC-P0D-AUTH-009 | Wrong password | Stays on `/login`, generic error, no cookie | "Invalid email or password." | **PASS** |  |
| TC-P0D-AUTH-010 | Session refresh | Session made to look expired is renewed by `proxy.ts` (new access token, cookie rewritten) | Renewed; new expiry in 3600 s | **PASS** | Expiry simulated by editing the cookie's `expires_at`; natural 1-hour expiry not waited for |
| TC-P0D-AUTH-011 | Sign out | Cookie removed; `/dashboard` protected; back/reload does not show it; refresh token revoked server-side | As expected | **PASS** |  |
| TC-P0D-AUTH-012 | Forged session cookie | Unsigned JWT with far-future `exp` rejected, redirect to `/login` (HTTP 307) | As expected | **PASS** | Server-side protection; the layout re-check cannot be isolated from `proxy.ts` in this test |
| TC-P0D-AUTH-013 | Replay of a copied pre-sign-out cookie | (Informational, no expectation set) | Dashboard still served | **NOTE** | Access token is a stateless JWT verified locally by `getClaims()`, valid until it expires (default 1 h); refresh token is revoked. Only relevant if a cookie is stolen |
| TC-P0D-UI-001 | Responsive shell (390 px) | Sidebar hidden, bottom nav visible, touch target >= 44 px, no horizontal overflow, sign-out works | 56 px targets; no overflow | **PASS** | Screenshots inspected |
| TC-P0D-STO-001 | Bucket configuration | `rayims-files` private, 10 MB limit, select/insert/delete policies for `authenticated` only | As expected | **PASS** |  |
| TC-P0D-STO-002 | Anonymous storage access denied | No public URL, no list, no upload, no signed URL, no authenticated-endpoint download | All denied | **PASS** |  |
| TC-P0D-STO-003 | Authenticated upload / download / signed URL | Admin uploads; admin and consultant download with JWT; signed URL works without credentials; tampered token rejected; expired URL rejected | As expected | **PASS** | Consultant read is intended under the V1 policy |
| TC-P0D-STO-004 | Size limit | 11 MB upload rejected | HTTP 400 "Payload too large" | **PASS** |  |
| TC-P0D-STO-005 | `lib/storage` abstraction on the real project | `buildStorageKey`, `upload`, `createSignedUrl` (signed, never public), `remove` | As expected | **PASS** |  |
| TC-P0D-STO-006 | Deleted object immediately unavailable | Download after delete fails at once | Intermittently still HTTP 200 (CDN HIT) | **FAIL** | Reproduced when the object was first fetched a few seconds after upload; then only for users who had already fetched it (same token or signed URL); others got 400 at once; gone after about 55 s. Matches Supabase's documented "up to 60 seconds" CDN invalidation. `storage.objects` was already empty. **Disposition (owner): Accepted platform limitation – Supabase CDN cache invalidation after object deletion may take up to approximately 60 seconds. Database metadata is removed immediately, new/unfetched access is denied, but a previously fetched object using the same cached authorization context may remain retrievable until CDN invalidation propagates.** Backlog: Evaluate a shorter `cacheControl` for uploaded RayIMS evidence/documents if stronger post-delete revocation is required. **Not implemented; no change to the storage architecture in Phase 0D.** |
| TC-P0D-STO-007 | Deleted object unavailable within 60-90 s | Unavailable | Unavailable at t+56 s | **PASS** | Single observation |
| TC-P0D-STO-008 | No test evidence left | Bucket and tables empty after tests | 0 objects, 0 business rows | **PASS** |  |
| TC-P0D-BUILD-001 | Generated database types | `types/database.ts` from the real schema (18 tables + view); clients typed with `Database`; `getStorage` accepts the typed client | Typecheck passes | **PASS** | Hand-written `types/domain.ts` kept: CHECK columns are plain `string` in generated types |
| TC-P0D-BUILD-002 | lint / typecheck / build | All pass | All pass (Next.js 16.3.5) | **PASS** |  |

> **Note (2026-09-21):** TC-P0D-RLS-003 ("Framework reference data read-only for users") was
> true when recorded. ADR-016 later made frameworks Admin-writable; TC-P2B-RLS-001 to
> RLS-003 are the current record. The Phase 0D result above is unchanged.

**NOT TESTED in Phase 0D:** natural 1-hour token expiry; `supabase db reset` on a local
stack (no Docker); password-reset and email flows (no UI, users are created by an
admin); behavior after the free-tier inactivity pause; deployment to Vercel; load.


### Phase 1 — Authentication & App Shell

Executed against the **production build** and the **hosted Supabase project** (Edge browser
plus API calls), plus pure-function checks run with Node. Same conventions as Phase 0D. The
scripts are ad-hoc and are **not** in the repository (no browser-test dependency was added);
test accounts live in the git-ignored `.env.test.local`.

**Result: 17 PASS, 0 FAIL, 2 NOT TESTED.** The accepted Phase 0D
limitations were not reopened. Underlying check counts: 156 unit, 51 browser/API (TC-P1
AUTH/UI/SEC), 7 runbook, 32 Phase 0D regression.

| ID | Feature | Expected | Actual | Status | Notes |
| -- | ------- | -------- | ------ | ------ | ----- |
| TC-P1-UNIT-001 | Pure functions `safeNextPath` and `signInErrorMessage` | Accepts relative internal paths; rejects absolute URLs, `//`, backslash/control/percent-encoded variants, `/..//`, malformed encodings, non-strings, `/login`; output is always a single-slash path; only `invalid_credentials` maps to the credentials message | 156/156 checks | **PASS** | One of my expectations was wrong (`/@evil.example//` is a same-origin path, not a host); corrected, the function was right |
| TC-P1-AUTH-001 | Invalid credentials | Wrong password: "Invalid email or password.", stays on `/login`, inputs `aria-invalid` + `aria-describedby` pointing at the `role=alert` message, email kept and password cleared, no cookie; unknown email gives the identical message | 5/5 | **PASS** |  |
| TC-P1-AUTH-002 | Non-credential error mapping | A real non-credential Supabase error (disabled account, `user_banned`) shows the generic temporary message, reveals no reason, creates no session; account restored afterwards | 4/4 plus unit mapping | **PASS** | Rate-limit and a real network outage cannot be induced safely: covered by the unit mapping only |
| TC-P1-AUTH-003 | Local-device sign-out isolation | Laptop and phone hold independent sessions; signing out on the laptop clears and revokes only the laptop session; the phone's refresh token still works (new access token) and its dashboard still loads | 5/5 | **PASS** | Inverse of the Gap Review probe, where global sign-out revoked the phone |
| TC-P1-AUTH-004 | Return path (`next`) preserved | Deep link to `/dashboard?tab=x` and `/clients` returns there after sign-in (path and query); signed-in `/login?next=` redirects there; `/` and `/dashboard` add no `next` | 8/8 | **PASS** |  |
| TC-P1-AUTH-005 | Hostile `next` rejected | 12 hostile values (absolute URLs, `//`, backslashes, encoded, `javascript:`, `/..//`, tab, `///`, `/login`) neutralized in the form; sign-in, a tampered hidden field and a signed-in `/login?next=` all end on our own `/dashboard`; the browser never contacts an external host | 5/5 | **PASS** |  |
| TC-P1-AUTH-006 | `requireUser()` in the workspace layout | Layout resolves the user (email shown) without querying `profiles` | Passes | **PASS** | The layout re-check cannot be isolated from `proxy.ts` in a black-box test (same note as TC-P0D-AUTH-012) |
| TC-P1-UI-001 | Branded 404 | Signed-in unknown route: h1 "Page not found", title "Page not found · RayIMS", HTTP 404, working link to the dashboard; unauthenticated unknown route redirects to `/login` | 4/4 | **PASS** | The 404 is a standalone screen without the sidebar (root not-found) |
| TC-P1-UI-002 | Workspace error boundary | A page error shows the branded screen with a title inside the shell (sidebar stays), hides message and stack, shows a support reference, "Try again" and "Go to dashboard" work | 6/6 | **PASS** | Forced with a temporary throwing route on the production build; removed before commit |
| TC-P1-UI-003 | Global error fallback | An error outside the workspace shows the own-document fallback (no shell, `lang=en`, titled, details hidden, link back to the dashboard) | 3/3 | **PASS** | Same temporary-route method |
| TC-P1-UI-004 | Sign-out pending state | While the action runs the button is disabled, `aria-busy`, reads "Signing out…"; then completes | 2/2 | **PASS** | Action delayed with a request interceptor to observe the state |
| TC-P1-UI-005 | 390 px mobile login and overflow | Inputs 16 px (no iOS focus-zoom), 44 px targets, email `autocapitalize=none` / `autocorrect=off` / `spellcheck=false` / `inputmode=email`, password attributes, no horizontal overflow on login, dashboard, 404 and error screens; desktop keeps 14 px | 6/6 | **PASS** | Font size verified by computed style; not tried on a physical iOS device |
| TC-P1-SEC-001 | Security headers | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` on `/login`, `/dashboard`, a 404 and a static asset; no `Permissions-Policy`; no CSP | Present as specified | **PASS** |  |
| TC-P1-SEC-002 | Clickjacking | An attacker origin cannot render `/login` in an iframe | Blocked; control run with the header stripped in flight DID render it | **PASS** | Control proves the test can see a framed page |
| TC-P1-OPS-001 | Runbook SQL procedures on the hosted project | Password-reset SQL writes a valid bcrypt hash and the account signs in; promote/demote works with one admin remaining; ban/unban gives `user_banned` then restores; `disable_signup = true` | 7/7 | **PASS** | Run on the consultant test account; every change reverted or a no-op; roles and ban state verified restored |
| TC-P1-OPS-002 | Create a user via the dashboard (Auto Confirm) | Follows the runbook | Not repeated | **NOT TESTED** | Performed by the owner for both test users in Phase 0D; no new user was created |
| TC-P1-OPS-003 | Delete a user | Profile removed; `created_by` etc. set to NULL | Not run on the hosted project | **NOT TESTED** | Would remove a test account; the FK behavior was only verified in local Postgres (Phase 0C) |
| TC-P1-REG-001 | Phase 0D browser regression | TC-P0D-AUTH-005, 007-012 and UI-001 behavior re-run (unauthenticated redirects, no sign-up UI, admin and consultant login, session refresh, sign-out incl. revoked refresh token, forged cookie, 390 px shell) | 32/32 | **PASS** | TC-P0D-AUTH-013 (copied pre-sign-out cookie) unchanged and still informational |
| TC-P1-BUILD-001 | lint / typecheck / production build | All pass on the final tree (no temporary routes) | All pass (Next.js 16.3.5) | **PASS** | Final build also smoke-tested: headers, redirects, `next` neutralization |

**NOT TESTED in Phase 1:** a real network outage and a real rate-limit response (unit
mapping only); a physical iOS device (zoom-on-focus verified via computed font size);
screen readers; users deleted through the dashboard.


### Phase 2 — Client / Project / Site / Frameworks

#### Phase 2 baseline: Framework administration authorization (executed 2026-09-21)

Run against the hosted project after applying migration `20260921000100_framework_admin_write.sql`, on temporary records
that were removed afterwards. Result: 9 PASS, 1 NOTE.

| ID | Feature | Expected | Actual | Status | Notes |
| -- | ------- | -------- | ------ | ------ | ----- |
| TC-P2B-RLS-001 | Consultant framework access (hosted) | Read frameworks and items allowed; INSERT denied by RLS; UPDATE and DELETE affect 0 rows; seeded data unchanged; cannot change rows created by an admin | As expected (HTTP 200 / 403 `42501` / 0 rows) | **PASS** |  |
| TC-P2B-RLS-002 | Admin framework access (hosted) | SELECT; INSERT framework, root and child items; UPDATE framework and item; DELETE unreferenced leaf item; DELETE unreferenced framework (cascades only its own items) | As expected | **PASS** | Temporary records `ZZ-P2B-TEST` / `P2B-TEST-*`, removed |
| TC-P2B-RLS-003 | Anonymous framework access (hosted) | No read and no write on frameworks or framework items | All denied (401 `42501`); anon holds no grants on these tables | **PASS** |  |
| TC-P2B-INT-001 | Referenced framework delete blocked | Framework assigned to a project cannot be deleted; the assignment survives | HTTP 409 `23503`; assignment intact | **PASS** |  |
| TC-P2B-INT-002 | Referenced framework item delete blocked | Item linked to a document cannot be deleted; a framework whose item is referenced cannot be deleted; nothing destroyed | HTTP 409 `23503` both; both items intact | **PASS** |  |
| TC-P2B-INT-003 | Item with children delete blocked | Deleting a parent item is blocked | HTTP 409 `23503` | **PASS** |  |
| TC-P2B-INT-004 | Editions and uniqueness | A second edition of the same code coexists; duplicate (code, edition) and duplicate item code in a framework rejected; parent from another framework rejected | 201; 409 `23505` twice; 409 `23503` | **PASS** |  |
| TC-P2B-MIG-001 | Migration and shape | `20260921000100_framework_admin_write.sql` applied; only grants and 6 policies added; regenerated types identical to `types/database.ts` | As expected | **PASS** | Also validated first in a local in-memory Postgres (29/29); local runs are not part of this hosted record |
| TC-P2B-REG-001 | Phase 0D regression on the hosted project | Anon suite 9/9; database behavior suite 66/66; auth/RLS/storage suite 53/53 with the framework-write attempts removed; catalog suite 37/41 | See notes | **PASS** | The 4 catalog differences are intended: 3 encode the superseded read-only rule (grants, policies, migration count 6) and 1 is the earlier flawed unique-index check (see TC-P0D-SCHEMA-005). Not new failures |
| TC-P2B-INC-001 | Incident: old test script wrote to seeded data | (Informational) | The Phase 0D step-2 script attempted framework writes as admin, expecting denial; under ADR-016 they succeeded: it renamed ISO 9001, created a framework `X` and retitled the four items with code `4`. Restored by SQL; hosted frameworks and items verified identical to the seed baseline (4 / 149) | **NOTE** | Only `updated_at` on 6 restored rows differs. The regression copy no longer writes to framework tables. Lesson: run write-attempt tests on temporary records only |

#### Phase 2 Integration / Acceptance checkpoint (executed 2026-09-23)

Result: **PASS — 157/157 acceptance checks, 0 P0 findings, 0 P1 findings.** Hosted
Supabase, production build, Playwright/Edge, desktop 1280×800 and mobile 390/412px.
Covered: Admin acceptance; Consultant acceptance; the integrated Client → Site →
Project → Site Scope → Framework Assignment → Project Workspace → Framework Library →
Framework Detail workflow; Framework hierarchy protections (self/descendant/cross-
framework parent, controlled delete); RLS behavior (direct write probes, not just UI
inspection); responsive acceptance; seed integrity (4 frameworks / 149 items, verified
unchanged before/after); existing "Test 1" user-data integrity (verified unchanged
before/after); temporary-fixture cleanup; `lint`/`typecheck`/`build`. All fixtures used
the `P2-ACCEPT-` prefix and were removed afterward. This checkpoint exercised the
candidate areas listed in the `TC-P2-*` table below at an integration level; those
individual case IDs were not formalized one-by-one and remain marked NOT TESTED for
that reason, not because the behavior is unverified.

#### Phase 2 test specification (application level; candidate areas, not individually formalized)

These cases were defined at the start of the Phase 2 implementation as candidate focus
areas. They were exercised via the Phase 2 Integration/Acceptance checkpoint above
rather than run one-by-one against these specific IDs.

| ID | Feature | Expected | Status |
| -- | ------- | -------- | ------ |
| TC-P2-HIER-001 | Self as parent rejected | Parent picker excludes the item; a crafted request setting the parent to itself is rejected by the server | **NOT TESTED** |
| TC-P2-HIER-002 | Descendant as parent rejected | Parent picker excludes all descendants; a crafted request re-parenting under a descendant is rejected by the server | **NOT TESTED** |
| TC-P2-HIER-003 | Cycle-safe rendering | A tree containing a cycle (created via SQL in a scratch project) renders without hanging | **NOT TESTED** |
| TC-P2-FWK-001 | Consultant experience | Library, detail and item search work; no create/edit/delete controls are shown | **NOT TESTED** |
| TC-P2-FWK-002 | Admin experience | New Framework, overflow, Add Item, Add Sub-item, Edit and controlled Delete are shown; desktop drawer / mobile full screen | **NOT TESTED** |
| TC-P2-FWK-003 | Forged consultant mutation | A crafted Server Action call by a consultant is refused (0 rows treated as forbidden), data unchanged | **NOT TESTED** |
| TC-P2-FWK-004 | Delete blocked messages | Referenced framework, referenced item and item with children each explain why deletion is blocked, from real FK state (a seeded framework with no references is deletable) | **NOT TESTED** |
| TC-P2-FWK-005 | Unreferenced framework delete | Confirmation states the item count; only its own items are removed | **NOT TESTED** |
| TC-P2-FWK-006 | Editing content in use | Editing a framework or item used by projects shows the notice | **NOT TESTED** |
| TC-P2-FWK-007 | Duplicate errors | Duplicate (code, edition) and duplicate item code give friendly messages | **NOT TESTED** |
| TC-P2-FWK-008 | New edition | A new edition of an existing code is created as a separate framework and is not auto-assigned to existing projects | **NOT TESTED** |
| TC-P2-PRJ-001 | Site belongs to client | The server rejects a site of another client in the project's site scope | **NOT TESTED** |
| TC-P2-PRJ-002 | Client immutable on edit | The edit page shows the client read-only; a crafted request changing `client_id` is ignored or rejected | **NOT TESTED** |
| TC-P2-PRJ-003 | Zero sites allowed | A project saves with no sites and shows the guidance | **NOT TESTED** |
| TC-P2-PRJ-004 | Zero frameworks allowed | A project saves with no frameworks and shows the guidance | **NOT TESTED** |
| TC-P2-PRJ-005 | Create from Client Detail | Client prefilled and locked | **NOT TESTED** |
| TC-P2-PRJ-006 | Create from global Projects | Client required and selectable; changing the client resets the site scope | **NOT TESTED** |
| TC-P2-PRJ-007 | Edit preserves assignments | Existing site and framework assignments are preserved on edit | **NOT TESTED** |
| TC-P2-PRJ-008 | Select All semantics | Selects currently available sites only; a site added later is not added to existing projects | **NOT TESTED** |
| TC-P2-PRJ-009 | Site removal blocked by work | Removing a site referenced by project work is refused with a friendly message (needs Phase 3+ data or a temporary fixture) | **NOT TESTED** |
| TC-P2-CLI-001 | Clients | Create, edit, search; counts of sites and projects; no delete control | **NOT TESTED** |
| TC-P2-CLI-002 | Sites | Create, edit; delete blocked with an explanation while the site is in any project scope; deletable otherwise | **NOT TESTED** |
| TC-P2-CLI-003 | No client/project delete | No UI or server action exists for deleting clients or projects | **NOT TESTED** |
| TC-P2-WSP-001 | Overview real data | Header (name, status, site count, frameworks, Edit); left: Sites, Frameworks; right: Project Information | **NOT TESTED** |
| TC-P2-WSP-002 | No future-domain content | No upcoming activities, verification progress or issues/actions, no zero values, and none of the strings CONCEPT, FUTURE CONCEPT DATA, IMPLEMENT IN PHASE 2, FUTURE CONCEPT — DO NOT IMPLEMENT YET | **NOT TESTED** |
| TC-P2-WSP-003 | Other tabs disabled | Plan, Documents, Verification, Issues & Actions, Reports are disabled and non-functional | **NOT TESTED** |
| TC-P2-UI-001 | Patterns | Simple CRUD is a drawer on desktop and full screen on mobile; Project Setup is a full page; destructive actions sit in overflow menus | **NOT TESTED** |
| TC-P2-UI-002 | Mobile | 390 px: no horizontal overflow, 44 px targets, 16 px inputs on all new forms | **NOT TESTED** |
| TC-P2-SEC-001 | RLS regression | Clients, sites, projects, project_sites, project_frameworks keep full authenticated CRUD; anon denied | **NOT TESTED** |

### Phase 3A — Activity Type Foundation (executed 2026-09-24)

Result: **PASS — 60/60 acceptance checks, 0 failures.** Hosted Supabase, production
build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px. Covered: navigation
(desktop sidebar + mobile bottom nav, 5 items, no overflow at either mobile width);
Admin CRUD (list/search, create with key-format and duplicate-key validation, key
auto-suggested from label and reviewable before save, edit preserves key, deactivate/
reactivate, delete); referenced-delete blocked with a temporary fixture (Activity Type
→ temporary Client → Project → Activity, all `P3A-ACCEPT-` prefixed, FK `NO ACTION`
verified, then cleaned up in correct order and delete re-verified to succeed);
Consultant read-only UI (no admin controls rendered) and direct RLS probes (insert/
update/delete all blocked, zero rows affected); anon access; responsive (390px/412px,
Create drawer full-screen); Phase 2 regression (Clients, Projects, Framework Library/
Detail/Admin, Consultant Framework read-only, sticky App Shell). All temporary
`P3A-ACCEPT-*` fixtures removed afterward; Framework seed (4/149) and existing "Test 1"
data confirmed unchanged before and after.

One issue was found and fixed **during** this acceptance pass (not a pre-existing app
defect — introduced by this migration and caught before commit): the new
`activity_types` table initially carried full default `anon` privileges from table
creation (this project still auto-grants new tables at the Postgres default-privilege
level; every other table was explicitly revoked-then-granted, this one wasn't). RLS
already blocked all anon reads/writes throughout, so no data was ever exposed — verified
directly (`anon` SELECT returned `200 []`, not real rows, even before the fix). Fixed
with `20260924000200_activity_types_anon_revoke.sql`; re-verified `anon` now gets the
identical `401` / `42501 permission denied` response `frameworks` gets, and authenticated
read/write were unaffected by the correction.

`npm run lint`, `npm run typecheck`, `npm run build` all pass. `git diff --check` clean.

### Phase 3B-1 — Foundation + Master Plan (read) (executed 2026-09-24)

Result: **PASS — 54/54 acceptance checks, 0 failures.** Hosted Supabase, production
build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px. Covered: Plan tab
live alongside Overview (Documents/Verification/Issues & Actions/Reports still inert,
not links); default ordering (`start_date` → `start_time` → `name`, undated last),
verified against a 10-row fixture set spanning two past dates, a four-way same-day
group (two activities tied on `start_time` correctly tiebreaking by name), a
project-wide/no-time row, a multi-day row and an undated row — the full observed order
matched the expected sequence exactly, not just the sort spec's 4-point example;
project-scope isolation (two temporary projects — Project A's Plan never showed
Project B's activity and vice versa); site integrity (an activity referencing a site
outside its project's `project_sites` scope was rejected, existing composite FK
untouched); ADR-017 regression (an activity referencing a now-inactive Activity Type
still displayed its current label and was not hidden — the temporary type used for
this, never one of the 8 seeds, was itself removed afterward); project-wide vs
site-specific display ("Project-wide", never blank); mode/status display (humanized
labels, not raw `on_site`/`planned`); the derived Overdue indicator (shown for a
past-dated non-terminal activity, correctly suppressed for a cancelled one despite its
past date); search and Site/Type/Status filters; no create/edit/detail controls
rendered and no dead links to the not-yet-built Activity Detail route (by design, this
slice is read-only); Admin and Consultant read parity via direct REST probes, anon
denied; responsive (390px/412px, no horizontal overflow, mobile bottom nav intact);
Phase 2/3A regression (Clients, Projects, Frameworks, Activity Types all still load).
All temporary `P3B1-ACCEPT-*` fixtures (2 projects, 2 sites, 1 client, 11 activities, 1
temporary Activity Type) were removed afterward and confirmed at zero residue; Test 1,
the Framework seed (4/149) and the 8 Activity Type seeds were confirmed unchanged
before and after, and the real `activities` table remained empty throughout (matching
its pre-existing state).

`npm run lint`, `npm run typecheck`, `npm run build` all pass. `git diff --check` clean.

### Phase 3B-2 — Create / Edit + Activity Detail (executed 2026-09-24)

Result: **PASS — 68/68 acceptance checks, 0 failures.** Hosted Supabase, production
build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px. Covered: Create (via
Master Plan's `+ New Activity`) and Edit (via Activity Detail's `Edit Activity`) for
every combination in the approved review's fixture set — project-wide + online +
unassigned + date-only; site-specific + on-site + assigned consultant with a same-day
09:00–12:00 window; a second same-day 13:00–15:00 activity (proving both same-day
windows validate and order correctly against each other); a multi-day activity
(15:00 on day one → 10:00 the next day, confirming times are never compared across
days); an undated activity; `planned_days = 0.5`; Objectives + Planned Work; and an
Outcome edit (Work Performed + Next Steps) with no date/status gating. Date/time
validation (BR-64) confirmed rejecting: 09:00–09:00 same-day, 12:00→09:00 same-day
(end before start), a start time with no start date, and an end date before the start
date — each with the friendly inline message, never a raw error. `planned_days ≤ 0`
rejected the same way. Server-side defense in depth confirmed by injecting values past
the UI picker's own filtering (a real client-tampering scenario, not just a UI gap): an
inactive Activity Type on create, a site outside the project's scope, and a nonexistent
consultant id were all independently rejected by the mutation itself with friendly
messages. The full inactive-Activity-Type-on-edit regression (create with an active
type, deactivate it as Admin, reopen: Activity Detail and the Edit picker both still
show its current label marked Inactive, a *different* inactive type is never offered,
saving unchanged succeeds, and changing to an active type succeeds) — BR-65. Master
Plan integration: newly created activities appear; editing an activity's schedule
reorders its row correctly; editing its site updates the displayed site label; the
list correctly renders Project-wide/Unassigned and a multi-day date range without
times. Cross-project protection: Project A's route with Project B's Activity id
renders the not-found page with zero Activity data exposed (checked by page content,
not HTTP status — see Findings). Admin/Consultant parity confirmed (both see Create
and Edit — Activities follow the Clients/Projects/Sites authorization model, not
Framework Administration's, BR-67). Responsive (390px/412px: Master Plan, Create form,
Activity Detail, no horizontal overflow, mobile bottom nav intact). Phase 2/3A/3B-1
regression (Clients, Projects, Frameworks, Activity Types, Project Workspace Overview
all still load).

All temporary `P3B2-ACCEPT-*` fixtures (1 client, 2 projects, 2 sites, 2 temporary
Activity Types, 10 activities) were removed afterward and confirmed at zero
residue; Test 1, the Framework seed (4/149) and the 8 Activity Type seeds were
confirmed unchanged before and after, and the real `activities` table remained empty
throughout (matching its pre-existing state).

`npm run lint`, `npm run typecheck`, `npm run build` all pass. `git diff --check` clean.

**Findings:**
- **P1, fixed:** `plannedDaysField`'s zod schema used `z.union([z.coerce.number(),
  z.literal("")])` for an optional field — but `Number("")` is `0` in JavaScript, so
  `z.coerce.number()` silently "succeeded" on an empty input as `0` before the union
  ever reached the `literal("")` branch, making an *unfilled* Planned Days field fail
  validation ("must be greater than 0") instead of being treated as not provided.
  Fixed with `z.preprocess` intercepting `""` before coercion runs.
- **BACKLOG, not fixed (pre-existing, cross-cutting, out of Phase 3B-2 scope):**
  `notFound()` renders the not-found page correctly but returns HTTP 200, not 404.
  Confirmed identical on the pre-existing `/clients/[id]`, `/projects/[id]` and
  `/frameworks/[id]` routes — not introduced by Activity Detail. No data is exposed
  either way (content-based verification, not status-code-based, is what the
  acceptance check above actually relies on).
- **NO CHANGE:** the Phase 3B-1 final report's prose describing the multi-day test
  fixture said "29 Sep 2026 – 31 Sep 2026" (September has no 31st day). Confirmed a
  report-only typo — the actual fixture used the real, valid range 29–31 **Oct** 2026
  (`supabase/migrations` were never involved; this was test-fixture SQL, and Postgres'
  `date` type would have rejected an actual invalid calendar date outright). No code or
  data defect.

### Phase 3B-3 — Status / Cancel / Delete + final Phase 3B acceptance (executed 2026-09-24)

Result: **PASS — 76/78 acceptance checks on the live run, 0 real failures.** Hosted
Supabase, production build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px.

Covered: full Chinh Long IMS end-to-end scenario (Site Assessment – Viet Long
09:00–12:00, Consulting – Viet Long 13:00–15:00 same day, Document Review project-wide
online the next day — verified chronological order); Outcome (Work Performed/Next
Steps) editing via Edit Activity; the quick status control (`planned → in_progress →
completed → planned`, each change reflected immediately in both Activity Detail and
Master Plan, no automatic date-driven transitions); **Cancel Activity** (confirmation
message explicitly states the activity is kept with its history, status becomes
Cancelled, Plan/Outcome data untouched, Activity Detail remains reachable, a
future-dated cancelled activity is correctly not overdue, and reactivating
`cancelled → planned` works as an ordinary status change with no special ceremony);
unreferenced delete (confirmation required, activity removed from both the database
and Master Plan, its Detail route no longer resolves); **all 5 real reference paths to
`activities.id`** — `verification_items.target_activity_id`,
`verification_items.verified_activity_id`, `issues.activity_id`, `actions.activity_id`,
`attachments.activity_id` — individually attempted and blocked with the friendly
business message (never a raw FK/constraint error), then independently re-verified at
the database level: all 5 activities intact, every reference row intact, no FK nulled,
no attachment/evidence row deleted; the 7-point overdue matrix (past+planned →
overdue, past+in_progress → overdue, past+completed → not overdue, past+cancelled →
not overdue, today+planned → not overdue, future+planned → not overdue,
undated+planned → not overdue); cancelled-row de-emphasis, filterability and
searchability; cross-project protection (content-based check, consistent with the
pre-existing app-wide `notFound()` behavior documented in Phase 3B-2); Project
Workspace Overview's new Upcoming Activities widget (inclusion of future
planned/in_progress, exclusion of future-completed/cancelled/past/undated, `View Plan`
link, and the compact empty state on a project with zero activities); Admin/Consultant
parity (both reach status/Cancel/Delete controls identically) and anon denial;
responsive (Master Plan, Activity Detail, Edit form — no horizontal overflow, mobile
header not overcrowded, bottom nav clear); full regression (Clients, Projects,
Frameworks, Activity Types, Project Workspace Overview).

Of the 78 checks, 2 did not pass on the live run and were both confirmed as
test-script bugs, not application defects, by independent direct queries against the
same live data immediately afterward: a `LIKE 'P3B3-ACCEPT-%-Ref'` pattern in the
verification script required a hyphen that the fixture names ("...TargetRef" etc.)
didn't have — a direct query confirmed all 5 referenced Activities were genuinely
still present; and a Playwright locator counting anchor tags inside the Upcoming
Activities section also counted the section's own "View Plan" link alongside the
activity rows — a direct REST query against the exact production query confirmed
exactly 3 rows returned, matching the `limit(3)`.

`npm run lint`, `npm run typecheck`, `npm run build` all pass. `git diff --check`
clean. All `P3B3-ACCEPT*` fixtures (1 client, 3 sites, 3 projects incl. one
zero-activity project for the empty-state check, ~20 activities, plus one
verification_items/issues/actions/files/attachments row each for the reference
matrix) were removed afterward and confirmed at zero residue; Test 1, the 4/149
Framework seed and the 8 Activity Type seeds confirmed unchanged; the real
`activities` table remained empty throughout.

## Phase 3B — Master Plan / Activities: full acceptance CLOSED

Combined across 3B-1 (54/54), 3B-2 (68/68) and 3B-3 (76/78, both non-passes
independently confirmed as test-script issues): **198/200 acceptance checks pass**,
with the 2 non-passes fully accounted for and the underlying application behavior
verified correct by direct query in both cases. No P0 finding at any point in Phase
3B; the two P1 findings (Phase 3A's anon-grant gap does not apply here — Phase 3B-2's
`planned_days` empty-string coercion bug) were found during acceptance and fixed
before commit.

### Phase 4A — Verification foundation + Project Verification workspace (executed 2026-09-24)

Result: **PASS — 73/73 acceptance checks, 0 failures.** Hosted Supabase, production
build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px.

Covered: the Project Workspace's "Verification" tab live (Documents/Issues &
Actions/Reports still inert); the exact deterministic planning order (pending before
completed, then Target Activity start_date/start_time, then priority high→medium→low,
then question A–Z) verified against an 11-row fixture set covering every tiebreak
level, not just the spec's example; read-only Result display (Pending/Verified
OK/Issue Identified/Follow-up Required); the full Create matrix — project-wide with no
Target Activity/Framework, plain site-specific, a site-specific Target Activity
(Site auto-fills and **locks**, replaced by a read-only box with an explanatory note),
a project-wide Target Activity with both Project-wide and Specific-site scope allowed,
and a Framework-mapped item (picker scoped to the project's assigned Frameworks only);
the full Edit matrix — question/priority edits, changing a locked Target Activity from
one site-specific Activity to another (Site follows), site-specific → project-wide
Target Activity (Site **unlocks but keeps its value**), removing the Target Activity
entirely (Site unlocks and remains), and Framework mapping add/change/remove;
**execution-field preservation** proven at the database level — a fixture item with
`result`, `notes`, `verified_activity_id`, `verified_by` and `verified_at` all
populated had only its `question` changed through the 4A planning form, and every
execution field was confirmed byte-identical afterward; the full historical-Framework
regression (an item's Framework Item whose Framework was removed from the project
still displays and remains selected, its optgroup marked "not currently assigned",
saving unchanged succeeds, it is never silently cleared, no *other* unassigned item is
offered, and changing to a currently-assigned item succeeds); validation (blank
question, a site outside the project's scope and a Target Activity outside the project
both rejected via values injected past the picker's own filtering — real server-side
defense in depth, not just a UI restriction); project-scope isolation between two
temporary projects; Admin/Consultant parity and anon denial; responsive (locked-site
state included); regression (Clients, Projects, Frameworks, Activity Types, Project
Workspace Overview, Master Plan).

**Finding fixed during acceptance (in-scope, no P0/P1):** the Verification workspace's
shared form catalog initially accepted only a single "current Framework Item" id
(mirroring Activity Detail's per-record catalog pattern) — but the workspace is a list
of many items, each potentially referencing a *different* historically-unassigned
Framework Item at once, so a single-value parameter couldn't correctly serve every
row's Edit form. Fixed by deriving the full set of historically-referenced-but-
unassigned Framework Items from the project's actual verification items in one query.

One planned check (site-specific Target Activity + a mismatched Site injected past the
picker) turned out to be **unreachable through the UI by construction**: selecting a
site-specific Target Activity removes the Site `<select>` from the DOM entirely
(replaced by the locked read-only box), leaving no client-side element to inject a
mismatched value into. The equivalent server-side rule
(`validateSiteAndTargetActivity` in `lib/mutations/verification-items.ts`) was verified
by code inspection instead — it runs unconditionally on every create/update regardless
of what the UI sends.

`npm run lint`, `npm run typecheck`, `npm run build` all pass. `git diff --check`
clean. All `P4A-ACCEPT-*` fixtures (1 client, 3 sites, 2 projects, 2 Framework
assignments, 4 activities, ~16 verification items) were removed afterward and
confirmed at zero residue; Test 1, the 4/149 Framework seed and the 8 Activity Type
seeds confirmed unchanged; the real `activities` and `verification_items` tables
remained empty throughout.

### Phase 4B — Activity verification + mobile execution (executed 2026-09-25)

Result: **PASS — 74/74 acceptance checks, 0 failures.** Hosted Supabase, production
build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px.

Covered: Activity Detail's new Verification section (between Plan and Outcome, the
Plan/Outcome layout changed from a 2-column grid to a vertical stack to fit that exact
order) showing a count summary ("N checks · M pending") with no compliance/progress
visualization; a 9-check density scenario on one Activity built around the real Chinh
Long brief (chemical storage/SDS/emergency-exit checks) plus filler and
cross-activity items; Result-required validation (Save with no Result selected shows
a friendly error, no mutation occurs); all three execution outcomes — **Verified OK**
(result, Observation, `verified_activity_id`, `verified_at` all confirmed persisted
exactly at the database level), **Issue Identified** (result and Observation
persisted, and the `issues` table row count confirmed **unchanged** before/after —
no Issue auto-created), **Follow-up Required** (result persisted, `issues`/`actions`/
`verification_items` row counts all confirmed unchanged — no Issue, Action or new
Verification Item auto-created); re-edit (current Result/Observation preload
correctly, overwriting them updates execution fields while every planning field —
question, priority, site_id, target_activity_id, framework_item_id — is confirmed
unchanged at the database level); the full cross-activity traceability matrix (an
item planned for Activity A but completed in Activity B: Activity A shows "Completed
in another activity" with no execute/edit action offered, Activity B shows "Planned
for another activity" with Review/Edit available — both directions proven, not
assumed); **+ Add Check** from both a site-specific Activity (Target Activity preset,
Site auto-locked, same 4A rule) and a project-wide Activity (Site freely choosable),
with the created record confirmed to also appear in the Project Verification
workspace (same underlying row, no duplicate model); cross-project protection (a
Project B item never appears on a Project A Activity's checklist; the existing
cross-project 404 behavior on Activity routes reconfirmed); Admin/Consultant parity
and anon denial; responsive (checklist density, execution drawer, full-width stacked
Result buttons chosen over a cramped 3-across layout — verified no horizontal
overflow or clipped labels at either mobile width); Project Verification workspace
regression (Result badge, Target Activity, and Site all reflect the activity-executed
state correctly; planning Edit still works and still cannot clear the execution
result); Phase 3B Activity regression (status control, Cancel/Delete, Plan/Outcome
sections, Master Plan, Project Overview all unaffected).

**Notable, not a defect:** pre-flight discovered real user-created data in the hosted
project for the first time — a "Chinh Long" client/project/activities/verification
items the user had created manually while trying out Phase 4A, closely matching the
task brief's own example scenario. Confirmed as genuine data (Vietnamese activity
name, realistic timestamps, no fixture prefix) and left completely untouched;
verified byte-identical (same row ids, names, `result = NULL`, `target_activity_id`)
before and after this slice's entire acceptance run. All `P4B-ACCEPT-*` fixtures used
a distinctly prefixed client so the two data sets could never collide.

`npm run lint`, `npm run typecheck`, `npm run build` all pass. `git diff --check`
clean. All `P4B-ACCEPT-*` fixtures (1 client, 2 sites, 2 projects, 1 framework
assignment, 4 activities, ~11 verification items) removed and confirmed at zero
residue across 8 tables (including `issues`/`actions`/`attachments`, confirmed still
genuinely empty — not just unchanged); Test 1, the 4/149 Framework seed and the 8
Activity Type seeds confirmed unchanged.

### Phase 4B.5 — Verification Excel import (executed 2026-09-26)

Result: **PASS — 149/149 acceptance checks, 0 failures** on the final code (hosted
Supabase, production build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px,
Admin + Consultant + anon). All fixtures used a `P4B5-ACCEPT-` client; the genuine
"Chinh Long" and "Test 1" data was never used.

Covered: entry point (Import Excel beside + New Verification Item at 1280; hidden at
390/412 with manual Add still working); generated template (exactly the two sheets and
six headers, header-only data sheet so an untouched template imports nothing, examples
only on the Instructions sheet, every project Activity listed in the approved identity
format including the ambiguous twin pair, only assigned Frameworks, no other-project
data, no UUIDs, no Result/Observation columns, no macros; a filled copy of the
downloaded template validates); the valid workbook (9 rows covering project-wide,
site-inferred, Framework+Item pair within the *named* Framework — `8.1` exists in three
seeded frameworks and resolves to the right one —, project-wide Activity with and
without an explicit Site, undated Activities, case-insensitive Site) and the database
rows it produced (planning columns only; result/notes/verified_* NULL; `created_by` =
importing user; no `files`/`attachments` rows); every error category (blank Question,
invalid Priority shown as typed, unknown/ambiguous Site, Site outside the project,
unknown/ambiguous Target Activity, an activity of another project, name-only/old-format
identity, Site/Activity mismatch, unknown/unassigned Framework, Framework without Item,
Item without Framework, unknown Item) with 0 rows inserted and no UUID/database wording
in the UI; duplicates (within-file and against an existing item are warnings, the
confirmation checkbox gates Import, an Error overrides the checkbox, confirmed
duplicates import both rows, the same file uploaded twice warns on all rows and imports
on confirmation); header flexibility (reordered columns, case/spacing, extra sheet and
column ignored; missing sheet/header rejected; a Question-only sheet rejected); limits
(300 rows accepted, 301 rejected at workbook level, blank rows not counted and Excel
row numbers preserved across a gap, a 1.79 MB workbook — over the 1 MB framework
default — reaches validation, a 2.61 MB workbook rejected, `.xls`/`.xlsm`/`.csv`/`.ods`
rejected, a CSV renamed `.xlsx` and a corrupt `.xlsx` give friendly errors with no
stack trace); stale preview (Framework unassigned after Preview: Import revalidates,
reports nothing imported, 0 rows inserted, shows the refreshed error); atomicity (a
bulk insert with a CHECK-violating row and one with an out-of-scope site both persist
**0** rows over PostgREST, a valid multi-row insert persists all; the mutation contains
exactly one `.insert(` call, not in a loop); Phase 4B regression (an imported, targeted
item appears on its Activity Detail and executes normally); manual create regression
(creation, 4A site inheritance, Framework picker, planning edit leaves execution fields
untouched); Consultant may download and import; anon is redirected to `/login`
(template and page) and denied a direct bulk insert.

Notes on the run (not defects): earlier runs of this script failed because of test-script
faults (a `role="alert"` selector that also matched Next's route announcer, a residue
query that matched the fixture's own item, an oversize file that came out at 1.74 MB)
and twice because the Supabase CLI hit a transient transport error; the script was fixed
and the harness's DB helper given a retry, and the full suite was re-run to 149/149. The
server-side 2 MB check is defence in depth: through the UI the browser rejects an
oversize file first, so the server branch was verified by code inspection, not by a
request that bypasses the client.

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean.
All `P4B5-ACCEPT-` fixtures removed — zero residue; the genuine Chinh Long / Test 1 data
(verification_items, activities, projects, clients, sites, project_frameworks) hashed
identical before and after; Frameworks/Items 4/149, Activity Types 8, and
issues/actions/attachments/files all still 0.

### Phase 4C-1 — Finding foundation (executed 2026-09-27)

Result: **PASS — 160/160 acceptance checks, 0 failures** on the final code (hosted Supabase,
production build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px, Admin +
Consultant + anon). All fixtures used a `P4C1-ACCEPT-` client; the genuine "Chinh Long" and
"Test 1" data was never used.

**Migration** (`20260927000100_finding_foundation.sql`, applied with `supabase db push` after a
dry run showing exactly that one file). Before: issues 0, actions 0, attachments 0, files 0,
verification items 3 (the genuine ones), 20 tables, 15 `issues` columns. After: 23 columns —
exactly the 8 new (`finding_type text NOT NULL DEFAULT 'observation'`, `correction`,
`root_cause`, `effectiveness_result`, `effectiveness_notes`, `effectiveness_reviewed_by`,
`effectiveness_reviewed_at`, `closed_by`), 2 new CHECKs (`issues_finding_type_check`,
`issues_effectiveness_result_check`), 2 new FKs to `profiles` (both ON DELETE SET NULL), 2 new
indexes; table count still 20; `actions` columns, the `issues` RLS policy (one "authenticated
full access") and grants (authenticated only) byte-identical; row counts unchanged. Generated
`types/database.ts` regenerated; its diff is only those columns/relationships.

Covered: DB-level closed sets (invalid `finding_type` and `effectiveness_result` rejected over
REST, no rows left); navigation ("Findings & Actions" tab, no "Issues & Actions" left on
Overview/Plan/Verification, no Actions sub-tab, empty state); create form (Finding Type has no
preselection, Priority defaults to Medium, no Verification picker / Correction / RCA / Actions /
Effectiveness / Evidence / Status fields, Type and Title validation, whitespace-only Title
rejected); manual create for all three types with the exact stored values (project-wide
Observation with site/activity/framework NULL, status Open, every origin/response/effectiveness/
closure column NULL, `created_by` = the session user; a Nonconformity with site, ISO 14001:2015 ·
8.1 and High priority; an OFI on a site-specific Activity with Site auto-filled and locked;
project-wide Activity with Site left project-wide and with a chosen Site); **server-side
enforcement proven through the real Server Action endpoint** by rewriting the request body after
the UI check (Site differing from a site-specific Activity, a Site from another project, an
Activity from another project, a Framework Item from an unassigned Framework, an invalid Finding
Type — each rejected with nothing created — and smuggled `status` / `closed_by` /
`verification_item_id` / `correction` keys ignored); the framework picker offers only assigned
Frameworks for a new selection; historical Framework (after unassigning ISO 14001 the current
item stays selected, is marked "(not currently assigned)", is the only unassigned item offered,
saves unchanged, and a newly chosen unassigned item is rejected server-side); Detail (header,
"Recorded manually", no placeholder or response/effectiveness/actions text, **no Close action for
a Nonconformity**, no Delete/overflow menu, no UUIDs); Edit (core fields only — correction/
root_cause/effectiveness_notes, origin links and `created_by` preserved); Observation and OFI
Close (`closed_at` fresh server timestamp, `closed_by` = the user, Edit/Close gone, Reopen
offered), the server refusing an edit of a closed Finding from a stale form, and the server
refusing to close a Nonconformity even with a tampered id; Reopen (status open, `closed_at`/
`closed_by` and `effectiveness_result`/`_reviewed_by`/`_reviewed_at` reset to NULL;
`effectiveness_notes`, `correction`, `root_cause` and linked actions preserved); linked-Action
safety using a directly inserted open Action (Close blocked with a friendly message, allowed once
the Action is closed; no Actions UI built); the list (columns, no response columns, the exact
deterministic order over a 6-row fixture including a same-timestamp tie, search over title /
description / site / framework, Type / Status / Site / Priority filters, no-match state, clear,
row click); project scope protection (a Project B Finding is "Page not found" through a Project A
URL and vice versa, never listed); regression (Verification workspace, Excel import page and
template, Master Plan, Project Overview, Framework Library, Phase 4B execution of "Issue
Identified" creating **no** Finding — issues 6 → 6 — and Activity Detail showing no Create Finding
action or Finding counts); Consultant creates and closes (`created_by`/`closed_by` = the
consultant); anon is redirected to `/login` and denied a direct `issues` insert/select; mobile
(cards, no horizontal overflow, bottom navigation does not cover the last card, full-width New
Finding sheet, comfortable Type tap targets, Create button inside the viewport, Site lock state,
Detail not clipped) at 390px and 412px; desktop (drawer ≤ 400px, no overflow).

Notes on the run (not defects): the first runs failed only because of test-script faults — the
create-form text check matched the seeded ISO item "10.2 — Nonconformity and corrective action"
inside the framework picker, the not-found regex did not match the app's own "Page not found"
copy, the Frameworks page has no heading role, and a mobile selector matched the hidden
desktop-table link; the script was fixed and the whole suite re-run to 160/160. The Findings
list, detail and create screens were reviewed visually (screenshots).

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All
`P4C1-ACCEPT-` fixtures removed — zero residue; the genuine Chinh Long / Test 1 data
(verification_items, activities, projects, clients, sites, project_frameworks) hashed identical
before and after; Frameworks/Items 4/149, Activity Types 8, and issues/actions/attachments/files
all 0.

### Phase 4C-2 — Verification → Finding integration (executed 2026-09-27)

Result: **PASS — 155/155 acceptance checks, 0 failures** on the final code (hosted Supabase,
production build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px, Admin +
Consultant + anon). All fixtures used a `P4C2-ACCEPT-` client.

Pre-flight: HEAD `c2517c4`, clean tree; hosted issues/actions/attachments/files all 0; the
genuine Chinh Long data (3 verification items) present. A schema/RLS/grant snapshot taken before
and after the run is **identical** (no schema change).

Covered: eligibility (Create Finding on *Issue Identified* — primary — and *Follow-up Required* —
secondary; none on *Verified OK*, *Pending*, or a check completed in another Activity); **server
enforcement through the real Server Action endpoint** with rewritten request bodies (Verified OK
item, Pending item, item verified elsewhere, another project's verification item, a different
valid Activity, another project's Activity, a Site differing from a site-specific Activity,
another project's Site, an unassigned Framework item, an invalid type — all rejected, nothing
created; smuggled `status`/`closed_by`/`verification_item_id`/`activity_id`/`created_by` ignored);
prefill (origin box with the check and Activity, Type and Title blank, Description = the
Observation exactly, Priority and Framework from the check, Activity fixed, Site locked for a
site-specific Activity; blank Observation stays blank — the question is never substituted);
save (stays on Activity Detail, toast, DB `verification_item_id` + `activity_id` + site +
`created_by` + Open; priority changed High → Medium and framework 8.1 → 8.2 on the Finding while
the verification row stays **byte-identical**); multiple Findings (two on one check, same
verification and activity, "2 Findings", inline View Findings list with type/title/status and
links, Add another Finding); an inherited framework item from an unassigned Framework is allowed
unchanged while a different unassigned item is rejected; project-wide Activity (Site prefilled
from the check, changeable to Project-wide or another site, cross-project site rejected);
cross-activity (Finding created in Activity B stores Activity B; Activity A offers no action but
counts it); Finding Detail ("Created from Verification", check, Activity link back, Site,
Framework, no UUIDs; manual Finding still "Recorded manually"); edit traceability (Activity
read-only and server-enforced for a verification-linked Finding, framework/title editable,
verification unchanged; manual Finding keeps its Activity picker); closed Findings still counted
and linked; executing *Issue Identified* and *Follow-up Required* creates **zero** Findings; card
density (+42px with summary and actions); one embedded PostgREST request returns items with
their findings — still exactly two queries, no per-item query; the full mobile onsite path at
390px and 412px (record Issue Identified → Create Finding → full-width sheet → Save reachable and
not covered → stays on Activity Detail → "1 Finding"); Consultant create; anon redirected / denied;
Project B Activity via a Project A URL not found; regression (Verification workspace has no
Create Finding, Findings workspace, Excel import, Master Plan, Overview, Frameworks, Reopen, NC
still not closable).

Notes on the run (not defects): three runs failed only on test-script assertions — the Pending
case expected the "result" message but the server correctly rejects it earlier ("activity where
this check was verified", as a pending item has no verified activity), and two checks read the
page before it re-rendered; the script was fixed and the full suite re-run to 155/155.

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All
`P4C2-ACCEPT-` fixtures removed — zero residue; the genuine Chinh Long / Test 1 data hashed
identical before and after; issues/actions/attachments/files all 0.

### Phase 4D-1 — NC response & Corrective Actions (executed 2026-09-27)

Result: **PASS — 145/145 acceptance checks, 0 failures**, on the first run and again after the two
layout fixes below (hosted Supabase, production build, Playwright/Edge, desktop 1280×800, mobile
390px and 412px, Admin + Consultant + anon). All fixtures used a `P4D1-ACCEPT-` client.

Pre-flight: HEAD `7a8e7aa`, clean tree; hosted issues/actions/attachments/files all 0; genuine
data present. A schema/RLS/grant snapshot before and after is **identical** (no schema change).

Covered: 4C-2 regression (Issue Identified alone → 0 Findings; explicit Create Finding works);
Nonconformity detail order Finding → Progress → NC Response → Corrective Actions → Origin, no
Effectiveness, no Close; Edit NC Response (values stored trimmed, Progress → Complete, blank Root
Cause saved as NULL, smuggled title/status/effectiveness/priority ignored); Add Corrective Action
(title, Finding context, Activity/Site defaults with site lock, no status/completion fields,
description required and whitespace rejected, DB `issue_id`/`project_id`/Open/`created_by`/no
completion, owner/due/High/site/activity, Finding priority independent, a second action on a
different project-wide Activity + Long An and a third with no Activity); server rejection of a
Site differing from a site-specific Activity, another project's Site / Activity / Finding, and of
an edit of another project's action; smuggled `status`/`completed_at`/`completion_notes`/
`created_by`/`issue_id`/`project_id` ignored on create and `issue_id` ignored on edit (link
immutable); status Open → In Progress → Pending Review → Closed with Completion Notes
(`completed_at` = server time), Closed → In Progress (`completed_at` NULL, notes kept), re-close
prefilling notes, closing without notes, stale edit of a Closed action rejected; progress 0 of 1 →
0 of 3 → 1 of 3 → 3 of 3 with the Nonconformity still not closable; type change NC → Observation →
NC hides and restores the NC response with no data loss; Observation and OFI through the real UI
(no NC sections, "Actions" label, Close blocked by an open action, allowed once it is closed);
closed Finding freezes its actions (no Add, read-only card, server rejects adding an action and a
status change; reopening restores editing); Actions workspace (sub-navigation, columns, Finding
link opens the Finding, Project B actions never shown, standalone **+ New Action** with
`issue_id` NULL and no Finding created, "Standalone" label, smuggled `issue_id` ignored on edit);
default order over a 7-row fixture, Overdue for yesterday + Open / Pending Review and not for
Closed or today, no stored overdue column; search by owner / Finding / site / activity /
description; Status / Overdue / Site / Priority / Linked / Standalone filters; query approach (one
embedded query each); Consultant adds an action, changes status and edits the NC response; anon
redirected and denied over REST; Project B Finding not found through a Project A URL; mobile at
390px and 412px (vertical NC detail, full-width sheets, owner/due fields, Create reachable, last
status control above the bottom navigation, cards with Overdue / Finding / Standalone / owner,
+ New Action, no overflow); desktop drawer width; regression (Findings, Verification, Excel import,
Master Plan, Overview, Frameworks, Activity Detail).

**Fixed during acceptance (in-scope, visual review):** the active project tab wrapped onto three
lines on mobile ("Findings & Actions" — missing `whitespace-nowrap`, present since 4C-1), and the
Findings / Actions search box was squeezed on mobile; the desktop Actions table repeated a
"Status" label inside the Status column. All fixed, then the full suite re-run to 145/145.

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All
`P4D1-ACCEPT-` fixtures removed — zero residue; the genuine Chinh Long / Test 1 data hashed
identical before and after; issues/actions/attachments/files all 0.

### Phase 4D-2 — Effectiveness Review & NC closure (executed 2026-09-27)

Result: **PASS — 122/122 acceptance checks, 0 failures** on the final code (hosted Supabase,
production build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px, Admin + Consultant +
anon). All fixtures used a `P4D2-ACCEPT-` client.

Pre-flight: HEAD `52f04da`, clean tree; hosted issues/actions/attachments/files all 0; genuine
data present. Schema/RLS/grant snapshot before and after: **identical**.

Covered: full NC end-to-end through the real UI (create NC → NC response → 3 corrective actions →
close them → Effectiveness Review Effective with notes → Progress Complete / Complete / 3 of 3
Closed / Effective → clean close; DB `closed_at` server time, `closed_by` = user, response and
effectiveness untouched; everything read-only afterwards; linked actions still visible and frozen
in the Actions workspace; closed NC still in the Findings list); section order Finding → Progress →
NC Response → Corrective Actions → Effectiveness Review → Origin; "Not Reviewed / — / — / —" before
a review; result options Effective / Not Effective only; blank submit rejected; notes trimmed;
reviewer (display name, else email, else "Unknown user") and formatted date; NC reopen (wording;
`closed_*` and effectiveness result/reviewer/time cleared, notes / correction / root cause / actions
kept) and re-close showing the *not completed* warning instead of reusing the old result; the
blocker / warning matrix — open action (hard block, no Close Anyway, then clean close once the
action is closed), Not Effective (hard block), missing Correction, missing RCA, missing
Effectiveness (one warning each, Close Anyway closes), all three warnings with zero actions (no
blocker, information line, Close Anyway), zero actions + Effective (normal close), zero actions +
Not Effective (hard block); **server re-evaluation**: a tampered `confirmWarnings: false` does not
close, a tampered id is evaluated from that Finding's real data, a hard-blocked NC is never closed
on request; Not Effective → add a rework action → re-review Effective replaces result, notes and
time (no history) → closable; effectiveness tampering (smuggled reviewer / time / status /
closed_by / correction / title ignored; invalid result, closed Finding, Observation and another
project's Finding rejected); close / reopen via another project's id rejected with nothing
leaked; actions of a closed NC frozen server-side; type change NC → Observation hides the NC
response and effectiveness, keeps the values, and Observation closure ignores them; back to NC
restores them; Observation / OFI (no Effectiveness section, blocked by an open action, closable
once it is closed or with no actions); verification-linked Finding closed and still counted with a
working View Finding, verification result unchanged, Issue Identified alone → 0 Findings; query
approach (closure = one query with embedded action statuses; detail loads effectiveness with the
Finding); Consultant reviews and closes (`effectiveness_reviewed_by` / `closed_by` = consultant);
anon redirected and denied a direct `issues` update; mobile 390px / 412px (record Effective in a
full-width sheet, result buttons ≥ 40px, Save not covered, section readable, Close, Reopen) and
the 390px warning dialog with all three warnings, Cancel and Close Anyway unclipped; regression
(Findings list and filter, Actions, Verification, Excel import, Master Plan, Overview, Frameworks).

Notes on the run (not defects): the first run had 6 failures, all one test-script cause — the
section labels are CSS-uppercased, so `innerText` returned "RESULT" / "REVIEWED BY" against
case-sensitive regexes; one later run timed out after 10s waiting for the page to refresh after a
type change whose save had succeeded (confirmed in the database) — the wait was raised to 25s
(no reload was added). The full suite then passed 122/122.

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All
`P4D2-ACCEPT-` fixtures removed — zero residue; genuine Chinh Long / Test 1 data hashed identical
before and after; issues/actions/attachments/files all 0.

### Phase 4E — Evidence / Attachments (executed 2026-09-27)

Result: **PASS — 122/122 acceptance checks, 0 failures** on the final code (hosted Supabase and
Storage, production build, Playwright/Edge, desktop 1280×800, mobile 390px and 412px, Admin +
Consultant + anon). All fixtures used a `P4E-ACCEPT-` client; every stored object sat under a
fixture project's key prefix.

Pre-flight: HEAD `39fb115`, clean tree; hosted issues / actions / attachments / files and bucket
objects all 0; bucket `rayims-files` private with a 10 MB limit; the live `files` / `attachments`
schema, `attachments_exactly_one_parent`, RLS, grants and the three Storage policies matched the
approved design — none were changed.

Covered: Finding evidence (JPEG with trimmed caption, PDF without; 2 attachments + 2 files rows,
exactly one parent each, project-prefixed server-generated keys, objects present; no URL or token
stored; list metadata without key/bucket/UUID; NC progress and status unchanged; **View** opens a
signed URL whose token is valid for exactly 60 s and works, **Download** uses the original name;
anon public / direct object URLs return 400; **Remove** deletes the attachment, the unreferenced
files row and the object, other evidence untouched); file policy (PNG, XLSX, DOCX and a 9.5 MB PDF
accepted — size recorded from the stored object; 10.5 MB, `.exe`, `.sh` rejected in the browser with
friendly messages; a disguised `.exe` and a declared 11 MB size rejected by the server; the bucket
itself refuses an 11 MB object; no rows or objects left by rejections); two `photo.jpg` uploads kept
under different keys; **cleanup**: a registration forced to fail after a successful Storage upload
removed the object and left no rows, and a re-sent key of an existing file is refused without
touching that file's object or rows; a missing object shows "File is unavailable." without breaking
the page or deleting metadata; two-parent / zero-parent attachments rejected by the constraint;
Action evidence (compact drawer, `action_id` only, "Evidence (1)" without growing the card; closed
action: viewable, no Add/Remove, server rejects upload and removal; reopened: restored); closed
Finding (viewable, no Add/Remove, server rejects both; reopened: restored; Observation order
Finding → Actions → Evidence → Origin); Verification evidence from the Activity Detail card
(`verification_item_id` only, stays on the page, card height unchanged, kept when the result is
edited, allowed while Pending, not copied to a Finding created from it); Activity evidence (separate
section, `activity_id` only); project isolation (upload to, view of and removal of another project's
records rejected; nothing leaked); Consultant upload (uploader = consultant) and removal of the
admin's evidence; anon denied on attachments, files and Storage upload and redirected from pages;
mobile 390 / 412 (Take Photo input `accept="image/*"` + `capture="environment"`, Choose File,
full-width sheets, upload through the photo input, controls clear of the bottom navigation, action
cards stay compact — a real device camera was **not** exercised: headless browser only);
signed-URL expiry after 66 s (HTTP 400); query approach (evidence embedded in each parent query,
signed URLs only on click); desktop compactness (92 px uploader, no overflow); closure rules
unaffected; regression (Verification, Excel import, Findings, Master Plan, Overview, Frameworks,
Issue Identified still creates 0 Findings).

Notes on the run (not defects): the first run timed out waiting 30 s for the 9.5 MB upload over this
connection — it had completed correctly (verified in Storage and `files`), so the wait was raised
(the upload takes 45–72 s here); a crashed run left fixture objects that the pre-flight "all 0"
check then saw (the script now cleans first); a test expected closure warnings on a Nonconformity
that still had an open action (the hard blocker correctly took precedence). During acceptance the
hidden file inputs were found to be announced to assistive tech with the same names as their
visible buttons — they are now fully hidden. Full suite re-run to 122/122.

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All
`P4E-ACCEPT-` fixtures removed and **17 test objects deleted from Storage**: attachments 0, files 0,
bucket objects 0; genuine Chinh Long / Test 1 data hashed identical; bucket still private (10 MB).

### Phase 4E.6 — UX polish (executed 2026-09-27)

Result: **PASS — 65/65 checks, 0 failures** on the final code (hosted Supabase, production build,
Playwright/Edge, 1280×800, 390px, 412px). Fixtures used a `P4E6-ACCEPT-` client. The genuine data
was snapshotted **fresh** at pre-flight (it had changed through the user's own use during 4E.5) and
is identical afterwards.

Covered: Activity Detail shows one "Status:" select with the current value, no tab-like buttons and
no duplicate status badge (desktop and both phone widths); Planned → In Progress → Completed →
In Progress (reverse) each saved with the existing toast, the same page and all four sections kept;
Cancel via the menu shows in the same control and Cancelled → In Progress still works; section order
Plan → Verification → Activity Evidence → Outcome; control height ≥ 40 px, no overflow, last control
above the bottom navigation; on every card state (pending, verified OK, follow-up, issue with 2
findings, completed elsewhere) the result / Finding actions precede the Evidence link; card heights at
390 px not increased (the multi-finding card shrank 338 → 290 px because its two buttons now share a
row); "View Findings" tap area 36 px; "Notes:" on cards and "Notes" in the execution drawer, never
"Observation:"; Finding "Open" badge neutral (Observation row now 2 amber badges instead of 3);
Findings Site cell one line; Finding section without a repeated Title; "Not reviewed yet." before a
review and full metadata after; editable action shows its status once (control), frozen action shows
a badge; NC reopen wording (result, notes, Correction, RCA, Corrective Actions); Actions table Finding
title clamped to 2 lines with the full title as a tooltip; at 390 px the "Evidence added" toast
(top of screen) no longer covers the next sheet's Cancel / Save, and Owner / Due Date are stacked at
full width. Regression: Issue Identified alone creates 0 Findings and saves `notes`; Create Finding
still prefills the description from the notes; NC warnings and the OFI blocker unchanged;
Verification workspace, Excel import, Master Plan, Overview.

Notes on the run: the first two runs failed only on test-script checks (a stricter-than-specified
amber-count threshold, measuring row height instead of wrapping, picking a standalone row, reading
the close panel before it loaded) and exposed two real layout issues — the 36 px tap target made the
card 20 px taller and the two card buttons still wrapped at 390 px — both fixed (negative margin for
the tap area; tighter button padding), then the suite re-run to 65/65.

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. Fixtures and
the one test Storage object removed; issues / actions / attachments / files / objects all 0.

### Phase 4F — Controlled delete, overdue actions, Phase 4 final acceptance (executed 2026-09-27 / 28)

Result: **PASS — 78/78 checks, 0 failures** on the final code (hosted Supabase, production build,
Playwright/Edge, 1280×800, 390px, 412px). Fixtures used a `P4F-ACCEPT-` client; the genuine data was
snapshotted fresh at pre-flight and compared afterwards (below).

Covered: Verification delete from the workspace row / card "…" menu — confirmation title and message,
`role="alertdialog"` with a labelled title, focus on Cancel, red Delete, Cancel and Escape keep the
item; an unused planning check is deleted with a toast and disappears from the list; blocked with the
exact message for an executed check, for a check with only non-blank notes (execution history), for a
pending check with Evidence, and all three blockers together for an executed check with 2 Findings and
Evidence (Close only, no Delete); the Finding count never drops through a verification delete; an
Activity's "3 checks · 3 pending" becomes "2 checks · 2 pending" after deleting one of its checks, the
Activity itself unchanged; no delete control on Activity verification cards. Finding delete from the
Finding Detail "…" menu — confirmation text; an open Finding without Actions / Evidence is deleted and
the page returns to the Findings list; its Verification item (result, notes, execution fields) and its
Activity are byte-for-byte unchanged; blocked for a Finding with an Action, a closed Finding (exact
"retained as project history" message) and a Finding with Evidence. Action delete from the edit drawer
— "Delete Action?" / "This permanently removes the Action."; Escape closes only the confirmation, not
the drawer; a standalone and a corrective action (from Finding Detail, same mutation) are deleted, the
Finding unchanged and then itself deletable; blocked for an action with Evidence and — after a **real**
Storage upload added evidence — the action becomes undeletable (evidence never auto-deleted). Server
enforcement: tampered Server Action requests that swap an allowed id for an executed verification item,
a closed Finding, a closed action or an action of a closed Finding are all refused and nothing is
deleted; the dialog then shows the server's current blockers. Overdue Actions on the Overview — 6 of 9
actions overdue: exactly 5 shown, ordered due date ascending then priority High → Low, total "(6)",
due-today / no-due-date / closed excluded; each row shows description, red due date, owner, Finding (or
"Standalone") and status; "View all Actions" opens the Actions workspace with the Overdue filter
preselected (6 rows); another project shows "No overdue actions.". "General Activity Evidence" title and
helper text, section order unchanged, card-level "Add Evidence" / "Evidence (n)" labels unchanged. 390 /
412 px: the delete dialog is a bottom sheet fully on screen, Delete 44 px tall, "…" target 32 × 32, no
horizontal overflow on the Verification workspace, Finding Detail, Overview and Activity Detail.
Consultant can delete an unused check, an open Finding and an open Action, with the same blockers.
Anonymous: REST delete refused (HTTP 401, nothing deleted), workspace redirects to login.

Notes on the run: the first run scored 69/78 — all 9 failures were test-script issues (toasts checked
after slow DB polling, the upload step not pressing Upload, a date-format regex, reading "(6)" without
the visual margin, the 0-evidence label "Add Evidence", and a blocked-dialog check that ignored an action
the script itself had added earlier). A second attempt failed during fixture setup because two suites
run in parallel shared one temporary SQL file in the test harness (fixed: per-process file); the suite
was then re-run to 78/78 with no product change.

**Phase 4 regression (re-run on the final 4F code):** 4B.5 Excel import 149/149 · 4C-1 Finding
foundation 160/160 · 4C-2 Verification → Finding 155/155 · 4D-1 NC response & actions 145/145 · 4D-2
Effectiveness & closure 122/122 · 4E Evidence 122/122 · 4E.6 UX polish 65/65. Older suites encoded
"not yet" states that later approved slices deliberately changed (e.g. "a Nonconformity cannot be
closed", "no Effectiveness section", "no Actions sub-tab", "no Create Finding on Activity Detail", "no
delete menu", the pre-4D-2 close banner and the pre-4E.6 wording / section order); those assertions were
updated to the current approved behaviour, each marked in the script, before the final runs. One 4E
check read the page before a streamed "Page not found" rendered (verified manually: the cross-project
URL correctly shows Page not found); it now waits for the text.

Not covered by automation: a real phone camera ("Take Photo" uses the standard file input with
`capture`; no physical device was available, so camera capture was **not** tested). Timezone: "today"
for overdue is the UTC date (backlog, unchanged).

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All fixtures and
Storage objects removed.

### Phase 5A — Document Register foundation (executed 2026-09-28)

Result: **PASS — 104/104 checks, 0 failures** on the final code (hosted Supabase, production
build, Playwright/Edge, 1280×800, 390px, 412px). Fixtures used `P5A-ACCEPT-` clients (two
clients, three projects); the genuine data was snapshotted fresh at pre-flight (documents,
versions, reviews and mappings all 0) and is identical afterwards.

Covered: Documents tab is a live link with the active state (Reports stays the only inert tab);
at 390 / 412 px the tab row stays one scrollable line and the active Documents tab is scrolled
fully into view (`aria-current="page"`). Register columns and derived status from
`document_register` for all six statuses via DB fixtures (Received / Under Review → blue info
tint, Revision Required → amber, Accepted → green, Not Received / Not Applicable → neutral),
including the latest-review rules (older accepted version + latest version revised; revision
then acceptance on the same version), "V2 · Rev.01", Last Review date, "—" without versions.
Create "Document Control Procedure" (code PR-QMS-01, Procedure, Quality Manager, project-wide,
applicable, ISO 9001 7.5 + 6.1 — the seeded ISO 9001 goes down to 7.5, not 7.5.2 / 7.5.3): title
trimmed, created_by = session user, 2 mappings, Not Received in register and detail, human-readable
requirements, "No versions received yet.", no Upload button, no UUIDs; non-blocking duplicate-code
hint; form has no status / version / file / review / description / due-date field; drawer 400 px.
Site-specific multi-framework document (Viet Long; ISO 14001 8.2 + 6.1.2 + ISO 45001 8.2):
register shows two requirements "+1", detail all three. Server rejects (tampered requests) a
Project B site and an ISO 50001 item, with no document written; picker offers only assigned
Frameworks. Applicable → Not Applicable → Applicable recomputes the status, keeps the mappings and
never touches created_by / created_at. Historical mapping: after unassigning ISO 45001 the mapping
shows "(not currently assigned)", is kept on save, no ISO 45001 item is offered, a tampered add of
another ISO 45001 item is rejected, and the mapping can be removed. Search (title, code), Status /
Site / Framework filters, no-results state, Title A–Z order. Delete: confirmation text, document and
mappings removed, framework data and project assignments untouched; a document with a (fixture)
version is blocked with "This document has versions and cannot be deleted." and Close only — the
version and its file remain and are shown read-only on Detail; tampered delete refused. Isolation:
a Project B document through a Project A URL is not found with nothing leaked; editing / deleting it
through Project A refused. Empty register. Mobile: cards, filters, bottom-sheet form with a usable
multi-select and site controls, Create not covered by the bottom navigation, detail and overflow
reachable, no horizontal overflow. Consultant creates / edits / deletes; anonymous redirected and
REST read denied.

Notes on the run: the first run scored 77/79 — both failures were test-script issues (the helper
text of "Applicable" contains the word "status"; a mobile selector also matched the hidden desktop
table link). Review of the screenshots then led to two product fixes before the final runs:
Frameworks now sort naturally (ISO 9001 before ISO 14001) and the active project tab is scrolled
into view on phones (it was cut off at 390 px).

Regression on the final build: Phase 4E.6 suite 65/65 and Phase 4F suite 78/78 (Activity Detail,
Verification, Findings, Actions, Evidence, Overview); plus Plan, Verification, Findings, Actions,
Overview and Framework Library smoke checks inside the 5A suite.

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All
fixtures removed; documents / versions / reviews / mappings / files all 0.

### Phase 5B — Document Versions (executed 2026-09-28 / 29)

Result: **PASS — 103/103 checks, 0 failures** on the final code (hosted Supabase, production
build, Playwright/Edge, 1280×800, 390px, 412px). Fixtures used `P5B-ACCEPT-` clients; every
uploaded object was under the fixture project's key prefix. The genuine data was snapshotted fresh
at pre-flight (documents, versions, reviews, files and Storage objects all 0) and is identical
afterwards.

Covered: upload drawer has exactly File / Revision / Received on / Notes, states the next version,
accepts only PDF / Office, shows the chosen file and size. V1 (PDF, Rev.00, received today, "Initial
issue"): row + one `files` row + one Storage object under `{projectId}/{uuid}-name`, uploaded_by =
session user, status Not Received → Received, Current badge, file / received / uploaded by / notes.
V2 (DOCX, Rev.01) Current and V1 not; V3 "Draft B" still ordered by version_no; newest two shown,
"Show earlier versions (1)"; Delete only on the Current version; compact desktop row (~120 px);
mappings and Document identity byte-identical. Download keeps the original filename; Office files
download only; PDF View opens a signed URL whose token lifetime is 60 s; no URL in the page.
Delete latest unreviewed V2: confirmation "Delete version? / This permanently removes V2 and its
uploaded file.", destructive Delete, toast "Version deleted.", version row, `files` row and object
removed, V1 Current again, status Received, mappings unchanged, register falls back; re-upload becomes
V2 again. Blocked (all refused by the server, data unchanged): V1 while V2 exists (tampered id),
a version with a (fixture) review — review and a Finding's review lineage kept — and a version of a Not
Applicable document. Document with one version: Document delete blocked → delete the version → Not
Received → Document delete allowed. Missing object: "File is unavailable.", metadata kept, delete
rules unchanged. Not Applicable: no Upload button, explanation shown, forced upload refused with no
residue. Same filename twice: two keys, both readable with their own content. Accepted PDF, DOCX,
XLSX, PPTX, DOC, XLS, PPT; rejected JPG, PNG, TXT, EXE in the browser and a forced .exe by the
server; 9 MB accepted (real stored size recorded), 11 MB rejected in the browser and a declared
11 MB by the server. Project isolation: Project B document URL not found; prepare, register (object
discarded), View, Download and Delete for Project B refused with nothing leaked. Mobile 390 / 412:
no overflow, long filename wraps, Upload reachable, View / Download ≥ 36 px, Delete in the "…" menu,
upload sheet usable and not covered. Consultant uploads, views, downloads and deletes. Signed out:
redirected; no public URL, no direct object read, no signed URL, no version rows.

Not executed: a real concurrent-upload race (two browsers at the same instant). The server retries
once on the UNIQUE (document_id, version_no) conflict and otherwise returns "Another version was
uploaded at the same time. Please try again." — covered by code review, not by a live test.

Notes on the runs: run 1 stopped at the 9 MB step — a probe showed Storage accepts 5.9 / 6.1 / 9 MB
standard uploads (HTTP 200) and the upload simply takes minutes on this machine's uplink; the test
now allows it 10 minutes. Runs 2 and 3 each failed one check that read the page before the refresh
(or the re-rendered delete dialog) appeared; those checks now wait for the content. One further run
lost its browser mid-run (Edge closed; no Windows crash record) and was repeated.

Regression on the final code: Phase 4E Evidence 122/122 (after updating one source-inspection
check: signing now lives in the shared `lib/files/server` helper), Phase 4F 78/78, Phase 5A 104/104
(after one selector update: Document Detail now has a second "…" menu on the Current version).

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All fixtures
and Storage objects removed; documents / versions / reviews / files / objects all 0.

### Phase 5C — Document Gap Assessment (executed 2026-09-29)

Result: **PASS — 74/74 checks, 0 failures** on the final code (hosted Supabase, production build,
Playwright/Edge, 1280×800, 390px, 412px). Fixtures used `P5C-ACCEPT-` clients (two projects); the
genuine data was snapshotted fresh at pre-flight (documents / versions / reviews / files / objects 0,
Findings and Verification hashed) and is identical afterwards.

Covered: register statuses and tones for all six derived statuses (Not Received / Not Applicable
neutral, Received / Under Review blue, Revision Required amber, Accepted green); Last Review = the
latest concluded assessment even when an open one is newer, "—" when none is concluded; no Review
Comments in the register. A document without a version offers no assessment. Start Gap Assessment on
the Current version: one row `under_review`, reviewer = starter, `reviewed_at` / notes NULL, status
Under Review, mapped requirements shown as "Assessed against …", Edit + Complete instead of Start.
A forced second open assessment is refused; an Under Review assessment blocks version delete. Edit
keeps the same row (comments trimmed). Complete requires a result (no default); Revision Required sets
`reviewed_at` and reviewer = concluding user, status Revision Required, amber badge with the "Upload a
new Version…" hint, no Edit / Complete, Start New Assessment offered. Forced edit / re-completion of a
concluded assessment refused (row byte-identical). New Version → Received; V2 starts "Not started" (no
carry-over); V1 keeps its final result read-only with its Assessment history (status, comments,
reviewer, started / reviewed). Forced start on the older version refused. Accepted (green, "Accepted
for this assessment.", never "Approved"). Same version Accepted → Revision Required: both kept, status
follows the latest, "Earlier assessments" lists the previous one; concluded assessments still block
version delete; version files never changed. N/A: history visible, no Start, forced start refused.
Project isolation: start / edit / complete against Project B refused, nothing leaked. Consultant
completes an admin-started assessment (reviewer becomes the consultant) and starts a new one. Mobile
390 / 412: status and comments readable, Complete sheet usable (40 px result buttons, not covered), no
overflow. Signed out: redirected; reviews not readable. No Finding or Verification item was ever
created by an assessment.

Notes on the runs: the first run scored 73/74 — the 412 px step expected the comment written at
390 px, but the 390 px step had completed without comments (test design); each mobile step now writes
its own comment. The screenshot also showed "No comments yet." on a completed assessment; it now reads
"No comments." once concluded.

Regression on the final code: 5B 103/103 (after one expectation update: the Current version row now
contains its Gap Assessment panel, so the compact-row check measures a non-current row), 5A 104/104,
4F 78/78, 4E Evidence 122/122. One 4E run scored 120/122 — a Storage object removal failed
transiently during "Remove Evidence" (the app reports manual cleanup by design), which also raised the
orphan count of the next check; the immediate rerun passed 122/122 with no code change.

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All fixtures
and Storage objects removed.

### Phase 5D — Gap Assessment follow-up (executed 2026-09-29)

Result: **PASS — 78/78 checks, 0 failures** on the final code (hosted Supabase, production build,
Playwright/Edge, 1280×800, 390px, 412px). Fixtures used `P5D-ACCEPT-` clients (two projects, three
Activities, eight documents with DB-level versions and assessments); the genuine data was snapshotted
fresh at pre-flight and is identical afterwards.

Covered: a concluded Revision Required assessment offers Create Finding / Add to Verification with the
path helper (hint "Upload a new Version…" kept). Finding form: origin box (document, version, result),
Description = Review Comments, Title blank, **no Finding Type preselected**, Priority Medium, Project-wide,
no Activity inferred, several mapped requirements → none preselected and "Mapped to this document" listed
first. Created Finding: `document_review_id` = review, `verification_item_id` NULL; review byte-identical,
Document status unchanged; "Add another Finding" → second Finding with a project site. Add to
Verification: origin box, check and Target Activity blank; two planning-only checks (result / notes /
verified_* NULL; site follows a site-specific Target Activity); no Finding created; summary "2 Findings ·
2 Verification Items" with links. Tampered requests refused with nothing created: Activity / Site / review
of Project B, a requirement of an unassigned Framework. Site-specific document: site locked, the one mapped
requirement prefilled, only compatible Activities, another site refused for both Finding and check.
Accepted assessment: green, follow-up buttons quiet. No mapping: nothing preselected, assigned items
offered. Latest-assessment rule: an earlier assessment of the same version and an older version's
assessment show their existing links but no actions, and forced follow-up from them is refused; Under
Review and Not Applicable: no actions, forced follow-up refused, existing N/A link still listed. Finding
Detail: "Source: Document Gap Assessment · document · V1 · Rev.00" line, origin section with result and
comments, link back to the Document; editing keeps a site-specific document's site locked. Verification
workspace shows "From Gap Assessment · document · V1". Deleting a planning-only review-origin check and a
review-origin Finding leaves the review and status unchanged and refreshes the counts. Executing the
review-origin check in its Activity (Issue Identified) and creating a Finding there gives the chain
Review → Verification → Finding with `document_review_id` NULL on that Finding. Consultant creates both
follow-ups from an Accepted assessment. Mobile 390 / 412: actions reachable, both sheets usable, no overflow.
Signed out: redirected; follow-up rows not readable.

Notes on the runs: the first run scored 74/76 — the origin-box checks read the small uppercase header
(CSS text-transform) with a case-sensitive pattern. The regression run then showed a real rule gap: 5D
offered follow-up on a Not Applicable document, conflicting with 5C's "N/A freezes new work"; follow-up is
now refused for N/A documents (UI and server, BR-127) and the suite gained two checks (78).

Regression on the final build: 5C 74/74, 5B 103/103 (one run read the register before it re-rendered after
a version delete; the check now waits for the row and the rerun passed), 5A 104/104, 4F 78/78, 4E Evidence
122/122, 4C-1 160/160 and 4C-2 155/155 (shared Finding form: manual create / edit / Verification origin),
4E.6 65/65.

`npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All fixtures removed.

### Phase 5E — Required Document Excel Import (executed 2026-09-29 / 2026-09-30)

Production build (`next start`), hosted Supabase, Edge via Playwright; fixtures prefixed `P5E-ACCEPT-`
only (Project A: ISO 9001 / 14001 / 45001, sites Viet Long + Long An, one existing document; Project B:
ISO 9001 / 50001, B Site). Pre-flight snapshot of genuine data taken before the run and compared after
all suites. **Result: 80/80 PASS.**

| Area | Checks (all PASS) |
| --- | --- |
| Entry point + template | "Import Excel" (secondary) next to "+ New Document"; import page explanation; template first sheet "Required Documents" with the 8 canonical headers, empty data sheet, Instructions sheet with this project's frameworks, sites and marked examples; no version / status / review / finding columns |
| Preview | 8-row file: preview 3.1 s, writes nothing; 4 Ready · 4 Warnings · 0 Errors; same title + site on another framework merges (warning); repeated Document Code warns on both rows; existing document → skip warning; several requirements, Applicable default / No shown; "6 to create, 1 existing skipped"; Import disabled until warnings are confirmed |
| Import | redirect to the register with "Imported 6 · Skipped existing 1 · Warnings 4", shown once; merged document exists once with both framework mappings; row values stored (code, type, owner, site / project-wide, applicable, created_by); several codes of one framework → several mappings; no framework → zero mappings; Applicable = No → Not Applicable, all others Not Received; no versions, reviews or files; existing document byte-identical |
| Register | statuses + mappings visible; Status / Site / Framework filters and search (code, owner, title) on imported documents |
| Row errors | framework not assigned; requirement 7.5.2 not in library (nothing guessed); unknown site; site of another client/project; framework without requirement and vice versa; Applicable "Maybe"; framework without edition ("ISO 9001"); missing Required Document — mixed file (9 invalid + 1 valid) blocked with zero writes; fixed file imports all 10 |
| File errors | CSV / XLS / TXT refused; CSV renamed .xlsx refused by the server; missing Required Document header; duplicate recognized headers (Clause + Framework Requirement); no data rows; 500 rows accepted; 501 rows refused |
| Parsing | aliases Clause / Required Documents / PIC on a non-template sheet; numeric clause 7.5 read as "7.5"; extra columns ignored; formula without stored value → row error (never evaluated); blank rows ignored |
| Stale preview | framework unassigned after preview → import re-validates, shows the error, writes nothing; document created after preview → import stops with the new warning, writes nothing; after re-confirming: new created, existing skipped, no duplicate |
| Performance | 250 rows: preview 1988 ms, import 82 ms (250 documents + 125 mappings); register with 269 documents 1976 ms |
| Lifecycle | imported document: Not Received → V1 upload → Received → Gap Assessment → Revision Required → Create Finding and Add to Verification (normal 5B–5D behaviour) |
| Mobile | 390 px and 412 px: register header with Import Excel, preview as cards, no horizontal overflow |
| Access / isolation | consultant can import (created_by = consultant); anon template download → 307, import page → login; Project B untouched |
| Cleanup | fixtures + 1 Storage object removed; genuine data identical to pre-flight |

**Regressions on the 5E build.** The first pass ran during a period of unstable connectivity from the test
machine to hosted Supabase (15 identical REST probes: stalls of 10.3 s and 17.0 s and one connection
failure; the next morning all 15 took 0.2–1.0 s). Every first-pass failure was a timeout or network error
(`page.goto` 30 s timeout, 9 MB / 9.5 MB upload not finished, `fetch failed`), or — for 4D-2 — the 4D-1
fixtures still present because the 4D-1 cleanup step had been left out of the runner. No failure was an
assertion on changed behaviour; 5E changes only the Documents register header/page and adds new import
files. The affected suites were rerun unchanged:

| Suite | First pass | Rerun(s) |
| --- | --- | --- |
| 5D | 78/78 | — |
| 5C | 74/74 | — |
| 5B | 68/71 (9 MB upload timeout, suite aborted) | 103/103 |
| 5A | 58/59 (`page.goto` timeout, suite aborted) | 104/104 |
| 4F | 14/15 (`page.goto` timeout, suite aborted) | 78/78 |
| 4E | 35/37 (9.5 MB upload, `fetch failed`) | interrupted by session end (killed, cleaned up), then 122/122 |
| 4E-6 | 62/65 (status control read 600 ms after save during slow refresh) | 64/65, then 65/65 on the stable connection |
| 4D-1 | 145/145 | — |
| 4D-2 | 40/42 (4D-1 fixtures present; timeout) | 122/122 |

After all runs: fixture residue 0 (only Chinh Long and Test 1 remain; 0 issues, actions, attachments,
files, Storage objects) and **genuine data identical to pre-flight**.

### Phase 5F — Gap Assessment Excel Export (executed 2026-09-30 / 2026-10-01)

Production build (`next start`), hosted Supabase, Edge via Playwright; the downloaded workbooks were
re-opened and checked cell by cell with ExcelJS. Fixtures prefixed `P5F-ACCEPT-` only (Project A: 12
documents covering every status and edge case; Project B with a unique `BMARKER` in title, code, owner, file
name, review comment and finding; an empty project; an import project; a large project). Pre-flight
snapshot of genuine data taken before the run and compared after all suites. **Result: 62/62 PASS** (run 2;
run 1 did not start — the test tooling `playwright-core` had been removed from the scratch folder, nothing
was executed or written).

| Area | Checks (all PASS) |
| --- | --- |
| Entry point | "+ New Document" (primary) · "Import Excel" · "Export Excel" (both secondary, same style) on one line at 1280 px; 390 / 412 px: button reachable, no horizontal overflow, export downloads at 390 px; export failure → friendly toast |
| File | browser download, `RayIMS-Gap-Assessment-P5F-ACCEPT-ISO-Implementation-20260930.xlsx`, valid .xlsx; sheets "Gap Assessment" + "Summary", none hidden |
| Structure | 19 columns in the approved order; top row frozen; AutoFilter A1:S1; bold header; 13 rows = one per Document × Framework Requirement |
| Statuses | Not Received (no version / file / comments, counts 0); Received (V1, Rev.00, original file name); Revision Required (comments exactly "Retention period is missing.", reviewer); Accepted (V2 / Rev.01, V2 comments); Not Applicable (Applicable = No); every row's status = `document_register` view |
| Current-state rules | new version without assessment → Received, V2, blank comments / reviewer / Last Review, the V1 comment appears nowhere in the workbook; Under Review → current comments, current reviewer (no display name → email), Last Review = earlier concluded assessment; two reviews on one version → the latest by created_at decides (not reviewed_at) |
| Grain + order | multi-framework document → 2 rows (ISO 14001:2015 · 8.2, ISO 45001:2018 · 8.2) with identical document / status / site / comments / counts; unmapped document → 1 row, blank framework / requirement, site name, listed last; frameworks ISO 9001 → 14001 → 45001; clauses 4.1, 6.1, 7.5, 9.1, 10.2 |
| Follow-up | "2 Findings (1 Open) · 3 Verification Items (2 Pending)"; Review → Verification → Finding counts 1 Verification Item, 0 direct Findings; historical V1 Finding still counted while V2 is Accepted; N/A document keeps historical file, date, comments, Finding |
| Formatting | Received On / Last Review are Excel dates, dd/mm/yyyy; 1243-character multi-line comment kept in full, wrapped, row height capped at 120 pt; Vietnamese, &, /, -, parentheses, § intact; status fills neutral / blue / amber / green with the text; no UUIDs, storage keys, signed URLs or enum values anywhere |
| Summary sheet | project, client, export time; document counts by status = register; open Findings / pending Verification items (direct); generated time in workbook metadata, not a data column |
| Isolation / access | Project A export contains no Project B value; Project B export contains only its own document; unknown / malformed project id → 404, no workbook; consultant export identical to admin's; signed out → 307 to login, no workbook bytes |
| Empty project | valid workbook, headers, 0 rows |
| Read-only | after all exports: 0 new documents, versions, reviews, findings, verification items, actions, files, Storage objects, mappings |
| Large project | 260 documents × 4 mappings = **1040 rows** (beyond the 1000-row response cap — proves paging), all statuses in the register's proportions, every document present: export 2.9 s, 82 KB; register shows all 260. A separate 4-run timing probe: register 1.2–3.2 s, export 2.1–5.4 s, ~84 KB (the acceptance run's single 18.8 s register load was not reproduced) |
| Import → Export | 5E template import (incl. a document repeated on two frameworks and an N/A row) → export: framework, requirement, code, type, owner, site, applicable represented; merged document = 2 rows; Not Received / Not Applicable as imported |
| Full workflow | import → upload V1 → Revision Required with comments → Create Finding → Add to Verification → export shows V1, file name, Revision Required, the comments, Findings 1, Verification Items 1, "1 Finding (Open) · 1 Verification Item (Pending)" |
| Cleanup | fixtures + 1 Storage object removed; documents / versions / reviews / findings / files / objects all 0 |

**Regressions on the 5F build** (the register read `listDocuments` changed — paging + project join — so every
Documents suite exercises it):

| Suite | Result |
| --- | --- |
| 5E | 80/80 |
| 5D | 78/78 |
| 5C | 74/74 (first attempt interrupted when the session ended — fixtures removed, rerun) |
| 5B | 24/26 — "PDF View opens a signed URL in a new tab" timed out (popup never reached the signed Storage URL; suite aborted). Rerun: one attempt stopped by the 10-minute limit of the background runner (its fixtures were removed by the next run), then **103/103** including the View / signed-URL check |
| 5A | 104/104 |
| 4F | 78/78 |
| 4E | 122/122 |
| 4E-6 | 65/65 |
| 4D-1 | 145/145 |
| 4D-2 | 122/122 |

After all runs: fixture residue 0 (only Chinh Long and Test 1 remain) and **genuine data identical to
pre-flight**.

### Phase 5G — Phase 5 final acceptance (executed 2026-10-01)

Production build (`next start`), hosted Supabase, Edge via Playwright (time zone Asia/Ho_Chi_Minh,
en-US); fixtures prefixed `P5G-ACCEPT-` only (IMS Implementation with ISO 9001 / 14001 / 45001 and Site A
/ Site B, an edge-case project, 10 / 100 / 300-document projects, an import project, an empty project and
a Project B with `BMARKER` values). Pre-flight snapshot of genuine data taken before testing and compared
after all suites. **Result: 100/100 PASS** (run 4 of the final suite). Earlier runs: run 1 stopped by the
tool's 10-minute background limit (nothing asserted, fixtures removed); run 2 87/93 — found the
simultaneous-start race (3/3 duplicates, fixed: BR-140), plus test-side issues (button reachability
measured without scrolling past the fixed bottom nav, wrong expected message, streamed not-found
expected as HTTP 404) and one transient database-CLI failure; run 3 92/93 — race fixed, one fixture bug
(duplicate mapping in the bulk seed).

| Area | Checks (all PASS in run 4) |
| --- | --- |
| Import (real client workbook) | 2 banner rows above the header ("Required Documents", project line) — header found on row 3 via aliases Clause / Document Required / PIC, extra column ignored, preview row numbers = sheet rows; result "Imported: 7 Documents · Skipped existing: 1"; repeated across frameworks → one document with 2 mappings; same title on Site A / Site B / Project-wide → 3 documents; same code, other title → separate (warning); blank code, Vietnamese owner, "9.1; 9.2" → 2 mappings; Applicable No → Not Applicable; existing document skipped byte-identical; no versions / reviews / files created; applicable imports Not Received |
| Register | status / site / clause visible; filters Not Received (7) and Not Applicable (1) |
| Full workflow (UI) | Not Received ("No versions received yet.") → V1 → Received → Start → Under Review → Upload New Version disabled with "Complete the current Gap Assessment before uploading a new Version." (forced upload refused by the server, no version, no object left) → Revision Required with a long consultant comment (stored and shown in full) → Create Finding (type as chosen, Open) → Add to Verification (target Activity) → assessment and status unchanged by follow-up → Finding Detail shows the origin → V2 (same file name, separate private object) → Received, V1 history read-only with its follow-up, V2 Not started → Accepted → V1 version / assessment / mappings unchanged, no delete on assessments → Verification executed in the Activity (Issue Identified) → Finding from Verification (no direct review link, Site A) → export |
| Export | 2 rows for the 2-framework document; V2 / Rev.01 / procedure.pdf / Accepted / V2 comments / identity; "1 Finding (Open) · 1 Verification Item (Completed)" (Verification-origin Finding not counted); Last Review = viewer's local day; Not Received / N/A rows; per-site documents apart; no Project B value, no ids; writes nothing |
| Mobile 390 / 412 | register, detail, upload drawer, complete dialog, follow-up, import page: no horizontal overflow, actions reachable and not under the bottom nav; at 390 px the whole flow (upload, assess with long comment, Create Finding with site locked to Site A, Add to Verification with Site A) |
| Race (BR-140) | 3 simultaneous two-browser starts → exactly one open assessment each time (before the fix: 2 each time) |
| Ordering | identical created_at: register and export agree with the view and take the comments from the same review (the Detail panel's id tie-break agreed in runs 3–4, differed in run 2 — synthetic only, backlog) |
| Dates (BR-142) | review concluded 22:30 UTC: register, detail and export all show 30 Sep 2026 (Vietnam); export with tz=UTC → 29 Sep; unknown zone → UTC |
| Counts | Detail 3 / 2 = database 3 / 2 = export 3 / 2 on both rows, "3 Findings (2 Open) · 2 Verification Items (1 Pending)" — closed, completed and historical-version follow-up included, Verification-origin Finding excluded |
| Storage / delete | missing object → "File is unavailable."; Document with versions: delete blocked; latest unreviewed version deleted; reviewed version blocked ("This version has review history and cannot be deleted."); version delete removes version, file row and object; download = private bucket, 60 s signed URL, original name |
| Errors | CSV renamed .xlsx → "Could not read this file…"; another client's site / unassigned framework / unknown clause → row errors, import blocked; .exe and > 10 MB upload refused; N/A document upload unavailable; no raw database errors |
| Security / isolation | cross-project document URL → "Page not found" (streamed, HTTP 200), nothing leaked; signed URL and assessment start for a Project B version through Project A refused; anonymous replay of "start assessment" → 307, nothing created; anonymous register / detail / import → login, export / template → 307 |
| Large data | 10 / 100 / 300 documents all listed; 300 documents × 4 mappings → 1200 export rows (> 1000), Findings 40 = 40, Verification 40 = 40, Last Review 80 = 80 — no truncation |
| Performance | register 10: 4.2 / 1.2 / 3.2 s · 100: 1.3 / 1.6 / 2.0 s · 300: 1.8 / 1.4 / 1.2 s; Document Detail (3 versions, 10 assessments, 20 follow-ups) 2.4 / 0.9 / 1.1 s; import 250 rows: preview 1.2 s, import 2.8 s; export 1200 rows 4.2 s (95 KB); export main project 2.6 s |
| Empty states / cleanup | empty project "No documents yet."; no "Coming soon" anywhere; fixtures + Storage objects removed, all Phase 5 tables 0 |

**Regressions on the final code:**

| Suite | Result on the final code | Earlier attempts in this phase |
| --- | --- | --- |
| 5A | 104/104 | — |
| 5B | 103/103 | interrupted when a session ended (fixtures removed); 60/62 — a .doc upload did not finish in 60 s (environment) |
| 5C | 74/74 | 72/73 — `fetch failed` network error near the end |
| 5D | 78/78 | interrupted when a session ended (fixtures removed) |
| 5E | 80/80 | — (missing-header message updated for BR-141) |
| 5F | 62/62 | 61/62 — failure-toast check intercepted `/export` only; since BR-142 the request carries `?tz=` (test pattern updated) |
| 4F | 78/78 | — |
| 4E | 122/122 | — |
| 4E-6 | 65/65 | — |
| 4D-1 | 145/145 | — |
| 4D-2 | 122/122 | 108/109 — a 10 s wait timed out in the mobile section (environment) |
| 4C-1 | 160/160 | — |
| 4C-2 | 155/155 | — |
| 4B.5 | 149/149 | — |

Each Phase 4 suite's cleanup script ran right after it (residue 0).

After all suites: fixture residue 0 (only Chinh Long and Test 1 remain) and **genuine data identical to
pre-flight**.

### Phase 6A — Finding numbering (executed 2026-10-02)

**Migration** `20261002000100_finding_numbering.sql` — first validated locally in an in-memory Postgres
(PGlite, stubbed Supabase roles / `auth`, Supabase-like default grants) with all project migrations
(**17/17**), then applied with `supabase db push` after a dry run listing exactly that one file. Hosted
before → after: tables 19 → 20 (`project_finding_counters`); `issues` columns 23 → 24 (`finding_no integer
NOT NULL`); new `issues_project_finding_no_key` (unique constraint + its index, no other index); new
trigger `assign_finding_no` (beside `set_updated_at`); new function `assign_finding_no` (SECURITY DEFINER;
EXECUTE only `postgres`, `service_role`); counter RLS on, 0 policies, no `anon` / `authenticated` grants;
`issues` RLS policy and grants byte-identical; row counts unchanged (0 genuine Findings — the backfill
had nothing to number). `types/database.ts` regenerated: only `issues.finding_no` and the counter table.

| Local migration test (PGlite) | Result |
| --- | --- |
| Existing Findings backfilled per project by (created_at, id), incl. a created_at tie broken by id | PASS |
| Counters seeded to each project's max; none for a project without Findings; backfill keeps `updated_at` | PASS |
| Next number = max + 1; a project's first Finding = 1; a value sent on INSERT is ignored | PASS |
| UPDATE of `finding_no` (with title / type / priority / status) keeps the number | PASS |
| Delete 6 → next 7; delete 2 → next 8 (never reused) | PASS |
| `UNIQUE (project_id, finding_no)` rejects a duplicate even with the trigger disabled | PASS |
| `authenticated` creates Findings (numbered by the trigger) and cannot change the number | PASS |
| `authenticated` / `anon`: no SELECT / INSERT / UPDATE / DELETE on the counter, no EXECUTE on the function (despite default grants) | PASS |
| Project delete cascades its counter row; fresh database (0 Findings) numbers 1, 2, 3 | PASS |

**Acceptance on hosted, production build:** **42/42 PASS** (run 2). Run 1: 34/37 — the Finding Detail
H1 rendered "F-001·Title" (the separator was spaced only by CSS margins — fixed with real spaces);
the search check expected "001" / "1" to return only F-001, but bare digits also keep the text search
and matched "ISO 9001" in other Findings — the test now requires F-001 among the results ("F-001"
itself still returns only F-001); the mobile check read the hidden desktop table copy (test fixed).

| Area | Checks (all PASS) |
| --- | --- |
| Creation paths | manual → "Finding F-001 created.", stored 1, no origin; Verification → "Finding F-002 created.", origin kept; Gap Assessment → "Finding F-003 created.", review origin kept — one project sequence |
| Display | Findings list "No." column; Finding Detail H1 "F-001 · Title", no UUID on the page; Verification card "View F-002" (title "F-002 · …"); Gap Assessment follow-up list "F-003 · Title"; Action form "Finding: F-001 · …"; Actions workspace "F-001 · …" |
| Stability | type Nonconformity → Observation + new title: still F-001 |
| Search | Findings: "F-001" → F-001 only; "001" and "1" include F-001; "f-2" → F-002; "Retention" → text match; Actions: "F-001" → its action; consultant "7" → F-007; "F-100" among 100 → exactly F-100 |
| No reuse | delete F-003 → next F-004; delete F-002 → next F-005; counter 5; numbers 1, 4, 5 |
| Tamper (Data API, consultant token) | PATCH `finding_no` 99 → still 1; INSERT with 999 → assigned 6; counter SELECT / INSERT / UPDATE / DELETE → 403 / 403 / 403 / 403 (anon 401), counter intact; `rpc/assign_finding_no` → 404 |
| Authorization / isolation | consultant creates "Finding F-007 created." and searches it; Project B's first Finding is also F-001; a Project B Finding through a Project A URL → "Page not found", nothing leaked |
| Concurrency | 10 simultaneous inserts (admin + consultant) in one project → all 201, 1..10; 2 × 10 in two projects → each 1..10; 20 more simultaneous → 11..30, no duplicates, counter 30 |
| Performance | 100 sequential inserts over the network: 1..100 in order, ~123 ms each (12.3 s); Findings list with 100: 1.3 s; no new query (number is a column of the existing selects / embeds) |
| Report readiness | `finding_no` directly selectable with an activity-scoped filter |
| Mobile 390 / 412 | card "F-007 · type · priority · status …", Finding Detail "F-001 · …", Action card "Finding: F-001 · …", no horizontal overflow |
| Cleanup | fixtures removed; the fixture projects' counter rows gone through the project cascade (0 left) |

**Regressions on the final code:**

| Suite | Result on the final code | Earlier attempt |
| --- | --- | --- |
| 5D | 78/78 | — |
| 5E | 80/80 | — |
| 5F | 62/62 | — (export keeps Finding counts only) |
| 4C-1 | 160/160 | 159/160 — "no new table (20)" superseded by the counter table |
| 4C-2 | 155/155 | 154/155 — source check of the embed string superseded (`finding_no` added) |
| 4D-1 | 145/145 | 144/145 — same embed-string source check |
| 4D-2 | 122/122 | — |
| 4E | 122/122 | — |
| 4F | 78/78 | — |

Each Phase 4 suite's cleanup script ran right after it (residue 0).

Superseded assertions updated (each marked "6A" in the test): toast text "Finding created" →
"Finding F-nnn created." (4C-1, 4C-2, 5D); "View Finding" link → "View F-nnn" (4C-2, 4D-2); the Findings
table's title is now the second column (4C-1 row reader); 4C-1's "no new table (20)" → 21 (the approved
counter table); 4C-2 / 4D-1 source checks of the embed string now include `finding_no` (still one
embedded query, no per-item query).

After all suites: fixture residue 0 (only Chinh Long and Test 1 remain) and **genuine data identical to
pre-flight**.

### Phase 6B — Activity Report narrative (executed 2026-10-02 / 2026-10-03)

**Migration** `20261003000100_activity_summary_fields.sql` — validated locally first (PGlite with all
project migrations: 4/4 — two nullable text columns without default; an existing Activity keeps its
fields and `updated_at`; `authenticated` can write them under the existing policy; no report table),
then `supabase db push` after a dry run listing only that file. Hosted: `activities` +`summary`,
+`client_participants` (text, nullable); RLS policy and grants unchanged; 20 tables (none added).
`types/database.ts` regenerated — only the two columns.

**Acceptance on hosted, production build: 35/35 PASS** (run 3). Run 1: 10/11 — the test's
`getByRole("button", { name: "Edit Activity" })` also matched "Edit Activity Summary" (made exact);
run 2: 34/35 — the partial-summary check read the section before the post-save refresh had rendered
it (the test now waits for the saved text; run 3 logged the section as exactly "Outcome / Activity
Summary · Edit Activity Summary · CONSULTANT SUMMARY · Only the conclusion so far.").

| Area | Checks (all PASS) |
| --- | --- |
| Empty state | "No Activity Summary has been recorded yet." + Add Activity Summary, no "Not set." rows; sections Plan → Verification → General Activity Evidence → Outcome / Activity Summary; Plan still shows Objectives / Planned Work |
| Edit surfaces | Edit Activity drawer: identity / schedule / Plan only; Edit Activity Summary drawer: the four fields with helper text, no Project / Site / Type / Dates / Consultant / Mode; saving Edit Activity leaves the summary byte-identical |
| Full summary | the four example texts saved ("Activity Summary saved"), surrounding whitespace trimmed, line breaks kept; same Activity, status Planned unchanged, Plan untouched, no new record; Detail shows all four with line breaks and "Edit Activity Summary" |
| Edit / blank | summary + participants updated, blank Next Steps stored as NULL and removed from the Detail, same record |
| Partial | only "Consultant Summary" shown — no other labels, no placeholders |
| Status independence | saved while Planned, In Progress, Completed and Cancelled — status unchanged each time (no report lock) |
| Long text / Vietnamese | 875-character, three-paragraph text with Vietnamese, & / ( ) stored in full and rendered with paragraph breaks; Vietnamese participant names intact; no overflow |
| Isolation / security | Project A context with Project B's Activity id → "This Activity could not be found.", both Activities unchanged; Project B Activity via a Project A URL → "Page not found", no narrative leaked; signed-out replay of the save action → 307, nothing changed; signed-out Detail → login |
| Delete | an unreferenced Activity with all four fields filled is still deletable (no new blocker) |
| Consultant | consultant edits and saves the summary (no admin role, no approval) |
| Report readiness | objectives, planned_work, work_performed, summary, next_steps, client_participants readable from the Activity; no report / summary table |
| Mobile 390 / 412 | long Vietnamese participant names wrap, no overflow; Edit Activity Summary reachable, not under the bottom nav; editor text areas full width (350 / 372 px), Save visible and tappable while typing; saved |
| Cleanup | fixtures removed |

**Regressions on the final code:**

| Suite | Result | Earlier attempts |
| --- | --- | --- |
| 6A | 42/42 | — |
| 5D | 78/78 | — |
| 5F | 62/62 | — |
| 4E-6 | 65/65 | 64/65 — Findings "Site" cell read by index 2, which since 6A's "No." column is index 3 (test fixed); 63/65 and 64/65 — the status-control value was read once 600 ms after a save while the refresh was still running (the test now polls up to 10 s; the database value was correct every time) |
| 4F | 78/78 | — (section order with the new "Outcome / Activity Summary" title) |
| 4D-1 | 145/145 | 53/54 — a 10 s wait for "3 of 3 Closed" timed out; passed unchanged on rerun |
| 4D-2 | 122/122 | — |
| 4B | not run | its harness reads fixture ids from `P4B_IDS`, provided by an external setup script that is no longer available; Activity Detail is covered by 4E-6, 4F and this suite |

Superseded assertions updated (marked "6B" in the tests): section title "Outcome / Visit Summary" →
"Outcome / Activity Summary" (4B, 4E-6, 4F).

**Genuine data:** the snapshot's whole-row hash of `activities` differs only because the rows now
include the two new (NULL) columns; the same hash over the original columns equals the pre-flight value,
every other snapshot key is identical, and both genuine Activities have NULL `summary` /
`client_participants`. Fixture residue 0 (only Chinh Long and Test 1 remain).

### Phase 6C — Activity Report data integration (executed 2026-10-03)

No migration, RLS, grant or Storage change. Two levels of testing:

**1. Report rules unit test — 21/21 PASS.** `assembleActivityReport` (`lib/reports/activity-report.ts`)
run directly by Node on synthetic raw rows: deterministic output; executed here = 3 (incl. a check
planned for another Activity) counted by result; planned-here pending = 1 and completed elsewhere = 1
kept separate; issue list = only executed-here Issue Identified / Follow-up Required, with requirement
"ISO 14001:2015 · 8.1 — …" and F-002; Findings `activity_id = A` only, ordered 1, 2, 7, a Finding with
no Activity dropped; origins manual / verification / document_review; site names resolved; no NC response
data; an Action on both paths once; a Finding-linked Action without `activity_id` included; standalone
Activity Action included; an Activity Action linked to another Activity's Finding keeps F-030; Action
order (open, due date, undated, closed last); Evidence 5 = Activity 1 + Verification 2 (executed + pending
here) + Finding 1 + Action 1, the elsewhere check's file excluded, the both-paths Action's file once;
Finding Evidence named "F-002 · …"; consultant falls back to email; narrative passed through; empty
Activity; Evidence of another project dropped.

**2. Hosted acceptance, production build — 29/29 PASS** (run 2; re-run 29/29 after the heading rename
below). Run 1: 27/29 — the block headings' counts were spaced only by a CSS margin, so the text read
"EVIDENCE(4)" (fixed with a real space; same class as 6A-01), and the performance fixture attached
Evidence to Action numbers 31–39 of 30 (fixture fixed).

| Matrix | Checks (all PASS) |
| --- | --- |
| Layout | sections Plan → Verification → General Activity Evidence → Outcome / Activity Summary → Activity Report Summary; no Export / "Coming soon" |
| A / B / C | Activity A: "4 executed · 2 Verified OK · 1 Issue Identified · 1 Follow-up Required" (incl. a check planned for B), "1 planned, not completed", "1 completed in another activity"; Activity B: the check planned for A but done in B counts there; B's own check done in A shows as completed elsewhere |
| Issue list | only the Issue / Follow-up checks executed in A, with requirement, notes and "F-001 · title" |
| D / E / F / G | Findings of A: F-001 (verification-origin), F-002 (manual), F-005 (Gap Assessment-origin with Activity A); project-wide F-004 and B's F-003 absent; row shows number, type, priority, status, title, description, requirement; site only where it differs from the Activity's |
| H / I / J | 3 Actions: the Finding-linked one without `activity_id` (F-001, owner, Overdue — existing rule — first), the one on both paths once, the standalone one (Closed, last); B's Action absent |
| K | Evidence 4 = Activity 1 / Verification 1 / Finding 1 / Action 1; the elsewhere check's and Project B's files absent; no signed URL before a click; Download → existing on-click flow ("File is unavailable." for a fixture without an object) |
| L | empty Activity: "No checks executed.", "No Findings recorded.", "No Actions recorded.", "No report Evidence recorded.", no empty group boxes |
| Read-only | viewing all reports left Activities, checks, Findings, Actions, attachments and files byte-identical |
| N / access | Project B Activity via a Project A URL → "Page not found", nothing leaked; signed out → login; consultant sees the same summary |
| M | 390 / 412 px: F-001, actions and a long Evidence file name wrap, no horizontal overflow |
| Performance | 50 checks / 20 Findings / 30 Actions / 40 Evidence on one Activity, all shown; Activity Detail 1048 / 765 / 812 ms |

**Regressions on the final code:**

| Suite | Result | Earlier attempt (this phase) |
| --- | --- | --- |
| 6B | 35/35 | — |
| 6A | 42/42 | — |
| 5D | 78/78 | — |
| 5F | 62/62 | — |
| 4C-1 | 160/160 | — |
| 4C-2 | 155/155 | 154/155 — counted the Close Finding button right after navigation, before render (passed unchanged on rerun) |
| 4D-1 | 145/145 | — |
| 4D-2 | 122/122 | — |
| 4E | 122/122 | — |
| 4E-6 | 65/65 | 64/65 — its "Activity status not repeated as a badge" check counted every "In Progress" span on the page, now including Action status badges in the Report Summary (check scoped outside it) |
| 4F | 78/78 | 17/18 — the Report Summary's "Verification" block heading had the same name as the Verification section, so a section locator matched twice → the block was renamed **"Verification Summary"** in the app |

Superseded assertions updated (marked "6C"): Activity Detail section order / count now includes
"Activity Report Summary" (4E-6, 4F, 6B); the 4E-6 badge check above.

After all suites: fixture residue 0 (only Chinh Long and Test 1 remain) and **genuine data identical to
pre-flight**.

### Phase 6D — Activity Report DOCX export (executed 2026-10-03)

No migration, RLS, grant or Storage change; new dependency `docx` 9.8.1 (pure JavaScript). The test
downloads the real `.docx` files (browser download and route requests), opens the package with JSZip and
reads `word/document.xml`, its tables and paragraphs.

**Acceptance on hosted, production build — 43/43 PASS** (run 2). Run 1: 40/42 — both failures in the
test: a "no Finalize / Approve / Submit / Sign…" button pattern also matched the app's "Sign out" (pattern
anchored to whole workflow words), and the whole-run no-mutation hash included the test's own deliberate
close / reopen of F-002 (split into a check before that step and a fresh baseline after it). Every DOCX
content check passed in both runs.

| Area | Checks (all PASS) |
| --- | --- |
| Entry point | **Export Report** in the Report Summary header, secondary style; no Finalize / Approve / Submit / Sign-off |
| File | `RayIMS-Site-Assessment-Report-P6D-ACCEPT-ISO-Implementation-20261027-Viet-Long.docx`; headers `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `attachment; filename="…"`, `no-store` |
| Structure | valid zip with `[Content_Types].xml` and `word/document.xml`; document.xml well-formed (browser DOMParser); A4 portrait (11906 × 16838); no `word/media`, drawings, links or signed URLs; table header rows repeat (`w:tblHeader`), rows don't split, headings keep with next; every table grid ≤ the 9638-twip content width |
| Content order | title "Site Assessment Report" + activity name; sections 1 Project / Activity Information … 9 Recommendations / Next Steps in order, each once |
| Information | client, project, type, site, mode "On-site", "27/10/2026 08:30 – 16:00", status, consultant, Client Participants "Nguyễn Văn A — Trưởng phòng Chất lượng" + second line; no N/A / Not provided / undefined / null |
| Narrative | Objectives and Planned Work / Scope as separate paragraphs; Work Performed "Đã đánh giá hiện trạng tài liệu…", blank line and second paragraph preserved; multi-paragraph Consultant Summary; Next Steps lines |
| Verification | counts Executed 8 / Verified OK 6 / Issue Identified 1 / Follow-up Required 1 / Planned, not completed 1 / Completed in another Activity 1 = the screen; issue table 2 rows (requirement "ISO 14001:2015 · 8.1 — …", question, result, notes, F-001) |
| Findings | F-001, F-002, F-005 each once = the screen; Vietnamese title "Chưa kiểm soát đầy đủ hồ sơ theo yêu cầu." with a long description; site Long An; no Correction / Root Cause / Effectiveness; columns No. / Type / Framework Requirement / Finding / Site / Priority / Status |
| Actions | 4 = the screen; the both-paths Action once; overdue "Open — Overdue" with F-001 and owner; standalone "—"; long Action, Vietnamese owner, due 15/12/2026; columns as specified |
| Evidence | 4 rows = the screen, one per origin (Activity / Verification / Finding / Action); Finding origin "F-001 · …"; long file name; no Project B or completed-elsewhere file |
| Parity / consultant | consultant export: document body byte-identical to the admin's |
| Cross-activity | export B counts the check planned for A (Issue Identified 1) and holds F-003; export A only "Completed in another Activity" 1, no F-003 |
| Empty | Activity without narrative / checks / Findings / Actions / Evidence: valid DOCX, only the information table, one line per section ("No objectives or planned work recorded.", "No checks executed.", "No issue or follow-up checks recorded.", "No Findings recorded.", "No Actions recorded.", "No report Evidence recorded.", "No consultant summary recorded.", "No next steps recorded.") |
| Point in time | after closing F-002 a new export shows Closed, the earlier file still Open |
| Isolation / access | Project A route + Project B Activity → 404; Project B route + Project A Activity → 404; malformed id → 404 — no DOCX; signed out → 307, no DOCX bytes |
| No mutation | the exports changed no Activity, check, Finding, Action, attachment, file or Storage object (checked before and after the deliberate F-002 step) |
| Mobile | 390 / 412 px: Export Report reachable, not under the bottom nav, downloads, no overflow |
| Performance | full report 638 ms (browser download), 13.8 KB; large report (50 checks / 20 Findings / 30 Actions / 40 Evidence) all rows present, 480 / 335 / 359 ms, 17 KB |

**Report rules unit test (6C):** 21/21 on the final code.

**Regressions on the final code:**

| Suite | Result | Earlier attempt (this phase) |
| --- | --- | --- |
| 6C | 29/29 | 28/29 — its "no Export control" check is superseded by the Export Report button (now: one enabled Export Report, still no "Coming soon") |
| 6B | 35/35 | — |
| 6A | 42/42 | — |
| 5D | 78/78 | — |
| 5F | 62/62 | — (Gap Assessment workbook after the shared-helper refactor) |
| 4C-1 | 160/160 | — |
| 4C-2 | 155/155 | — |
| 4D-1 | 145/145 | — |
| 4D-2 | 122/122 | — |
| 4E | 122/122 | — |
| 4E-6 | 65/65 | — |
| 4F | 78/78 | — |

After all suites: fixture residue 0 (only Chinh Long and Test 1 remain) and **genuine data identical to
pre-flight**.

### Phase 6E — Phase 6 final acceptance (executed 2026-10-03 / 2026-10-04)

Validation only: no application-code, schema, RLS, grant or Storage change (documentation edits only).
Production build (`next start`), hosted Supabase, Edge via Playwright (time zone Asia/Ho_Chi_Minh).
Fixtures prefixed `P6E-ACCEPT-` only. Before testing: schema / RLS / grant / Storage fingerprint
(`p6e-schema`) and a genuine-data snapshot; both compared again after all suites.

**Result: 57/57 PASS** (run 2). Run 1: 56/57 — the "linked Action without Activity" step of the test left
the Finding's prefilled Activity in the Action form (test now chooses "No activity" explicitly; the
product behaviour — prefilling the Finding's Activity — is as designed). The whole scenario is driven
by a Consultant account through the UI.

| Area | Checks (all PASS) |
| --- | --- |
| Phase 3 behaviour | consultant creates the Activity in the Master Plan (type Site Assessment, site, mode, consultant, date and times; status Planned), it appears in the plan, edit (end time) and status → In Progress persist |
| Scenario data | 9 checks: 4 Verified OK, 2 Issue Identified, 1 Follow-up Required, 1 planned not completed, 1 planned for A but executed in B |
| Finding numbering | Findings from a Verification (F-001), manually with the Activity (F-002), from a Gap Assessment with the Activity selected (F-003) — "Finding F-00n created." — one sequence; origins stored as designed; the check executed in B produced F-004 on B; title / type / status edits (and `finding_no` 99 forced over the API) keep F-002; delete of F-006 → next F-007 |
| Actions | linked without Activity, linked + Activity A, overdue (derived), standalone, Closed — union of 5 on the report, the both-paths Action once |
| Narrative | whitespace-only Consultant Summary stored as NULL; Vietnamese text, paragraph breaks, Client Participants saved; Plan fields and status unchanged |
| Activity Detail | sections Plan → Verification → General Activity Evidence → Outcome / Activity Summary → Activity Report Summary; all 10 headings unique; every button named; Export Report present, no approval / finalize control |
| Report vs database | counts 7 executed / 4 / 2 / 1, 1 planned not completed, 1 completed elsewhere; only 3 Issue / Follow-up checks listed; Findings F-001..F-003 (F-004 absent); Actions 5; Evidence 4 (the elsewhere check's file excluded) — each equals a direct SQL count |
| Finding number everywhere | Findings list, Finding Detail H1 "F-001 · title" (copies with real spaces, no UUID), Actions "F-001 · title", Verification "View F-001", Gap Assessment follow-up "F-003 · title", Report Summary, DOCX |
| DOCX | filename `RayIMS-Site-Assessment-Report-P6E-ACCEPT-IMS-Implementation-20261027-P6E-ACCEPT-Viet-Long.docx`; valid zip, well-formed document.xml; A4 portrait, page-number footer, repeated table headers, no table wider than the page; no media, signed URL or UUID; 9 sections in order, each once; "27/10/2026 08:30 – 16:30"; Vietnamese and paragraph breaks intact |
| Screen / DOCX parity | Verification counts, Finding numbers and statuses, Actions (count, once, Overdue, due date, Closed), Evidence count |
| Current state | F-001 closed after an export: the new file says Closed, the earlier file still Open; repeated exports changed no Activity / check / Finding / Action / attachment / file / Storage object |
| Cross-activity | export B counts the executed check and owns F-004; export A shows it only as "Completed in another Activity" |
| Empty Activity | undated, no narrative / checks / Findings / Actions / Evidence: compact empty states on screen; valid DOCX with only the information table; file date = the viewer's local date in two zones (Asia/Ho_Chi_Minh 20261003, Pacific/Kiritimati 20261004), footer time in the same zone |
| Isolation / signed out | Project A route + Project B Activity / export / Finding → not found, nothing leaked; signed out: Activity Detail → login, narrative action replay refused (307), Finding insert refused (401), export 307 with no bytes, nothing changed |
| Mobile 390 / 412 | report readable, F-001 visible, no overflow; long Evidence file name wraps; Export Report reachable, not under the bottom nav; Activity Summary editor usable, Save visible while typing |
| Desktop | Export Report secondary, not dominant; hierarchy Plan → Verification → Outcome → Report Summary |
| Large Activity | 50 checks / 20 Findings / 30 Actions / 40 Evidence: detail 964 / 772 / 770 ms, DOCX 287 / 281 / 256 ms, 17 KB, all rows present |
| Cleanup | fixtures removed; issues / actions / attachments / files / documents / finding counters 0 |

**Report rules unit test (6C):** 21/21.

**Regressions on the final code:**

| Suite | Result | Earlier attempt (this phase) |
| --- | --- | --- |
| 6D | 43/43 | — |
| 6C | 29/29 | — |
| 6B | 35/35 | — |
| 6A | 42/42 | — |
| 5C | 74/74 | — |
| 5D | 78/78 | — |
| 5E | 80/80 | — |
| 5F | 62/62 | — |
| 4C-1 | 160/160 | — |
| 4C-2 | 155/155 | 154/155 — the "Close Finding available" check read the button count once right after navigation, before the page had rendered (it also failed once in 6C and passed on rerun); the test now waits for the button, then counts |
| 4D-1 | 145/145 | — |
| 4D-2 | 122/122 | — |
| 4E | 122/122 | — |
| 4E-6 | 65/65 | — |
| 4F | 78/78 | — |

**Phase 3:** no Phase 3 suite remains in the test harness. Activity create / edit / status / site / consultant /
time / Master Plan behaviour is covered by the 6E scenario (above) and by 4E-6, 4F and 6B (Activity Detail,
status control, delete rules, Activity Summary). This is stated as coverage, not as a Phase 3 suite pass.

**Schema review (hosted, read-only fingerprint before vs after: identical).** 12 migrations; 20 tables;
Phase 6 additions are exactly `project_finding_counters` and `issues.finding_no` (6A), `activities.summary` and
`activities.client_participants` (6B); none in 6C / 6D. Every business table keeps its single
"authenticated full access" policy and authenticated-only grants; `project_finding_counters` has RLS on, no
policies and no `anon` / `authenticated` grants (SELECT and function EXECUTE both false); functions
`assign_finding_no` (security definer), `handle_new_user`, `set_updated_at`. **Storage:** bucket
`rayims-files` private, 10 MB limit, the same three authenticated policies, 0 objects before and after —
the report export writes nothing.

After all suites: fixture residue 0 (only Chinh Long and Test 1 remain) and **genuine data identical to
pre-flight**.

### Phase 7A — Pilot Foundation + regression harness preservation (executed 2026-10-04 / 2026-10-05)

Production build (`next start`), hosted Supabase, Edge via Playwright (time zone Asia/Ho_Chi_Minh unless a
check names another), run **from the committed harness in `tests/`** (`node tests/regression/run.mjs`).
Fixtures prefixed `P7A-ACCEPT-`. Before testing: schema / RLS / grant / Storage fingerprint (`p7a-schema`,
identical to the Phase 6E final one: 12 migrations, 20 tables) and a genuine-data snapshot (`p7a-snapshot`);
both compared again afterwards — **identical**. No migration, RLS, grant, Storage or application-data change.

**Result: `p7a` 107/107 PASS** (first runs failed only on test-side problems, listed below), **`p7a-activity`
9/9**, **`p7a-unit` 92/92** (four process time zones), report-rules unit test 21/21.

| Area | Checks (all PASS) |
| --- | --- |
| Home — empty | no fixtures: "No pending work needs your attention." + View Projects, no placeholder wording, title / navigation "Home" |
| Home — data | Upcoming: 5 rows, soonest first across Projects, Project + Type + Site shown, Completed / Cancelled excluded, row opens Activity Detail. Overdue: 5 rows, total (10) in the heading, F-nnn, owner, due date, Project; closed / not-yet-due excluded; Finding-linked row → Finding, others → Actions?filter=overdue. Documents Under Review: 5 rows, total (8), oldest first, V1, Under Review; concluded / unreceived excluded; row → Document Detail. Recent Projects: the 5 newest. No overflow, no hydration warning, side-by-side at 1280×800 |
| Authorization | Consultant sees the same Home as Admin; signed out → login, no fixture content |
| Project Overview | the shared sections: 3 upcoming of this Project only, Overdue (8) of this Project only |
| Date-only | 2026-10-03 shows "Oct 3, 2026" on Actions and Activity Detail in Asia/Ho_Chi_Minh, UTC, America/Los_Angeles, Pacific/Kiritimati; unit test shows the previous implementation printed "Oct 2, 2026" in Los Angeles |
| Local today | controlled clock: Action due 2026-10-03 and Activity ending 2026-10-03 are NOT overdue at local 23:59 on 3 Oct and ARE overdue at 00:01 on 4 Oct, in Asia/Ho_Chi_Minh and America/Los_Angeles; unit boundary cases also for UTC and UTC+14 |
| Timestamps | 2026-10-03T16:59Z shows 11:59 PM (Ho Chi Minh) / 09:59 AM (Los Angeles); server HTML carries a hidden placeholder, never a server-zone time; no hydration warning |
| Deep link | Gap Assessment follow-up → `/verification?item=<id>`: item 26 rows down is scrolled into view and highlighted without searching, highlight differs from a normal row without hover, clears after ~6 s; at 390 / 412 px visible, highlighted, not under the bottom nav, no overflow |
| Invalid deep links | malformed id, another Project's item, deleted item, 300-character value: workspace loads (HTTP < 400), compact note, no highlight, nothing from another Project; note dismissible |
| Findings filter | options = All Activities, Project-wide / No Activity, this Project's Activities only; exact results for FA (2), FB (1), No Activity (1), empty Activity (empty state); combines with Type and search; Clear resets it |
| Actions filter | same options (No Activity); FA → only the Action whose own Activity is FA (the Finding-linked Action without an Activity is not included), FB (1), No Activity (2); combines with Status (Overdue) and search; Clear resets it; the Activity Report still lists both Actions (broader rule kept) |
| Mobile 390 / 412 | Home, Activity Detail, Verification, Finding detail (timestamp row), Finding create form, Findings, Actions (Activity filters fit and work), Document Detail + Gap Assessment (Complete Assessment reachable, not under the bottom nav), Activity Summary editor (Save visible): no horizontal overflow |
| Desktop 1280×800 | Actions and Findings filters stay in at most two rows |
| Copy sweep | Home, Projects, Project Overview, Activity Detail, Verification, Findings, Actions, Documents, Document Detail: no stale / approval / placeholder wording |
| No mutation | Activities, checks, Findings, Actions, Documents, reviews, files, Storage objects identical after Home, filters, deep links and date display |
| Cleanup | fixtures removed; issues / actions / attachments / files / documents / objects 0 |

**Test-side problems found while writing the suite (fixed in the test, not product defects):** the first fixture
build used ~130 CLI calls (rewritten as one SQL batch); a follow-up list exists only on a concluded
assessment (fixture review made concluded); the summary button is "Add Activity Summary" while empty; the
filter-row check counted per-row status selects; a fixture question contained the word "approval"; and the
first highlight check measured the hover colour (the highlight was strengthened and the check now moves
the mouse away and compares with a normal row).

**Performance (this machine, hosted database):** Home 443 – 739 ms warm (6.3 s on the first cold request);
Findings / Actions Activity filter applied in 11 – 75 ms (client-side); deep link including the Document
Detail page and a click 3.1 – 5.0 s. Home runs a fixed set of queries — six in parallel (Upcoming × 2,
Overdue × 2, Documents Under Review, Recent Projects) plus one site-name lookup; the Project Overview four plus
one; no per-row queries (stated from the code, not instrumented).

**Phase 3 minimal Activity smoke test (`p7a-activity`, 9/9):** Consultant creates an Activity in the Master
Plan (type, name, site, mode, consultant, date, times) → stored and listed; an end time before the start is
refused; edit (name, end time, Project-wide) saved; status Planned → In Progress → Completed saved; Activity
Detail shows it. It was cheap because the 6E steps were reusable. It is not a full Phase 3 suite.

**Regressions on the final code (run from `tests/regression` through `run.mjs`):**

| Suite | Result | Note |
| --- | --- | --- |
| 6D | 43/43 | |
| 6C | 29/29 | |
| 6B | 35/35 | |
| 6A | 42/42 | |
| 5C | 74/74 | |
| 5D | 78/78 | |
| 5E | 80/80 | |
| 5F | 62/62 | first pass 59/60 — the large-register step (260 documents) timed out waiting for a page (network / load); a rerun alone passed 62/62 |
| 4C-1 | 160/160 | |
| 4C-2 | 155/155 | |
| 4D-1 | 145/145 | |
| 4D-2 | 122/122 | |
| 4E | 122/122 | |
| 4E-6 | 65/65 | |
| 4F | 78/78 | |

**Harness preservation:** `tests/regression` holds about 85 files (suites, fixtures, safety fingerprints, `run.mjs`), `tests/README.md`
documents prerequisites, environment, fixtures, how to run and the gaps; dev dependencies `playwright-core`
(26 suites drive the browser) and `jszip` (the .docx / workbook suites) were added; `npm run test:regression`
and `npm run test:unit` exist; `npm test` deliberately does not. Paths were made relative (`REPO`), the
browser path can be overridden (`RAYIMS_BROWSER_PATH`), two hard-coded account e-mails in `p5f` now come
from the env file. 15 core suites plus the new ones ran from the repository. **Not preserved as runnable:**
4B (`p4b-test.mjs` needs `P4B_IDS` from a harness that no longer exists), `p6a-local` / `p6b-local` (need
`@electric-sql/pglite`, not added); `p5a`, `p5b`, `p5g`, `p6e`, `p4b5` were copied but not re-run in 7A.
There is still no full Phase 3 suite.

### Phase 7B — Data-integrity hardening (executed 2026-10-05)

Hosted Supabase, production build, Edge via Playwright, run **from the committed harness in `tests/`**. Fixtures
prefixed `P7B-ACCEPT-`. Pre-flight: 12 migrations; documents / versions / reviews / attachments / files / Storage
objects all 0; **0 Versions with more than one open review** (checked, not assumed); live constraint names read from
`pg_constraint` (`document_versions_document_id_fkey`, `document_reviews_document_version_id_fkey`, both ON DELETE
CASCADE, not deferrable) and the live `document_register` definition (`order by r.created_at desc`, `security_invoker`).
Project-delete audit: the only Project delete in the application is the rollback of a brand-new Project (no Documents);
the two RESTRICT FKs do not touch it. Test cleanups of every suite already delete reviews → versions → documents explicitly.

**Migration** `20261005000100_document_integrity_hardening.sql`: tested **locally first** (`p7b-local`, PGlite with all
earlier migrations, **26/26**: a duplicate-open-review database makes it stop with a clear message and change nothing; on
clean data the two FKs become RESTRICT, the mapping FK still cascades, both stay non-deferrable, the unique partial index
exists, the view keeps columns / types / order / `security_invoker` / grants and orders `created_at DESC, id DESC`;
existing rows untouched; delete refusals; second open insert → 23505; concluded history unrestricted; tie-break), then
`supabase db push --dry-run` (only this migration pending) and `supabase db push` (never `config push`). Hosted fingerprint
after: the **only** change among migrations / tables / columns / RLS / policies / grants / functions / triggers / Storage is
the migration count (12 → 13); FK delete actions `r`, `r` (mapping `c`), one new index, the view definition; **no new table,
column, function or RPC; no RLS, grant or Storage change**.

**Result: `p7b` 40/40 PASS** (two test-side problems on earlier runs, listed below).

| Area | Checks (all PASS) |
| --- | --- |
| Constraints (hosted) | both FKs RESTRICT, mapping FK still CASCADE; partial unique index present; view orders `created_at DESC, id DESC` and keeps `security_invoker` |
| Document delete | no Versions (with a requirement mapping) → deleted, mapping removed; with a Version → blocked by the application ("This document has versions and cannot be deleted."), Document, Version, file row and Storage object intact |
| Version delete | latest unreviewed → Version row, file row and Storage object all removed; blocked with a concluded review, with an open review, and a non-latest Version ("Only the latest unreviewed version can be deleted.") → Version, file row, object and both reviews intact |
| Deterministic Document race | the check saw no Version → a competing Version was inserted → the stale delete is **refused by the database** (HTTP 409, SQLSTATE 23503 — RESTRICT surfaces as a foreign-key violation) → Document and new Version survive, no file row or object lost |
| Deterministic Version race | the check saw no review → a Gap Assessment **with Evidence** was added → the stale delete is refused → Version, Review, Evidence attachment, both file rows and both Storage objects survive |
| Overlapping stress | 12 × (Version insert vs Document delete) and 12 × (review start vs Version delete), fired at the same instant: no Version / Review was ever lost; both orders of serialization occurred and were consistent |
| One open review | 12 simultaneous inserts on one Version → exactly 1 created, 11 refused (23505); a later second open insert refused; concluded reviews unrestricted; a new open review possible once the previous one is concluded |
| Application, simultaneous starts | a Consultant starts through the UI → exactly one open assessment; the captured Start action replayed **12 at once** → 1 started, 11 "already open", every response HTTP 200, 1 open of 1 review; **20 at once** on a fresh Version → exactly one review row |
| Application delete races | the captured delete actions replayed against a competing insert with a random 0 – 30 ms offset, 30 × Document and 30 × Version: never a lost Version / Review, never a raw error; the new "can no longer be deleted because a version / Gap Assessment now exists" message was produced 20 – 22 (Document) and 15 – 22 (Version) times per 30 attempts across runs; the rest were refused by the application's own check |
| Security | cross-project tampering (another Project's Document / Version id, either direction) → "could not be found" with no hint of Versions / reviews; signed out → the delete actions do nothing and a REST delete is denied; Documents unchanged |
| Latest review | two reviews with an identical `created_at` (ids …aa Accepted, …bb Revision Required) → the view's latest review is the higher id; Document Detail and the register list show the same Revision Required |
| Register statuses | Not Applicable, Not Received, Received, Under Review, Revision Required, Accepted unchanged (view and application list) |
| Performance | review insert median 118 ms (open, covered by the partial index) vs 110 ms (concluded, not covered) over 10 inserts each; start through the UI about 1.0 – 1.5 s. No before-migration baseline exists, so the comparison is open vs concluded on the same table |
| Cleanup | fixtures removed; documents / versions / reviews / findings / actions / attachments / files / Storage objects 0 |

**How the interleavings were produced** (no sequential faking): (1) *deterministic* — the test plays both parties with real
separate HTTP requests to the hosted database: T1's check (a read), T2's competing insert, then T1's delete, exactly the
window the application leaves between its check and its delete; (2) *overlapping* — the competing insert and the delete are fired
together with `Promise.all`, and the invariants are asserted whatever order the database serialized them in; (3) *through the
application* — server actions captured from the UI are replayed concurrently with the competing insert.

**Test-side problems on earlier runs (fixed in the test, not product defects):** the confirm dialog is an `alertdialog`;
the UI offers Delete only on the current Version (the non-latest case is checked through the action); a variable shadowed a
function; a keyword search for "error" matched the page payload of a successful action response; the cleanup check
counted the three genuine Verification items.

**Phase 7A and earlier on the final code (run from `tests/regression`):**

| Suite | Result | Note |
| --- | --- | --- |
| 7A `p7a` | 107/107 | |
| 7A `p7a-activity` | 9/9 | |
| 7A `p7a-unit` | 92/92 | |
| 6D / 6C / 6B / 6A | 43/43, 29/29, 35/35, 42/42 | report-rules unit test 21/21 |
| 5A | 104/104 | |
| 5B | 103/103 | |
| 5C / 5D / 5E | 74/74, 78/78, 80/80 | |
| 5F | 62/62 | first pass in the runner 59/60 (the large-register import preview timed out waiting 60 s; also seen in 7A); standalone rerun 62/62 |
| 5G | 100/100 | first runs 83/85 and 98/100: one check read the Finding Detail text before the page had rendered, and one read the register / detail text before `<LocalTime>` (7A) had been formatted — both are timing in the test; waits added, rerun 100/100. 5G had not been re-run since Phase 5 |
| 4C-1 / 4C-2 | 160/160, 155/155 | |
| 4D-1 / 4D-2 | 145/145, 122/122 | |
| 4E / 4E-6 / 4F | 122/122, 65/65, 78/78 | |

**Data safety:** genuine data identical to the pre-flight snapshot; fixtures removed (only Chinh Long and Test 1 remain; 0 issues,
actions, attachments, files, Storage objects).

**Not exercised on the hosted database:** the migration's duplicate-open-review guard (the hosted data has no duplicates and the
index now forbids creating them) — covered by the local PGlite test only.

### Phase 7C — Bulk Document Upload (executed 2026-10-05 / 2026-10-06)

Hosted Supabase, production build, Edge via Playwright, run **from the committed harness in `tests/`**. Fixtures prefixed
`P7C-ACCEPT-` (Document titles carry no prefix so title matching is realistic; the Client and Project do). Pre-flight:
13 migrations, 20 tables, schema / RLS / grant / Storage fingerprint recorded, genuine-data snapshot taken; documents /
versions / reviews / files / attachments / Storage objects all 0. Afterwards the fingerprint is **identical** (still 13
migrations, 20 tables; **no migration, no RLS / grant / Storage change, no new table**) and the genuine data is identical.

**Result: `p7c` 86/86 PASS** (final build), **`p7c-unit` 54/54** (matcher), after fixes described below.

| Area | Checks (all PASS) |
| --- | --- |
| Entry point / selection | Bulk Upload button in the Documents workspace opens a page (not a drawer); the picker has no `webkitdirectory`; 51 files → "Select up to 50 files per batch." and Analyze disabled, nothing truncated, removing one re-enables it; 31 × 10 MB (over 300 MB) → advisory warning only, Analyze enabled; drag and drop adds files; the picker is a labelled multi-file input; signed out → login |
| Mixed batch (Consultant, 13 rows) | unique code → Auto-match (Document shown as code · title · Site, Revision prefilled Rev.02, preview V1); code on two Sites → Suggested, nothing preselected, picker lists both candidates first; exact title → Suggested / Needs review, Accept makes it Ready; no match → Unmatched; 10 MB + 1 KB → Blocked with the policy message; .txt → Blocked; the same file twice → second Blocked as duplicate; open Gap Assessment → Blocked (existing wording); Not Applicable → Blocked; same file name and size as the current Version → warning only, still Ready, preview V2; manual assignment found by search → Manual; Skip → Skipped; filters Ready 5 / Unmatched 2 / Blocked 5 / Needs review 0 / All 13; summary bar; **nothing uploaded before Confirm**; Cancel uploads nothing |
| Upload result | Completed 5 · Failed 0 · Skipped 1 · not uploaded 7; the result shows the Version the server created; database: V1 with revision Rev.02, received date, uploaded by the Consultant, original file name and size intact, the Document that had V1 got V2; 5 Versions, 5 file rows, 5 Storage objects, **0 Documents created**; blocked / unmatched / skipped files created nothing; every object lives under the Project prefix; Back to Documents shows the new state |
| Next Version | no Version → preview V1, V1 → V2, V1 + V2 → V3; the server created exactly V1 / V2 / V3 |
| Vietnamese | "Quy trình kiểm soát tài liệu Rev.02.pdf" and "Hồ sơ đào tạo 2026.xlsx" display intact (no mojibake), match their Vietnamese titles as Suggested (accent-insensitive title; word overlap with a year), Rev.02 hint; the original names are stored unchanged, only the Storage key is ASCII |
| One file per Document | two files assigned to one Document → both Conflict, explained, Upload not possible; skipping one resolves it; only ONE Version created |
| Realistic 30-file batch (Admin) | 30 Documents, 30 files → 30 Auto-match, all Ready; upload: 30 Versions, 30 file rows, 30 Storage objects, exactly one Version per Document, all keys unique, no orphan object |
| Partial failure | the Storage upload of one of four files forced to fail: 3 completed, 1 failed with its reason; the earlier success kept and the later files continued; the failed upload left no file row, no Version, no object; Retry (fresh prepare) → exactly one V1, no duplicate |
| Register failure | after a real Storage upload, another consultant opens a Gap Assessment on that Document: the server refuses with the existing message; the object was removed, no file row, no Version; Retry while still open fails again cleanly; after the assessment is concluded **Retry Failed** creates V2 |
| State change during the batch | a Gap Assessment started (by SQL, between the files) on the second file's Document: that file fails with the existing message, files 1 and 3 complete, nothing created for the blocked one |
| Isolation | the prepare / register server actions replayed with another Project's Document id (both directions) → generic "could not be found", no metadata, no Version / file row / object created; signed out → the action is refused; the Project's page does not contain the other Project's Document |
| Mobile 390 / 412 | selection and Match Review fit (stacked cards, no horizontal overflow), the Document selector panel stays on screen, a conflict is explained in the card, reassigning through search resolves it, Upload reachable (not under the bottom navigation), the Confirm sheet is fully on screen, progress and result readable, Back to Documents reachable |
| Desktop 1280×800 | 30 rows, compact (about 100 px each), no horizontal overflow, **no cell or control clipped at the table's right edge** |
| Cleanup | fixtures removed; documents / versions / reviews / attachments / files / Storage objects 0 |

**Matcher unit test (`p7c-unit`, 54/54):** normalization; revision hints (Rev.02, Rev02, Revision 3, V2, V2.1; "Div2" and "Reverse" are not hints); exact unique Document Code (also with `_`, `.`, no separators); PR-QMS-010 does not match PR-QMS-01; the same code on two Sites; Site words rank / preselect (never AUTO); the longest code wins; codes under 3 characters ignored; exact title after removing revision / date suffixes; Vietnamese with and without accents; word overlap (4/5 ≥ 0.8) and its uniqueness; exact title beats a longer similar title; a Site name alone never matches; determinism; duplicate selected files; row states (Ready, Needs review, Unmatched, Skipped, Blocked ×5, Conflict, resolved by skip / reassign, same-as-current warning, previews V1 / V2 / V3); summary counts; Document label. Thresholds (documented constants): 0.8 overlap of both sides, at least 2 shared words, 3-character codes, 0.1 uniqueness margin, 50 files, 300 MB advisory.

**Performance (this machine, hosted database; no network conclusions beyond these figures):** matching 50 files against 300 Documents took
about 32 ms (pure function); the browser analyzed 13 files in 90 – 131 ms and 30 files in 94 – 148 ms (including render);
5 files of the mixed batch uploaded in 11.6 – 17.8 s; **30 sequential uploads of 20 KB files took 64 – 87 s (about 2.1 – 2.9 s per file)** across the runs. Sequential upload was
usable for this size, so no parallelism was added.

**Problems found while building the suite:** the suite caught **one real defect** — the file input handler reset the input before React read its
live `FileList`, so a later selection could be empty (fixed: the files are copied first) — and a **layout defect seen in a screenshot**
(the Include column clipped at the right edge; fixed, and a no-clipping check was added). The rest were test-side: a keyword search for
"webkitdirectory" matched bundled React code, `innerText` applies the CSS uppercase, reads before the page had rendered, a file selected
before hydration is ignored (and React ignores a repeat of the identical selection — the test clears and re-selects), and a mobile step that
assigned a Document another file already targeted.

**Regressions on the final code (run from `tests/regression`):**

| Suite | Result | Note |
| --- | --- | --- |
| 7B `p7b` / `p7b-local` | 40/40, 26/26 | open-review blocking, Version and Document delete rules intact |
| 7A `p7a`, `p7a-activity`, `p7a-unit` | 107/107, 9/9, 92/92 | |
| 6D / 6C / 6B / 6A | 43/43, 29/29, 35/35, 42/42 | report-rules unit test 21/21 |
| 5A / 5B | 104/104, 103/103 | single Version upload, numbering, cleanup |
| 5C / 5D / 5E / 5F | 74/74, 78/78, 80/80, 62/62 | |
| 5G | 100/100 | the first runner pass was 84/85: the large-register import preview timed out waiting 60 s (the same pattern seen in 7A / 7B); a standalone rerun passed 100/100 |
| 4C-1 / 4C-2 / 4D-1 / 4D-2 | 160/160, 155/155, 145/145, 122/122 | |
| 4E / 4E-6 / 4F | 122/122, 65/65, 78/78 | |

**Data safety:** genuine data identical to the pre-flight snapshot; fixtures removed (only Chinh Long and Test 1 remain; 0 documents, versions, reviews, files, attachments, Storage objects).

**Not covered:** parallel uploads, folder upload and a real slow / dropping network are not tested (Storage failure is simulated by aborting the request); the matcher's behaviour on very large catalogs (thousands of Documents) was only timed at 300.

### Phase 7 — remaining slices (7D – 7E)
Test cases: *not yet defined* (Expected Records, deployment dry-run).
