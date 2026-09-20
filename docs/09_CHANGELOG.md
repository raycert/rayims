# 09 — Changelog

Records what has been completed per phase. **No application features exist yet.**

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
