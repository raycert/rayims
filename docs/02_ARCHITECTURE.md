# 02 — Architecture

## Stack

| Layer            | Choice                                    |
| ---------------- | ----------------------------------------- |
| Framework        | Next.js 16, App Router                    |
| Language         | TypeScript                                |
| Styling          | Tailwind CSS                              |
| Database         | PostgreSQL (primary relational database)  |
| Platform         | Supabase (managed)                        |
| Authentication   | Supabase Auth                             |
| File storage     | Supabase Storage (replaceable, see below) |
| Deployment       | Vercel (future)                           |

Supabase provides PostgreSQL, Auth, Object Storage and the database API.
**No additional infrastructure** is introduced: no Redis, separate backend,
message queue, search engine, realtime infrastructure, microservices or
separate authentication provider (ADR-002, ADR-011).

One responsive web application serves desktop and mobile.

## RayIMS Core vs future domain modules

```
RAYIMS CORE (reusable)
  Client → Project → Site → Framework → Activity
        → Document / Evidence → Review → Verification
        → Issue → Action → Report

        ▲ extended by (future, NOT in V1) ▲

  RayIMS ISO     RayIMS Carbon     RayIMS ESG     RayIMS CBAM
```

**The Core** owns: profiles, clients, sites, projects, frameworks and framework
items, activities, documents / versions / reviews, verification items, issues,
actions, and the files / attachments registry.

**Domain modules** own their operational data in dedicated tables, for example:

- Carbon: emission sources, activity data, emission factors, GHG results
- ESG: indicators, metrics, targets
- CBAM: installations, production processes, goods, precursors, embedded emissions

Module boundary rules (ADR-010):

1. The Core must not be redesigned to add a module.
2. `framework_items` organizes reference/assessment structure; it must **not**
   replace domain-specific data models.
3. Module tables use a name prefix in the `public` schema (`carbon_*`, `esg_*`,
   `cbam_*`).
4. Modules connect to the Core through `project_id`, `site_id`,
   `framework_item_id` and the shared `files` registry.
5. Modules needing evidence create **their own** evidence/file junction tables
   referencing `files`. They must **not** add domain-specific nullable FK
   columns to the Core `attachments` table (ADR-009).
6. Module-specific issue data should use 1:1 extension tables keyed by
   `issue_id` (or an additive nullable column), not ISO- or module-specific
   columns on the Core `issues` table.

No domain module or calculation engine is created in V1.

## Planned application structure

Shallow by design. This is the approved layout. The foundation was created in
Phase 0C; folders and routes for later features (`clients/`, `projects/`,
`frameworks/`, `components/<domain>/`) are added when their phase starts.

```
RayIMS/
├─ app/                    Routing and page composition only (no business logic)
│  ├─ (auth)/login/
│  ├─ (workspace)/         Authenticated shell: sidebar (desktop) / bottom nav (mobile)
│  │  ├─ dashboard/
│  │  ├─ clients/
│  │  ├─ projects/[projectId]/   overview, sites, plan, documents, verification,
│  │  │                          issues, actions, reports
│  │  └─ frameworks/       Read-only reference browser
│  └─ layout.tsx, globals.css
├─ components/
│  ├─ ui/                  Primitives
│  ├─ layout/              Sidebar, mobile nav, page header
│  └─ <domain>/            Feature components (documents/, verification/, …)
├─ lib/
│  ├─ supabase/            Browser client, server client, session helper
│  ├─ auth/                Server user helper (session.ts), return-path validation,
│  │                       sign-in error mapping
│  ├─ storage/             Provider-agnostic interface + Supabase implementation
│  ├─ queries/             Server-side read functions per entity
│  ├─ mutations/           Server Actions per entity
│  ├─ validation/          zod schemas
│  ├─ constants/           Activity types, statuses, priorities (TypeScript consts)
│  └─ utils.ts
├─ types/                  Generated database types + hand-written domain types
├─ supabase/               migrations/ (schema, RLS, storage, framework seed)
├─ proxy.ts                Session refresh (Next.js 16 name for middleware)
├─ docs/
└─ CLAUDE.md
```

Notes:

- `lib/queries` and `lib/mutations` are named deliberately: a folder called
  `actions/` would collide with the domain entity **Action**.
- Future modules add `lib/<module>/`, `components/<module>/` and routes under
  `projects/[projectId]/<module>` without restructuring.

## Data access

- Server Components read data; Server Actions mutate it, both through the
  Supabase server client using the **user's session**, so Row Level Security is
  enforced.
- There is no separate API layer. Route handlers are used only where Server
  Actions cannot serve the need.
- Prefer one embedded query per page over many round trips; select specific
  columns; paginate lists.
- Database types are generated from the hosted schema into `types/database.ts`
  (`npx supabase gen types typescript --linked`); regenerate after every migration.
  `types/domain.ts` keeps hand-written types for the value lists, because CHECK
  columns are plain `string` in generated types.

## Authentication and access model (V1)

- Supabase Auth; `profiles` mirrors `auth.users` (created by trigger).
- **Public sign-up is disabled.** Users are created by an admin.
- RLS is **enabled on every table**. The V1 policy is "any authenticated user
  can access all data" — an internal team workspace. Because tables are exposed
  through the Supabase API, disabling RLS is not permitted (ADR-014).
- Every project-owned work entity carries `project_id`, so RLS can later move to
  project-level membership without reshaping tables.
- The Supabase service/secret key is server-only and never sent to the browser.
- `lib/auth/session.ts` (`getCurrentUser`, `requireUser`) verifies the user with
  `getClaims()`, memoized per request. Every server entry point calls it (Proxy is not a
  security boundary). Sign-out is per device (local scope).
- Minimal security headers on every response (`next.config.ts`): `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
  No Content-Security-Policy yet (Phase 7) and deliberately no `Permissions-Policy`, so
  the camera stays available for on-site evidence. HSTS is left to the hosting platform.

## Storage and provider portability

Principles (ADR-008):

1. **PostgreSQL stores metadata only.** Binaries are never stored in PostgreSQL.
2. Object storage holds the binaries (Supabase Storage in V1) in a **private**
   bucket.
3. The `files` table is the provider-independent shared file registry. It stores
   `storage_provider` and `storage_key` (a relative object key — no bucket, no
   URL).
4. **Permanent public URLs are never stored.** Access is via short-lived signed
   URLs generated server-side on demand.
5. The bucket name and provider credentials live in configuration, not in rows.
6. All storage calls go through `lib/storage` (a provider-agnostic interface).
   No other code imports Supabase Storage APIs directly.
7. Documents, document versions, attachments, issues, activities and other
   entities reference `files`; none embeds provider details. Replacing Supabase
   Storage with S3-compatible storage or Cloudflare R2 therefore touches
   `files`, `lib/storage` and configuration only.

Storage key convention: `{project_id}/{uuid}-{sanitized-file-name}`.

Upload flow: the browser uploads **directly** to storage under the user's
session (serverless request-body limits on the hosting platform are too small
for photos and PDFs). The server then inserts the `files` and `attachments` /
`document_versions` rows. If the second step fails, an unreferenced object may
remain; orphan cleanup is a manual script — no background jobs.

## Cost principles

RayIMS V1 should run on low-cost or free infrastructure for development,
portfolio/demo and small internal use.

- Do not add services, background jobs or realtime.
- Minimize queries and API calls (embedded queries, specific columns, pagination).
- Compress and resize photos client-side before upload; set bucket file-size
  limits; do not use storage image transformations.
- Generate reports as printable HTML (browser print / Save as PDF).
- Do not optimize prematurely for enterprise scale.

Operational notes (**verify current provider limits when relevant**):

- Free-tier Supabase projects may pause after a period of inactivity, which
  matters for demos, and free tiers may not include backups. Plan manual
  exports and a paid plan before real client data is stored.
- Vercel's free plan is restricted to non-commercial use; real consulting use
  may require a paid plan.

## Verified in Phase 0C

Checked against the current documentation (Next.js 16.3.5, `@supabase/ssr`
0.12) before implementing:

- Next.js 16 uses `proxy.ts` (renamed from `middleware.ts`); it defaults to the
  Node.js runtime. Proxy is not a security boundary, so the workspace layout
  re-checks the session.
- Supabase SSR session check in `proxy.ts` uses `getClaims()` (verifies the JWT
  signature) rather than `getSession()`; the cookie `setAll` callback also
  applies the no-cache headers the library provides.
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key; no secret key is used
  in the foundation), plus `NEXT_PUBLIC_STORAGE_BUCKET`.
- Storage bucket `rayims-files` is private with a 10 MB object limit; the bucket
  name is configuration, not stored in rows.
