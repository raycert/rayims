-- Private object storage for RayIMS files (Phase 0C). ADR-008.
--
-- * One private bucket. The bucket name is configuration
--   (NEXT_PUBLIC_STORAGE_BUCKET); it is never stored in database rows.
-- * Files are served through short-lived signed URLs generated on demand; no
--   permanent public URLs.
-- * Object keys follow `{project_id}/{uuid}-{sanitized-file-name}` (see
--   lib/storage/keys.ts). The database `files` table records the key.
-- * Deleting objects is never a database cascade; it is done by the application
--   through lib/storage.
-- * V1 access model: any authenticated user (same as the tables). No anon access.

insert into storage.buckets (id, name, public, file_size_limit)
values ('rayims-files', 'rayims-files', false, 10485760) -- 10 MB per object
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

create policy "rayims files: authenticated read"
  on storage.objects for select to authenticated
  using (bucket_id = 'rayims-files');

create policy "rayims files: authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'rayims-files');

create policy "rayims files: authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'rayims-files');
