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

### Phase 5 — Documents / Versions / Reviews
Test cases: *not yet defined.*
Candidate areas: document with no version = Not Received; new version resets to
Received; multiple reviews of one version; derived status rules; framework
mapping; review → issue / verification.

### Phase 6 — Visit Summary / Reporting
Test cases: *not yet defined.*
Candidate areas: report sections populated from data; printable output.

### Phase 7 — Dashboard / Polish / Demo / Deployment
Test cases: *not yet defined.*
Candidate areas: dashboard figures; mobile walkthrough; production build and
deployment checks.
