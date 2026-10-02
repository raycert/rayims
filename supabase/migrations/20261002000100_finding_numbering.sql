-- Phase 6A — Finding numbering (ADR-019; supersedes ADR-015 for Findings only).
--
-- Every Finding gets a stable, human-readable number per Project: stored as an integer
-- (issues.finding_no), shown as F-001. Assigned by the database at INSERT through a per-project
-- counter (race-safe: the counter row is locked by an atomic upsert), immutable afterwards, never
-- reused (a deleted Finding leaves a gap). Actions are not numbered.

-- 1. Counter table: internal infrastructure, not reachable through the Data API.
create table public.project_finding_counters (
  project_id      uuid primary key references public.projects (id) on delete cascade,
  last_finding_no integer not null check (last_finding_no >= 0)
);
alter table public.project_finding_counters enable row level security;
-- No policies. New tables in this project receive default grants, so revoke them explicitly.
revoke all on public.project_finding_counters from public, anon, authenticated;

-- 2. The number column, backfilled deterministically per project (created_at, id) before NOT NULL.
alter table public.issues add column finding_no integer;

-- The backfill must not bump existing Findings' updated_at.
alter table public.issues disable trigger set_updated_at;
with numbered as (
  select id, row_number() over (partition by project_id order by created_at, id) as n
  from public.issues
)
update public.issues i set finding_no = numbered.n from numbered where numbered.id = i.id;
alter table public.issues enable trigger set_updated_at;

insert into public.project_finding_counters (project_id, last_finding_no)
select project_id, max(finding_no) from public.issues group by project_id;

alter table public.issues
  alter column finding_no set not null,
  add constraint issues_project_finding_no_key unique (project_id, finding_no);

-- 3. Assignment: on INSERT take the project's next number (the browser never chooses it); on UPDATE
--    the number is kept as it was. SECURITY DEFINER so the counter needs no user grants.
create function public.assign_finding_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.project_finding_counters as c (project_id, last_finding_no)
    values (new.project_id, 1)
    on conflict (project_id) do update set last_finding_no = c.last_finding_no + 1
    returning c.last_finding_no into new.finding_no;
  else
    new.finding_no := old.finding_no;
  end if;
  return new;
end;
$$;
revoke all on function public.assign_finding_no() from public, anon, authenticated;

create trigger assign_finding_no
  before insert or update on public.issues
  for each row execute function public.assign_finding_no();
