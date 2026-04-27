-- Daily Brief — "Last 7 days of meetings" section
-- Tracks which Outlook event IDs each user has already logged activity for,
-- so the ✓ badge persists across page reloads.
-- Idempotent. Apply via the Supabase SQL editor.

create table if not exists meeting_activity_logged (
  user_email text not null,
  outlook_event_id text not null,
  bullhorn_appointment_id bigint,
  logged_at timestamptz not null default now(),
  primary key (user_email, outlook_event_id)
);

create index if not exists idx_meeting_activity_logged_user_logged_at
  on meeting_activity_logged (user_email, logged_at desc);
