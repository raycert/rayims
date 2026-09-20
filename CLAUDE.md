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
| Recording what changed                              | `docs/09_CHANGELOG.md`                                  |

## Rules

- RayIMS is a **Quick-Win MVP**. Prefer the simplest thing that works.
- V1 focuses on **ISO implementation and consulting** projects
  (ISO 9001 / 14001 / 45001 / 50001, multi-site).
- The **Core architecture is framework-agnostic**. Do **not** hard-code ISO
  assumptions (clauses, NC/OFI classifications, ISO-specific columns) into
  Core tables.
- `framework_items` is client-independent reference data. Never store activity
  data, emissions, calculations, products, installations, metrics or other
  operational data in it.
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
