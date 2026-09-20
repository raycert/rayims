# 06 — Roadmap

| Phase | Name                                        | Status        |
| ----- | ------------------------------------------- | ------------- |
| 0A    | Architecture Review                         | **COMPLETED** |
| 0B    | Documentation Baseline                      | **COMPLETED** |
| 0C    | Foundation Implementation                   | **CURRENT**   |
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

## Phase 0C — Foundation Implementation [CURRENT]

Scope (foundation only; no feature CRUD):

- Initialize Next.js 16 (TypeScript, App Router, Tailwind), dependencies, folder
  structure per `02_ARCHITECTURE.md`; repository initialization
- Supabase setup, environment template
- Initial SQL migration for the approved Core schema (`03_DATABASE.md`), RLS,
  storage bucket and policies
- Seed data: frameworks and framework items (numbers and short titles only)
- Supabase clients, generated database types, `lib/storage` abstraction
- Design foundation (tokens, status badge, responsive shell skeleton)
- Verification items listed at the end of `02_ARCHITECTURE.md`

## Phase 1 — Authentication & App Shell

Login (no public sign-up), session handling, responsive shell (sidebar / mobile
navigation).

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
