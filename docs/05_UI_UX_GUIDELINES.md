# 05 — UI / UX Guidelines

High-level guidelines. Phase 2 screens are specified by the approved references in
`docs/phase-2/` (see "Phase 2 UI patterns"); screens for later phases are not designed yet.

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
| **Blue (info)** | In progress, no problem       | Received, Under Review (documents)         |

*(Phase 5A)* Document statuses: Not Applicable and Not Received **neutral**, Received and Under
Review **blue / informational** (the primary tint — not amber), Revision Required **amber**,
Accepted **green**. Only the status that needs attention is amber.

Statuses not listed above default to neutral until assigned in the design
foundation (Phase 0C).

## Content and interaction

- *(Phase 4E.6)* A record's single current state (e.g. Activity status) is shown **once** as one
  labelled control ("Status: [value ▾]") — never as a row of tab-like buttons, which read as
  separate content sections. Verification free text is labelled "Notes"; "Observation" is only a
  Finding Type. Buttons that create a new business record carry "+" ("+ New Finding",
  "+ New Action", "+ Add Check", "+ Add Corrective Action"); inline follow-on actions do not
  ("Add Evidence", "Add another Finding", "Create Finding"). On cards, the result / Finding actions
  come first and Evidence is a trailing text link. Toasts appear at the top on phones so they never
  cover a sheet's footer buttons or the bottom navigation.

- Plain, professional language; consistent terms with `04_BUSINESS_RULES.md`
  (e.g. the UI says **"Finding"** — database table `issues` — and the Project tab reads
  "Findings & Actions"; the Verification result label stays "Issue Identified". ADR-018).
- Derived statuses (document status, overdue) are shown as badges but are
  computed, not edited directly.
- Empty states explain the next step.
- Forms are short; validation messages are specific.
- Basic accessibility: sufficient contrast, visible focus, labelled inputs.

## Phase 2 UI patterns

Approved references live in **`docs/phase-2/`** (`Client and Site Management`,
`Projects List`, `Project Setup`, `Project Workspace Overview v1`, `Framework Library`,
all `.dc.html`). They define layout, hierarchy, interaction intent, responsive behavior
and UI states. They do **not** override the schema, business rules, RLS, ADRs or scope,
and prototype/demo data is not a requirement.

- **Simple CRUD** (client, site, framework, framework item): **desktop → right-side
  drawer; mobile → full-screen presentation.**
- **Project Setup** is a **full page** (one structured page with Project Identity, Site
  Scope and Framework Assignment), not a drawer, modal or wizard.
- **Destructive actions are secondary**: per-row overflow (…) menus and confirmations;
  they never dominate a list. Deletion follows the FK rules (BR-53, BR-58) and explains
  why a delete is blocked.
- *(Phase 4F)* Controlled delete of Verification items, Findings and Actions uses one shared
  confirmation (`ConfirmDeleteDialog`): a centred dialog on desktop, a bottom sheet on phones,
  `role="alertdialog"`, focus starts on **Cancel**, Escape closes only the dialog. It first shows the
  server's current evaluation — when blocked, the title says the record can't be deleted, **every**
  reason is listed and only **Close** is offered; otherwise a short message with Cancel and a red
  **Delete**. Entry points: Verification workspace row / card "…" menu, Finding Detail "…" menu
  ("Delete Finding"), the Action edit drawer footer (a quiet red "Delete" on the left).
- *(Phase 5B)* Document Versions are a compact list, newest first ("V2 · Rev.01" + **Current** badge,
  file, received / uploaded, notes, View (PDF) · Download), collapsed to the newest two with "Show
  earlier versions (n)". Delete sits in the "…" menu of the Current version only. Versions are never
  edited — the upload drawer is the only form (File, Revision, Received on, Notes).
- *(Phase 5C)* The **Gap Assessment** panel sits inside the Current version: result badge (Under Review
  blue, Revision Required amber, Accepted green), "Assessed against …" (mapped requirements), Review
  Comments, "Reviewed by / Started by …", and one next action (Start Gap Assessment → Edit / Complete
  Assessment → Start New Assessment). Revision Required adds "Upload a new Version if the document content
  is revised."; Accepted adds "Accepted for this assessment." Older versions show their final result as a
  badge; every version has a collapsed, read-only "Assessment history (n)" ("Earlier assessments" on the
  Current version). Completing uses a drawer with a required Result choice (no default).
- *(Phase 5D)* Under a concluded, latest assessment: one helper line ("Create Finding for a gap the
  document already shows · Add to Verification to confirm it onsite"), two compact buttons (secondary for
  Revision Required, quiet for Accepted) and a collapsed "Follow-up: n Findings · m Verification Items"
  list with links; historical assessments show the list only. The Finding / Verification forms are the
  existing ones with an origin box; a site-specific Document shows its site locked. Review-origin
  Findings show a "Source: Document Gap Assessment · <document> · <version>" line under the header;
  review-origin checks show "From Gap Assessment · <document> · V<n>" in the Verification workspace.
- *(Phase 5E)* Documents header: "+ New Document" (primary) and "Import Excel" (secondary). The import
  page follows the Verification import: explanation ("Import the list of documents required for this
  project. Files and assessment results are added later."), Download Template, choose .xlsx, server
  preview (Row / Required Document / Code / Site / Framework Requirement(s) / Applicable / Result; cards on
  phones) with Ready / Warning / Error, a confirmation checkbox for warnings, and "Import N Documents".
  After import the register shows one message with the counts.
- *(Phase 5F)* Documents header: "+ New Document" (primary), "Import Excel" and "Export Excel" (secondary,
  same weight). Export downloads directly (no wizard, no preview; "Exporting…" while it runs, a toast if it
  fails). The workbook: "Gap Assessment" sheet with a bold, frozen, filterable header row, wrapped long text
  (tall comments are capped at ~8 lines — the full value stays in the cell), subtle status fills that match
  the app tones (neutral / blue / amber / green) next to the status text; plus a simple "Summary" sheet.
- *(Phase 5G)* While the current Version has an open Gap Assessment, "Upload New Version" stays visible
  but disabled, with the line "Complete the current Gap Assessment before uploading a new Version."
  under the Versions header (same place as the Not Applicable explanation).
- **Primary navigation** is the row or name (client, project, framework, site row with a
  chevron); secondary actions live in the overflow.
- **No fabricated future-domain data.** Do not show placeholder or zero values for
  activities, verification, issues or actions before their phases (BR-59). Keep the
  Overview composition so those sections can be added later.
- **Design annotations never ship**: "CONCEPT", "FUTURE CONCEPT DATA", "IMPLEMENT IN
  PHASE 2", "FUTURE CONCEPT — DO NOT IMPLEMENT YET", demo emails and prototype counts.
  The approved `.dc.html` files are not edited to remove them.
- **Admin controls** on the Framework Library / Detail are shown to Admins only; the
  library still reads as a reference catalog for everyone.
- *(Phase 6A)* **Finding numbers** are built only by `formatFindingNumber` / `findingLabel`
  (`lib/ui/format.ts`): "F-001" alone where space is tight (Findings "No." column — first column,
  tabular figures; phone cards — before the badges; Verification card "View F-001"), "F-001 · Title"
  wherever a Finding is named in text (Finding Detail H1 with real spaces, breadcrumb, Action form
  context, Actions list / cards, Gap Assessment follow-up list). Never a raw integer, never a UUID.
- *(Phase 6B)* **Outcome / Activity Summary** (last Activity Detail section, after General Activity
  Evidence): empty → one line "No Activity Summary has been recorded yet." with **Add Activity
  Summary**; otherwise only the fields that have content (Work Performed, Consultant Summary, Next
  Steps, Client Participants — labels in that order, text with its line breaks, long words wrap) and
  **Edit Activity Summary** in the section header. No "Not set." rows. The editor is a normal drawer
  (bottom sheet on phones) with four text areas and one helper line each; no wizard. "Activity Summary"
  is the UI term — not "Visit Summary" (Activities can be online, training, document review…).
- *(Phase 6C)* **Activity Report Summary** — the last Activity Detail section ("Derived from this
  Activity's records — current state."), compact and read-only, separate from the consultant narrative:
  **Verification Summary** (one line of counts — executed, Verified OK, Issue Identified, Follow-up Required,
  plus "planned, not completed" / "completed in another activity" when non-zero — then only the
  Issue / Follow-up checks), **Findings (n)** (F-nnn, type / priority / status badges, title linking to
  the Finding, requirement; site only when it differs from the Activity's), **Actions / Follow-up (n)**
  (description, F-nnn or "Standalone", owner, due date, Overdue badge, status), **Evidence (n)** (only
  non-empty groups, file names wrap, View / Download on click). Empty → one line each ("No checks
  executed.", "No Findings recorded.", "No Actions recorded.", "No report Evidence recorded."). Cards on
  every width — no table that scrolls sideways.
- *(Phase 6D)* **Export Report** — secondary button in the Activity Report Summary header ("Exporting…"
  while it runs; an inline error if it fails); downloads the .docx directly, no dialog. The DOCX uses the
  one built-in template: A4 portrait, 2 cm margins, Arial, navy (#1F3A5F) headings with a thin rule,
  light grey table borders, a light header fill repeated on every page, rows kept together, a footer with
  the report title, activity, generation time (viewer's time zone) and page number. No logo, no colour
  beyond navy / grey, readable in black and white. Per-client templates and photos are backlog.

## Phase 7A UI patterns (pilot foundation)

- **Home** (`/dashboard`, labelled "Home"): a page title and one sentence, then compact lists in cards —
  Upcoming Activities and Overdue Actions side by side from about 768 px (stacked on phones),
  Documents Under Review full width, Recent Projects last. Rows are links (title, one muted detail line
  that wraps, status badge on the right), five at most; no charts, KPIs or "welcome" copy. When nothing
  is pending a single card says "No pending work needs your attention." with a primary **View Projects**
  button. Never "Your workspace is ready…".
- **Dates:** a date-only value reads the same everywhere (BR-157); timestamps are the viewer's local time
  via `LocalTime`; "today" is the viewer's local day (BR-158). Do not build dates with
  `new Date(value).toLocale…` in components.
- **Filters** keep the existing row of selects. The Activity filter reads "All Activities"; Findings add
  "Project-wide / No Activity", Actions "No Activity". Filters are not in the URL (except the existing
  `?filter=overdue` of Actions).
- **Deep link highlight:** a linked row gets a light primary tint with a primary edge (phone: primary
  border and ring) for a few seconds, no animation; the item is scrolled to the middle of the screen,
  clear of the bottom navigation.

## Phase 7C UI patterns (Bulk Upload)

- **A page, not a drawer:** Documents → **Bulk Upload** (secondary button beside Import Excel / Export Excel). Stages on one
  page: choose files (drop zone with a "Choose files" button as the keyboard / phone fallback, selected-file list with
  Remove, limit and size notices) → **Match Review** → Confirm sheet → progress and result. No wizard framework.
- **Match Review:** a compact table on desktop (File · Document · Next · Revision · Status · Include; no more than six
  columns, rows about 110 px) and **stacked cards under 768 px** — never a horizontally scrolling table. Match type
  (Auto-match, Suggested, No match, Manual) and row state (Ready, Needs review, Unmatched, Blocked, Skipped, Conflict) are
  always **text badges**, never colour alone; blockers and warnings are written in the row ("Warning: Same file name and
  size as current Version."). A "Show" filter (All / Ready / Needs review / Unmatched / Blocked) replaces any second screen.
  The summary bar (n ready · needs review · unmatched · blocked · skipped) and the **Upload n files** button sit above the
  list and repeat below a long list; Confirm is a dialog (a bottom sheet on a phone).
- **Document selector:** a button that opens a searchable list (code · title · Site; Suggested candidates first); keyboard:
  Tab / Arrow keys, Escape; panels never exceed the screen width.
- **Progress:** "12 / 30", the current file name (live region), a progress bar and one row per file with its state and a
  named **Retry** button for failures.

## Out of scope for this document

Detailed screen layouts, wireframes, component specifications and the visual
token set for phases after Phase 2 are defined later (per-phase work).
