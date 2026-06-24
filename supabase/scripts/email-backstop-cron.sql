-- ============================================================================
-- Email reliability backstops via Supabase pg_cron (Vercel-Hobby friendly).
--
-- Run this ONCE in the Supabase SQL editor against the PRODUCTION project
-- (Dashboard -> SQL Editor). It is NOT a migration on purpose: `create extension
-- pg_cron` requires shared_preload_libraries that the local Supabase CLI stack
-- does not load, so auto-applying it to local would fail.
--
-- Prerequisite: migration 20260624000005_email_reliability_fixes.sql must already
-- be deployed to prod (provides reconcile_orphan_email_events + the drain RPCs).
--
-- Re-running this script is safe: cron.schedule() upserts a job by name.
-- ============================================================================

-- 1. Extensions ---------------------------------------------------------------
-- (Or enable via Dashboard -> Database -> Extensions: pg_cron, pg_net.)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Secrets for the drain ping ----------------------------------------------
-- The reconcile job runs pure SQL (no HTTP). The drain job must call the app to
-- actually send email, so it needs the endpoint URL + the CRON_SECRET. Store
-- both in Supabase Vault so they are not written into cron.job in plaintext.
-- Run these two ONCE (replace the placeholder values), then delete these lines:
--
--   select vault.create_secret(
--     'https://YOUR-PROD-DOMAIN/api/cron/email-drain', 'email_drain_url',
--     'Email drain backstop endpoint');
--   select vault.create_secret(
--     'YOUR-CRON-SECRET-VALUE', 'email_cron_secret',
--     'Bearer token for the email cron endpoints (matches Vercel CRON_SECRET)');
--
-- (To rotate: select vault.update_secret((select id from vault.secrets where
--  name='email_cron_secret'), 'NEW-VALUE');)

-- 3. Reconcile backstop -------------------------------------------------------
-- Pure in-DB sweep: re-links + re-applies any provider events that landed
-- without a recipient. No HTTP, no secret. Every 10 minutes.
select cron.schedule(
  'email-reconcile',
  '*/10 * * * *',
  $$ select public.reconcile_orphan_email_events(500); $$
);

-- 4. Drain backstop -----------------------------------------------------------
-- Finishes any send a killed serverless invocation left unfinished. Fire-and-
-- forget GET to the drain endpoint (which finds stuck sends + processes a bounded
-- number of chunks, then re-triggers the worker). Every minute.
select cron.schedule(
  'email-drain',
  '* * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'email_drain_url'),
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
    )
  );
  $$
);

-- 5. Verify -------------------------------------------------------------------
--   select jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select * from net._http_response order by created desc limit 10;  -- drain pings
--
-- To remove later:  select cron.unschedule('email-drain');
--                    select cron.unschedule('email-reconcile');
