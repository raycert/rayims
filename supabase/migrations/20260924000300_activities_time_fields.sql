-- Phase 3B-1: structured time-of-day for activities.
--
-- Adds start_time / end_time (time, no timezone) alongside the existing
-- start_date / end_date / planned_days. These serve different purposes:
--   date/time    -> WHEN the activity occurs (used to order same-day activities)
--   planned_days -> planned consulting effort/duration in days
-- Purely additive: both columns are nullable, no default, no backfill, no
-- change to existing dates, activity_type_id, FK behavior, RLS or grants.

alter table public.activities
  add column start_time time,
  add column end_time   time;
