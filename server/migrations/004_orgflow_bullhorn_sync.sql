-- Org Flow ↔ Bullhorn ClientCorporation link + sync watermarks.
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.
--
-- After applying, the periodic sync job (server/lib/orgflowSync.js) will
-- backfill bullhorn_client_id on existing Org Flow clients by name match,
-- then keep the link fresh as new ClientCorporations are created in Bullhorn.

-- 1) Link Org Flow clients to Bullhorn ClientCorporation.id (nullable —
-- existing rows that don't match a Bullhorn corp by name stay NULL).
alter table clients add column if not exists bullhorn_client_id bigint;

-- Partial unique index: enforces one Org Flow card per Bullhorn corp,
-- but allows many rows with NULL (unlinked clients are common).
create unique index if not exists clients_bullhorn_client_id_unique
  on clients (bullhorn_client_id) where bullhorn_client_id is not null;

-- 2) Sync watermarks — one row per named sync job. Read at the start of each
-- run to know how far we got last time; written at the end with results.
create table if not exists sync_state (
  key text primary key,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
