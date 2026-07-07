# WhatsApp ingestion — activation runbook

Operator steps to activate the WhatsApp → AI digest pipeline shipped on
`feat/whatsapp-ingestion`. Everything here runs against the **live** DB / prod
and is done by hand after auditing each dry-run. Nothing below runs in CI.

The `is_noise` schema change ships as a normal repo migration
(`20260706000001_conversation_digest_noise_gate.sql`) and applies through the
usual migration flow. Scheduling is **not** a repo migration: pg_cron isn't in
the local dev stack, so a scheduling migration would break the local db-push
hook. Instead the schedule is created directly on prod with the SQL below —
mirroring how the live email-drain job was created (cron.schedule + net.http_get,
both the URL and the bearer secret read from Supabase Vault).

## Live-run sequence (in order)

Env: all scripts read `.env.development.local` (service-role DB; the backlog
drain also needs `ADMIN_AI_PROVIDER` + the provider key for extraction).

1. **Apply the schema migration** (`is_noise` column + relaxed summary CHECK)
   via the normal migration flow (local hook / `supabase db push` to remote).
   - Verify before proceeding: the `conversation_digests` table has an
     `is_noise boolean not null default false` column.

2. **Backfill DRY-RUN** — proposes phone matches, writes a JSON report to
   `.admin-ai-debug/`, prints existing `matched_via` values, makes **no** writes:
   ```
   RUN_WHATSAPP_MATCH_BACKFILL=1 npx vitest run scripts/whatsapp-match-backfill.test.ts
   ```
   - Verify before proceeding: the participant→contact pairs in the report look
     correct and the total is in the expected range (~280 messages / ~51
     senders); no surprising or obviously-wrong matches.

3. **Backfill APPLY** — batched UPDATEs (`contact_id`, `match_status='matched'`,
   `matched_via='phone_backfill'`); never touches already-matched or deactivated
   rows:
   ```
   RUN_WHATSAPP_MATCH_BACKFILL=1 BACKFILL_APPLY=1 npx vitest run scripts/whatsapp-match-backfill.test.ts
   ```
   - Verify before proceeding: the dry-run report was audited and the
     `matched_via` naming decision is made (see "matched_via naming" below).

4. **Backlog DRY-RUN** — prints the windows that would process (per-contact,
   signal/noise split); no model calls, no writes:
   ```
   RUN_CONVERSATION_DIGEST_BACKLOG=1 BACKLOG_DRY_RUN=1 npx vitest run scripts/conversation-digest-backlog.test.ts
   ```
   - Verify before proceeding: the per-contact window counts and signal/noise
     split are sane (real threads mostly signal; greeting-only threads noise).

5. **Backlog DRAIN** — loops the cron's own processing function until
   `remainingWindows = 0` (model calls + DB writes):
   ```
   RUN_CONVERSATION_DIGEST_BACKLOG=1 npx vitest run scripts/conversation-digest-backlog.test.ts
   ```
   - Verify before proceeding: the dry-run looked right and `ADMIN_AI_PROVIDER`
     + key are set (this step spends model calls). Verify after: the run ends
     with `Remaining windows: 0`.

6. **Prod scheduling** — create the daily pg_cron job (SQL below).
   - Verify: `select * from cron.job where jobname = 'conversation-digest'`
     returns the row.

7. **Hostinger cutover** — update the `conversation_digest_url` Vault value to the
   new host (see the cutover note below). No code or schedule change needed.

## Scheduling (run on prod)

Reuses the existing `email_cron_secret` Vault entry (all cron routes verify the
same `CRON_SECRET` env), so only a new URL secret is added.

### 1. URL secret

Use the **hub's current prod host**. There is no canonical hub domain:
`behind-the-mask.com` is a DIFFERENT website; the hub runs at
`btm-hub.vercel.app` (Vercel prod) and `preview.behind-the-mask.com`
(Hostinger pilot). Portability comes from the Vault indirection — at a host
change only the secret values change (see the cutover section).

```sql
select vault.create_secret(
  'https://btm-hub.vercel.app/api/cron/conversation-digest',
  'conversation_digest_url',
  'Conversation digest cron endpoint (hub prod host; update at host cutover)'
);
```

> DONE Jul 7 2026: job `conversation-digest` (jobid 3) is scheduled on prod and
> the secret exists (a double-slash typo in the URL was fixed the same day —
> `net.http_get` does not follow redirects, so path typos fail silently).

### 2. Schedule the job (mirrors the live email-drain job's style)

```sql
select cron.schedule(
  'conversation-digest',
  '10 3 * * *',
  $$
  select net.http_get(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'conversation_digest_url'
    ),
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'email_cron_secret'
      )
    )
  );
  $$
);
```

### 3. Verify

```sql
select * from cron.job where jobname = 'conversation-digest';
```

### Rollback (unschedule)

```sql
select cron.unschedule('conversation-digest');
```

## Media archive activation (feat/whatsapp-media-persistence)

YCloud retains attachment bytes for only **30 days** (fetches need the
`X-API-Key` header). The archive pipeline copies them into the private
`whatsapp-media` Storage bucket; the admin media proxy prefers our copy and
answers 410 for media that expired before archiving. In order:

1. **Apply the migration** (`20260707000003_whatsapp_media_archive.sql`:
   bucket + `conversation_media` ledger + seed RPC) via the normal flow
   (`supabase db push`).
2. **Backfill DRY-RUN** — inventory only (counts by contentType, ledger
   status), no fetches, no writes:
   ```
   RUN_WHATSAPP_MEDIA_BACKFILL=1 npx vitest run scripts/whatsapp-media-backfill.test.ts
   ```
3. **Backfill APPLY** — loops the cron's bounded batch function until
   `remaining = 0`; writes a JSON report to `.admin-ai-debug/`. Run this SOON
   after the migration — the 30-day clock is already running, and
   history-synced attachments older than the window will be reported (not
   hidden) as `expired`:
   ```
   RUN_WHATSAPP_MEDIA_BACKFILL=1 BACKFILL_APPLY=1 npx vitest run scripts/whatsapp-media-backfill.test.ts
   ```
4. **Prod scheduling** — new URL secret + daily job (10 min after the digest
   job; reuses `email_cron_secret`):
   ```sql
   select vault.create_secret(
     'https://btm-hub.vercel.app/api/cron/whatsapp-media-archive',
     'whatsapp_media_archive_url',
     'WhatsApp media archive cron endpoint (hub prod host; update at host cutover)'
   );

   select cron.schedule(
     'whatsapp-media-archive',
     '20 3 * * *',
     $$
     select net.http_get(
       url := (
         select decrypted_secret from vault.decrypted_secrets
         where name = 'whatsapp_media_archive_url'
       ),
       headers := jsonb_build_object(
         'Authorization',
         'Bearer ' || (
           select decrypted_secret from vault.decrypted_secrets
           where name = 'email_cron_secret'
         )
       )
     );
     $$
   );
   ```
   Verify: `select * from cron.job where jobname = 'whatsapp-media-archive';`
   Rollback: `select cron.unschedule('whatsapp-media-archive');`

Prod env prerequisite: `YCLOUD_API_KEY` must be set wherever the cron route
runs, or the batch throws (fail loud) and the run does nothing.

## Contact AI-summary activation (feat/ai-visibility-and-summaries)

Per-contact AI summaries (queue task 1c): one CRM summary per eligible
contact, regenerated only when the rendered card's content hash changes.
Requires `ADMIN_AI_PROVIDER=deepseek` + `DEEPSEEK_API_KEY` wherever it runs.
**Activation gate (owner):** audit the first batch's summaries on a few
contact pages (include a declined and a committed contact) before scheduling —
this is the calibration round; the contact-scope eval questions remain open
(see the queue doc).

1. **Apply the migration** (`20260707000005_contact_ai_summaries.sql`).
2. **DRY-RUN** (hash check only — no model calls, no writes):
   ```
   RUN_CONTACT_AI_SUMMARIES=1 SUMMARIES_DRY_RUN=1 npx vitest run scripts/contact-ai-summaries-backfill.test.ts
   ```
3. **GENERATE** (~300 contacts ≈ $0.5–1 cold):
   ```
   RUN_CONTACT_AI_SUMMARIES=1 npx vitest run scripts/contact-ai-summaries-backfill.test.ts
   ```
4. **Audit** the summaries in the contact pages' "AI conversation memory"
   section, then schedule nightly — 20 min after the digest job so fresh
   digests are already inside the summarized card:
   ```sql
   select vault.create_secret(
     'https://btm-hub.vercel.app/api/cron/contact-ai-summaries',
     'contact_ai_summaries_url',
     'Contact AI-summary cron endpoint (hub prod host; update at host cutover)'
   );

   select cron.schedule(
     'contact-ai-summaries',
     '30 3 * * *',
     $$
     select net.http_get(
       url := (
         select decrypted_secret from vault.decrypted_secrets
         where name = 'contact_ai_summaries_url'
       ),
       headers := jsonb_build_object(
         'Authorization',
         'Bearer ' || (
           select decrypted_secret from vault.decrypted_secrets
           where name = 'email_cron_secret'
         )
       )
     );
     $$
   );
   ```
   Verify: `select * from cron.job where jobname = 'contact-ai-summaries';`
   Rollback: `select cron.unschedule('contact-ai-summaries');`

## Hostinger cutover note

At the Vercel → Hostinger cutover `btm-hub.vercel.app` dies, so **ALL FOUR**
cron URL secrets must be updated to the hub's new domain (whatever is chosen
at cutover) — the schedules and routes themselves stay put:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'conversation_digest_url'),
  'https://NEW-HUB-DOMAIN/api/cron/conversation-digest'
);
select vault.update_secret(
  (select id from vault.secrets where name = 'email_drain_url'),
  'https://NEW-HUB-DOMAIN/api/cron/email-drain'
);
select vault.update_secret(
  (select id from vault.secrets where name = 'whatsapp_media_archive_url'),
  'https://NEW-HUB-DOMAIN/api/cron/whatsapp-media-archive'
);
select vault.update_secret(
  (select id from vault.secrets where name = 'contact_ai_summaries_url'),
  'https://NEW-HUB-DOMAIN/api/cron/contact-ai-summaries'
);
```

Verify each with a no-auth curl (expect **401** — a 404 or 308 means a wrong
path or a redirecting host; `net.http_get` does not follow redirects), and the
next day check `select * from cron.job_run_details order by start_time desc
limit 5;`.

Also required at webhook re-enable time: prod env needs
`ADMIN_AI_PROVIDER=deepseek` + `DEEPSEEK_API_KEY`, or digest extraction falls
back to the OpenAI default and fails nightly once new messages flow.

## matched_via naming

The two matchers write different `matched_via` values, intentionally, so
backfilled links stay auditable/reversible separately from live ones — **the
owner should confirm this is the desired convention** (the backfill dry-run
prints the existing distinct `matched_via` values first):

- **Live webhook** (`matchContactByDigits`): exact matches keep the source via
  (e.g. `contact.phone`, `application:<id>.phone`); suffix matches write
  `suffix9:<source>` (e.g. `suffix9:contact.phone`).
- **Backfill script**: every linked row gets `matched_via = 'phone_backfill'`.

## Recalibration wipe

To re-digest the whole corpus under a changed taxonomy (e.g. after tuning the
profile/status/noise rules or the prompt), delete the derived rows and re-run
the drain. The digest watermark (`max(window_end)` per contact in
`list_undigested_conversation_messages`) derives from `conversation_digests`, so
deleting the digests resets it and every window is reprocessed.

```sql
-- Order matters if FKs demand it: facts reference message ids, digests reference
-- message ids; delete the derived tables first, leaving conversation_messages.
delete from public.conversation_facts;
delete from public.conversation_digests;
```

Then re-run the backlog drain until `remainingWindows = 0`:

```
RUN_CONVERSATION_DIGEST_BACKLOG=1 npx vitest run scripts/conversation-digest-backlog.test.ts
```

Embeddings are keyed by content hash and are NOT wiped here — they are message
embeddings, independent of the digest taxonomy, and stay valid.
