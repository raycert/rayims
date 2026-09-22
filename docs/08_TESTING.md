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

#### Phase 2 test specification (application level; NOT yet implemented, NOT TESTED)

These cases are defined for the Phase 2 implementation. They depend on screens and server
actions that do not exist yet, so **none has been run and none has a result**.

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

### Phase 3 — Master Plan / Activities
Test cases: *not yet defined.*
Candidate areas: project-wide vs site activity; site must be in project scope;
modes and statuses.

### Phase 4 — Verification / Issues / Actions
Test cases: *not yet defined.*
Candidate areas: manual verification item; schedule to activity A, complete in
activity B; issue from verification; standalone action; overdue derivation; first
photo upload and attachment.

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
