-- Concurrency safety migration — C1 (optimistic locking) and C3 (reconciliation queue).
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.
--
-- After applying, the server auto-detects the new schema at boot and starts
-- enforcing optimistic locking on `job_overrides`. Clients that don't yet
-- send `If-Match` continue to work (legacy upsert path) so the deploy can
-- happen in any order.

-- C1 — Optimistic locking for job_overrides
alter table job_overrides add column if not exists version integer not null default 1;

-- C1 — Also add to placement_checklist so the same pattern can protect that
-- write path later. No code uses this column yet; safe to add now.
alter table placement_checklist add column if not exists version integer not null default 1;

-- C3 — Reconciliation queue for split-brain between Bullhorn and Supabase.
-- Populated when a Bullhorn write succeeds but the companion local write
-- fails. Admins can list pending rows to manually reconcile.
create table if not exists reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  job_id bigint not null,
  kind text not null,                  -- e.g. 'status_changed_at', 'override'
  attempted_payload jsonb,             -- what we tried to write
  bullhorn_updated_at timestamptz not null default now(),
  error text,                          -- message from the failing Supabase call
  status text not null default 'pending' check (status in ('pending','resolved','ignored')),
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists idx_reconciliation_queue_status on reconciliation_queue(status, created_at);
create index if not exists idx_reconciliation_queue_job on reconciliation_queue(job_id);
