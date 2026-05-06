-- Real-time publication for the Req Board (v3.15.8).
--
-- Adds job_overrides + job_notes to Supabase's default Realtime publication
-- so the API server's Realtime subscription receives INSERT/UPDATE events
-- on those tables. Each event is fanned out to every connected SSE client
-- at /api/req-board/jobs/events.
--
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.
-- After applying, no code change or restart is required for new events to
-- start flowing — Supabase picks up the publication change immediately.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'job_overrides'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE job_overrides';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'job_notes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE job_notes';
  END IF;
END
$$;
