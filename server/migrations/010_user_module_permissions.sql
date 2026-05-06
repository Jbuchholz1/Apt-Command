-- Per-module access grants. One row per (user, module) tuple.
-- Replaces the coarse role-based gating with explicit per-tool permissions.
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.

create table if not exists user_module_permissions (
  id           bigserial primary key,
  user_email   text not null,
  module_key   text not null,
  access_level text not null check (access_level in ('basic', 'admin')),
  granted_by   text,
  granted_at   timestamptz not null default now(),
  unique (user_email, module_key)
);

create index if not exists user_module_permissions_email_idx
  on user_module_permissions (lower(user_email));

create index if not exists user_module_permissions_module_idx
  on user_module_permissions (module_key);
