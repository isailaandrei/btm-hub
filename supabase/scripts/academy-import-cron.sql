-- ============================================================================
-- Academy import cron via Supabase pg_cron (replaces Vercel Cron on Hostinger).
--
-- Run this ONCE in the Supabase SQL editor against the PRODUCTION project
-- (Dashboard -> SQL Editor) — but NOT before Phase 3 step 4 of the migration.
-- While Vercel Cron still fires /api/cron/academy-import, adding this job would
-- DOUBLE-EXECUTE the importer: its per-row duplicate check is check-then-insert
-- and races under concurrent runs. Land the vercel.json cron-removal commit
-- (Phase 3 step 2) first, THEN run this. See
-- docs/plans/vercel-to-hostinger-migration.md.
--
-- It is NOT a migration on purpose: `create extension pg_cron` requires
-- shared_preload_libraries that the local Supabase CLI stack does not load, so
-- auto-applying it locally would fail.
--
-- Re-running this script is safe: cron.schedule() upserts a job by name.
-- ============================================================================

-- 1. Extensions ---------------------------------------------------------------
-- (Or enable via Dashboard -> Database -> Extensions: pg_cron, pg_net.)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Secrets for the import ping ----------------------------------------------
-- The job calls the app to run the import, so it needs the endpoint URL + the
-- CRON_SECRET. The URL goes in its own Vault secret; the bearer token REUSES the
-- existing `email_cron_secret` — the academy-import route authenticates with the
-- same CRON_SECRET as the email drain (constant-time `Bearer <CRON_SECRET>`
-- check), so there is no separate secret to manage.
-- Run this ONCE (replace the placeholder), then delete these lines:
--
--   select vault.create_secret(
--     'https://YOUR-PROD-DOMAIN/api/cron/academy-import', 'academy_import_url',
--     'Academy import cron endpoint');
--
-- `email_cron_secret` must already exist (created by email-backstop-cron.sql).
-- If it does not, create it too (value = the app's CRON_SECRET):
--   select vault.create_secret(
--     'YOUR-CRON-SECRET-VALUE', 'email_cron_secret',
--     'Bearer token for the app cron endpoints (matches CRON_SECRET)');

-- 3. Academy import -----------------------------------------------------------
-- Fire-and-forget GET to the importer (auth: Bearer CRON_SECRET). Daily at
-- 02:15 UTC, matching the Vercel Cron schedule it replaces.
--
-- timeout_milliseconds is raised from pg_net's 5s default because a full import
-- runs longer than the email drain; this only governs how long pg_net waits to
-- capture the response for monitoring (net._http_response) — the GET reaches the
-- app and triggers the server-side run regardless of whether pg_net waits.
select cron.schedule(
  'academy-import',
  '15 2 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'academy_import_url'),
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);

-- 4. Verify -------------------------------------------------------------------
--   select jobname, schedule, active from cron.job where jobname = 'academy-import';
--   select * from cron.job_run_details where jobname = 'academy-import' order by start_time desc limit 20;
--   select * from net._http_response order by created desc limit 10;  -- import pings
--
-- To remove later:  select cron.unschedule('academy-import');
