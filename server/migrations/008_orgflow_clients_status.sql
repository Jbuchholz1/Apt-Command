-- Org Flow client status — local-only field for the dashboard pill + dropdown.
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.
--
-- Background: Bullhorn ClientCorporation does not expose a standard status
-- field that the orgflow sync currently pulls (see server/lib/orgflowSync.js).
-- Status is managed entirely in Supabase; the dashboard writes through the
-- existing PATCH /api/org-flow/clients/:id endpoint.

alter table clients add column if not exists status text not null default 'Active';
create index if not exists clients_status_idx on clients(status);
