# 00 — Product Vision

## What RayIMS is

RayIMS is a responsive B2B workspace for managing **implementation, assessment,
consulting, verification, documents, evidence, issues, actions and reporting**
across management-system and sustainability projects.

It is one web application used on desktop/laptop for planning and review work,
and on mobile/tablet for site work.

## Target users

**V1: internal users only** — a consultant / admin who runs client projects.
The single V1 role is `ADMIN / CONSULTANT`. There are no client accounts.

Architecture must not make future multi-user collaboration difficult, but V1
does not implement organizations, teams, invitations or enterprise RBAC.

## Core workflow

The reusable RayIMS Core is built around this chain:

```
Client → Project → Site → Framework → Activity
       → Document / Evidence → Review → Verification
       → Issue → Action → Report
```

The V1 working flow:

```
Project setup → Master plan / activities → Document review
  → Create items for site verification → Site visit / verification
  → Issue identification → Action tracking → Activity summary → Activity report (DOCX)
```

**The workflow is not a fixed sequence.** Document Review and Site Visit have no
mandatory order. Two examples the model must support equally well:

- Internal audit: Document Review → Audit Preparation → Site Audit → Findings
- ISO implementation: Training → Initial Site Assessment → Document Review →
  Document Improvement → Follow-up Visit

## V1 ISO focus

The first real use case is a **multi-site IMS implementation project**, for
example:

- Project: *Chinh Long – IMS Implementation 2026*
- Frameworks: ISO 9001, ISO 14001, ISO 45001
- Sites: Viet Long, Chinh Long Binh Duong, Chinh Long Long An,
  Chinh Long Ben Cat, Chinh Long Bac Giang
- Typical activities: Training, Site Assessment, Document Review, Document
  Support, Consulting, Online Support, Internal Audit, Follow-up

V1 supports ISO 9001, 14001, 45001 and 50001 as seeded frameworks. ISO is a
**V1 focus, not a Core assumption**.

## Future direction

The Core stays reusable. Future modules extend it without redesigning it:

| Future module | Direction                                                                   |
| ------------- | --------------------------------------------------------------------------- |
| RayIMS ISO    | ISO implementation, gap assessment, internal audit                          |
| RayIMS Carbon | GHG inventory, ISO 14064-1, emission sources, activity data, factors, verification |
| RayIMS ESG    | ESG assessment, indicators, metrics, targets, improvement actions           |
| RayIMS CBAM   | Installations, production processes, goods, precursors, embedded emissions  |

**None of these domain modules (or their calculation engines) are implemented
in V1.** Domain-specific operational data will live in dedicated tables added
later; the Core only guarantees it does not prevent them. See
`02_ARCHITECTURE.md` and ADR-010.

## Responsive concept

- **Desktop / laptop** — dashboard, project management, master plan, document
  review, issue management, action tracking, reporting.
- **Mobile / tablet** — site verification, notes, photos, evidence, issue
  creation, action follow-up.

One responsive web application; no separate desktop and mobile apps.
See `05_UI_UX_GUIDELINES.md`.

## Quick-Win philosophy

RayIMS V1 is a **Quick-Win MVP**: a useful product delivered quickly without
creating architectural dead ends.

- Build the smallest useful thing; challenge every table, field and feature.
- Keep the Core generic; keep the V1 product focused.
- Avoid infrastructure, queries and storage that cost money without value.
- Design so that growth is possible without paying the complexity cost now.
- Defer, do not delete: deferred ideas are recorded in `01_V1_SCOPE.md`.
