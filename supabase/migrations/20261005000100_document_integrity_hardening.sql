-- Phase 7B: Document / Version / Gap Assessment data-integrity hardening.
--
-- Moves three application-level rules down into the database so they also hold under concurrent
-- consultant actions. The user-facing workflow does not change.
--
--   1. documents -> document_versions       ON DELETE CASCADE -> RESTRICT
--      A Document can only be physically deleted while it has no Versions (the application rule since
--      Phase 5A). A Version inserted between the application's check and its delete is no longer
--      silently cascaded away; the delete is refused.
--   2. document_versions -> document_reviews ON DELETE CASCADE -> RESTRICT
--      A Version can only be deleted while it has no Gap Assessments (Phase 5B). A Gap Assessment
--      started between the check and the delete (with its Evidence, which cascades from the review)
--      is no longer silently deleted.
--   3. One OPEN Gap Assessment per Version: a partial unique index on document_reviews
--      (document_version_id) WHERE status = 'under_review'. The application's Phase 5G post-insert
--      reconciliation stays as a second line; this is the hard guarantee.
--   4. document_register: the latest review of the latest Version is the one with the highest
--      (created_at, id) — "created_at DESC, id DESC", the same rule the application uses — so two
--      reviews with an identical created_at no longer leave the status to chance.
--
-- Everything else is untouched: no table, column, function, RLS policy, grant or Storage policy is
-- added or changed; the other CASCADE constraints (mappings, attachments of a review / parent, Project
-- children) keep their meaning. `create or replace view` keeps the view's columns, order, options and grants.
--
-- Precondition: no Version may currently have more than one open review (the index could not be
-- created). The migration STOPS with a clear message instead of choosing a survivor or deleting data.

do $$
declare
  duplicates integer;
begin
  select count(*) into duplicates
  from (
    select document_version_id
    from public.document_reviews
    where status = 'under_review'
    group by document_version_id
    having count(*) > 1
  ) d;
  if duplicates > 0 then
    raise exception 'Phase 7B precondition failed: % Document Version(s) have more than one open (under_review) Gap Assessment. Resolve them before applying this migration (nothing was changed).', duplicates;
  end if;
end
$$;

-- 1. Document -> Version
alter table public.document_versions drop constraint document_versions_document_id_fkey;
alter table public.document_versions
  add constraint document_versions_document_id_fkey
  foreign key (document_id) references public.documents (id) on delete restrict;

-- 2. Version -> Review
alter table public.document_reviews drop constraint document_reviews_document_version_id_fkey;
alter table public.document_reviews
  add constraint document_reviews_document_version_id_fkey
  foreign key (document_version_id) references public.document_versions (id) on delete restrict;

-- 3. One open Gap Assessment per Version
create unique index document_reviews_one_open_per_version_idx
  on public.document_reviews (document_version_id)
  where status = 'under_review';

-- 4. Deterministic latest review (created_at DESC, id DESC)
create or replace view public.document_register
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
  order by r.created_at desc, r.id desc
  limit 1
) lr on true;
