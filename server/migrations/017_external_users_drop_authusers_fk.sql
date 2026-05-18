-- Drop the auth.users → user_profiles FK so external (non-Azure) users
-- can live in user_profiles without a matching Supabase Auth row.
--
-- Background: the FK was put there by the standard Supabase Auth pattern
-- when the user_profiles table was first created. This app doesn't use
-- Supabase Auth — Azure users authenticate via MSAL, external users via
-- the app-issued JWT in server/middleware/auth.js. Both produce IDs that
-- are NOT registered in auth.users, so the FK breaks external user
-- creation (and would also break any future auto-provisioning of Azure
-- users).
--
-- Idempotent; safe to re-run.

alter table user_profiles
  drop constraint if exists user_profiles_id_fkey;
