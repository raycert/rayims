# 05 — UI / UX Guidelines

High-level guidelines only. **Detailed screens are not designed yet.**

## Style

RayIMS looks like a **professional B2B productivity and consulting workspace**:

- light / neutral background
- clean typography
- subtle borders
- restrained use of color
- clear tables and clean cards
- clear status badges
- desktop sidebar; responsive mobile navigation
- large touch targets for site work

**Do not copy RayCert.** RayCert is a realtime quiz/game product; RayIMS must not
inherit its visual style, tone or interaction patterns.

## One responsive application

RayIMS is **one** web application, not separate desktop and mobile apps, and not
mobile-only.

### Desktop / laptop focus (administration, planning, review)

- Dashboard
- Project management
- Master plan / planning
- Document review
- Issue management and action tracking
- Reporting

Dense tables, filters and side-by-side context are appropriate here.

### Mobile / tablet focus (site work)

- Site verification
- Notes
- Evidence / photos
- Issue creation
- Action follow-up

Site screens prioritize one-handed use, minimal typing, quick capture and clear
results.

## Responsive principles

- Design each workflow for its primary device, but keep every feature reachable
  on every device.
- Navigation: sidebar on desktop; compact bottom/menu navigation on mobile.
- Tables degrade to stacked cards on narrow screens rather than scrolling
  horizontally.
- Touch targets around 44 px minimum on site-work screens.
- Camera/photo capture and file pick are first-class on mobile; images are
  compressed client-side before upload.
- Primary actions stay visible and thumb-reachable on mobile; destructive actions
  need confirmation.
- Support light theme first; do not depend on hover for essential actions.
- Keep pages fast: paginate lists, avoid loading everything at once.

## Status conventions

Color reinforces meaning but **never carries it alone** — every badge has a text
label.

| Color       | Meaning                          | Examples                                   |
| ----------- | -------------------------------- | ------------------------------------------ |
| **Green**   | Done / good                      | Completed, Accepted, Verified OK           |
| **Yellow**  | Needs attention                  | Attention, Under Review, Revision Required |
| **Red**     | Problem                          | Issue, Overdue                             |
| **Neutral** | Not started / draft              | Draft, Not Started                         |

Statuses not listed above default to neutral until assigned in the design
foundation (Phase 0C).

## Content and interaction

- Plain, professional language; consistent terms with `04_BUSINESS_RULES.md`
  (e.g. "Issue", not "Nonconformity", unless a future module says otherwise).
- Derived statuses (document status, overdue) are shown as badges but are
  computed, not edited directly.
- Empty states explain the next step.
- Forms are short; validation messages are specific.
- Basic accessibility: sufficient contrast, visible focus, labelled inputs.

## Out of scope for this document

Detailed screen layouts, wireframes, component specifications and the visual
token set are defined later (Phase 0C design foundation and per-phase work).
