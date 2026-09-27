# CLAUDE.md — RayIMS

RayIMS is a responsive B2B workspace for managing implementation, assessment,
consulting, verification, documents, evidence, issues, actions and reporting
across management-system and sustainability projects.

The approved documentation in `docs/` is the **source of truth**. Read the
relevant documents **before** modifying anything.

## Read before you change anything

| If your task involves…                              | Read first                                              |
| --------------------------------------------------- | ------------------------------------------------------- |
| Any task (always)                                   | `docs/01_V1_SCOPE.md`, `docs/06_ROADMAP.md`             |
| Product intent, terminology, workflow               | `docs/00_PRODUCT_VISION.md`, `docs/04_BUSINESS_RULES.md` |
| Folder structure, stack, Supabase, storage          | `docs/02_ARCHITECTURE.md`, `docs/07_DECISIONS.md`       |
| Schema, migrations, queries, RLS, derived values    | `docs/03_DATABASE.md`, `docs/04_BUSINESS_RULES.md`      |
| UI, layout, status colors, responsive behavior      | `docs/05_UI_UX_GUIDELINES.md`                           |
| Tests                                               | `docs/08_TESTING.md`                                    |
| Users, roles, passwords, sign-up, hosted Supabase ops | `docs/10_RUNBOOK.md`                                  |
| Recording what changed                              | `docs/09_CHANGELOG.md`                                  |

## Rules

- RayIMS is a **Quick-Win MVP**. Prefer the simplest thing that works.
- V1 focuses on **ISO implementation and consulting** projects
  (ISO 9001 / 14001 / 45001 / 50001, multi-site).
- The **Core architecture is framework-agnostic**. Do **not** hard-code ISO
  assumptions (clauses, ISO-specific columns) into Core tables. The generic
  audit-finding type on `issues` (nonconformity / observation / opportunity for
  improvement) and the lightweight NC response are approved in **ADR-018**; a full
  CAPA management system is still **out of scope**.
- `framework_items` is client-independent reference data. Never store activity
  data, emissions, calculations, products, installations, metrics or other
  operational data in it.
- Frameworks and Framework Items are reference/master data **administered by Admin
  users only**; consultants are read-only (ADR-016). Referenced frameworks/items and
  items with children cannot be deleted (existing FK integrity). Do not add
  `is_seeded`, `is_system`, lifecycle, archive, publication or versioning concepts.
- Do **not** expand V1 scope without explicit approval.
- Do **not** add: AI / LLM features, realtime, offline sync, billing or
  subscriptions, a client portal, complex RBAC / organizations / teams,
  GHG calculations, ESG scoring, or CBAM calculations.
- Do **not** add infrastructure (Redis, queues, background jobs, search engine,
  separate backend, microservices).
- Never store binary files in PostgreSQL or permanent public file URLs.
- Future domain modules (Carbon, ESG, CBAM) must **not** add nullable FK
  columns to the Core `attachments` table. See `docs/03_DATABASE.md` and
  ADR-009 / ADR-010.
- Do not introduce new architecture decisions on your own. If something is
  missing or ambiguous, ask.
- **When implementation conflicts with the approved documentation: STOP and
  report the conflict.** Do not resolve it silently in either direction.
- Architectural changes must be recorded in `docs/07_DECISIONS.md`, and only
  **after** approval.
- Do not invent test results. Never record PASS for a test that was not run.
- **Public sign-up must stay disabled** in the hosted Supabase project, and **never run
  `supabase config push`** against it (it would overwrite hosted settings). See
  `docs/10_RUNBOOK.md`.
- Every server entry point (Server Component tree, Server Action, route handler) that
  needs a user must verify it with `requireUser()` / `getCurrentUser()` from
  `lib/auth/session.ts`. Proxy is not a security boundary.
- Only relative internal paths may be used as post-login return paths: use
  `safeNextPath()` from `lib/auth/redirect.ts`. Never redirect to a user-supplied URL.

## Approved UI References

Approved Phase 2 UI/UX references are stored in:

`docs/phase-2/`

Approved set:

- `Client and Site Management.dc.html`
- `Projects List.dc.html`
- `Project Setup.dc.html`
- `Project Workspace Overview v1.dc.html` (the FINAL approved Project Workspace; an
  older variant was superseded and removed from this folder)
- `Framework Library.dc.html`

Claude Code must review the relevant `.dc.html` design reference before
implementing a Phase 2 screen.

These files define approved visual layout, hierarchy, interaction intent,
responsive behavior, and UI states.

They do NOT override:
- approved database schema
- business rules
- RLS/security rules
- ADR decisions
- Phase 2 scope

Prototype/demo data and future-concept elements shown in design files must
not be treated as production requirements unless explicitly included in
the current implementation phase. Design annotations ("CONCEPT", "FUTURE CONCEPT
DATA", "IMPLEMENT IN PHASE 2", "FUTURE CONCEPT — DO NOT IMPLEMENT YET") must never
appear in production. Do not edit the approved `.dc.html` files to remove them; the
implementation filters them.

## Next.js 16

@AGENTS.md
