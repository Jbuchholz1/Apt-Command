-- External (non-Azure-AD) user provisioning.
-- Adds password-based auth columns to user_profiles. Existing Azure rows
-- keep auth_provider='azure' and ignore the password fields.
-- Run in the Supabase SQL editor. Idempotent; safe to re-run.

alter table user_profiles
  add column if not exists auth_provider text not null default 'azure';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_auth_provider_chk'
  ) then
    alter table user_profiles
      add constraint user_profiles_auth_provider_chk
      check (auth_provider in ('azure', 'external'));
  end if;
end $$;

alter table user_profiles
  add column if not exists password_hash text,
  add column if not exists password_updated_at timestamptz,
  add column if not exists password_must_change boolean not null default false,
  add column if not exists failed_login_count int not null default 0,
  add column if not exists locked_until timestamptz;

-- External rows must carry a hash. Azure rows must not (defense-in-depth so
-- a stray UPDATE can't flip provider without setting the hash).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_external_has_hash_chk'
  ) then
    alter table user_profiles
      add constraint user_profiles_external_has_hash_chk
      check (
        (auth_provider = 'azure' and password_hash is null)
        or (auth_provider = 'external' and password_hash is not null)
      );
  end if;
end $$;

-- Case-insensitive uniqueness on email prevents Azure/external collisions.
create unique index if not exists user_profiles_email_lower_idx
  on user_profiles (lower(email));
