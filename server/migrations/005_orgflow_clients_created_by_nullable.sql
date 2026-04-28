-- Allow Org Flow client cards with no resolved Account Manager.
-- Run this in the Supabase SQL editor. Idempotent.
--
-- Background: the Bullhorn → Org Flow sync sets clients.created_by from the
-- Bullhorn owner email (looked up against user_profiles). When no match
-- exists, the sync writes NULL, which previously violated a NOT NULL
-- constraint and aborted the whole insert batch. The dashboard already
-- renders nullable account_manager safely (`client.account_manager?.full_name`).

alter table clients alter column created_by drop not null;
