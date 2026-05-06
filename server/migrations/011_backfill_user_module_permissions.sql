-- Backfill grants for every existing user so the strict-default access model
-- doesn't lock anyone out on rollout. Idempotent via the unique constraint.
--
-- Global admins are intentionally skipped — they bypass the grants table
-- via the superuser path in resolvePermissions().
--
-- Run AFTER 010_user_module_permissions.sql. Safe to re-run.

-- Managers: admin level on everything currently visible to managers,
-- basic on the admin module (so they can read but not mutate).
-- Operations is intentionally omitted (was admin-only before this migration).
insert into user_module_permissions (user_email, module_key, access_level, granted_by)
select lower(up.email), m.module_key, m.access_level, 'system_backfill'
from user_profiles up
cross join (values
  ('req_board',             'admin'),
  ('org_flow',              'admin'),
  ('pipeline',              'admin'),
  ('client_health',         'admin'),
  ('reporting_recruiter',   'admin'),
  ('reporting_sales',       'admin'),
  ('reporting_executive',   'admin'),
  ('reporting_performance', 'admin'),
  ('goal_tracking',         'admin'),
  ('support',               'admin'),
  ('project_management',    'admin'),
  ('admin',                 'basic')
) as m(module_key, access_level)
where up.role = 'manager' and up.email is not null and up.email <> ''
on conflict (user_email, module_key) do nothing;

-- Basic users: preserve today's behavior. Inline edits / notes / opportunity
-- edits are basic-level in the new system, so a basic grant keeps everything
-- they could do before. Operations / project_management / admin were already
-- gated to managers+, so basic users still won't see them.
insert into user_module_permissions (user_email, module_key, access_level, granted_by)
select lower(up.email), m.module_key, 'basic', 'system_backfill'
from user_profiles up
cross join (values
  ('req_board'),
  ('org_flow'),
  ('pipeline'),
  ('client_health'),
  ('reporting_recruiter'),
  ('reporting_sales'),
  ('reporting_executive'),
  ('reporting_performance'),
  ('goal_tracking'),
  ('support')
) as m(module_key)
where up.role = 'basic' and up.email is not null and up.email <> ''
on conflict (user_email, module_key) do nothing;
