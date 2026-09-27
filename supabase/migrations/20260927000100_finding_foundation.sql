-- Finding foundation (Phase 4C-1, ADR-018).
--
-- The UI term "Finding" is the existing `issues` table (no rename). This additive
-- migration establishes the final Finding-ready schema ONCE, so Phase 4D builds the
-- NC response workflow without another `issues` migration:
--   * finding_type            closed system set (not master data, ADR-012)
--   * correction, root_cause  NC response text (UI arrives in 4D)
--   * effectiveness_*         ONE current effectiveness review (no history, ADR-018)
--   * closed_by               who closed the Finding (closed_at already exists)
--
-- Backward-compatible: finding_type is NOT NULL with DEFAULT 'observation' (the least
-- restrictive value) so any pre-existing row backfills safely; every other column is
-- nullable. The application always supplies an explicit finding_type on create — the
-- default exists only for migration/backfill. No new table, no RLS or grant change:
-- the existing table-level grants and "authenticated full access" policy on
-- public.issues cover the new columns. User references follow the project
-- convention: ON DELETE SET NULL, with an index on each FK column.

alter table public.issues
  add column finding_type text not null default 'observation'
    constraint issues_finding_type_check
    check (finding_type in ('nonconformity', 'observation', 'opportunity_for_improvement')),
  add column correction text,
  add column root_cause text,
  -- NULL = Not Reviewed
  add column effectiveness_result text
    constraint issues_effectiveness_result_check
    check (effectiveness_result in ('effective', 'not_effective')),
  add column effectiveness_notes text,
  add column effectiveness_reviewed_by uuid references public.profiles (id) on delete set null,
  add column effectiveness_reviewed_at timestamptz,
  add column closed_by uuid references public.profiles (id) on delete set null;

create index issues_effectiveness_reviewed_by_idx on public.issues (effectiveness_reviewed_by);
create index issues_closed_by_idx on public.issues (closed_by);
