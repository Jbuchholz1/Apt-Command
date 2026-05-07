-- Add Ex A/B, SOW checkbox to onboarding tracker checklist.
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.

alter table placement_checklist
  add column if not exists ex_ab_sow_complete boolean not null default false;
