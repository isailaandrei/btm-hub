# Admin Email Operations

This runbook covers production setup for the BTM Hub admin email capability.

## Required Environment Variables

- `EMAIL_PROVIDER=postmark`
- `POSTMARK_SERVER_TOKEN`
- `OWNER_EMAIL_FORWARD_TO`
- `POSTMARK_WEBHOOK_TOKEN` or `POSTMARK_WEBHOOK_BASIC_AUTH_USER` and `POSTMARK_WEBHOOK_BASIC_AUTH_PASSWORD`

Optional overrides:

- `POSTMARK_BROADCAST_MESSAGE_STREAM`, defaults to `broadcast`
- `POSTMARK_TRANSACTIONAL_MESSAGE_STREAM`, defaults to `outbound`
- `POSTMARK_FORWARD_FROM`, defaults to `BTM Replies <noreply@mail.behind-the-mask.com>`

## DNS

- Website hosting remains on Vercel.
- Hostinger MX records stay on the root domain so the owner keeps using the existing `@behind-the-mask` mailbox.
- Postmark sending domain: `mail.behind-the-mask.com`.
- Reply inbound domain: `replies.behind-the-mask.com`.
- Tracking domain: `links.behind-the-mask.com`.

## Required Provider Features

- SPF, DKIM, and DMARC alignment for `mail.behind-the-mask.com`.
- Open tracking.
- Link tracking.
- Bounce and complaint webhooks.
- Delivery, open, and click webhooks.
- Inbound reply webhook.
- One-click unsubscribe support for broadcast/newsletter mail.

## Webhook URLs

- Outbound events: `https://<production-domain>/api/email/webhooks/postmark`
- Inbound replies: `https://<production-domain>/api/email/webhooks/postmark`

Configure either a custom `x-postmark-webhook-token` header matching `POSTMARK_WEBHOOK_TOKEN`, or Postmark basic HTTP auth matching the configured basic-auth env vars.

## Manual Checks Before First Real Send

1. Send a test email to a Gmail account.
2. Confirm SPF, DKIM, and DMARC pass in message headers.
3. Confirm tracked links use `links.behind-the-mask.com`.
4. Reply to the message and confirm the reply appears in BTM Hub.
5. Confirm the reply is forwarded to `OWNER_EMAIL_FORWARD_TO`.
6. Trigger an unsubscribe test and confirm broadcast eligibility excludes that contact.
7. Trigger a hard-bounce or complaint test in Postmark and confirm the email becomes suppressed for outreach and one-off sends.

## Operator Workflow

- Use broadcast campaigns only for newsletter-style mail. Newsletter unsubscribes exclude contacts from future broadcasts.
- Use outreach and one-off emails for owner-initiated CRM messages. These ignore newsletter unsubscribe state, but still respect global suppressions.
- Replies are not answered inside BTM Hub. They are stored on the contact timeline and forwarded to the owner mailbox.
- If forwarding fails, the contact timeline marks the reply with `Forward failed`; retry or handle directly from Postmark/owner mailbox.
