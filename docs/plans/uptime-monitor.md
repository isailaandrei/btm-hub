# External uptime monitor — pg_cron probe + Brevo direct alerts

**Status:** PLANNED (2026-07-12, owner-deferred — "not urgent"). Nothing exists yet: verified
no `uptime_*` Vault secrets, tables, functions, or cron jobs on prod as of 2026-07-12.
**Prerequisite reading:** none — this document is self-contained.

## Goal

Alert Andrei (isailaandrei.i@gmail.com) by email when production —
`https://preview.behind-the-mask.com` until the official launch, the final domain after —
stops serving, using infrastructure that does not depend on the app being up.

## Why this architecture (decided 2026-07-12)

- No new SaaS account (UptimeRobot etc.) can be created by an assistant session — account
  creation is owner-only. A free UptimeRobot monitor remains a fine substitute if Andrei
  prefers to set one up himself; this plan is the no-new-accounts alternative.
- Supabase pg_cron + pg_net is proven in this stack (the `email-drain` job pings the app
  every minute; see `supabase/scripts/email-backstop-cron.sql`) and runs on Supabase's
  infrastructure — independent of the Hostinger box, its CDN, and its process manager.
- Alerts must NOT go through the app's email pipeline (if the site is down, that pipeline
  is down): the checker calls **Brevo's HTTP API directly from Postgres** via
  `net.http_post` to `https://api.brevo.com/v3/smtp/email`.
- Blind spot (accepted): if Supabase itself is down, the monitor is down too — but then the
  app is also degraded (every request hits Supabase), and Supabase has its own status page.

## Design

All objects live in the `public` schema, namespaced `uptime_*`. RLS enabled with NO
policies (cron runs as postgres, which bypasses; app clients get nothing).

1. **Vault secrets**
   - `uptime_target_url` = `https://preview.behind-the-mask.com/`
     (description: "update at official launch")
   - `uptime_brevo_api_key` = the Brevo API key (same account the app uses; the value is in
     the local `.env.development.local` under `BREVO_API_KEY`, and in the hPanel/Vercel env
     stores). NEVER commit the real key; the runnable script keeps a REPLACE-ME placeholder.

2. **Tables**
   - `uptime_probes(request_id bigint primary key, created_at timestamptz not null default now())`
   - `uptime_state` — single row (`id int primary key default 1 check (id = 1)`):
     `status text not null default 'up' check (status in ('up','down'))`,
     `consecutive_failures int not null default 0`, `last_alert_at timestamptz`,
     `last_change_at timestamptz`, `updated_at timestamptz not null default now()`. Seed the row.

3. **`public.uptime_send_alert(p_subject text, p_html text) returns bigint`**
   Fire-and-forget `net.http_post` to Brevo:
   headers `{"api-key": <vault uptime_brevo_api_key>, "content-type": "application/json"}`;
   body `sender = {"name":"BTM Uptime Monitor","email":"academy@behind-the-mask.com"}`
   (a validated Brevo sender — the app's production from-address),
   `to = [{"email":"isailaandrei.i@gmail.com"}]` (hardcoded; alerts go to Andrei ONLY),
   `subject`, `htmlContent`.

4. **`public.uptime_probe()`** — cron, every minute
   Insert into `uptime_probes` the request id from
   `net.http_get(url := <vault uptime_target_url> || '?uptime=' || extract(epoch from now())::bigint, timeout_milliseconds := 10000)`;
   prune `uptime_probes` rows older than 2 days.
   The cache-buster query param is REQUIRED, not optional: the site serves
   `cache-control: s-maxage=31536000`, so a plain `/` probe can be answered by the
   Hostinger CDN from cache while the origin is dead — the buster forces an origin hit.

5. **`public.uptime_check()`** — cron, every minute
   - Evaluate probes with `created_at` between `now()-'15 min'` and `now()-'90 sec'`
     (responses need time to land; `net._http_response` rows expire after ~6 h, join by
     `uptime_probes.request_id = net._http_response.id`), newest first.
   - A probe FAILS if: no response row, or `timed_out`, or `error_msg is not null`, or
     `status_code is null`, or `status_code` not in 200–399.
   - Compute the streak of consecutive failures from the newest evaluated probe backwards.
   - Transitions (update `uptime_state` + `last_change_at`):
     - `up` and streak ≥ 3 → `down`; send DOWN alert
       (subject `[BTM] SITE DOWN — <host>`; body: streak, newest status_code / error_msg /
       timed_out, timestamp); set `last_alert_at`.
     - `down` and the 2 newest evaluated probes both succeeded → `up`; send RECOVERED
       alert; set `last_alert_at`.
     - `down`, still failing, `last_alert_at < now()-'60 min'` → re-send DOWN alert
       (hourly reminder), update `last_alert_at`.
   - Always update `consecutive_failures` + `updated_at`; no-op safely when there are zero
     evaluable probes.

6. **Scheduling — LAST, only after verification below**
   `cron.schedule('uptime-probe',  '* * * * *', <select public.uptime_probe()>)`
   `cron.schedule('uptime-check', '* * * * *', <select public.uptime_check()>)`

## Implementation deliverables

- `supabase/scripts/uptime-monitor.sql` — runnable script in the house style of
  `email-backstop-cron.sql` / `academy-import-cron.sql` (header: run once against prod via
  SQL editor / MCP `execute_sql`; NOT a migration — pg_cron isn't loadable in the local CLI
  stack; API-key placeholder; verify + removal instructions:
  `cron.unschedule` both jobs, drop the `uptime_*` functions/tables/secrets).
- Local commit on main (no push without approval):
  `feat(ops): external uptime monitor — pg_cron probe + Brevo direct alerts`.

## Verification protocol (in order)

1. Create secrets/tables/functions (NOT the cron jobs). Call `uptime_probe()` once, wait
   ≥ 90 s, confirm a 200 landed in `net._http_response` and `uptime_check()` leaves state
   `up` / streak 0.
2. Test the alert path ONCE for real:
   `select public.uptime_send_alert('[BTM] Uptime monitor armed — test alert', '<p>…</p>');`
   → verify Brevo returned 2xx (201) in `net._http_response`, and the email arrives at
   isailaandrei.i@gmail.com. **Warn Andrei beforehand that one test email is coming.**
3. Schedule both jobs; verify `cron.job` rows + first `cron.job_run_details` successes.
4. Confirm existing jobs untouched: `email-reconcile`, `email-drain`, `conversation-digest`,
   `whatsapp-media-archive`, `academy-import` (compare `cron.job` before/after).

## Hard rules for the implementer

- Live production DB: additive statements only; touch nothing outside the `uptime_*`
  namespace; jobs are scheduled last so an interrupted run leaves nothing armed.
- Never print or commit the Brevo API key.
- Exactly one test email, to isailaandrei.i@gmail.com only.
- If interrupted mid-way, report the exact leftover state (the namespacing makes cleanup a
  handful of drops).

## Follow-ups after implementation

- **At official launch:** update Vault `uptime_target_url` to the final domain (this is
  already listed in the launch runbook expectations — keep the two in sync:
  `docs/plans/vercel-to-hostinger-migration.md`).
- Consider a second probe path (e.g. `/login`) if the homepage ever becomes statically
  cached at the CDN in a way that masks origin death (`cache-control: s-maxage=31536000`
  is set today — the CDN can serve `/` stale while origin is dead; a cache-busted probe
  URL, e.g. `/?uptime=<epoch-minute>`, avoids this and is the recommended default).
