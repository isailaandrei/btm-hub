# Admin Email Operations

This branch implements the CRM-style admin email workflow with Maily templates,
Brevo/fake providers, recipient tracking, and newsletter unsubscribe support.

## Environment

Required for local testing:

```bash
EMAIL_PROVIDER=fake
EMAIL_FROM_EMAIL=owner@behind-the-mask.com
EMAIL_FROM_NAME="Behind The Mask"
EMAIL_REPLY_TO_EMAIL=owner@behind-the-mask.com
OWNER_EMAIL_FORWARD_TO=owner@behind-the-mask.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`EMAIL_PROVIDER` is intentionally required before sending. `fake` is available
for local testing only and is rejected when `VERCEL_ENV=production` or
`EMAIL_REQUIRE_REAL_PROVIDER=true`.

Required for Brevo testing:

```bash
EMAIL_PROVIDER=brevo
BREVO_API_KEY=...
BREVO_WEBHOOK_TOKEN=<high-entropy-random-token>
EMAIL_WORKER_SECRET=<high-entropy-random-token>
```

`NEXT_PUBLIC_SITE_URL` controls public links inside emails, such as unsubscribe
URLs. `EMAIL_WORKER_ORIGIN` can be set separately if the worker callback should
target a specific deployment; otherwise the app uses the current Vercel
deployment URL when available.

## Brevo Webhook

Configure the Brevo transactional webhook URL as:

```text
https://<domain>/api/email/webhooks/brevo?token=<BREVO_WEBHOOK_TOKEN>
```

The route fails closed:

- no `BREVO_WEBHOOK_TOKEN` configured: `404`
- wrong token: `401`
- malformed JSON: `400`

Brevo events are correlated by provider message ID. Do not rely on email +
subject matching.

## Sending

The admin UI saves an email draft first. Sending queues recipient rows and then
processes claimed chunks idempotently:

```text
pending -> queued -> sending -> sent/failed
```

The worker path uses the Supabase admin client so it does not depend on a live
admin browser session. The internal route is available at:

```text
POST /api/admin/email/process
Header: x-email-worker-secret: <EMAIL_WORKER_SECRET>
Body: { "sendId": "<uuid>" }
```

The current UI also starts processing after confirmation for a few-hundred-per-
month workflow. If more recipients remain after one invocation and
`EMAIL_WORKER_SECRET` is configured, the worker route triggers the next chunk.
If volume grows beyond low CRM usage, keep the tables and replace the trigger
with a durable external queue.

## Broadcast Compliance

Broadcast emails automatically append a newsletter unsubscribe footer and store
a hashed unsubscribe token on each recipient. The public unsubscribe route only
sets newsletter preferences:

```text
/email/unsubscribe/<token>
```

Outreach ignores newsletter unsubscribe preferences but still respects active
suppressions.

## Assets

Email images use the public `email-assets` storage bucket:

- public read for email clients
- admin-only object listing/upload/update/delete
- opaque storage paths; original filenames are kept only in the admin asset row
- 5 MB max
- JPEG, PNG, GIF, and WebP only

## Current Limits

- No scheduled sends.
- Replies go to the owner inbox via Reply-To; the CRM does not ingest replies.
- Existing application notification emails remain separate from this CRM email
  workflow.
