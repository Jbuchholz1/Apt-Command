-- COI Tracking — Operations module
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.

create table if not exists coi_records (
  id uuid primary key default gen_random_uuid(),
  client_name text not null default '',
  coi_link text not null default '',
  expiration_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);

create index if not exists coi_records_expiration_idx on coi_records(expiration_date);
