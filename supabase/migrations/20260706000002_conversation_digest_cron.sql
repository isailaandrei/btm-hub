-- Daily backstop that drains the conversation-digest backlog via the bounded
-- cron route. Scheduled with pg_cron (NOT vercel.json) so it survives the
-- Vercel -> Hostinger cutover.
--
-- IMPORTANT (flagged for review): there is no committed pg_cron "email-drain
-- backstop" migration in this repo to mirror — the only committed cron is
-- `academy-import` in vercel.json, and the email drain runs from a schedule that
-- lives only in the live database (see `select * from cron.job`). This migration
-- therefore follows the standard Supabase pg_cron + pg_net + Vault pattern and
-- should be reconciled against that live definition before it is relied on.
--
-- It reads the app base URL and the cron bearer secret from Vault secrets
-- `app_base_url` and `cron_secret` at RUN time (create those before the schedule
-- can fire). The whole body is guarded: where pg_cron is unavailable (e.g. a
-- local stack without the extension preloaded) it no-ops with a NOTICE rather
-- than failing the migration.

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception
    when others then
      raise notice
        'pg_cron unavailable (%); conversation-digest schedule not installed', sqlerrm;
      return;
  end;

  -- Idempotent: replace any prior definition of this job.
  if exists (
    select 1 from cron.job where jobname = 'conversation-digest-daily'
  ) then
    perform cron.unschedule('conversation-digest-daily');
  end if;

  perform cron.schedule(
    'conversation-digest-daily',
    '10 3 * * *',
    $cron$
    select net.http_get(
      url := (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'app_base_url'
      ) || '/api/cron/conversation-digest',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'cron_secret'
        )
      )
    );
    $cron$
  );
exception
  when others then
    raise notice
      'conversation-digest schedule not installed: %', sqlerrm;
end;
$$;
