# 06 — Roadmap

| Phase | Name                                        | Status        |
| ----- | ------------------------------------------- | ------------- |
| 0A    | Architecture Review                         | **COMPLETED** |
| 0B    | Documentation Baseline                      | **COMPLETED** |
| 0C    | Foundation Implementation                   | **COMPLETED** |
| 0D    | Supabase Integration & Backend Verification | **COMPLETED** |
| 1     | Authentication & App Shell                  | **COMPLETED** |
| 2     | Client / Project / Site / Frameworks        | Planned       |
| 3     | Master Plan / Activities                    | Planned       |
| 4     | Verification / Issues / Actions             | Planned       |
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

## Phase 2 — Client / Project / Site / Frameworks

Clients, projects, client-level sites, `project_sites` scope, framework browser
(read-only), project frameworks.

## Phase 3 — Master Plan / Activities

Activity planning and list/detail views; project-wide and site-specific
activities; no drag-and-drop.

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
