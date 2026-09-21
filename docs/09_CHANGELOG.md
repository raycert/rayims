# 09 — Changelog

Records what has been completed per phase. **No feature CRUD exists yet**; the
application has authentication, the responsive shell and the schema only.

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
