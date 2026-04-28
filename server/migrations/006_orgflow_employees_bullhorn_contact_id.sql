-- Org Flow employees ↔ Bullhorn ClientContact link.
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.
--
-- After applying, the Bullhorn sync will start populating employees rows
-- under each linked Org Flow client (one card per ClientContact). Existing
-- employees with the same email under the same client get linked instead
-- of duplicated.

alter table employees add column if not exists bullhorn_contact_id bigint;

-- Partial unique index — one Org Flow employee per Bullhorn contact.
-- NULLs are common (manually-typed employees) so the index is partial.
create unique index if not exists employees_bullhorn_contact_id_unique
  on employees (bullhorn_contact_id) where bullhorn_contact_id is not null;
