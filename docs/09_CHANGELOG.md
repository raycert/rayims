# 09 — Changelog

Records what has been completed per phase. **No feature CRUD exists yet**; the
application has authentication, the responsive shell and the schema only.

## Phase 6B — Activity Report narrative (2026-10-03)

**Result: 35/35 acceptance checks.** One migration; no ADR (ADR-013 note).

### Added

- Migration `20261003000100_activity_summary_fields.sql`: `activities.summary`,
  `activities.client_participants` (nullable text). `types/database.ts` regenerated.
- **Outcome / Activity Summary** on Activity Detail (empty state, only filled fields shown) and the
  **Edit Activity Summary** drawer (`components/activities/activity-summary-drawer.tsx`) with
  `updateActivitySummary` (only the four narrative columns, matched by id + project).
- BR-148, BR-149.

### Changed

- **Edit Activity** no longer contains the Outcome fields; `updateActivity` no longer writes
  `work_performed` / `next_steps`. Section title "Outcome / Visit Summary" → "Outcome / Activity
  Summary". BR-13, BR-66 wording.

## Phase 6A — Finding numbering (2026-10-02)

**Result: 42/42 acceptance checks.** One migration; ADR-019.

### Added

- Migration `20261002000100_finding_numbering.sql`: `issues.finding_no` (backfilled, NOT NULL,
  `UNIQUE (project_id, finding_no)`), internal `project_finding_counters` (RLS, no policies, no
  grants), trigger function `assign_finding_no` (SECURITY DEFINER, EXECUTE revoked) and trigger. No
  `issues` RLS / grant change. `types/database.ts` regenerated.
- Finding numbers **F-001** on the Findings list ("No." column / phone cards), Finding Detail header
  and breadcrumb, Action form and Actions list / cards, Verification card links ("View F-001"), Gap
  Assessment follow-up list and the creation toast ("Finding F-001 created."); number search on
  Findings and Actions ("F-001", "001", "1").
- `formatFindingNumber`, `findingLabel`, `relatedFindingLabel`, `findingNumberFromQuery`
  (`lib/ui/format.ts`); `insertFinding` (`lib/mutations/finding-insert.ts`) used by all three Finding
  creation paths.
- ADR-019 — Finding Numbering (supersedes ADR-015 for Findings only); BR-144 – BR-147.

### Recorded (backlog, not implemented)

- Phase 7: Bulk Document Upload with match suggestions / folder upload, and External Document Source
  (Google Drive / Docs, SharePoint, OneDrive; "snapshot for assessment") — see `06_ROADMAP.md`.

## Phase 5G — Phase 5 final acceptance (2026-10-01)

**Result: 100/100 acceptance checks. Phase 5 — COMPLETE / CLOSED.** No migration, RLS, grant or Storage
change; no ADR.

### Fixed

- Open Gap Assessment + new Version: Upload New Version is now refused while the current Version has an
  open assessment (UI + server, both upload steps) — the old assessment could otherwise never be
  completed (BR-139).
- Simultaneous "Start Gap Assessment" from two browsers created two open assessments (reproduced 3/3);
  the server now reconciles to the earliest one (BR-140).
- Required Document import read existing Documents unpaged (past 1000 a re-import could duplicate) —
  now paged; the compensation delete is batched (100 ids per request).
- Paging no longer assumes a 1000-row cap: it reads until the exact row count (BR-143).
- Last Review dates were the UTC day in the register / export but the local day on Document Detail — all
  three now use the viewer's local day; the export receives the browser's time zone (BR-142).

### Changed

- Import: header row searched in the first 10 rows (title banners above the table, BR-141).
- Business rules BR-125 (note), BR-139 – BR-143; roadmap: Phase 5 closed, backlog classified, Phase 6 next.

## Phase 5F — Gap Assessment Excel Export (2026-09-30)

**Result: 62/62 acceptance checks.** No migration, RLS, grant or Storage change; no ADR.

### Added

- **Export Excel** on the Documents register → `/projects/[projectId]/documents/export` (requireUser):
  `RayIMS-Gap-Assessment-{Project}-{YYYYMMDD}.xlsx` with the "Gap Assessment" sheet (one row per Document ×
  Framework Requirement, 19 human-readable columns) and a "Summary" sheet.
- `lib/queries/document-export.ts` (current file, latest assessment comments / reviewer, direct follow-up
  counts; batched, no per-document query) and `lib/export/gap-assessment-workbook.ts` (rows, order,
  formatting, filename).
- `lib/queries/paging.ts`: ordered paging past the 1000-row response cap.

### Changed

- Document Register read (`listDocuments`): register, mappings and concluded-review reads are paged, the
  Last Review lookup is a project join (no long id list); rows also carry `latestVersionId` /
  `latestReviewId`. Same results, same rules.
- Business rules BR-135 – BR-138.

## Phase 5E — Required Document Excel Import (2026-09-29)

**Result: 80/80 acceptance checks.** No migration, RLS, grant or Storage change; no ADR.

### Added

- **Import Excel** on the Documents register → `/projects/[projectId]/documents/import`: Download Template
  (`/documents/template`, with this project's frameworks and sites), choose a .xlsx, server preview
  (errors / warnings), confirm, import. Up to 500 rows, 2 MB.
- Parser `lib/import/document-register-workbook.ts` (canonical headers + aliases Clause / PIC / Required
  Documents, first-sheet fallback, stored formula values only), validation `lib/validation/document-import.ts`
  (site / applicable / framework + requirement codes, identity merge, existing skip, repeated codes),
  catalog `lib/queries/document-import.ts`, actions `previewDocumentImport` / `importDocuments`.
- Result message on the register: "Imported: X Documents · Skipped existing: Y · Warnings: Z".

### Changed

- Business rules BR-131 – BR-134.

## Phase 5D — Gap Assessment follow-up (2026-09-29)

**Result: 78/78 acceptance checks.** No migration, RLS, grant or Storage change; no ADR.

### Added

- **Create Finding** and **Add to Verification** on the latest concluded Gap Assessment of the current
  Version (Document Detail), reusing the existing Finding and Verification forms with an origin box.
- Server actions `createFindingFromReview` and `createVerificationItemFromReview` with a shared
  eligibility check (concluded, current version, latest assessment, project isolation), document-site
  lock and framework rule (assigned or mapped).
- Follow-up summary per assessment ("n Findings · m Verification Items", with links), also on history.
- Finding Detail: "Source: Document Gap Assessment" line and origin details with a link to the Document;
  Verification workspace: "From Gap Assessment" source line.

### Changed

- Editing a review-origin Finding or check keeps a site-specific Document's site and allows the
  Document's mapped requirements. Business rules BR-127 – BR-130.

## Phase 5C — Document Gap Assessment (2026-09-29)

**Result: 74/74 acceptance checks.** No migration, RLS, grant or Storage change; no ADR.

### Added

- **Gap Assessment** on the Current version (Document Detail): Start Gap Assessment → Edit Assessment
  (Review Comments) → Complete Assessment (Revision Required / Accepted, required choice) → Start New
  Assessment; mapped Framework Requirements shown as "Assessed against"; next-step hints.
- Server actions `startDocumentReview`, `updateDocumentReview`, `completeDocumentReview`: latest
  version only, Applicable only, one open assessment per version, concluded assessments immutable,
  reviewer = concluding user, project isolation through Version → Document → project.
- Read-only **Assessment history** per version ("Earlier assessments" on the Current version).

### Changed

- Register **Last Review** = latest concluded assessment of the latest version (an open one no longer
  replaces it); one batched query. Document Detail loads reviews with reviewer names in its single
  embedded query.
- Roadmap: 5D Review → Finding / Verification (next), 5E Required Document Excel Import, 5F Gap
  Assessment Export, 5G Phase 5 final acceptance. Business rules BR-122 – BR-126.

## Phase 5B — Document Versions (2026-09-28)

**Result: 103/103 acceptance checks.** No migration, RLS, grant or Storage change; no ADR.

### Added

- **Upload New Version** on Document Detail (drawer / sheet: File, Revision, Received on, Notes);
  direct browser upload to the private bucket, server registration of `files` + `document_versions`
  with server-assigned `version_no` (race retried once) and cleanup of the object on any failure.
- Versions list: V{n} · Revision, **Current** badge, file, received / uploaded, notes, read-only
  review summary; newest two with "Show earlier versions"; View (PDF) / Download via 60-second signed
  URLs generated on click; "File is unavailable." for a missing object.
- Controlled **Version delete** (latest, unreviewed, Applicable document) removing the row, the
  `files` row and the stored object; uploads refused while Not Applicable.
- Shared file infrastructure: `lib/files/policy.ts` (per-purpose type / size policy) and
  `lib/files/server.ts` (key check, discard-if-unregistered, real stored size, files row, signed
  URL, object removal). Evidence now uses it with identical behaviour.

### Changed

- The shared delete dialog passes the delete result to its caller (to report a Storage cleanup
  failure). Business rules BR-119 – BR-121.

## Phase 5A — Document Register foundation (2026-09-28)

**Result: 104/104 acceptance checks.** No migration, RLS, grant or Storage change; no ADR.

### Added

- **Documents** project tab (`/projects/[projectId]/documents`): register of logical documents
  with derived status from the `document_register` view, compact Framework Requirements, latest
  version and last review; search, Status / Site / Framework filters; cards on phones.
- **+ New Document / Edit Document** (drawer / bottom sheet): Title, Document Code, Document
  Type, Owner, Project-wide or site, Applicable, and a searchable, grouped **Framework
  Requirements** multi-select — saved together; server validates site and new requirements
  before any write; historical mappings are kept when a Framework is unassigned.
- **Document Detail** (`/projects/[projectId]/documents/[documentId]`): information,
  requirements, read-only Versions area ("No versions received yet.").
- Controlled **Document delete** (no versions only), using the shared confirmation dialog.
- `info` badge tone (primary tint) for Received / Under Review.

### Changed

- Project tabs: Documents is live (Reports stays inert); the active tab is marked
  `aria-current="page"` and scrolled into view on narrow screens.
- Business rules BR-113 – BR-118; BR-21 clarified (explicit Review → Finding / Verification in
  5D; Review Evidence backlog). Phase 5 slicing 5A–5E in the roadmap.

## Phase 4F — Controlled delete, overdue actions, Phase 4 final acceptance (2026-09-28)

Completes Phase 4. **Result: 78/78 acceptance checks**, Phase 4 regression suites all passing (see
`08_TESTING.md`). No migration, FK, RLS, grant or Storage change; no ADR.

### Added

- Controlled delete (BR-108 – BR-111) with one evaluator per record type
  (`lib/domain/delete-rules.ts`) listing every blocker, re-checked by the delete mutations
  (`deleteVerificationItem`, `deleteFinding`, `deleteAction`) on freshly loaded data; the DELETE
  statements are also conditioned on the record's state. Evidence is never deleted automatically.
- Shared `ConfirmDeleteDialog` (alertdialog; bottom sheet on phones). Entry points: Verification
  workspace row / card "…" menu, Finding Detail "…" menu, Action edit drawer.
- **Overdue Actions** on the Project Overview (BR-112): top 5, total count, "View all Actions" → Actions
  workspace with the Overdue filter (`?filter=overdue`).

### Changed

- Activity Detail: "Activity Evidence" → **General Activity Evidence**, with a one-line helper.
- Phase 4 marked **COMPLETED / CLOSED**; next is Phase 5 — Documents / Versions / Reviews.

## Phase 4E.6 — UX polish (2026-09-27)

Applies the approved fixes from the Phase 4E.5 UX review. **Result: 65/65 checks.** No schema, RLS,
grant, Storage or business-rule change.

### Changed

- Activity Detail: one **Status:** select (no tab-like Planned / In Progress / Completed buttons, no
  duplicate status badge; Cancel stays in the menu); sections ordered Plan → Verification → Activity
  Evidence → Outcome / Visit Summary.
- Verification cards: Verify / Review / Edit and Create Finding / Add another Finding come first (one
  row at 390 px), Evidence is a trailing link; "View Finding(s)" has a 36 px tap area.
- Terminology: the Verification free-text field is labelled **"Notes"** (was "Observation");
  "Observation" is only a Finding Type (BR-107).
- Finding "Open" badge is neutral, like Action "Open".
- Toasts show at the top on phones (never over sheet footers or the bottom navigation).
- Finding Detail: no repeated Title row; "Not reviewed yet." before an effectiveness review; fuller
  NC reopen wording.
- Action cards show status once when editable (badge only when read-only); Actions table Finding
  titles clamp to two lines (full title as tooltip); Findings Site column does not wrap; Owner / Due
  Date stack on phones.
- Button "+" convention documented in `05_UI_UX_GUIDELINES.md` (already followed).

## Phase 4E — Evidence / Attachments (2026-09-27)

**Result: 122/122 acceptance checks, 0 P0/P1 findings.** No migration, no RLS / grant / Storage
policy change — the Phase 0C `files` / `attachments` schema and the private `rayims-files`
bucket (10 MB) were used as designed. Phase 4F has not started.

### Added

- `lib/mutations/evidence.ts`: `prepareEvidenceUpload` (parent + policy check, server-generated
  key), `registerEvidence` (re-validation, stored-object check, `files` + `attachments` with
  exactly one parent, cleanup on failure that never touches an already-registered object),
  `getEvidenceUrl` (60-second signed URL on click; "File is unavailable." when the object is
  missing), `removeEvidence` (attachment, then unreferenced file row and object).
- `lib/validation/evidence.ts` (10 MB, allowlisted types by extension + MIME),
  `lib/queries/evidence.ts` (`EVIDENCE_EMBED` added to the Activity, verification-item, Finding
  and Action queries — no extra query, no URLs on page load).
- `StorageProvider` gains `stat` and a `downloadName` option for signed URLs.
- UI: `EvidenceUploader` (Take Photo / Choose File, caption, "Uploading…"), `EvidenceList`
  (metadata, View / Download, Remove with confirm), `EvidenceSection` (Finding, Activity) and
  `EvidenceButton` + drawer (verification cards, action cards, Actions table).
- Business rules BR-102 – BR-106; `03_DATABASE.md` attachments note; `10_RUNBOOK.md` evidence /
  orphan-object cleanup.

### Not done (intentionally)

Evidence categories, bulk upload, thumbnails, compression, versioning, Document Review evidence
UI (Phase 5), business-record delete (4F).

## Phase 4D-2 — Effectiveness Review & NC closure (2026-09-27)

**Result: 122/122 acceptance checks, 0 P0/P1 findings.** No migration, no RLS/grant change (the
4C-1 schema already had the effectiveness and `closed_by` columns). Completes the lightweight NC
workflow of ADR-018. Phase 4E has not started.

### Added

- **Effectiveness Review** section on a Nonconformity (Result, Notes, Reviewed By, Reviewed At;
  "Not Reviewed" / "—" before a review; reviewer shown by display name, else email, else
  "Unknown user") with **Record / Edit Effectiveness Review** (`EffectivenessDrawer`); Progress
  gains an Effectiveness Review row.
- `recordEffectivenessReview` — updates only the four effectiveness columns of an open
  Nonconformity; reviewer/time server-derived; replaces the current review (BR-99).
- `lib/domain/finding-closure.ts` — `evaluateFindingClosure`, the ONE closure rule set
  (hard blockers / warnings / info) for every Finding type (BR-100).
- `getFindingClosureState` and a rewritten `closeFinding(projectId, findingId, { confirmWarnings })`:
  one query loads the Finding with its action statuses, the evaluator decides, warnings require
  explicit confirmation, and the server re-evaluates on every close.
- **Close Finding** for Nonconformity, with a blocker panel ("Cannot close this Finding", Back only),
  a warning confirmation ("Please review", **Close Anyway**) or a clean confirmation; NC-specific
  Reopen wording.

### Changed

- Observation / OFI closure now uses the same evaluator (same rule as before: blocked while a
  linked action is not Closed). BR-88 / BR-98 marked as implemented / superseded; BR-99 – BR-101
  added.

### Not done (intentionally)

Evidence (4E), delete and overdue overview (4F), effectiveness history, Finding number, approvals /
e-signatures, notifications.

## Phase 4D-1 — NC response & Corrective Actions (2026-09-27)

**Result: 145/145 acceptance checks, 0 P0/P1 findings.** No migration, no RLS/grant change
(the Phase 4C-1 schema already had `correction` / `root_cause`, and `actions` was unchanged).
Phase 4D-2 has not started.

### Added

- **Finding Detail** (Nonconformity): derived **Progress** panel, **NC Response** (Correction,
  Root Cause Analysis) with **Edit NC Response**, **Corrective Actions** list with
  **+ Add Corrective Action**. Observation / OFI: **Actions** with **+ Add Action** only (BR-94).
- `updateNcResponse` (`lib/mutations/findings.ts`) — updates only `correction` / `root_cause`
  of an open Nonconformity; blank → NULL.
- `createAction`, `updateAction`, `setActionStatus` (`lib/mutations/actions.ts`): server-derived
  `project_id` / `issue_id` / `created_by` / Open; immutable Finding link; BR-73 Site↔Activity
  rule; closed actions and actions of a closed Finding are read-only; `completed_at` set on
  close and cleared on reopen, completion notes kept (BR-95 – BR-97).
- Shared `ActionFormDrawer`, `ActionStatusControl`, `ActionCard`; `NcResponseDrawer`;
  `FindingsSubnav` (Findings | Actions).
- **Project Actions workspace** `/projects/[projectId]/actions` (`ActionsWorkspaceView`,
  `listProjectActions`): linked and standalone actions, search, filters, derived Overdue, default
  order, **+ New Action** (standalone).
- `isActionOverdue` (`lib/ui/format.ts`), action status labels/tones; `getFinding` now returns
  the NC response and linked actions in its one query.

### Fixed

- The active project tab could wrap onto several lines on mobile ("Findings & Actions"): it now
  has `whitespace-nowrap` like the inactive tabs. The Findings / Actions search box is full-width
  on mobile.

### Not done (intentionally)

Effectiveness Review, Nonconformity closure / Close Anyway / NC Reopen (4D-2), Evidence (4E),
Finding / Action delete (4F), overdue actions on Project Overview (4F), linking an existing
action to a Finding.

## Phase 4C-2 — Verification → Finding integration (2026-09-27)

**Result: 155/155 acceptance checks, 0 P0/P1 findings.** No migration, no RLS/grant change.
Phase 4D-1 has not started.

### Added

- **Create Finding** on the Verification card in Activity Detail — explicit action only, for
  *Issue Identified* (primary) and *Follow-up Required* (secondary), only where the check was
  verified (BR-91). Reuses `FindingFormDrawer` with a new `origin` mode: compact origin box,
  Activity fixed, Site locked for a site-specific Activity, Description/Priority/Framework
  prefilled, Title and Type blank (BR-92).
- `createFindingFromVerification` (`lib/mutations/findings.ts`): reloads the Activity and
  verification item, enforces project, `verified_activity_id` = Activity and the eligible
  results; sets `verification_item_id`, `activity_id`, `created_by`, Open from the server.
- Compact finding summary on the card ("N Finding(s)", View Finding / inline View Findings list,
  Add another Finding); linked findings come from one embedded `issues(...)` relationship in
  `listActivityVerificationItems` — no extra query.
- Finding Detail origin: "Created from Verification" with the check, Activity (linked), Site and
  Framework.

### Changed

- `updateFinding` rejects changing the Activity of a verification-linked Finding; the form shows
  it read-only (BR-93). Manual Findings are unchanged. BR-27 reworded; BR-91 – BR-93 added.

### Not done (intentionally)

Create Finding from the Project Verification workspace, NC response UI, Corrective Actions,
Effectiveness, closure of Nonconformity, Evidence, delete, Finding number.

## Phase 4C-1 — Finding foundation (2026-09-27)

First slice of the revised Phase 4C/4D (Findings & NC workflow). **Result: 160/160 acceptance
checks, 0 P0/P1 findings.** Full result in `08_TESTING.md`; roadmap in `06_ROADMAP.md`. Phase
4C-2 (Verification → Finding) has not started. Approved by the Phase 4C/4D design review and
**ADR-018** (a lightweight NC response — not a full CAPA system).

### Added

- **ADR-018** — Findings on `issues` with a lightweight NC response, and the matching
  amendments: `CLAUDE.md` (Core rule), `01_V1_SCOPE.md` (Findings; exclusion narrowed to a full
  CAPA *management system*), `03_DATABASE.md` (issues section), `04_BUSINESS_RULES.md` (BR-29,
  BR-43, new BR-85 – BR-90), `05_UI_UX_GUIDELINES.md` (terminology), `02_ARCHITECTURE.md`,
  `06_ROADMAP.md` (4C-1 / 4C-2 / 4D-1 / 4D-2 / 4E / 4F).
- **Migration `20260927000100_finding_foundation.sql`** — one additive migration on `issues`:
  `finding_type` (NOT NULL, DEFAULT `observation` for backfill only, CHECK
  `nonconformity | observation | opportunity_for_improvement`), `correction`, `root_cause`,
  `effectiveness_result` (CHECK `effective | not_effective`, NULL = not reviewed),
  `effectiveness_notes`, `effectiveness_reviewed_by` and `closed_by` (FKs to `profiles`, ON DELETE
  SET NULL, indexed), `effectiveness_reviewed_at`. No new table, no RLS/grant change. The
  response and effectiveness columns are established now and **not exposed** until Phase 4D.
  `types/database.ts` regenerated.
- **Findings & Actions** project tab (was the inert "Issues & Actions"), routed to
  `/projects/[projectId]/findings`; **Findings list** (`FindingsWorkspaceView`: search over
  title/description/site/framework, Type/Status/Site/Priority filters, deterministic order —
  Open first, priority, newest, title — desktop table and mobile cards); **New / Edit Finding**
  (`FindingFormDrawer`: Finding Type required with no default, Title, Description, Priority,
  Activity/Site with the BR-73 lock, Framework Requirement); **Finding Detail**
  (`/findings/[findingId]`: header, Finding, Origin); `createFinding`, `updateFinding`,
  `closeFinding`, `reopenFinding` (`lib/mutations/findings.ts`); `listFindings`, `getFinding`,
  `getFindingFormCatalog` (`lib/queries/findings.ts`); `findingSchema` (`lib/validation/findings.ts`).
- **Close / Reopen** for Observation and Opportunity for Improvement (blocked while a linked
  Action is not Closed; `closed_at`/`closed_by` server-derived; closed Findings are read-only).
  **Reopen** clears `closed_at`/`closed_by` and invalidates the current effectiveness result while
  preserving correction, root cause, effectiveness notes and actions. A Nonconformity has no Close
  action yet (server-enforced too).

### Changed

- The Site↔Activity rule (BR-73) and the assigned-framework check (BR-74) moved from the
  Verification mutation into the shared `lib/mutations/scope-validation.ts`
  (`validateSiteAndActivity`, `frameworkItemInProjectScope`) and are reused by Findings; the
  Verification wording/behaviour is unchanged. `getVerificationFormCatalog` now delegates to a
  shared `loadScopeCatalog` (historical framework items taken from the table being edited).

### Verified

Hosted Supabase, production build, Playwright/Edge, 1280×800 and 390/412px, Admin, Consultant and
anon — see `08_TESTING.md`. Server-side rules were proven through the real Server Action endpoint
by rewriting request bodies. Fixtures removed to zero residue; the genuine Chinh Long / Test 1
data hashed identical before and after.

### Findings

- **Design note:** the `issues` table has no DB constraint tying an issue to the same project as
  its activity / verification item / framework item (nor `actions` to its issue); the application
  validates project scope (Findings do, as earlier phases did). Recorded in `03_DATABASE.md`.
- **BACKLOG:** Finding/NC number (Phase 6 prerequisite), target closure date, Major/Minor,
  effectiveness history, evidence category.

### Not done (intentionally)

Verification → Create Finding and Finding counts (4C-2), Correction / Root Cause / Effectiveness
UI, Corrective Actions and the Actions tab (4D), Evidence (4E), Finding delete (4F), NC closure.

## Phase 4B.5 — Verification Excel import (2026-09-26)

Bulk creation of Verification planning items from `.xlsx`. **Result: 149/149 acceptance
checks, 0 P0/P1 findings.** Full result in `08_TESTING.md`; roadmap in `06_ROADMAP.md`.
Phase 4C (Issues) has not started. No database migration, no RLS/grant change.

### Added

- **Import Excel** (secondary button beside "+ New Verification Item", hidden below
  `md`) → dedicated page `/projects/[projectId]/verification/import`: file picker
  (single `.xlsx`, ≤ 2 MB, ≤ 300 data rows), server-side validation, full-width preview
  table (original Excel row numbers, resolved values such as "Viet Long (inferred)"),
  Ready / Warnings / Errors summary, duplicate-confirmation checkbox, and
  "Import N Verification Items". Success returns to the Verification workspace with a
  toast. All-or-nothing (BR-83).
- **Download Template** — a Route Handler (`…/verification/template/route.ts`, the first
  in the codebase, `requireUser()`) that generates a project-specific workbook: sheet
  `Verification Items` (the six headers only) and `Instructions` (guidance, illustrative
  examples that are *not* imported, and the project's Sites, Target Activity identities
  and Frameworks). Code columns are text-formatted so `8.10` is never turned into 8.1.
- `lib/import/verification-workbook.ts` (parse + template + the one Activity-identity
  composer), `lib/queries/verification-import.ts` (one catalog load per request),
  `lib/validation/verification-import.ts` (the single validation used by Preview and
  Import; reuses the 4A question rule), `lib/mutations/verification-import.ts`
  (`previewVerificationImport`, `importVerificationItems`).
- Business rules BR-78 – BR-84 (`04_BUSINESS_RULES.md`).
- Dependency `exceljs` ^4.4.0; `experimental.serverActions.bodySizeLimit: "3mb"` in
  `next.config.ts` (default 1 MB would reject a legitimate 2 MB file).

### Decisions applied (approved overrides of the pre-implementation review)

- Target Activity identity includes Site context: `YYYY-MM-DD | HH:MM | Site | Name`
  (time/date/site slots collapse as specified; `Project-wide`, `Undated`).
- Framework and Framework Item are a both-or-neither pair (Framework alone is an error,
  not a warning — `verification_items` has no `framework_id`, so it could not be stored).
- Duplicate warnings require an explicit confirmation before Import enables (UI only).

### Verified

Hosted Supabase, production build, Playwright/Edge, 1280×800 and 390/412px, Admin,
Consultant and anon — see `08_TESTING.md`. `npm run lint`, `typecheck`, `build` pass;
`git diff --check` clean. Fixtures removed to zero residue; genuine Chinh Long / Test 1
data hashed identical before and after.

### Findings

- `npm audit` reports 2 moderate advisories, both the transitive `uuid` (< 11.1.1,
  missing buffer bounds check when a caller passes a buffer) reached through `exceljs`
  4.4.0. Not exploitable through this feature (no caller-supplied buffer reaches `uuid`);
  fixing it needs `exceljs` to bump its dependency. `exceljs` itself has no advisory.
  BACKLOG: re-check on `exceljs` updates. No broad dependency upgrade performed.
- A workbook's compressed size is capped (2 MB) but its *decompressed* size is not
  inspected before parsing; acceptable for authenticated internal users at V1, noted as
  BACKLOG hardening.
- The duplicate check loads existing items in one query subject to PostgREST's default
  1000-row response cap; a project with more than 1000 verification items would compare
  against only the first 1000. BACKLOG (far above expected V1 volumes).

### Not done (intentionally)

Import history / batch id, undo or delete of an import (Phase 4F owns delete), result /
observation / execution-data import, Verification export, checklist library, mobile
import, Excel dropdown/reference-sheet infrastructure.

## Phase 4B — Activity verification + mobile onsite execution (2026-09-25)

Second implementation slice of Phase 4. **Result: 74/74 acceptance checks, 0 P0/P1
findings.** Full result in `08_TESTING.md`; roadmap status in `06_ROADMAP.md`. Phase
4C (Issues) has not started. No database migration, no RLS/grant change —
`verification_items` already supported this model.

### Added

- **Activity Detail Verification section** (`components/verification/activity-verification-section.tsx`):
  a new card between Plan and Outcome — the Plan/Outcome layout changed from a
  2-column grid to a vertical stack so the three sections read in that exact order.
  Shows a count summary ("N checks · M pending"), no compliance score or progress
  visualization. Items are `target_activity_id = this Activity` OR
  `verified_activity_id = this Activity`, de-duplicated by id
  (`listActivityVerificationItems` in `lib/queries/verification-items.ts`), ordered
  pending-first, then priority high→medium→low, then question A–Z.
- **Cross-activity relationship labels** (BR-76): an item planned here but completed
  in a different Activity shows "Completed in another activity" with **no**
  execute/edit action offered (its execution context can never be silently
  reassigned); an item planned elsewhere but completed here shows "Planned for
  another activity" with Review/Edit fully available, since it's genuinely current
  here.
- **+ Add Check**: reuses the exact 4A `VerificationItemFormDrawer`/`createVerificationItem`
  — no second planning form. Two new optional props (`defaultTargetActivityId`,
  `defaultSiteId`) preset the Target Activity (and lock the Site, via the existing 4A
  rule, when the Activity is site-specific) instead of opening on an empty form.
- **`VerificationExecutionDrawer`** (`components/verification/verification-execution-drawer.tsx`):
  the focused onsite execution UI — Result (Verified OK / Issue Identified /
  Follow-up Required, as full-width stacked buttons, chosen over a 3-across layout
  that would cramp the labels in a 400px-wide drawer at any viewport) and an optional
  Observation. No planning fields. Preloads the current Result/Observation when
  re-opening an already-executed item ("Review / Edit").
- **`recordVerificationResult`** (`lib/mutations/verification-items.ts`): the
  execution mutation. Result is required (BR-75); `verified_activity_id`,
  `verified_by` and `verified_at` are always derived server-side (the route's
  Activity, the session user, the server clock) — never accepted as client input.
  Verifies the Activity belongs to the route's project, the item belongs to the same
  project, and the item is genuinely related to that Activity
  (`target_activity_id` or `verified_activity_id` match) — and independently refuses
  to let an item already verified in a *different* Activity be silently
  re-attributed (BR-76), matching the UI's own refusal to offer that action. Neither
  *Issue Identified* nor *Follow-up Required* creates anything beyond the result
  itself — no Issue, Action, or new Verification Item (BR-77); Phase 4C owns
  Verification → Issue.
- `lib/validation/verification-items.ts`: `verificationExecutionSchema` /
  `VERIFICATION_RESULTS` — a schema deliberately separate from the 4A planning
  schema, with no question/priority/site/target-activity/framework fields.

### Verified

Hosted Supabase, production build, Playwright/Edge, 1280×800 desktop, 390px/412px
mobile: a 9-check density scenario on one Activity; all three execution outcomes with
the "no Issue/Action/new item auto-created" checks explicitly proven at the database
level; Result-required validation; re-edit preload/overwrite with every planning
field confirmed unchanged; the full cross-activity traceability matrix in both
directions; Add Check from a site-specific and a project-wide Activity, with the new
record confirmed to also appear in the Project Verification workspace; cross-project
protection; Admin/Consultant parity and anon denial; responsive; Project Verification
workspace and Phase 3B Activity regression. `npm run lint`, `npm run typecheck`,
`npm run build` pass; `git diff --check` clean. All `P4B-ACCEPT-*` fixtures removed
and confirmed at zero residue across 8 tables; Test 1, the 4/149 Framework seed and
the 8 Activity Type seeds confirmed unchanged.

### Findings

- **Notable, not a defect:** this slice's pre-flight found real user-created data in
  the hosted project for the first time — a "Chinh Long" client/project with
  activities and verification items closely matching the task brief's own example
  scenario, created manually while trying Phase 4A. Confirmed genuine (not test
  residue) and verified byte-identical before and after this slice's full acceptance
  run.

### Not done (intentionally)

Issues, Actions, automatic Issue creation, evidence/photo upload, attachments,
controlled delete for verification items, Project Overview widgets — Phase 4C and
later.

## Phase 4A — Verification foundation + Project Verification workspace (2026-09-24)

First implementation slice of Phase 4. **Result: 73/73 acceptance checks, 0 P0/P1
findings.** Full result in `08_TESTING.md`; roadmap status in `06_ROADMAP.md`. Phase
4B (Activity verification + mobile execution) has not started. No database migration —
the Phase 4 pre-implementation review confirmed `verification_items` already supported
the full V1 model.

### Added

- **Project Verification workspace** (`/projects/[projectId]/verification`): the
  Project Workspace's inert "Verification" tab is now live. Desktop table / mobile
  cards, search (question/framework/target activity/site), and Site/Target
  Activity/Result/Framework filters. Read-only in the sense that matters most:
  `result` is displayed but never editable here — execution is Phase 4B.
- **Deterministic planning order**: pending before completed, then Target Activity
  `start_date`/`start_time` (undated last), then priority high→medium→low, then
  question A–Z. Applied in application code after one query, not as repeated
  round trips — PostgREST cannot express "order by a related table's columns" as a
  single-query `.order()` on the parent table.
- **Create/Edit Verification Item** (`components/verification/verification-item-form-drawer.tsx`):
  the established drawer(desktop)/full-screen(mobile) pattern. Fields: Check/Question,
  Priority, Scope (Project-wide/Specific site), Target Activity, Framework
  Requirement. Deliberately excludes Result, Observation, Verified Activity/By/At —
  those are Phase 4B's execution mutation, not this one.
- **Site inheritance** (BR-73): selecting a site-specific Target Activity replaces the
  Site field with a locked, read-only box showing that Activity's site — enforced in
  the UI (the interactive Site select is removed from the DOM entirely while locked,
  not merely disabled) and independently server-side
  (`validateSiteAndTargetActivity` in `lib/mutations/verification-items.ts`). A
  project-wide Target Activity leaves Site freely chosen. Removing or changing the
  Target Activity never silently clears an already-set site.
- **Framework Requirement scoping and historical preservation** (BR-74): the picker
  offers only Framework Items from Frameworks currently assigned to the project,
  grouped by Framework identity; an existing item's Framework Item that's since been
  unassigned stays visible and selectable (marked "not currently assigned"), is never
  silently cleared, and is never offered to a *different* item as a new choice —
  mirroring ADR-017's inactive-Activity-Type philosophy.
- **Execution-field separation** (BR-72): the planning mutation's UPDATE statement
  never references `result`, `notes`, `verified_activity_id`, `verified_by` or
  `verified_at` — structural preservation, not merely validated away. Proven at the
  database level: editing only `question` on a fully-executed fixture item left every
  execution field byte-identical afterward.
- `lib/queries/activities.ts`: exported `siteNameMap` (was private) for reuse by
  `verification_items`, which has the identical site-resolution need (`site_id` has
  no direct FK to `sites`, only the composite FK to `project_sites`).
- `lib/mutations/scope-validation.ts` (new, not a Server Action file): extracted
  `siteInProjectScope` out of `lib/mutations/activities.ts` for reuse by
  `verification-items.ts` — deliberately kept out of any `"use server"` file, since
  exporting a plain helper from one also exposes it as its own callable Server Action.

### Fixed (found during acceptance, in-scope, no P0/P1)

`getVerificationFormCatalog` initially took a single "current Framework Item" id
parameter, copying Activity Detail's per-record catalog shape — but the Verification
workspace is a *list*, where different rows can each reference a different
historically-unassigned Framework Item simultaneously; a single-value parameter
couldn't serve every row's Edit form correctly. Fixed by deriving the complete set of
historically-referenced-but-unassigned Framework Items from the project's actual
verification items in one additional query, rather than one parameterized value.

### Verified

Hosted Supabase, production build, Playwright/Edge, 1280×800 desktop, 390px/412px
mobile: full Create/Edit matrix, exact ordering across an 11-row fixture set,
execution-field preservation, the complete historical-Framework regression,
validation (including values injected past the picker to prove server-side defense in
depth), project-scope isolation, Admin/Consultant parity, anon denial, responsive,
regression. `npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff
--check` clean. All `P4A-ACCEPT-*` fixtures removed and confirmed at zero residue;
Test 1, the 4/149 Framework seed and the 8 Activity Type seeds confirmed unchanged;
the real `activities` and `verification_items` tables remained empty throughout.

### Not done (intentionally)

Result editing, Observation capture, `verified_activity_id` assignment, mobile onsite
execution, Issues, Actions, evidence upload, controlled delete for verification
items, Project Overview widgets — Phase 4B and later.

## Phase 3B-3 — Status / Cancel / Delete + Phase 3B close (2026-09-24)

Third and final implementation slice of Phase 3B. **Result: 76/78 acceptance checks on
the live run; the 2 non-passes were test-script bugs, independently re-confirmed
correct by direct query.** Full result in `08_TESTING.md`; roadmap status in
`06_ROADMAP.md`. **Phase 3B is now CLOSED.** No database migration in this slice.

### Added

- **Status control** (Activity Detail header): a single quick-change control
  (Planned/In Progress/Completed) — the one primary status-changing interaction
  (BR-68). Removed the Status field from the Edit Activity drawer (it lived there
  since Phase 3B-2) to avoid two competing controls for the same thing.
- **Cancel Activity**: its own explicitly labeled, confirmed action in Activity
  Detail's overflow menu (not one of the quick-status buttons) — `status =
  "cancelled"`, nothing else touched. A cancelled Activity may be changed back to any
  other status through the normal quick status control, no special ceremony
  (BR-68/BR-69).
- **Delete Activity**: controlled, application-level delete in the overflow menu.
  Checks — *before* deleting — whether the Activity is referenced by any of the 5
  real FK paths found in the schema (`verification_items.target_activity_id`,
  `verification_items.verified_activity_id`, `issues.activity_id`,
  `actions.activity_id`, `attachments.activity_id`), and blocks with a friendly
  business message if so, never relying on the database's own SET NULL/CASCADE
  behavior — `attachments` is CASCADE and would otherwise silently remove evidence
  (BR-70).
- **Overdue badge** on Activity Detail, alongside the existing Master Plan indicator;
  cancelled rows now visually de-emphasized (opacity) in Master Plan while staying
  fully searchable, filterable and openable.
- **Upcoming Activities** (Project Workspace Overview, new section): at most 3
  activities where `status NOT IN (completed, cancelled)` and `start_date >= today`,
  ordered `start_date → start_time → name`, via a scoped/limited query — never the
  whole Master Plan just to show 3 rows. Compact empty state; `View Plan` link
  (BR-71).
- `lib/mutations/activities.ts`: `setActivityStatus` (the single status-changing
  mutation — Cancel is simply this call with `status="cancelled"`, no separate
  mutation, no `cancelled_at`) and `deleteActivity` (`requireUser()`, not
  `requireAdmin()`, same as every other Activity mutation).
- `lib/queries/activities.ts`: `listUpcomingActivities`; refactored the shared
  row-mapping/site-name-resolution logic out of `listActivities` so both queries
  reuse it instead of duplicating it.

### Verified

Hosted Supabase, production build, Playwright/Edge, 1280×800 desktop, 390px/412px
mobile: the full Chinh Long IMS end-to-end scenario from the task brief (create,
chronological order, Outcome edit, full status cycle, Cancel + reactivate,
unreferenced delete, all 5 reference paths individually blocked and verified intact
at the database level), the complete 7-point overdue matrix, cancelled-row display,
cross-project protection, Upcoming Activities, Admin/Consultant parity, anon denial,
responsive, full regression. `npm run lint`, `npm run typecheck`, `npm run build`
pass; `git diff --check` clean. All `P3B3-ACCEPT*` fixtures removed and confirmed at
zero residue across 9 tables; Test 1, the 4/149 Framework seed and the 8 Activity
Type seeds confirmed unchanged; the real `activities` table remained empty throughout.

### Findings

- **NO CHANGE (test-script bugs, not app defects):** a `LIKE` pattern typo and a
  locator that counted a navigation link alongside the rows it meant to count — both
  found during acceptance, both independently re-verified against the live data to
  confirm the actual application behavior was correct in each case. See
  `08_TESTING.md` for detail.
- **BACKLOG (unchanged, not touched in this slice):** the app-wide `notFound()` →
  HTTP 200 behavior noted in Phase 3B-2 remains outstanding, out of scope here.

### Not done (intentionally — future phases)

Status history/audit trail, workflow transition restrictions, `cancelled_at` /
`cancellation_reason`, calendar view, drag/drop scheduling, recurrence, notifications,
multi-consultant assignment, `activity_frameworks` junction, Storage object deletion
as part of Activity delete, analytics/charts/KPIs on the Overview.

## Phase 3B-2 — Create / Edit + Activity Detail (2026-09-24)

Second implementation slice of Phase 3B. **Result: 68/68 acceptance checks, 1 P1
finding (found and fixed).** Full result in `08_TESTING.md`; roadmap status in
`06_ROADMAP.md`. Phase 3B-3 (Status/Cancel/Delete + final Phase 3B acceptance) has not
started.

### Added

- **Activity create/edit** (`components/activities/activity-form-drawer.tsx`): the
  established drawer(desktop)/full-screen(mobile) pattern, opened from the Master
  Plan's `+ New Activity` and from Activity Detail's `Edit Activity`. Fields grouped
  into Activity / Scope & Delivery / Schedule / Plan sections, plus Status and
  Outcome (Work Performed, Next Steps) on Edit only — Create stays intentionally
  shorter (BR-66). Scope is a Project-wide/Specific-site toggle, never a bare "Site:
  None" picker; the site list is always this project's own scope.
- **`lib/mutations/activities.ts`** (`createActivity`, `updateActivity`): use
  `requireUser()`, not `requireAdmin()` — Activities follow the Clients/Projects/Sites
  authorization model, not Framework Administration's (BR-67). `project_id` is always
  a trusted route/prop value; `updateActivity` re-verifies the existing row's
  `project_id` before touching anything and repeats it in the UPDATE's own WHERE
  clause as defense in depth, so a Project A update request can never reach a Project
  B Activity.
- **`lib/validation/activities.ts`**: server-authoritative date/time rules (BR-64) via
  a shared `superRefine`; an Activity Type must be active to be newly selected on
  create, and on edit an inactive *current* type may be kept but never newly chosen
  for a different inactive one (BR-65) — enforced independently server-side, not just
  by what the picker offers.
- **Activity Detail** (`/projects/[projectId]/activities/[activityId]`,
  `components/activities/activity-detail-view.tsx`): a dedicated route (not a
  drawer) showing the activity's identity/schedule/site/mode/consultant/status header
  and two visually separate sections — Plan (Objectives, Planned Work) and Outcome /
  Visit Summary (Work Performed, Next Steps) — with a restrained "Not set." treatment
  for empty fields, never a large empty card. Outcome fields are editable with no
  date- or status-based restriction (BR-66). `getActivity(projectId, activityId)`
  returns null (→ `notFound()`) whenever the id/project pair doesn't match, so a
  cross-project URL can never distinguish "wrong id" from "right id, wrong project."
- **Master Plan integration:** rows/cards now navigate to Activity Detail (Phase 3B-1
  intentionally left them inert); the list re-renders in correct chronological order
  after a schedule edit and reflects any name/site/type/consultant/status change.

### Fixed (found during acceptance, P1, in-scope)

`plannedDaysField`'s validation used `z.union([z.coerce.number(), z.literal("")])` for
an optional numeric field. `Number("")` is `0` in JavaScript, so `z.coerce.number()`
silently "succeeded" on an empty input as `0` before the union ever reached the
`literal("")` branch — an unfilled Planned Days field failed validation ("must be
greater than 0") instead of being treated as not provided. Fixed with `z.preprocess`
intercepting the empty string before coercion runs.

### Verified

Hosted Supabase, production build, Playwright/Edge, 1280×800 desktop, 390px/412px
mobile: create/edit across the approved review's full fixture set (project-wide,
site-specific, on-site, online, unassigned/assigned consultant, same-day and
multi-day schedules, `planned_days`, Objectives/Planned Work, Outcome editing); every
listed date/time and reference-integrity validation, including three checks performed
by injecting a value past the UI picker's own filtering (inactive type, out-of-scope
site, nonexistent consultant) to prove server-side defense in depth, not just a UI
restriction; the full inactive-Activity-Type-on-edit regression; Master Plan
integration; cross-project protection (content-based, not status-code — see Findings
below); Admin/Consultant parity; responsive; Phase 2/3A/3B-1 regression. `npm run
lint`, `npm run typecheck`, `npm run build` pass; `git diff --check` clean. All
`P3B2-ACCEPT-*` fixtures removed and confirmed at zero residue; Test 1, the 4/149
Framework seed and the 8 Activity Type seeds confirmed unchanged; the real `activities`
table remained empty throughout.

### Findings

- **P1, fixed:** the `planned_days` validation bug above.
- **BACKLOG, pre-existing, not introduced by this slice:** `notFound()` across this
  app (confirmed on the pre-existing Framework/Client/Project detail routes, not just
  the new Activity Detail route) renders the not-found page correctly but returns HTTP
  200, not 404. No data is exposed either way; fixing it would touch shared
  error-boundary behavior well outside "Activity create/edit + detail," so it's left
  for a dedicated pass rather than silently absorbed into this slice.
- **NO CHANGE:** the Phase 3B-1 report's prose said "29 Sep 2026 – 31 Sep 2026" for a
  multi-day fixture (no such date exists). Confirmed a report-only typo — the actual
  fixture and UI used the real, valid 29–31 **Oct** 2026 range. No code or data defect.

### Not done (intentionally)

Status change beyond a plain edit, cancel, delete, referenced-delete protection —
Phase 3B-3.

## Phase 3B-1 — Foundation + Master Plan (read) (2026-09-24)

First implementation slice of Phase 3B. **Result: 54/54 acceptance checks, 0 P0/P1
findings.** Full result in `08_TESTING.md`; roadmap status in `06_ROADMAP.md`. Phase
3B-2 (Create/Edit + Activity Detail) has not started.

### Added

- **`activities.start_time` / `end_time`** (migration
  `20260924000300_activities_time_fields.sql`): nullable `time` columns, purely
  additive — no backfill, no change to existing dates, `activity_type_id`, FK
  behavior, RLS or grants. Applied safely regardless of row count (the migration does
  not assume `activities` is empty, unlike Phase 3A's one-time column swap).
- **`listActivities(projectId)`** (`lib/queries/activities.ts`): Project-scoped only —
  no global activities query or route exists. Two queries (activities + the project's
  sites), not N+1: `activities.site_id` has no direct FK to `sites` (only the
  composite FK to `project_sites`), so the site name is resolved the same way
  `getProjectWorkspace` already resolves it for the Overview tab. Default order:
  `start_date` → `start_time` → `name`, nulls last.
- **Master Plan** (`/projects/[projectId]/plan`): the Project Workspace's Plan tab is
  now live, showing a read-only desktop table / mobile cards over the project's
  Activities, with search (name/type/site/consultant) and Site/Type/Status filters.
  Documents/Verification/Issues & Actions/Reports remain inert. A shared
  `ProjectWorkspaceHeader` component (extracted from the former inline Overview
  header) keeps Overview and Plan visually identical apart from the active tab and the
  content below.
- **Display conventions:** project-wide activities show "Project-wide" (never blank);
  `mode`/`status` show humanized labels, never raw `on_site`/`planned`; a multi-day
  date range shows dates only (no times, avoiding an unreadable string); Activity Type
  label is resolved live from `activity_types` (ADR-017 — no snapshot), so an activity
  referencing a now-inactive type still displays correctly and is never hidden.
- **Overdue indicator:** derived only (`effective end date < today AND status NOT IN
  (completed, cancelled)`, effective end date = `end_date` if set else `start_date`) —
  never stored, no fifth status.
- **No new RLS or grants:** `activities` already had `for all to authenticated using
  (true) with check (true)` and full CRUD grants since Phase 0C/0D. Admin and
  Consultant have identical read access to the Master Plan, the same as
  Clients/Projects/Sites — confirmed by direct REST probes, not assumed.
- **Intentionally deferred to Phase 3B-2 (by design, not oversight):** Activity
  create/edit, Activity Detail screen, status change, cancel/delete, Visit Summary
  editing. Rows are not clickable and no "New Activity" button is shown — a dead link
  to a route that doesn't exist yet would be worse than no link.

### Verified

Hosted Supabase, production build, Playwright/Edge, 1280×800 desktop, 390px/412px
mobile: ordering (a 10-row fixture set, not just the sort spec's 4-point example, with
a verified same-time tiebreak by name); project-scope isolation between two temporary
projects; site integrity (cross-project site rejected); ADR-017 inactive-type
regression; display conventions; the Overdue indicator (shown and correctly
suppressed); search/filters; Admin/Consultant read parity; responsive; Phase 2/3A
regression. `npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff
--check` clean. All `P3B1-ACCEPT-*` fixtures removed and confirmed at zero residue;
Test 1, the 4/149 Framework seed and the 8 Activity Type seeds confirmed unchanged; the
real `activities` table remained empty throughout, matching its pre-existing state.

### Not done (intentionally)

Activity create/edit, Activity Detail, status change, cancel/delete, Visit Summary
editing, calendar view, drag/drop scheduling, recurrence, reminders, notifications,
multi-consultant assignment, `activity_frameworks` junction — all Phase 3B-2 or later
per the approved Phase 3B pre-implementation review.

## Phase 3A — Activity Type Foundation (2026-09-24)

Implements ADR-017. **Result: 60/60 acceptance checks, 0 P0, 1 P1 (found and fixed
during acceptance).** Full result in `08_TESTING.md`; roadmap status in
`06_ROADMAP.md`. Phase 3B (Master Plan / Activities) has not started.

### Added

- **`activity_types` table** (migration `20260924000100_activity_type_foundation.sql`):
  dedicated reference table — `id`, unique `key`, `label`, nullable `description`,
  `sort_order`, `is_active` (default `true`), timestamps. Seeded with exactly the 8
  documented values (training, site_assessment, document_review, document_support,
  consulting, online_support, internal_audit, follow_up), all active. RLS mirrors
  Framework Administration (ADR-016): authenticated read; Admin-only insert/update/
  delete; consultant writes blocked at the RLS layer, not just hidden in the UI.
- **`activities.activity_type_id`** replaces the old `activity_type` free-text column
  in the same migration statement (`activities` had zero rows, verified immediately
  beforehand) — FK to `activity_types(id)`, `NO ACTION`, matching the codebase's
  existing implicit-default FK convention.
- **Activity Types admin screen** (`/activity-types`): list (search over label/key/
  description; default order `sort_order` then `label`), Admin-only "+ New Activity
  Type" and row actions (Edit / Activate–Deactivate / Delete); consultant sees the
  list with all admin controls absent, not disabled. Create/Edit uses the established
  drawer (desktop) / full-screen (mobile) pattern.
- **Key immutability:** Key is editable only at create (with a live label→key
  auto-suggestion the Admin can review before saving); the Edit form shows Key
  read-only, and the server-side update action has no `key` field in its schema at
  all, so a changed key can never be written regardless of client input.
- **Controlled delete:** an Activity Type referenced by an Activity is blocked with a
  friendly message (23503 mapped, never a raw Postgres error); an unreferenced type
  (including the 8 seeds, since no Activities exist yet) can be deleted. No
  `is_seeded`/`is_system`/`protected` flag — deletability is purely reference-state
  driven, identical philosophy to Framework Administration.
- Nav: `Activity Types` (`Tags` icon) added alongside `Frameworks` on the desktop
  sidebar and mobile bottom nav; 5 items verified to fit both 390px and 412px without
  overflow.

### Fixed (found during acceptance, P1, in-scope)

- `activity_types` initially inherited full default `anon` privileges at table-creation
  time (a legacy per-table default on this hosted project; every other table had gone
  through an explicit revoke-then-grant that a table created later doesn't inherit).
  RLS already blocked all anon access — no data was ever exposed — but the grant layer
  didn't match the project's documented "anon gets nothing" model. Fixed with
  `20260924000200_activity_types_anon_revoke.sql`; verified `anon` now gets the same
  `401 permission denied` response as `frameworks`, and `authenticated`'s grant set now
  exactly matches (select/insert/update/delete only).

### Verified

Hosted Supabase, production build, Playwright/Edge, 1280×800 desktop, 390px and 412px
mobile: Admin CRUD, key-format and duplicate-key validation, key preserved on edit,
activate/deactivate, referenced-delete blocked using a temporary `P3A-ACCEPT-` fixture
(Activity Type → Client → Project → Activity) then fully cleaned up, unreferenced-delete
allowed; consultant read-only UI and direct RLS probes (insert/update/delete blocked,
zero rows affected); anon access; responsive layouts; Phase 2 regression (Clients,
Projects, Framework Library/Detail/Admin, consultant framework read-only, sticky App
Shell). `npm run lint`, `npm run typecheck`, `npm run build` pass; `git diff --check`
clean. Test 1 data, the 4/149 Framework seed, and the 8 Activity Type seeds confirmed
unchanged before and after; zero `P3A-ACCEPT` residue left in the hosted project.

### Not done (intentionally)

Activities list, Master Plan, Activity create/edit, scheduling, calendar, Activity
filters, Activity Type selection inside an Activity form, visit planning, verification
linkage, Activity reporting — all Phase 3B. Generic Master Data mechanism (deferred per
ADR-017, not decided).

## Pre-Phase 3 — Master Data Design/Audit & ADR-017 (2026-09-23)

Architecture-decision checkpoint, documentation only — **no application or schema
change**. Completed the pre-Phase-3 Master Data Design/Audit (`06_ROADMAP.md`) and
recorded **ADR-017**: Activity Type will be Admin-configurable from Phase 3's first
implementation via a **dedicated `activity_types` reference table**, FK-referenced from
the existing `activities` table — not a generic `master_data_sets`/`master_data_options`
mechanism. Generic Master Data is explicitly deferred (revisit only if real duplication
appears across future similar fields). Every other current status/taxonomy field is
unchanged. No migration, RLS, or application code has been written yet; Phase 3A
(Activity Type Foundation) and Phase 3B (Master Plan / Activities) remain not started.

## Phase 2 — COMPLETE (2026-09-23)

Phase 2 (Client / Project / Site / Frameworks) is formally closed after passing
Integration / Acceptance review: **157/157 acceptance checks, 0 P0 findings, 0 P1
findings.** Full result in `08_TESTING.md`; roadmap status in `06_ROADMAP.md`.

- Clients & Sites completed (Slice 1)
- Projects and Project Workspace completed (Slice 2)
- Framework Library and Framework Administration completed (Slice 3)
- Phase 2 responsive/sticky UI polish completed (desktop App Shell, Framework Detail
  work header, Project Setup action footer)
- Integration acceptance: PASS — verified the full Client → Site → Project →
  Framework workflow, Admin and Consultant authorization, hierarchy integrity, RLS,
  responsive behavior, and data integrity against the real hosted project
- Seed Framework catalog (4 frameworks / 149 items) and existing user data confirmed
  unchanged before and after acceptance testing
- No database, migration or RLS change during acceptance or this close

**Phase 3 (Master Plan / Activities) has not started.** A Master Data Design/Audit
checkpoint is planned before Phase 3 implementation begins (`06_ROADMAP.md`).

## Phase 2 UI polish — Project Setup sticky actions (2026-09-23)

`components/projects/project-setup-form.tsx` only. Create and Edit Project (the shared
Project Setup form) now share a sticky action footer (Cancel / Create Project or Save
Changes): on desktop the actions stay available while scrolling a long form; on mobile
they stay visible just above the fixed bottom navigation, never overlapping it. The
breadcrumb, page title and Project Identity header remain non-sticky, unchanged. No
database, migration or RLS change.

## Phase 2 Slice 3 — Framework Administration (2026-09-23)

Framework Library, Framework Detail and Admin Framework/Framework Item CRUD implemented.
**All Phase 2 implementation slices (Clients & Sites, Projects Workspace, Framework
Administration) are now complete, but Phase 2 acceptance/integration review is still
pending — Phase 2 is not yet marked complete.** No database, migration or RLS change;
the 4 seeded frameworks and their 149 seeded framework_items are unchanged.

### Added

- **Framework Library** (`/frameworks`): search (code/edition/name/category), real item
  counts, canonical `CODE:EDITION` identity everywhere via the shared
  `formatFrameworkIdentity()`. Admin sees `+ New Framework` and a per-row overflow
  (Edit/Delete); consultant sees neither — absent, not disabled.
- **Framework Detail / hierarchy browser** (`/frameworks/[frameworkId]`): breadcrumb,
  identity header, category, real item count, recursive expand/collapse tree (root
  sections start expanded), item search that flattens to a match list with an
  ancestor-path breadcrumb. No invented ISO text — every string comes from the existing
  seeded rows.
- **Consultant read-only experience:** browse and search only; every admin control is
  absent (not disabled) in the Library, Detail and tree rows. Enforced by RLS
  (ADR-016), not just hidden UI — a direct `POST /rest/v1/frameworks` as consultant
  returns 403.
- **Admin Framework CRUD:** create/edit via the existing right-side drawer (desktop) /
  full-screen (mobile) pattern; a new `requireAdmin()` helper
  (`lib/auth/session.ts`) backs every mutation. Duplicate `(code, edition)` maps to a
  friendly message, never a raw Postgres error. A new edition is verified to create a
  separate row, never overwrite an existing one.
- **Admin Framework Item CRUD:** Add root item, Add Sub-item (parent pre-filled), Edit,
  Delete — all through the same drawer pattern; `sort_order` is assigned by the app.
- **Controlled deletion (BR-53):** a framework assigned to a project, or an item
  referenced by document/verification/issue data or with children, cannot be deleted —
  real FK-backed checks, never a demo `referenced` flag. Deleting an unreferenced
  framework cascades only its own remaining items.
- **Hierarchy integrity (BR-55):** an item's parent can never be itself or one of its
  descendants, and never an item from a different framework. Enforced in the parent
  picker and independently re-checked server-side (verified by bypassing the picker's
  own filtering).
- **Framework category humanization:** category is displayed as `Management System`
  everywhere (Library, Detail) while the stored value stays `management_system`
  (`humanizeCategory()`, `lib/ui/format.ts`). The Create/Edit Framework drawer's
  Category field is a select sourced from the catalog's existing distinct values
  (`listFrameworkCategories()` — no enum, no taxonomy table, no migration), with an
  "Other…" option for a new value.
- **Simplified Framework Item form:** Item Type removed from the normal Add/Edit Item
  UI. New items always get `item_type = "item"` server-side; editing an item never
  writes `item_type` at all, so a seeded item's real type (e.g. `"clause"`) is never
  silently overwritten.
- **Desktop sticky sidebar** (`components/layout/app-shell.tsx`): the shell is pinned to
  the viewport height at `md:` and up, so the sidebar (brand, nav, user, sign out) stays
  in place while a long page's content scrolls independently. Mobile is unchanged
  (whole-page scroll, fixed bottom navigation).
- **Compact sticky Framework Detail work header:** identity, admin Edit/overflow,
  search and `+ Add Item` stay reachable while scrolling a long hierarchy (desktop
  only — `md:sticky`); breadcrumb, the large heading, category and item count scroll
  away normally. Not sticky on mobile, so it never consumes extra viewport height there.
- Nav: `Frameworks` enabled in the sidebar/bottom nav.

### Verified

114 Playwright checks across three passes against the hosted project (production
build): navigation, consultant experience and RLS, admin Framework/Item CRUD, hierarchy
integrity (self/descendant/cross-framework, bypassing the UI picker), controlled delete
(referenced framework, referenced item, item-with-children, leaf item), category
humanization and form behavior, item-type preservation on edit, responsive layouts
(390–412px), the sticky App Shell (sidebar position/height unchanged and the page never
scrolls after a 3000px scroll of a 42-item hierarchy; mobile bottom nav stays fixed),
and regression of Clients/Projects/Project Framework Assignment/Project Workspace
identity. `npm run lint`, `npm run typecheck`, `npm run build` all pass. All temporary
`SLICE3-TEST-*` fixtures were removed after each pass; the 4 seeded frameworks and 149
seeded framework_items were confirmed byte-identical before and after.

### Not done (intentionally)

Framework lifecycle/publication/archive, `is_seeded`/`is_system`, duplicate-as-new-
edition workflow, GRI/ESG/GHG/CBAM frameworks; project-specific compliance status or
implementation assessment; Activities, Documents/Evidence, Verification, Issues &
Actions, Reports; Phase 3+.

## Phase 2 Slice 2 — Projects Workspace (2026-09-23)

Projects List, Project Setup and Project Workspace Overview implemented. **Phase 2 is
not complete**: Framework Administration UI and Activities/Documents/Verification/
Issues & Actions/Reports remain unbuilt. No database, migration or RLS change; framework
seed data unchanged.

### Added

- **Projects List** (`/projects`): search by project or client name, live Site Scope
  (`n of {client's current site total}`, not a frozen snapshot), framework count,
  status badge, single "Edit Project" action via overflow menu (per the approved
  design).
- **Project Setup** (`components/projects/project-setup-form.tsx`): one shared
  create/edit form across three entry modes — global create (`/projects/new`), create
  from Client Detail (`/projects/new?clientId=`, client locked and prefilled) and edit
  (`/projects/[projectId]/edit`, client immutable per BR-57).
- **Site Scope:** checkbox list of the selected client's sites, Select all/Clear all,
  live "n of total selected" count; changing the client during create clears the
  selection (sites belong to the previous client); zero sites is valid and shown as
  informational text, never an error (BR-56).
- **Framework Assignment** (section renamed from "Frameworks" after UI review): catalog
  grouped by category, each row showing the canonical `CODE:EDITION` identity (e.g.
  `ISO 9001:2015`) with the descriptive name as secondary text; zero frameworks is
  valid and informational only (BR-56).
- **Create Project from Client Detail:** `+ New Project` added to the Client Detail
  Projects section; project rows there now link to the project's Workspace.
- **Project Workspace Overview** (`/projects/[projectId]`): breadcrumb, status, real
  site count and real framework identities in the header; Sites and Frameworks cards
  (no per-site status badge — no such column exists); a real "Project" info card
  (client, status, start/end date). The five non-Overview tabs (Plan, Documents,
  Verification, Issues & Actions, Reports) are visible but inert placeholders — no
  route, no navigation, no "CONCEPT" label shipped. No fabricated future-domain data
  (verification progress, issues/actions counts, upcoming activities) was added, per
  BR-59.
- **Responsive behavior:** Projects List (table ⇄ cards), Workspace (two-column ⇄
  single-column grid at 860px) and Setup verified at mobile and desktop widths.
- **Framework identity normalization:** every screen renders framework identity as
  `CODE:EDITION` via one shared helper (`formatFrameworkIdentity` in
  `lib/ui/format.ts`), replacing inconsistent code-only / name-only / no-edition
  displays found in UI review.
- **Native date-picker interaction:** Start/End date fields call the native
  `showPicker()` where supported (feature-detected, try/catch) so clicking anywhere in
  the field opens the picker, not only the calendar icon; no dependency added, no
  custom calendar; keyboard interaction and the stored `YYYY-MM-DD` format are
  unchanged.
- Nav: `Projects` enabled in the sidebar/bottom nav.

### Verified

Playwright checks against the hosted project (production build) covering: create
(global and from Client Detail), edit with add/remove site and framework assignments,
client-side and server-side validation, zero-scope states, responsive layouts, the UI
review fixes above, and regression of Clients List/Detail, auth and framework RLS
(ADR-016 — consultants still cannot write frameworks). `npm run lint`,
`npm run typecheck`, `npm run build` all pass. Temporary test fixtures were removed
after each pass; framework seed data confirmed unchanged before/after.

### Not done (intentionally)

Framework Administration UI; Activities, Documents, Verification, Issues & Actions,
Reports; project/client deletion; Phase 3+.

## Phase 2 baseline update (2026-09-21)

Baseline before Phase 2 implementation. **No Phase 2 screen or application code was implemented.**

### Changed

- **ADR-016 (new): framework administration by Admins.** Frameworks and framework items stay
  reference data; consultants read-only, admins controlled CRUD. ADR-001 and ADR-014 carry
  pointers; BR-45 is marked superseded (history kept).
- **Migration `20260921000100_framework_admin_write.sql`:** grants `insert, update, delete` on `frameworks` and
  `framework_items` to `authenticated` and adds six admin-only RLS policies
  (`profiles.role = 'admin'`). No columns, indexes, FKs, triggers or functions. Applied to the
  hosted project; regenerated types are identical.
- **Docs:** `CLAUDE.md` (design path is `docs/phase-2/`; approved set; framework rule),
  `01_V1_SCOPE`, `02_ARCHITECTURE`, `03_DATABASE`, `04_BUSINESS_RULES` (BR-52 to BR-60,
  BR-42/45/49 amended), `05_UI_UX_GUIDELINES` (Phase 2 UI patterns), `06_ROADMAP`,
  `07_DECISIONS`, `08_TESTING` (Phase 2 baseline results and test specification),
  `10_RUNBOOK`.
- **Design references:** `docs/phase-2/` now holds only the five final approved files; the
  superseded Project Workspace Overview variant was removed. `Project Workspace Overview
  v1.dc.html` is the approved workspace reference. No `.dc.html` file was edited.

### Verified on the hosted project (see `08_TESTING.md`, TC-P2B-*)

Consultant, admin and anon framework access; referenced and parent-item deletes blocked by FK
integrity; unreferenced deletes allowed; editions and uniqueness; Phase 0D regression
(anon 9/9, database behavior 66/66, auth/RLS/storage 53/53, catalog 37/41 with 4 intended
differences).

### Incident (recorded, resolved)

The old Phase 0D step-2 test script attempted framework writes as admin expecting denial.
Under ADR-016 they succeeded and modified seeded data (ISO 9001 name, a stray framework `X`,
four item titles). The data was restored and verified identical to the seed baseline (only
`updated_at` on six rows differs). The regression copy no longer writes to framework tables.

### Not done (intentionally)

Phase 2 implementation; application-level Phase 2 tests (specified only). Backlog: DB
hierarchy-cycle trigger; atomic `save_project`; DB guards for site/client consistency and
immutable project client; client and project deletion; duplicate-as-new-edition; site status.

## Phase 1 — Authentication & App Shell (2026-09-21)

Completed: 17 PASS, 0 FAIL, 2 NOT TESTED (see `08_TESTING.md`). No database, RLS or framework change.

### Added / changed

- **Sign-out is local:** `signOut({ scope: "local" })` ends only the current device's
  session (the Gap Review showed the default global scope logged out the phone when the
  laptop signed out). Sign-out button shows a pending state.
- **Return path:** `lib/auth/redirect.ts` `safeNextPath()`; the proxy adds `?next=` for
  protected deep links, the login page and the sign-in action validate it, and a signed-in
  user opening `/login?next=` is redirected safely. Relative internal paths only.
- **Login errors:** `lib/auth/errors.ts`; only `invalid_credentials` shows "Invalid email or
  password."; everything else gets one generic message. The form keeps the email, and sets
  `aria-invalid` / `aria-describedby`.
- **Mobile inputs:** 16 px on small screens (no iOS focus-zoom); email
  `inputMode`/`autoCapitalize`/`autoCorrect`/`spellCheck` attributes.
- **`lib/auth/session.ts`:** request-cached `getCurrentUser()` and `requireUser()`
  (`getClaims()`); the workspace layout uses it.
- **Error experience:** `app/not-found.tsx`, `app/(workspace)/error.tsx`,
  `app/global-error.tsx` (uses the Next.js 16 `retry` prop), title template `%s · RayIMS`,
  `buttonClasses()` and `MessagePanel` helpers.
- **Security headers** in `next.config.ts`: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
  No CSP, no Permissions-Policy (camera must stay available).
- **Docs:** `docs/10_RUNBOOK.md` (new), `CLAUDE.md` index and rules, BR-46 to BR-51,
  `02_ARCHITECTURE.md`, roadmap and testing.

### Not changed

Accepted Phase 0D limitations (CDN deletion lag, stateless JWT after sign-out) are unchanged.
No browser-test script or dependency was added to the repository.

## Phase 0D — Supabase Integration & Real Backend Verification (2026-09-21)

Completed: 36 PASS, 1 FAIL (accepted platform limitation), 1 informational note.

### Added / changed

- Migration `20260920000500_data_api_grants.sql`: explicit Data API grants (Supabase no
  longer auto-grants privileges on new `public` tables). Revokes everything from
  `anon` / `authenticated` first (the hosted project still had legacy default
  privileges), then grants least-privilege: `anon` nothing; `authenticated` CRUD on
  work tables, SELECT on frameworks, SELECT+UPDATE on profiles, SELECT on
  `document_register`. Documented in `03_DATABASE.md` ("Data API grants").
- `types/database.ts` generated from the hosted schema; browser/server/proxy Supabase
  clients are typed with `Database`. Hand-written `types/domain.ts` is kept (CHECK
  columns are `string` in generated types).
- `supabase/config.toml` and `supabase/.gitignore` from `supabase init`.
- `docs/03_DATABASE.md`: repaired a double-encoding defect (garbled characters) that
  had been introduced in the baseline commit; one wording fix.
- `docs/02_ARCHITECTURE.md`: generated-types statement updated.

### Verified on the hosted project (see `08_TESTING.md`)

36 PASS, 1 FAIL, 1 informational note: schema, RLS, grants, seed, derived document
status, profile role lock, authenticated CRUD, real browser login / session refresh /
sign-out / forged cookie, private Storage (signed URLs, size limit, `lib/storage`),
sign-up disabled at Supabase level, lint / typecheck / build.

Public sign-up was found **enabled** on the first run (TC-P0D-AUTH-001 failed). The owner
disabled it in the dashboard and the re-run passed (`disable_signup = true`, sign-up
attempts rejected with `signup_disabled`, still exactly 2 users).

### Accepted limitations, notes and backlog

- **Storage deletion vs CDN (TC-P0D-STO-006, stays FAIL): decided by the owner.** Accepted platform limitation – Supabase CDN cache invalidation after object deletion may take up to approximately 60 seconds. Database metadata is removed immediately, new/unfetched access is denied, but a previously fetched object using the same cached authorization context may remain retrievable until CDN invalidation propagates.
  The storage architecture is unchanged in Phase 0D. Backlog: Evaluate a shorter `cacheControl` for uploaded RayIMS evidence/documents if stronger post-delete revocation is required. **Not implemented; no change to the storage architecture in Phase 0D.**
- **Sign-out and stolen cookies:** `getClaims()` verifies the JWT locally, so a copied
  pre-sign-out cookie works until the access token expires (default 1 h); the refresh
  token is revoked on sign-out. Shorter JWT expiry or `getUser()` would trade cost for
  immediacy.
- **Do not run `supabase config push`:** the local `config.toml` template differs from
  the hosted project on 13 auth/db settings and would overwrite them.

## Phase 0C — Foundation Implementation (2026-09-20)

Foundation only; no feature CRUD.

### Added

- Next.js 16.3.5 app (TypeScript, App Router, Tailwind 4) with
  `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `lucide-react`, `clsx`.
- Folder structure: `app/`, `components/`, `lib/`, `types/`, `supabase/`.
- `.env.example` (placeholders only) and a `.gitignore` that excludes env files.
- Supabase clients (browser, server) and `proxy.ts` session handling using
  `getClaims()`.
- Migrations: `20260920000100_core_schema.sql` (18 tables + `document_register`
  view), `20260920000200_rls_policies.sql`, `20260920000300_storage_bucket.sql`,
  `20260920000400_seed_frameworks.sql` (ISO 9001:2015, 14001:2015, 45001:2018,
  50001:2018; item numbers and short labels only).
- `lib/storage` (provider interface, Supabase implementation, key builder),
  value-list constants, activity type list, domain types.
- Responsive shell (desktop sidebar, mobile top bar and bottom navigation, page
  container), empty dashboard placeholder, login page and sign-in / sign-out
  server actions. No sign-up UI.
- `AGENTS.md` (generated by Next.js) referenced from `CLAUDE.md`.
- `npm run typecheck` script.

### Changed (documentation)

- Foreign keys between project-owned tables (composite site FKs,
  `actions.issue_id`, `document_versions.file_id`, `attachments.file_id`) are
  `NO ACTION DEFERRABLE INITIALLY DEFERRED`; found when testing whole-project
  delete. Recorded in `03_DATABASE.md` and OI-3.
- `03_DATABASE.md`: column defaults, derived status codes, and the application
  rule that a project site belongs to the project's client.
- `02_ARCHITECTURE.md`: "items to verify" replaced by what was verified.

### Verified

- `npm run lint`, `npm run typecheck`, `npm run build`: pass.
- Production server: unauthenticated `/`, `/dashboard` and other routes redirect
  to `/login`; `/login` renders; no sign-up UI.
- Migrations applied in order to an in-memory Postgres (PGlite) with stubbed
  Supabase `auth` / `storage` / roles: 101 ad-hoc checks passed (site integrity,
  hierarchy, CHECKs, attachments constraint, multiple reviews, derived document
  status, delete behavior incl. whole-project cascade, RLS for anon and
  authenticated). This script is not part of the repository.

### Not verified

- Migrations against a real Supabase project (none exists yet).
- A real login round trip and real Supabase Storage behavior.

## Phase 0B — Documentation Baseline (2026-09-20)

### Open Items resolved (baseline approved)

- OI-1: review ordering by `created_at`; rule is "latest review record for the
  latest document version"; `updated_at` added to `document_reviews`; timestamp
  semantics documented.
- OI-2: database constraints where simple; application validation for
  same-project verification target/verified activities and similar links.
- OI-3: final delete behavior (CASCADE / NO ACTION / SET NULL principles;
  NO ACTION instead of RESTRICT so whole-project deletes cascade).
- OI-4: V1 value lists fixed (`projects.status` includes `on_hold`).
- Roadmap: 0B marked completed, 0C current.

### Initial baseline

- Created `CLAUDE.md` and `docs/00`–`09` as the repository source of truth.
- Applied the Phase 0A approval corrections:
  - Per-project numbering deferred (no `issue_seq` / `action_seq` / triggers).
  - `document_reviews.document_version_id` is not unique.
  - `verification_items` separate `target_activity_id` (planned) from
    `verified_activity_id` (actual).
  - Core attachment rule recorded: future modules must not add domain FK columns
    to `attachments`; they create their own junction tables to `files`.
  - `files` registry, derived document status, client-level sites and the
    framework model recorded as approved.
- Recorded Open Items (OI-1 to OI-4) in `07_DECISIONS.md`.
- No application code, packages, migrations or Supabase resources were created.

## Phase 0A — Architecture Review (2026-09-20)

- Architecture review completed and approved with corrections.
- Repository check: the folder was empty and not a git repository.
