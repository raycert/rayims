-- Correct grants on activity_types (Phase 3A follow-up).
--
-- New tables on this project still receive default privileges for anon/
-- authenticated at CREATE TABLE time (the legacy behavior noted in
-- 20260920000500_data_api_grants.sql — this project predates the cutover).
-- The Phase 3A migration granted select/insert/update/delete to
-- `authenticated` but never revoked the auto-granted privileges first, unlike
-- every other table (each went through an explicit "revoke all ... from
-- anon, authenticated" before being re-granted). The result: `anon` had
-- select/insert/update/delete on activity_types (should have had nothing),
-- and `authenticated` also carried unused trigger/truncate/references grants
-- alongside the intended four.
--
-- RLS already blocked every anon request (no policy targets anon, so 0 rows
-- were ever visible or writable) — no data was exposed or altered by this
-- gap. This migration closes it at the grant layer too, matching the
-- project's documented two-layer model ("anon gets NOTHING: fail closed at
-- the privilege layer") and giving `authenticated` exactly the same grant
-- set as every other reference-data table (select, insert, update, delete;
-- nothing else).

revoke all on public.activity_types from anon, authenticated;
grant select, insert, update, delete on public.activity_types to authenticated;
