-- Revoke anon + authenticated grants on all public-schema tables/sequences.
-- Run in the Supabase SQL editor for BOTH prod and sandbox. Idempotent; safe to re-run.
--
-- Why this exists:
--   Supabase's Security Advisor flagged "rls_disabled_in_public" on prod
--   tables. The underlying risk: Supabase's legacy default GRANTed SELECT/
--   INSERT/UPDATE/DELETE to the `anon` and `authenticated` roles on every
--   public-schema table at creation time. With no RLS policies, anyone who
--   obtains the anon key could read or modify those tables via PostgREST.
--
-- Why not just add RLS instead:
--   This app uses service_role exclusively (server/lib/db.js connects with
--   SUPABASE_SERVICE_KEY; the React client never imports supabase-js).
--   anon and authenticated have no legitimate purpose here, so revoking
--   their access entirely is cleaner than adding RLS — there's no role
--   left for an attacker to exploit, and we skip the RLS-policy maintenance
--   burden. service_role bypasses RLS anyway, so the server is unaffected.
--
-- Safe to run because:
--   - Frontend has no supabase-js dependency (confirmed via grep).
--   - Realtime SSE is server-side via service_role; publication membership
--     doesn't require anon grants on the underlying tables.
--   - Storage buckets use a separate permission model (storage.objects).
--   - Auth is Microsoft Entra/Azure AD, not Supabase Auth.
--   - Dashboard data viewing uses Supabase's dashboard role, not anon.
--
-- The ALTER DEFAULT PRIVILEGES block at the bottom ensures the legacy
-- default doesn't re-grant access on tables created in the future.

-- 1. Revoke current grants on every existing table.
revoke all
  on all tables in schema public
  from anon, authenticated;

-- 2. Revoke sequence access too (bigserial/serial inserts via these roles).
revoke all
  on all sequences in schema public
  from anon, authenticated;

-- 3. Block the legacy default privilege so newly-created tables don't
--    silently re-grant anon/authenticated access. This is paired with the
--    service_role default-privilege grant from migration 014.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
