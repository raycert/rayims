# 08 — Testing Strategy and Template

This document defines **how** RayIMS is tested and holds the test-case template and
the recorded results. Results exist only for Phase 0D (below); other phases have no
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

**NOT TESTED in Phase 0D:** natural 1-hour token expiry; `supabase db reset` on a local
stack (no Docker); password-reset and email flows (no UI, users are created by an
admin); behavior after the free-tier inactivity pause; deployment to Vercel; load.


### Phase 1 — Authentication & App Shell
Test cases: *not yet defined.*
Candidate areas: login/logout; sign-up disabled; protected routes; responsive
navigation.

### Phase 2 — Client / Project / Site / Frameworks
Test cases: *not yet defined.*
Candidate areas: client/project/site CRUD; project site scope; project
frameworks; framework tree browse.

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
