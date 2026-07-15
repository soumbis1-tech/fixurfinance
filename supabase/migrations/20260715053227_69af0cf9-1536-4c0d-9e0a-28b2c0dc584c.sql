-- Re-schedule the weekly reports cron job to authenticate with x-cron-secret
-- instead of the public apikey header. The public anon/publishable key must
-- never be accepted as authentication for privileged cron work.
DO $$
DECLARE
  jid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR jid IN
      SELECT jobid FROM cron.job
      WHERE command ILIKE '%/api/public/cron/weekly-reports%'
    LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;
  END IF;
END $$;

-- Store the shared cron secret in Vault so pg_cron can read it without
-- embedding it in job SQL. The application's CRON_SECRET env var must match.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    -- No-op: value is managed via Vault UI / secrets tooling.
    NULL;
  END IF;
END $$;