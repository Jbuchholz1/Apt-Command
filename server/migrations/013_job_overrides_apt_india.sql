-- Add apt_india boolean flag to job_overrides.
-- Run in the Supabase SQL editor. Idempotent; safe to re-run.
--
-- When a job's apt_india row is true, the job appears on the new "India
-- Req Board" tab in addition to the regular Req Board. Falls off both
-- boards using the same FALLOFF rule as every other job (12h after hitting
-- a terminal status). See server/routes/jobs.js for the filter logic.

alter table job_overrides
  add column if not exists apt_india boolean not null default false;

-- Partial index — most rows are false; only index the truthy ones so the
-- "show me all India jobs" lookup stays sub-millisecond as the table grows.
create index if not exists idx_job_overrides_apt_india
  on job_overrides(apt_india) where apt_india = true;
