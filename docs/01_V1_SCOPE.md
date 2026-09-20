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
5. **Frameworks** — seeded, read-only reference frameworks with a hierarchical
   item tree (ISO 9001, 14001, 45001, 50001); projects select the frameworks
   they use.
6. **Master Plan / Activities** — plan project work: activity type, site
   (optional), dates, mode (on-site / online), planned days, consultant,
   objectives, planned work, status. Also holds the visit summary fields.
7. **Verification** — verification items created from document review or
   manually, scheduled to an activity, and completed with a result.
8. **Issues** — generic issues (not necessarily nonconformities).
9. **Actions** — trackable actions, with or without an issue.
10. **Documents** — a document register (project-wide or site-specific).
11. **Document Versions** — multiple uploaded revisions per document.
12. **Document Review** — review of a document version, with a result.
13. **Evidence / Attachments** — photos, PDFs, Excel, Word and screenshots
    attached to core entities via the shared files registry.
14. **Visit Summary / Report** — generated from structured data as a printable
    page (no server-side PDF generation).
15. **Minimal Dashboard** — upcoming activities and open / overdue actions.

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
- Full CAPA / root-cause analysis
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
| Issue classification (NC / Observation / OFI), CAPA       | Future additive column or 1:1 extension table                         |
| Framework editing UI / custom frameworks                  | Frameworks are seeded via migration                                   |
| `ltree` paths, full-text search                           | Adjacency list + recursive query is sufficient                        |
| Soft delete, audit log                                    | `created_by` + `updated_at` are sufficient for V1                     |
| Image thumbnails / storage image transformations          | Cost; compress client-side at upload instead                          |
| Server-side PDF generation                                | Printable HTML page instead                                           |
| Domain tables for Carbon / ESG / CBAM                     | Not created in V1                                                     |

## Scope change rule

Do not expand V1 scope without explicit approval. Approved scope changes must be
reflected here and recorded in `07_DECISIONS.md`.
