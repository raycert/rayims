-- RLS foundations (Phase 0C). ADR-014.
--
-- V1 assumptions: public sign-up is disabled (configure in the Supabase
-- dashboard: Authentication > Sign In / Providers), all users are internal
-- (admin / consultant), any authenticated user can access all data. No client
-- portal, no organizations, no per-role or per-project policies.
--
-- RLS is enabled on EVERY table: tables are exposed through the Supabase API and
-- would otherwise be open. No policy is granted to the anon role, so anonymous
-- requests see nothing.

alter table public.profiles                  enable row level security;
alter table public.clients                   enable row level security;
alter table public.sites                     enable row level security;
alter table public.projects                  enable row level security;
alter table public.project_sites             enable row level security;
alter table public.frameworks                enable row level security;
alter table public.framework_items           enable row level security;
alter table public.project_frameworks        enable row level security;
alter table public.activities                enable row level security;
alter table public.documents                 enable row level security;
alter table public.document_versions         enable row level security;
alter table public.document_framework_items  enable row level security;
alter table public.document_reviews          enable row level security;
alter table public.verification_items        enable row level security;
alter table public.issues                    enable row level security;
alter table public.actions                   enable row level security;
alter table public.files                     enable row level security;
alter table public.attachments               enable row level security;

-- Work tables: full access for authenticated users.
create policy "authenticated full access" on public.clients
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.sites
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.projects
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.project_sites
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.project_frameworks
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.activities
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.documents
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.document_versions
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.document_framework_items
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.document_reviews
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.verification_items
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.issues
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.actions
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.files
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.attachments
  for all to authenticated using (true) with check (true);

-- Framework reference data: read-only for users (seeded by migration; BR-45).
create policy "authenticated read" on public.frameworks
  for select to authenticated using (true);
create policy "authenticated read" on public.framework_items
  for select to authenticated using (true);

-- Profiles: everyone signed in can read; a user can update only their own row and
-- cannot change their own role. Rows are created by the auth.users trigger; there
-- are no insert or delete policies.
create policy "authenticated read" on public.profiles
  for select to authenticated using (true);
create policy "update own profile, role unchanged" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
  );
