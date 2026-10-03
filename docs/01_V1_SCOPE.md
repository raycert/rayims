# 01 — V1 Scope

RayIMS V1 is a Quick-Win MVP. Anything not listed under **In scope** is not V1
without explicit approval.

## In scope

1. **Authentication** — Supabase Auth, login only. Public sign-up disabled;
   users are created by an admin. Single role `admin` / `consultant`.
2. **Clients** — create and manage clients.
3. **Projects** — a client may have multiple projects.
4. **Sites** — reusable client-level sites, linked to projects through
   `project_sites` (scope of a project).
5. **Frameworks** — reference/master data with a hierarchical item tree (seeded:
   ISO 9001, 14001, 45001, 50001). Consultants browse and search; **Admins
   administer** (create, edit, controlled delete; ADR-016). Projects select the
   frameworks they use.
6. **Master Plan / Activities** — plan project work: activity type, site
   (optional), dates, mode (on-site / online), planned days, consultant,
   objectives, planned work, status. Also holds the visit summary fields.
7. **Verification** — verification items created from document review or
   manually, scheduled to an activity, and completed with a result.
8. **Findings** (database table `issues`) — audit / site findings: Nonconformity,
   Observation or Opportunity for Improvement, with a lightweight NC response
   (correction, root cause, corrective actions, one effectiveness review, closure —
   ADR-018; not a full CAPA system).
9. **Actions** — trackable actions, with or without a Finding (Corrective Actions are
   actions linked to a Finding).
10. **Documents** — a document register (project-wide or site-specific).
11. **Document Versions** — multiple uploaded revisions per document.
12. **Document Review** — review of a document version, with a result.
13. **Evidence / Attachments** — photos, PDFs, Excel, Word and screenshots
    attached to core entities via the shared files registry.
14. **Activity Summary / Activity Report** — consultant narrative on the Activity plus data derived from
    its records, shown on Activity Detail and exported as an editable **DOCX** (ADR-020; no server-side
    PDF generation, no report record, status or approval).
15. **Minimal Dashboard** — upcoming activities and open / overdue actions.

## Phase 2 scope (Client / Project / Site / Frameworks)

In: Clients, Sites, Projects, Project Setup (identity, site scope, framework
assignment), Project Workspace **Overview with real data only** (sites, frameworks,
project information), Framework Library and Detail, Framework Administration (Admin).
Approved UI references: `docs/phase-2/`.

Outside Phase 2: activity planning, documents and versions, reviews, evidence,
verification, issues and actions, reports, and every excluded item below. The
Overview does not show upcoming activities, verification progress or issues/actions
until their phases.

## Out of scope (V1 exclusions)

RayIMS V1 **must not** implement:

- AI, LLM APIs, automatic document analysis
- Realtime
- Offline synchronization
- Billing, subscriptions
- Client portal / client accounts
- Complex multi-tenant architecture
- Complex RBAC (organizations, teams, invitations, permissions)
- Complex approval workflows
- Electronic signatures
- Full CAPA **management system** (workflow engine, configurable approvals, escalation,
  RCA methodology tooling such as 5 Why / Fishbone). A *lightweight* NC response on a
  Finding is in V1 (ADR-018).
- GHG calculation engine
- ESG scoring engine
- CBAM calculation engine
- Drag-and-drop calendar / scheduling
- Resource optimization and complex timesheets
- Microservices
- Redis
- Background job infrastructure (queues, cron workers)
- Search engine, separate backend server, separate auth provider

Where such things look useful, they are **future considerations only**.

## Deferred (approved review outcomes — not V1)

| Item                                                      | Note                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| `visit_notes` table                                       | Visit summary lives on `activities`; notes on verification items; photos as captioned attachments (ADR-013) |
| Human-readable numbering (e.g. ACT-014)                   | Deferred; no `issue_seq` / `action_seq`, no numbering triggers (ADR-015) |
| Activity ↔ framework junction (`activity_frameworks`)     | Frameworks derived from project and from item references             |
| Per-project, per-item assessment status matrix            | Future additive table (gap assessment)                                |
| Organizations, `project_members`, client contacts         | Future multi-user / portal work                                       |
| Finding number (NC-001 style), target closure date, Major/Minor, effectiveness history, evidence category | Backlog; Finding/NC numbering is a Phase 6 prerequisite (ADR-018, ADR-015) |
| `ltree` paths, full-text search                           | Adjacency list + recursive query is sufficient                        |
| Soft delete, audit log                                    | `created_by` + `updated_at` are sufficient for V1                     |
| Image thumbnails / storage image transformations          | Cost; compress client-side at upload instead                          |
| Server-side PDF generation                                | Activity Report exports as editable DOCX instead (ADR-020); Save as PDF from Word if needed |
| Domain tables for Carbon / ESG / CBAM                     | Not created in V1                                                     |
| DB trigger against framework hierarchy cycles             | Prevented in the application in Phase 2 (ADR-016)                     |
| Atomic `save_project` database function                  | Phase 2 uses idempotent multi-step saves                              |
| DB guards for project/site client consistency and immutable project client | Validated in the application in Phase 2              |
| Client and project deletion                               | Not part of Phase 2; use `inactive` / `archived`                    |
| "Duplicate framework as new edition"                      | A new edition is a new framework row entered by an Admin              |
| Site status                                               | Not stored; no per-site status is shown                                |

Previously deferred and now **in scope**: framework administration (the "Framework
editing UI / custom frameworks" deferral), approved for Phase 2 and recorded as
ADR-016.

## Scope change rule

Do not expand V1 scope without explicit approval. Approved scope changes must be
reflected here and recorded in `07_DECISIONS.md`.
