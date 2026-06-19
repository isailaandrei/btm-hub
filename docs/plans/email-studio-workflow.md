# Email Studio Workflow Redesign — Plan

Status: **design approved, not yet implemented**. This doc is self-contained: a fresh
contributor should be able to build from it without the conversation that produced it.

## 1. Goal (in the admins' words)

Admins create + send emails from **one place**. Every distinct email they send is
auto-kept as a reusable starting point. Sent history is glanceable and tells sends
apart. Recipients can be saved and reused as **lists** and **segments**, and there is
one obvious **exclusion list** that reliably stops email to people who opted out or
were blocked.

## 2. Current state (what already exists — reuse it)

- **One tab group**, not separate routes: `src/app/(admin)/admin/email/email-studio.tsx:45-53`
  renders tabs `Compose · Templates · Sent emails`. Admin area is `/admin?tab=email`.
- **Templates** are versioned: `email_templates` + `email_template_versions`
  (`builder_json` = the Maily document; `html`/`text` rendered snapshots; `asset_ids`).
  Soft-deleted via `status='archived'`. Data in `src/lib/data/email-templates.ts`.
- **Sends** are fully modeled: `email_sends` (snapshots `builder_json_snapshot`,
  `html_preview_snapshot`, subject, all the counts, `metadata` JSONB — currently only
  `{editor:"maily"}`) + `email_send_recipients` (per-recipient status + timeline).
  Send pipeline: `src/lib/email/send-pipeline.ts`; actions in
  `src/app/(admin)/admin/email/actions.ts` (`sendEmailNowAction`, `getComposeRecipientsAction`).
  Provider = **Brevo** (`src/lib/email/provider/brevo.ts`).
- **Recipients today** = `contacts` (M:N tags via `contact_tags` join over `tags`/
  `tag_categories`) **+** `email_manual_recipients` (saved ad-hoc addresses, global/
  admin-shared). Eligibility + skip logic in `src/lib/email/eligibility.ts`.
- **Exclusion machinery exists but has no UI** (two parallel mechanisms):
  - `email_suppressions` — reason enum `hard_bounce | spam_complaint | invalid_address |
    manual | do_not_contact`; `lifted_at`/`lifted_by` for un-suppressing. Blocks **all**
    email. Written by the Brevo webhook (`src/app/api/email/webhooks/brevo/route.ts`) and
    by `suppressEmail()` (`src/lib/data/email-sends.ts:574-595`) — which **nothing in the
    UI calls**. Filtered in eligibility + the `queue_email_send` / `claim_queued_email_recipients` RPCs.
  - `contact_email_preferences.newsletter_unsubscribed_at` — newsletter opt-out, **broadcasts only**.
- **Unsubscribe works end-to-end for broadcasts**: per-recipient hashed token
  (`send-pipeline.ts:63-98,189-192`) → footer link → public route
  `src/app/(marketing)/email/unsubscribe/[token]/` → `unsubscribeNewsletterByToken()`
  (`src/lib/data/email-sends.ts:601-650`) sets `newsletter_unsubscribed_at`, marks the
  recipient, logs an event. **Gaps:** outreach sends have no unsubscribe link; there is
  **no** RFC-8058 `List-Unsubscribe` one-click header.

## 3. Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | Mailing lists model | **Both** static lists + dynamic segments |
| 2 | Lists vs segments in UI | **Two distinct concepts** (Lists = static, Segments = dynamic) |
| 3 | Segment rule expressiveness | **Tags + include/exclude**: match ALL or ANY of [tags], optionally EXCLUDE [tags] |
| 4 | Auto-save sent design as template | **Dedup by content** (no duplicate if identical content already exists) |
| 5 | Dedup scope | **Body/design only** — subject + preview text are per-send, not part of template identity |
| 6 | Sent tab metrics | **Keep all** (delivered/opened/clicked/failed/skipped/unsubscribed) + Details |
| 7 | Sent row identifier | **Date/time + recipient count**, plus audience name once persisted; subject secondary |
| 8 | "Duplicate into Compose" | **Not built** — content reuse via Start-from picker, audience reuse via saved lists |
| 9 | Tabs | **Compose · Sent · Audiences**; Audiences = `Lists · Segments · Excluded`; Templates tab removed |
| 10 | Exclusion scope | **Flat**: excluded = receives no email at all (incl. newsletter unsubscribes) |
| 11 | Unsubscribe reach | **Broadcasts**: keep footer link **+ add `List-Unsubscribe` one-click header**; outreach stays link-free |
| 12 | Exclusion home | **Audiences → Excluded** section + a per-contact do-not-email toggle |
| 13 | Scoping | Lists/segments/exclusions are **global/admin-shared** (matches contacts + manual recipients) |

## 4. Target information architecture

```
Email  ┌ Compose      ← the one authoring + send workspace (Templates folded in here)
       ├ Sent         ← glanceable history, full per-send metrics
       └ Audiences ┌ Lists      (static, editable membership)
                   ├ Segments   (dynamic, tag rule, resolved at send)
                   └ Excluded   (the single exclusion list)
```

## 5. Feature specs

### 5A. Compose — the single workspace
- **Start:** blank, or **"Start from…"** picker = the template library (each deletable).
- **Design:** existing Maily editor + width/padding controls (already built this branch).
- **Recipients panel** unions any of: ad-hoc **tags** · a **List** · a **Segment** ·
  individual **contacts** · **manual** addresses → resolve → **dedup by email** → apply
  exclusions → show the existing eligible/skipped counts (reuse `eligibility.ts`).
- **"Save this selection as a List"** (static snapshot of who's resolved right now).
- **Preview → Send** (existing pipeline).

### 5B. On-send automation
1. Recorded in `email_sends` (already happens).
2. **Persist the audience source** into `email_sends.metadata`, e.g.
   `{ editor:"maily", audience:{ listIds, segmentIds, tagFilter, contactCount, manualCount } }`
   — so Sent rows can show "→ Beginners segment". (New sends only; old sends fall back to date+count.)
3. **Auto-save the design as a template, dedup by content:** compute a stable
   `content_hash` over the normalized `builder_json` (body + layout; subject/preview are
   not in `builder_json`, so "body-only" is automatic). If no non-archived
   `email_template_versions.content_hash` matches → create a template (name defaulted from
   the subject, editable) + first version. If it matches → reuse, create nothing.
4. Offer **"Save these recipients as a List"** (static snapshot).

### 5C. Sent tab
- **Keep** all metrics + the Details expand (recipient diagnostics) + Refresh +
  auto-refresh-while-sending + delete (draft/queued/failed).
- **Change the row's leading label** from the (always-identical) subject to:
  **`{date, time} · {N} recipients`**, plus the **audience name** when
  `metadata.audience` is present (e.g. "Beginners segment · 142 · Jun 18, 2:30 pm"); show
  the subject as secondary text. Fixes the "every row says Hello {{contact.name}}" problem.

### 5D. Audiences → Lists (static)
- New tables `email_lists` (id, name, description, created_by/at, updated_by/at) +
  `email_list_members` (list_id, **contact_id** *or* **manual_recipient_id**, email
  snapshot, added_at). A member is a contact or a manual recipient.
- Create empty + add members; save from a Compose selection; save after a send.
- **Editable** (add/remove); membership does **not** drift when tags change. Show count.

### 5E. Audiences → Segments (dynamic)
- New table `email_segments` (id, name, description, **rule** JSONB, created_by/at).
  `rule = { match: 'all' | 'any', includeTagIds: uuid[], excludeTagIds: uuid[] }`.
- Contacts only (manual recipients have no tags). Resolved at **send time** (always
  current). Show a live "matches ~N contacts" preview in the builder and picker.

### 5F. Audiences → Excluded (flat exclusion) + unsubscribe
- **Single authoritative gate via `email_suppressions`.** Add enum value `unsubscribe`.
  - On unsubscribe (`unsubscribeNewsletterByToken`) → **also write an active suppression**
    (reason `unsubscribe`). Keep setting `newsletter_unsubscribed_at` as source/history.
  - Manual exclude → write a suppression (reason `manual`/`do_not_contact`).
  - Because eligibility + `queue_email_send` + `claim_queued_email_recipients` already
    filter active suppressions for **both** send kinds, flat blocking falls out with
    minimal new logic. (Verify outreach path honors it; add the filter if any path skips it.)
- **Excluded UI** (Audiences → Excluded): rows of `who · reason (Unsubscribed / Bounced /
  Spam complaint / Invalid address / Manually excluded) · date · source (email link /
  provider:brevo / admin) · [Remove]` (Remove = set `lifted_at`/`lifted_by`).
- **Per-contact do-not-email toggle** on the contact page (`src/app/(admin)/admin/contacts/[id]/`)
  — writes/lifts a manual suppression; shows current status + reason.
- **Deliverability:** add `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  headers to broadcast sends (pointing at the existing token route / a POST variant).
- **Copy fix (truth-in-labeling):** the footer + confirmation page currently say
  "Unsubscribe from newsletters" — with flat semantics this stops *all* email. Update copy
  to say so plainly.

### 5G. Templates
- Auto-saved from sends (dedup by `content_hash`), name editable, deletable (archive).
- Surfaced **only** as the Compose "Start from…" picker. No tab.

## 6. Data-model changes (migrations required)

This is the first part of the email feature that genuinely needs schema (can't live in
`builder_json`). After each migration: test locally, then `supabase db push`.

- `email_lists`, `email_list_members` (new).
- `email_segments` (new; `rule` JSONB).
- `email_template_versions.content_hash text` + index (for dedup lookup).
- `email_suppression_reason` enum: add value `unsubscribe`.
- RPC updates if needed so outreach also respects the unified exclusion gate
  (`queue_email_send`, `claim_queued_email_recipients`, `eligibility.ts`).
- No schema change for audience persistence — reuse `email_sends.metadata` JSONB.

## 7. Suggested build order (phases are loosely coupled)

- **Phase 1 — IA + content reuse.** Merge Compose+Templates → Compose with "Start from…"
  picker; remove Templates tab; auto-save-on-send dedup (`content_hash`); persist audience
  source; relabel Sent rows. (Highest-priority ask; mostly UI + reuse + one column.)
- **Phase 2 — Exclusions first-class.** Enum + unsubscribe/manual → suppression (flat);
  Audiences tab shell + Excluded section; per-contact toggle; `List-Unsubscribe` header;
  copy fix. (Correctness/compliance; mostly surfaces existing data.)
- **Phase 3 — Static Lists.** Tables + UI + recipient source + save-from-selection +
  save-after-send.
- **Phase 4 — Dynamic Segments.** Table + rule builder + live count + resolve-at-send.

## 8. Open items / risks

- **Branch dependency:** this builds on the Maily editor work in
  `feat/email-studio-improvements`. Either merge that to `main` first and branch off main,
  or branch the new work off `feat/email-studio-improvements`.
- Old sends have no `metadata.audience` → Sent rows fall back to date + count (acceptable).
- Un-excluding someone is a consent action — keep it a deliberate admin click, no bulk un-exclude.
- Test the `List-Unsubscribe` one-click header against Gmail/Yahoo before relying on it.
