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

Use the **canonical domain** (e.g. `https://behind-the-mask.com/...`), NOT a
host-specific URL — that is what makes this Hostinger-portable.

```sql
-- Placeholder value: replace with the real canonical prod URL at deploy time.
select vault.create_secret(
  'https://REPLACE-WITH-CANONICAL-DOMAIN/api/cron/conversation-digest',
  'conversation_digest_url',
  'Conversation digest cron endpoint (canonical domain; updated at host cutover)'
);
```

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

## Hostinger cutover note

At the Vercel → Hostinger cutover, only the URL Vault value changes — the
schedule and route stay put. If the URL secret already holds the canonical
domain and DNS moves with it, nothing changes. Otherwise update the value:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'conversation_digest_url'),
  'https://NEW-CANONICAL-DOMAIN/api/cron/conversation-digest'
);
```

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
