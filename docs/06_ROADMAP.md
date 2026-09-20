# 06 — Roadmap

| Phase | Name                                        | Status        |
| ----- | ------------------------------------------- | ------------- |
| 0A    | Architecture Review                         | **COMPLETED** |
| 0B    | Documentation Baseline                      | **COMPLETED** |
| 0C    | Foundation Implementation                   | **COMPLETED** |
| 1     | Authentication & App Shell                  | Planned       |
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

Still needed from the project owner before Phase 1 can be exercised end to end
(none of this was part of Phase 0C):

- Create the hosted Supabase project, disable public sign-ups, create the first
  user, and fill `.env.local`
- Apply the migrations to that project and confirm the storage bucket exists
- Run a real login round trip (not yet verified: no Supabase project exists)

## Phase 1 — Authentication & App Shell

Login (no public sign-up), session handling, responsive shell (sidebar / mobile
navigation). Builds on the Phase 0C foundation (login form, sign-in/out actions,
`proxy.ts`, shell) and adds real-project verification and refinement.

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
