-- RayIMS core schema (Phase 0C).
-- Source of truth: docs/03_DATABASE.md. Do not add tables or columns here that
-- are not documented there.
--
-- Conventions:
--   * uuid primary keys; created_at on all tables; updated_at on mutable tables
--   * no native enums: text + CHECK (ADR-012)
--   * "blocked while referenced" foreign keys use NO ACTION (not RESTRICT). Those
--     between project-owned tables (site integrity, actions.issue_id, file_id
--     references) are also DEFERRABLE INITIALLY DEFERRED: Postgres checks each
--     cascade step separately, so the check must wait until the whole
--     project delete has finished. Standalone deletes of a referenced row are
--     still rejected (at commit). See docs/03_DATABASE.md "Deletion behavior".
--   * no numbering columns/triggers (ADR-015)
--   * RLS policies are in the next migration

-- ---------------------------------------------------------------------------
-- Shared trigger function
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity and structure
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email        text,
  role         text not null default 'consultant'
               check (role in ('admin', 'consultant')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  notes      text,
  status     text not null default 'active'
             check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reusable, client-level sites (ADR-003).
create table public.sites (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id),
  name       text not null,
  address    text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sites_client_id_idx on public.sites (client_id);

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id),
  name         text not null,
  project_type text,
  status       text not null default 'planning'
               check (status in ('planning', 'active', 'on_hold', 'completed', 'archived')),
  start_date   date,
  end_date     date,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index projects_client_id_idx on public.projects (client_id);
create index projects_created_by_idx on public.projects (created_by);

-- Sites in scope for a project. Also the anchor of site integrity: work entities
-- reference (project_id, site_id) here.
create table public.project_sites (
  project_id uuid not null references public.projects (id) on delete cascade,
  site_id    uuid not null references public.sites (id),
  notes      text,
  created_at timestamptz not null default now(),
  primary key (project_id, site_id)
);
create index project_sites_site_id_idx on public.project_sites (site_id);

-- ---------------------------------------------------------------------------
-- Framework reference (client-independent)
-- ---------------------------------------------------------------------------
create table public.frameworks (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  edition     text not null,
  name        text not null,
  category    text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (code, edition)
);

create table public.framework_items (
  id           uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.frameworks (id) on delete cascade,
  parent_id    uuid,
  code         text,
  title        text not null,
  description  text,
  item_type    text not null default 'item',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- target of the composite self-reference below
  unique (framework_id, id),
  -- a parent must belong to the same framework (MATCH SIMPLE: NULL parent = root)
  constraint framework_items_parent_fk
    foreign key (framework_id, parent_id)
    references public.framework_items (framework_id, id)
);
create index framework_items_tree_idx
  on public.framework_items (framework_id, parent_id, sort_order);
create unique index framework_items_code_uidx
  on public.framework_items (framework_id, code) where code is not null;

create table public.project_frameworks (
  project_id   uuid not null references public.projects (id) on delete cascade,
  framework_id uuid not null references public.frameworks (id),
  created_at   timestamptz not null default now(),
  primary key (project_id, framework_id)
);
create index project_frameworks_framework_id_idx
  on public.project_frameworks (framework_id);

-- ---------------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------------
create table public.activities (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  site_id        uuid,
  activity_type  text not null,
  name           text not null,
  start_date     date,
  end_date       date,
  mode           text not null check (mode in ('on_site', 'online')),
  planned_days   numeric(4, 1),
  consultant_id  uuid references public.profiles (id) on delete set null,
  objectives     text,
  planned_work   text,
  status         text not null default 'planned'
                 check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  work_performed text,
  next_steps     text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint activities_project_site_fk
    foreign key (project_id, site_id)
    references public.project_sites (project_id, site_id)
    deferrable initially deferred
);
create index activities_project_start_idx on public.activities (project_id, start_date);
create index activities_project_site_idx on public.activities (project_id, site_id);
create index activities_consultant_id_idx on public.activities (consultant_id);
create index activities_created_by_idx on public.activities (created_by);

-- ---------------------------------------------------------------------------
-- Evidence: files registry (created before document_versions references it)
-- ---------------------------------------------------------------------------
-- Metadata only. No binaries, no permanent URLs, no bucket name (ADR-008).
create table public.files (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  storage_provider text not null default 'supabase',
  storage_key      text not null unique,
  original_name    text not null,
  mime_type        text,
  size_bytes       bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index files_project_id_idx on public.files (project_id);
create index files_uploaded_by_idx on public.files (uploaded_by);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
-- Logical document. No status column: status is derived (ADR-005).
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  site_id       uuid,
  doc_code      text,
  title         text not null,
  document_type text,
  owner_name    text,
  is_applicable boolean not null default true,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint documents_project_site_fk
    foreign key (project_id, site_id)
    references public.project_sites (project_id, site_id)
    deferrable initially deferred
);
create index documents_project_site_idx on public.documents (project_id, site_id);
create index documents_created_by_idx on public.documents (created_by);

create table public.document_versions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version_no  integer not null,
  revision    text,
  file_id     uuid not null references public.files (id) deferrable initially deferred,
  received_on date,
  notes       text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (document_id, version_no)
);
create index document_versions_file_id_idx on public.document_versions (file_id);
create index document_versions_uploaded_by_idx on public.document_versions (uploaded_by);

create table public.document_framework_items (
  document_id       uuid not null references public.documents (id) on delete cascade,
  framework_item_id uuid not null references public.framework_items (id),
  primary key (document_id, framework_item_id)
);
create index document_framework_items_item_idx
  on public.document_framework_items (framework_item_id);

-- A version may have multiple review records: document_version_id is NOT unique
-- (ADR-004). created_at orders the records.
create table public.document_reviews (
  id                  uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions (id) on delete cascade,
  reviewer_id         uuid references public.profiles (id) on delete set null,
  status              text not null
                      check (status in ('under_review', 'revision_required', 'accepted')),
  reviewed_at         timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index document_reviews_version_created_idx
  on public.document_reviews (document_version_id, created_at desc);
create index document_reviews_reviewer_id_idx on public.document_reviews (reviewer_id);

-- ---------------------------------------------------------------------------
-- Verification, issues, actions
-- ---------------------------------------------------------------------------
create table public.verification_items (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  site_id              uuid,
  framework_item_id    uuid references public.framework_items (id),
  question             text not null,
  priority             text not null default 'medium'
                       check (priority in ('low', 'medium', 'high')),
  -- source: NULL = created manually
  document_review_id   uuid references public.document_reviews (id) on delete set null,
  -- planned activity
  target_activity_id   uuid references public.activities (id) on delete set null,
  -- activity in which the item was actually completed (ADR-006)
  verified_activity_id uuid references public.activities (id) on delete set null,
  -- carry-over lineage
  follows_item_id      uuid references public.verification_items (id) on delete set null,
  -- NULL = pending
  result               text
                       check (result in ('verified_ok', 'issue_identified', 'follow_up_required')),
  notes                text,
  verified_by          uuid references public.profiles (id) on delete set null,
  verified_at          timestamptz,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint verification_items_project_site_fk
    foreign key (project_id, site_id)
    references public.project_sites (project_id, site_id)
    deferrable initially deferred
);
create index verification_items_project_site_idx on public.verification_items (project_id, site_id);
create index verification_items_framework_item_idx on public.verification_items (framework_item_id);
create index verification_items_review_idx on public.verification_items (document_review_id);
create index verification_items_target_activity_idx on public.verification_items (target_activity_id);
create index verification_items_verified_activity_idx on public.verification_items (verified_activity_id);
create index verification_items_follows_idx on public.verification_items (follows_item_id);
create index verification_items_verified_by_idx on public.verification_items (verified_by);
create index verification_items_created_by_idx on public.verification_items (created_by);

create table public.issues (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  site_id              uuid,
  title                text not null,
  description          text,
  framework_item_id    uuid references public.framework_items (id),
  -- origin (all optional; store the closest origin)
  activity_id          uuid references public.activities (id) on delete set null,
  verification_item_id uuid references public.verification_items (id) on delete set null,
  document_review_id   uuid references public.document_reviews (id) on delete set null,
  priority             text not null default 'medium'
                       check (priority in ('low', 'medium', 'high')),
  status               text not null default 'open'
                       check (status in ('open', 'closed')),
  closed_at            timestamptz,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint issues_project_site_fk
    foreign key (project_id, site_id)
    references public.project_sites (project_id, site_id)
    deferrable initially deferred
);
create index issues_project_site_idx on public.issues (project_id, site_id);
create index issues_framework_item_idx on public.issues (framework_item_id);
create index issues_activity_idx on public.issues (activity_id);
create index issues_verification_item_idx on public.issues (verification_item_id);
create index issues_review_idx on public.issues (document_review_id);
create index issues_created_by_idx on public.issues (created_by);

create table public.actions (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  site_id          uuid,
  -- optional: standalone actions are allowed (ADR-007). NO ACTION: an issue with
  -- linked actions cannot be deleted; actions are never silently deleted.
  issue_id         uuid references public.issues (id) deferrable initially deferred,
  activity_id      uuid references public.activities (id) on delete set null,
  description      text not null,
  owner_name       text,
  due_date         date,
  priority         text not null default 'medium'
                   check (priority in ('low', 'medium', 'high')),
  status           text not null default 'open'
                   check (status in ('open', 'in_progress', 'pending_review', 'closed')),
  completion_notes text,
  completed_at     timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint actions_project_site_fk
    foreign key (project_id, site_id)
    references public.project_sites (project_id, site_id)
    deferrable initially deferred
);
create index actions_project_site_idx on public.actions (project_id, site_id);
-- "open actions to follow up" (overdue is derived from due_date + status, not stored)
create index actions_open_idx on public.actions (project_id, site_id) where status <> 'closed';
create index actions_issue_idx on public.actions (issue_id);
create index actions_activity_idx on public.actions (activity_id);
create index actions_created_by_idx on public.actions (created_by);

-- ---------------------------------------------------------------------------
-- Attachments (ADR-009)
-- ---------------------------------------------------------------------------
-- Core attachments link only to Core entities. Future domain modules MUST NOT add
-- domain-specific FK columns here; they create their own junction tables to files.
create table public.attachments (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  file_id              uuid not null references public.files (id) deferrable initially deferred,
  caption              text,
  activity_id          uuid references public.activities (id) on delete cascade,
  document_review_id   uuid references public.document_reviews (id) on delete cascade,
  verification_item_id uuid references public.verification_items (id) on delete cascade,
  issue_id             uuid references public.issues (id) on delete cascade,
  action_id            uuid references public.actions (id) on delete cascade,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint attachments_exactly_one_parent check (
    num_nonnulls(activity_id, document_review_id, verification_item_id, issue_id, action_id) = 1
  )
);
create index attachments_project_id_idx on public.attachments (project_id);
create index attachments_file_id_idx on public.attachments (file_id);
create index attachments_created_by_idx on public.attachments (created_by);
create index attachments_activity_idx on public.attachments (activity_id) where activity_id is not null;
create index attachments_review_idx on public.attachments (document_review_id) where document_review_id is not null;
create index attachments_verification_item_idx on public.attachments (verification_item_id) where verification_item_id is not null;
create index attachments_issue_idx on public.attachments (issue_id) where issue_id is not null;
create index attachments_action_idx on public.attachments (action_id) where action_id is not null;

-- ---------------------------------------------------------------------------
-- updated_at triggers (mutable tables only)
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.sites
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.frameworks
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.framework_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.activities
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.document_reviews
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.verification_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.issues
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.actions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile row for every new auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email)
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Derived document status (ADR-005). Never stored.
--   1. not applicable                  -> n_a
--   2. no version                      -> not_received
--   3. latest version has no review    -> received
--   4. else status of the most recently created review record of the latest
--      version (created_at)            -> under_review | revision_required | accepted
-- Latest version = highest version_no.
-- ---------------------------------------------------------------------------
create view public.document_register
with (security_invoker = true) as
select
  d.id            as document_id,
  d.project_id,
  d.site_id,
  d.doc_code,
  d.title,
  d.document_type,
  d.owner_name,
  d.is_applicable,
  lv.id           as latest_version_id,
  lv.version_no   as latest_version_no,
  lv.revision     as latest_revision,
  lr.id           as latest_review_id,
  case
    when not d.is_applicable then 'n_a'
    when lv.id is null then 'not_received'
    when lr.id is null then 'received'
    else lr.status
  end             as status
from public.documents d
left join lateral (
  select v.id, v.version_no, v.revision
  from public.document_versions v
  where v.document_id = d.id
  order by v.version_no desc
  limit 1
) lv on true
left join lateral (
  select r.id, r.status
  from public.document_reviews r
  where r.document_version_id = lv.id
  order by r.created_at desc
  limit 1
) lr on true;
