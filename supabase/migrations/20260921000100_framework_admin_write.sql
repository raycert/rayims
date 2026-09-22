-- Framework administration by Admins (ADR-016, Phase 2 baseline).
--
-- Frameworks and framework items remain reference/master data. Every
-- authenticated user can still read them (existing "authenticated read"
-- policies, untouched). Writes are now possible for ADMINS ONLY:
--   * consultants: SELECT only (their INSERT is rejected by RLS; UPDATE and
--     DELETE affect 0 rows)
--   * admins (public.profiles.role = 'admin'): INSERT, UPDATE and DELETE
--   * anon: nothing (no grants, no policies)
--
-- Deletion safety is NOT part of this migration: it is the existing FK
-- behavior (referenced frameworks/items and items with children cannot be
-- deleted; a framework delete cascades only to its own unreferenced items).
--
-- No schema shape changes: no columns, indexes, FKs, triggers or functions.
--
-- Grants make the operations reachable for the role; the policies below decide
-- who may actually perform them. Both layers are required (see 20260920000500).

grant insert, update, delete on public.frameworks, public.framework_items to authenticated;

-- public.frameworks ---------------------------------------------------------
create policy "admin insert" on public.frameworks
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

create policy "admin update" on public.frameworks
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

create policy "admin delete" on public.frameworks
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

-- public.framework_items ----------------------------------------------------
create policy "admin insert" on public.framework_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

create policy "admin update" on public.framework_items
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

create policy "admin delete" on public.framework_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );
