-- Activity Type foundation (Phase 3A, ADR-017).
--
-- Activity Type becomes dedicated, Admin-configurable reference data — a small
-- lookup table, not the generic master_data_sets/master_data_options mechanism
-- considered and rejected in ADR-017 (a plain FK to a generic options table
-- cannot prove the referenced row belongs to the right set; a dedicated table
-- proves it for free).
--
-- Authorization mirrors Framework Administration (ADR-016) exactly:
--   * authenticated (Admin and Consultant): SELECT
--   * admin (public.profiles.role = 'admin'): INSERT, UPDATE, DELETE
--   * anon: nothing (no grants, no policies)
--
-- Deletion safety is existing FK behavior (ON DELETE NO ACTION): a referenced
-- activity type cannot be deleted; no trigger, no is_seeded/is_system flag.
--
-- activities.activity_type (free text) is replaced by activity_type_id (FK).
-- Safe because activities currently has zero rows (verified before writing
-- this migration) — there is no data to migrate or backfill.

-- ---------------------------------------------------------------------------
-- activity_types
-- ---------------------------------------------------------------------------
create table public.activity_types (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  label        text not null,
  description  text,
  sort_order   integer not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.activity_types (key, label, sort_order) values
  ('training', 'Training', 1),
  ('site_assessment', 'Site Assessment', 2),
  ('document_review', 'Document Review', 3),
  ('document_support', 'Document Support', 4),
  ('consulting', 'Consulting', 5),
  ('online_support', 'Online Support', 6),
  ('internal_audit', 'Internal Audit', 7),
  ('follow_up', 'Follow-up', 8);

alter table public.activity_types enable row level security;

create policy "authenticated read" on public.activity_types
  for select to authenticated using (true);

create policy "admin insert" on public.activity_types
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

create policy "admin update" on public.activity_types
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

create policy "admin delete" on public.activity_types
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

-- Grants make the operations reachable for the role; the policies above decide
-- who may actually perform them (see 20260920000500 for the project-wide
-- revoke-then-grant baseline this builds on).
grant select, insert, update, delete on public.activity_types to authenticated;

-- ---------------------------------------------------------------------------
-- activities.activity_type (text) -> activities.activity_type_id (FK)
-- ---------------------------------------------------------------------------
alter table public.activities
  drop column activity_type,
  add column activity_type_id uuid not null references public.activity_types (id);
