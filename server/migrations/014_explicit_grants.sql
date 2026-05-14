-- Explicit GRANTs on public-schema tables for service_role (Supabase Data API).
-- Run in the Supabase SQL editor for BOTH prod and sandbox. Idempotent; safe to re-run.
--
-- Why this exists:
--   Supabase is removing the legacy default that auto-grants the Data API
--   roles access to every new public-schema table. New projects after
--   2026-05-30 already enforce the new behavior; ALL existing projects
--   (including ours) get enforced on 2026-10-30. Without explicit GRANTs,
--   PostgREST/supabase-js will return 42501 permission-denied on every read
--   and write.
--
-- Scope: service_role only. The frontend never imports supabase-js — every
-- DB call goes through the Express API server using SUPABASE_SERVICE_KEY
-- (server/lib/db.js). anon and authenticated are unused, so granting them
-- now would add risk without benefit (no RLS = directly readable rows).
--
-- The ALTER DEFAULT PRIVILEGES block at the bottom makes this fire-and-forget:
-- any future table created by postgres (manual migration, ensureSchema's
-- exec_sql rpc, the dashboard) inherits these grants automatically — no need
-- to remember to add a GRANT every time we add a new table.

-- 1. Backfill grants for every base table that exists today.
grant select, insert, update, delete
  on all tables in schema public
  to service_role;

-- 2. Sequences (bigserial/serial columns need USAGE+SELECT to call nextval).
grant usage, select
  on all sequences in schema public
  to service_role;

-- 3. Default privileges for FUTURE tables/sequences created by postgres.
--    Applies only to objects created by the role that runs this statement
--    (postgres in the SQL editor), which matches how all schema changes
--    reach this DB (SQL editor + exec_sql rpc both run as postgres).
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
