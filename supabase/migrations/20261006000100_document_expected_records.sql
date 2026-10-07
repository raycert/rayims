-- Phase 7D: Expected Records / Required Evidence (ADR-022).
--
-- Contextual guidance attached to the Required Document itself: the records or evidence the consultant expects
-- to review for it (e.g. for a Training Procedure: annual training plan, attendance records, competence
-- evaluation, training effectiveness records). Free multiline text, maintained by the consultant, shown as
-- read-only context in the Gap Assessment, imported from / exported to Excel.
--
-- One nullable text column on `documents`. Nothing else: no default (existing Documents get NULL, no backfill),
-- no CHECK (the 2,000-character limit is enforced by the application, validation and import, so it can be
-- adjusted without a migration), no index, no table, no function, no trigger. It is NOT stored on versions,
-- reviews, document_framework_items or framework_items. The column inherits the existing Documents RLS policy
-- and table grants — no policy or grant change.

alter table public.documents add column expected_records text;

comment on column public.documents.expected_records is
  'Expected Records / Required Evidence: records the consultant expects to review for this Required Document (multiline text, optional, document-level). Reference context only.';
