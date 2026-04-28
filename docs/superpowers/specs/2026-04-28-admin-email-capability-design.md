# Admin Email Capability Design

Date: 2026-04-28

## Scope

BTM Hub will add a CRM-owned email capability for the admin dashboard. This is a full feature design, not a minimal v1, but implementation should still be phased so each risky subsystem can be verified before the next one depends on it.

The feature covers:

- Broadcast/newsletter campaigns sent to all eligible contacts by default.
- Selected outreach campaigns sent to contacts chosen from the CRM table.
- One-off email from a contact detail page.
- BTM Hub-managed email templates using a shared visual builder.
- BTM Hub-managed image/assets library for email templates.
- Preview-required send workflow with optional test sends.
- Opens, clicks, bounces, failures, spam complaints, unsubscribes, and replies.
- Inbound reply capture in BTM Hub and mandatory forwarding to the owner's existing Hostinger mailbox.
- Contact timeline integration and auditable append-only email events.

The feature does not include scheduled sending, a full email inbox UI, mailbox folders, IMAP synchronization, read/unread state, or general-purpose email-client behavior.

## Product Decisions

BTM Hub owns the email product. The provider is delivery infrastructure behind an adapter, not the source of truth for templates, contacts, recipients, reporting, or CRM history.

Broadcast and outreach have different eligibility rules:

- Broadcast sends to all contacts with an email address unless they are newsletter-unsubscribed or globally suppressed.
- Outreach sends to selected contacts unless they are globally suppressed.
- One-off email sends to one contact unless that contact is globally suppressed.

Unsubscribe and suppression are separate concepts:

- Newsletter unsubscribe blocks broadcast/newsletter sends only.
- Global suppression blocks all email. Suppression can come from hard bounces, spam complaints, invalid addresses, explicit do-not-contact requests, or a manual admin action from the contact profile.

All send types use the same template/builder system. One-off email is modeled as a campaign with `kind = 'one_off'` and exactly one recipient, so it gets the same preview, rendering, event tracking, reply capture, forwarding, and audit behavior.

Replies are CRM-tracked but BTM Hub is not an email client. Inbound replies are captured through the provider webhook, linked to the contact/campaign/recipient, shown in CRM history, and always forwarded to the owner's existing Hostinger mailbox. The owner continues human follow-up from their normal mailbox. A later "send follow-up" CRM action can use the same one-off email path without building inbox features.

## Provider Strategy

Use an internal `EmailProvider` adapter so the application owns a stable contract:

- `sendEmail`
- `sendBatch`
- `forwardInboundReply`
- `parseWebhook`
- `verifyWebhookSignature`
- `normalizeEvent`
- `normalizeInboundReply`

Provider-specific payloads and IDs remain stored for audit/debugging, but the rest of the app consumes normalized records.

Default provider for implementation: Postmark. It is a clean fit for CRM-style sending, inbound processing, message streams, webhooks, open/click tracking, bounces, spam complaints, and simpler operations at a few hundred emails per month.

Fallback provider order:

1. Mailgun if Postmark account, DNS, inbound routing, or forwarding constraints block the required workflow.
2. Resend if its inbound and tracking features are a better fit at implementation time.
3. SendGrid only if the project later wants a heavier marketing-platform surface.

The implementation should not depend on provider-native campaign/audience state. Contacts, templates, campaigns, recipients, suppressions, replies, and reporting stay in BTM Hub.

## DNS And Mailbox Setup

The website can remain hosted on Vercel while email remains hosted by Hostinger. Web and mail use different DNS records.

Default domain layout:

- Root domain and website records continue pointing at Vercel.
- Existing owner mailbox stays on Hostinger with Hostinger MX/SPF/DKIM/DMARC records preserved.
- Sending provider gets `mail.behind-the-mask.com`.
- Reply ingestion gets `replies.behind-the-mask.com`.
- Tracking links use `links.behind-the-mask.com`.

The implementation should avoid taking over the root domain's MX records for inbound CRM processing because that could disrupt the owner's Hostinger mailbox.

All promotional/broadcast email should include proper SPF, DKIM, DMARC alignment, a physical mailing address, a visible unsubscribe link, and one-click unsubscribe headers through provider-native support or custom email headers.

## Visual Builder And Templates

Use a self-hosted/open-source builder by default, with the integration hidden behind a local builder adapter.

Default builder path:

- Start with GrapesJS plus MJML.
- Store builder JSON and rendered output in BTM Hub.
- Keep the adapter boundary clean enough to move to a paid SDK later if the self-hosted editor fails rendering or maintenance expectations.

Templates are versioned. Draft edits never mutate the immutable version that a previous campaign used. A sent campaign references the exact template version and rendered snapshots used at send time.

Template records should support:

- Name, category, status, and description.
- Default subject and preview text.
- Builder JSON.
- Rendered HTML and plain text.
- Asset references.
- Version history.
- Created/updated/published audit metadata.

The builder must support variables, at minimum:

- Contact name.
- Contact email.
- Program/application context when available.
- Unsubscribe URL for broadcast/newsletter sends.
- Reply tracking metadata handled outside visible body content.

AI-generated sections should be represented as explicit blocks or variables in the template model, but AI generation itself can be implemented after the core email system is stable.

## Email Assets

BTM Hub manages email images by default. External image URLs are allowed as an advanced escape hatch, but the preferred workflow is upload/select from the BTM Hub asset library.

Use a dedicated public Supabase Storage bucket named `email-assets`, because email clients cannot load private authenticated assets.

Each asset stores:

- Storage path and public URL.
- MIME type.
- File size.
- Dimensions.
- Original filename.
- Created-by metadata.
- Usage references when practical.

Guardrails:

- Allow JPEG, PNG, and GIF. Reject SVG and arbitrary files.
- Enforce a 5 MB original upload limit.
- Resize/compress oversized images before use, targeting email-safe widths and sub-500 KB rendered assets where possible.
- Do not delete assets referenced by sent campaigns.
- Record asset references in template versions and campaign snapshots for auditability.

## Data Model

Primary tables:

- `email_templates`: template identity, status, category, builder type, current version, and audit fields.
- `email_template_versions`: immutable template versions with builder JSON, rendered HTML, rendered text, subject defaults, preview metadata, and asset references.
- `email_assets`: uploaded image/media records for the visual builder.
- `email_campaigns`: one record per send effort with `kind = 'broadcast' | 'outreach' | 'one_off'`, template version, subject/from/reply-to, status, aggregate counts, and audit fields.
- `email_campaign_recipients`: one row per recipient per campaign.
- `email_events`: append-only normalized event log.
- `email_suppressions`: global all-email suppression records.
- `contact_email_preferences`: newsletter/broadcast unsubscribe state.
- `email_replies`: parsed inbound replies linked to contact, campaign, recipient, raw provider reference, body snippets, attachments metadata, and forwarding status.

`email_campaign_recipients` is required because delivery is per recipient, not per campaign. Each recipient has their own contact snapshot, email address snapshot, personalization snapshot, provider message ID, send status, bounce/open/click/reply history, and errors. This table is the join point between provider events and CRM contact history.

The contact timeline should merge manual `contact_events` with email-derived timeline items from `email_campaign_recipients`, `email_events`, and `email_replies`. Do not duplicate every provider webhook into `contact_events`; keep provider activity in the email tables and render it as part of the timeline query/view.

## Status And Event Model

Campaign statuses:

- `draft`
- `previewed`
- `queued`
- `sending`
- `sent`
- `partially_failed`
- `failed`

Recipient statuses:

- `pending`
- `skipped_unsubscribed`
- `skipped_suppressed`
- `queued`
- `sent`
- `delivered`
- `delivery_delayed`
- `opened`
- `clicked`
- `bounced`
- `complained`
- `failed`
- `replied`

Recipient status is a summary. `email_events` is the source of truth. Webhook events are at-least-once and may arrive out of order, so ingestion must be idempotent using provider event IDs or webhook delivery IDs when available, and event timestamps must be preserved.

Open tracking should be reported as approximate because image loading, caching, and privacy protections can inflate or hide opens. Clicks are a stronger engagement signal but can still include security scanner activity. Reporting copy should avoid overstating precision.

## Send Workflows

### Broadcast

1. Admin opens Email Studio and creates a broadcast campaign.
2. Admin selects a template version or creates one in the visual builder.
3. System resolves all contacts with usable email addresses.
4. System excludes newsletter-unsubscribed contacts and globally suppressed contacts.
5. Admin sees recipient count, exclusions, subject, preview, and warnings.
6. Admin may send a test email.
7. Admin confirms.
8. System creates queued recipient rows and sends through the provider in idempotent chunks.
9. Provider webhooks update event history and reporting.

### Selected Outreach

1. Admin selects contacts from the existing CRM contacts table.
2. Bulk action opens an email draft in Email Studio.
3. Admin selects or edits a template.
4. System excludes globally suppressed contacts only.
5. Admin previews recipient count, exclusions, personalization, and content.
6. Admin may send a test email.
7. Admin confirms and the same chunked send/event pipeline runs.

### One-Off Contact Email

1. Admin opens a contact profile.
2. Admin chooses a "Send email" action.
3. Email Studio opens in a single-recipient mode with the same template/builder system.
4. System blocks send if the contact is globally suppressed or lacks a usable email.
5. Admin previews and confirms.
6. System sends through the same pipeline and records the activity in the contact timeline.

For all send types, there is no owner-facing scheduled sending. The internal queue exists only to avoid request timeouts, enable retries, and preserve per-recipient status.

## Reply Handling

Outbound messages use reply-tracking metadata, either through unique reply addresses or provider-supported metadata that lets inbound replies map back to `email_campaign_recipients`.

Inbound reply flow:

1. Recipient replies to the message.
2. Provider receives the reply on the inbound subdomain.
3. Provider posts an inbound webhook to BTM Hub.
4. BTM Hub verifies the webhook, stores the raw event reference, parses sender/recipient/subject/body/attachments metadata, and links the reply to contact/campaign/recipient.
5. BTM Hub appends normalized `email_events` and creates/updates the contact timeline projection.
6. BTM Hub forwards the reply to the owner's Hostinger mailbox.
7. BTM Hub records the forwarding attempt and status.

Forwarding to Hostinger is mandatory. If forwarding fails, the reply remains stored in BTM Hub and the failure is visible in admin reporting so the owner can recover.

Inbound attachment binaries are not stored in BTM Hub by default. Store attachment metadata and provider references, and preserve attachments in the forwarded copy to Hostinger when the provider payload supports it.

## Admin UI

Add an Email tab/studio to the admin dashboard. It owns:

- Template list.
- Template editor/visual builder.
- Asset library.
- Campaign drafts.
- Campaign history.
- Campaign reporting.
- Suppression/preference visibility.

Add contact-list integration:

- Bulk-selected contacts can launch selected outreach.
- Contacts table can show email eligibility/status indicators later if useful.

Add contact-detail integration:

- "Send email" one-off action.
- Email activity in timeline.
- Inbound replies in timeline.
- Newsletter preference state.
- Manual global suppression action with a reason.

Keep Email Studio functional and work-focused. This is an admin CRM tool, not a marketing landing page.

## API And Server Boundaries

Follow existing BTM Hub admin patterns:

- Server components fetch initial admin data.
- Client components are used only for interactive builder/editor surfaces and admin controls.
- Server actions live near admin routes and call `requireAdmin`.
- Inputs are validated with Zod.
- Server actions return structured form state where used by forms.
- Data fetchers live under `src/lib/data/`.
- Provider calls stay server-side only.
- Secrets never enter client components.
- Mutations revalidate affected admin routes.

Webhook endpoints should be route handlers under an admin/provider namespace, but they must not require an admin session. They authenticate using provider signatures/secrets instead.

Recommended internal modules:

- `src/lib/email/provider/`
- `src/lib/email/rendering/`
- `src/lib/email/tracking/`
- `src/lib/data/email-*`
- Admin UI under `src/app/(dashboard)/admin/email/` or a feature folder consistent with the existing admin structure.

## Compliance And Deliverability

The system should include:

- SPF/DKIM/DMARC setup checklist in admin/operator documentation.
- One-click unsubscribe headers for broadcast/newsletter email.
- Visible unsubscribe link in broadcast/newsletter templates.
- Physical postal address block for commercial/broadcast email.
- Global suppression for hard bounces and complaints.
- Manual global suppression on the contact profile.
- Clear exclusion counts before send.
- No sending to globally suppressed contacts.
- Rate-limited/batched sending even at low volume.

At a few hundred emails per month, a dedicated IP and enterprise campaign infrastructure are unnecessary. A reputable shared sending pool with correct domain authentication is the better starting point.

## Error Handling

Send confirmation should never assume all recipients succeeded. The send process should create recipient rows first, then mark each recipient according to what happened.

Failure cases to handle:

- Missing/invalid contact email.
- Newsletter-unsubscribed broadcast recipients.
- Globally suppressed recipients.
- Provider API send failure.
- Provider webhook duplicate.
- Provider webhook out of order.
- Unknown provider message ID.
- Inbound reply that cannot be matched.
- Forward-to-Hostinger failure.
- Asset upload/type/size failure.
- Template rendering failure.

Unknown inbound replies should be stored in an unmatched state for admin review rather than discarded.

## Testing

Unit tests:

- Eligibility filtering for broadcast, outreach, and one-off sends.
- Suppression/preference rules.
- Template rendering and required variables.
- Provider event normalization.
- Webhook idempotency.
- Reply matching.
- Campaign/recipient status derivation.

Integration tests:

- Create template version.
- Create campaign draft.
- Preview recipients and exclusions.
- Confirm send with a fake provider adapter.
- Ingest delivered/open/click/bounce/reply webhooks.
- Verify contact timeline projections.
- Verify reply forwarding status.

E2E tests:

- Admin creates a template with an image.
- Admin sends selected outreach to test contacts.
- Admin sends one-off email from contact detail.
- Broadcast preview excludes newsletter-unsubscribed and suppressed contacts.
- Manual suppression blocks all send types.

Provider contract tests should run against a fake provider in CI and optionally against sandbox/test credentials locally.

## Implementation Phases

1. Data model and fake provider adapter: migrations, data access, status/event model, timeline projection, and tests.
2. Template and asset foundation: visual builder integration, template versioning, asset uploads, rendering tests.
3. Campaign creation and preview: broadcast/outreach/one-off drafts, recipient eligibility, exclusion reporting.
4. Sending pipeline: confirmation, queue/batch processing, provider adapter, send event persistence.
5. Provider webhooks: delivery, bounce, complaint, open, click, unsubscribe, idempotent ingestion.
6. Inbound replies and mandatory forwarding: reply subdomain, webhook ingestion, matching, timeline entries, forward-to-Hostinger status.
7. Reporting and CRM polish: campaign reports, contact timeline rendering, suppression controls, admin-facing recovery states.
8. AI-ready personalization: introduce explicit AI block placeholders and analyst-generated section workflow after the deterministic email system is stable.

## Required Operational Inputs For Implementation

These are not product design decisions, but they must be supplied during implementation setup:

- Owner mailbox address for mandatory forwarding.
- Physical postal address text for broadcast/commercial footers.
