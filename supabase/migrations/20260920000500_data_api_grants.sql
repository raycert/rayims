-- Explicit Data API grants (Phase 0D).
--
-- Supabase no longer grants table privileges to the Data API roles automatically
-- for new tables in the public schema (new projects since 2026-05-30, all projects
-- from 2026-10-30). Grants decide whether a role can reach an object at all; RLS
-- (previous migration) decides which rows. Both are required.
--
-- Least privilege for the V1 access model (ADR-014):
--   * anon gets NOTHING: anonymous requests fail closed at the privilege layer.
--   * authenticated gets exactly what the RLS policies allow.
--   * service_role is not used by RayIMS in V1 and is not granted here.

-- Start from a clean slate so the result does not depend on the project's
-- "automatically expose new tables" setting (legacy projects auto-grant everything
-- to anon/authenticated through default privileges). RLS remains a second layer.
revoke all on all tables in schema public from anon, authenticated;

-- Work tables: full access for authenticated users (RLS: authenticated full access).
grant select, insert, update, delete on
  public.clients,
  public.sites,
  public.projects,
  public.project_sites,
  public.project_frameworks,
  public.activities,
  public.documents,
  public.document_versions,
  public.document_framework_items,
  public.document_reviews,
  public.verification_items,
  public.issues,
  public.actions,
  public.files,
  public.attachments
to authenticated;

-- Framework reference data: read-only for users (BR-45).
grant select on public.frameworks, public.framework_items to authenticated;

-- Profiles: read all; update own row only (RLS also locks the role column).
-- No insert/delete: rows are created by the auth.users trigger.
grant select, update on public.profiles to authenticated;

-- Derived document status view (security_invoker: RLS of the base tables applies).
grant select on public.document_register to authenticated;
