-- Phase 6B — Activity Report narrative (ADR-013: the activity summary lives on `activities`).
--
-- Two consultant-authored narrative fields, next to the existing work_performed / next_steps:
--   summary             — the consultant's overall conclusion for the Activity
--   client_participants — free text: client attendees / coordinators (names and roles)
-- Both optional (NULL = not recorded). No report table, no status, no new FK, no RLS or grant change
-- (the existing "authenticated full access" policy and table grants cover new columns).

alter table public.activities
  add column summary text,
  add column client_participants text;
