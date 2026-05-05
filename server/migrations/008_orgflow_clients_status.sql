-- Org Flow client status — local-only field for the dashboard pill + dropdown.
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.
--
-- Background: Bullhorn ClientCorporation has a `status` field with the
-- following picklist (APT tenant): Unqualified / Qualified Lead / Proposal /
-- Negotiation / Active Account / Passive Account / DNC / Archive. The
-- dashboard writes through the existing PATCH /api/org-flow/clients/:id
-- endpoint (which also calls update_entity on Bullhorn).

alter table clients add column if not exists status text not null default 'Unqualified';
create index if not exists clients_status_idx on clients(status);

-- One-time data fix-up for environments that ran an earlier draft of this
-- migration with default 'Active' (a value not in the Bullhorn picklist).
-- Idempotent; no-op once everything is on the new picklist.
update clients set status = 'Active Account' where status = 'Active';

-- Make the column default match the new picklist for any future inserts that
-- don't specify a status. add column if not exists won't change a default
-- that was already set, so this needs its own statement.
alter table clients alter column status set default 'Unqualified';
