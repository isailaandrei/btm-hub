# Opus-solo task queue

Self-contained tasks deliberately deferred from the Jul 6–7 2026 Fable session
(usage rationing). Each is executable by a plain Opus session without
back-and-forth. Work on a feature branch off main; commit locally; never push
without Andrei's approval; run gates (tsc, affected vitest suites, eslint)
before committing. Do not touch `.env*` files or `.admin-ai-debug/` (PII).

---

## 1. AI-visibility badges in the WhatsApp thread

**Goal:** admins see, per message in the contact-page WhatsApp thread, whether
the AI sees it — the calibration surface for the digest taxonomy. V1 is
READ-ONLY (no override actions).

**Context you need:**
- The AI never reads raw messages; it reads `conversation_digests` rows
  (window summaries) + `conversation_facts`. Digests are built per contact from
  INBOUND, matched, non-deactivated messages, in session windows (30-min gap,
  see `src/lib/conversations/digests.ts`).
- Digest columns that matter: `contact_id`, `window_start`, `window_end`,
  `is_noise` (noise marker rows have empty summaries), `relevance`
  (`'profile' | 'status'`, null on noise rows), `summary`.
- The AI card loader keeps: `is_noise = false AND (relevance = 'profile' OR
  window_end >= now() - 45 days)`. The 45 is the exported constant
  `STATUS_DIGEST_FRESHNESS_DAYS` (in `src/lib/data/contact-cards.ts` after the
  calibration round lands — verify name/location).
- The thread component is `ContactWhatsAppSection` (contact detail page, main
  column). It is a client component with Supabase Realtime append. Do NOT
  modify `contacts-filters.tsx`, `contacts-panel-view-model.ts`,
  `search-helpers.*` (another workstream owns them).

**Build:**
1. Extend the section's data path to also load the contact's digests
   (window bounds, is_noise, relevance, summary). Compute a per-message state
   by bucketing `happened_at` into windows (all messages in a window share its
   fate):
   `profile` (in AI memory permanently) · `status-fresh` (visible until
   window_end + 45d — compute the date) · `status-aged` (aged out on date) ·
   `noise` (filtered) · `pending` (inbound+matched, not yet digested) ·
   `excluded` (outbound / unmatched / deactivated — never shared with AI).
2. Badge on each bubble (Sparkles icon variants: solid = profile,
   outlined/amber = status-fresh, muted = aged/noise; subtle marker or nothing
   for excluded/pending). Tooltip shows the state in words AND the digest
   `summary` (what the AI actually holds for that exchange). Compact legend in
   the section header.
3. Server/client discipline: compute states where the section already gets its
   data; no server-only imports into the client component.

**Tests:** bucketing + all six states incl. boundaries (message at window edge,
newer than last window = pending, outbound = excluded); loader filter untouched;
badge/tooltip render smoke.

---

## 1b. Conversation summaries on the contact detail page

**Goal (Andrei, Jul 7):** show the AI's conversation digests on the contact
detail ("contact id") page so admins can check that the summaries make sense —
same visibility/calibration motive as the badges. Natural companion to task 1
(one session can do both).

**Build:** a read-only "AI conversation memory" section on the contact detail
page listing that contact's signal digests (`is_noise = false`), newest first:
date range, summary text, a `profile`/`status` chip, and for status digests the
expiry date (`window_end + STATUS_DIGEST_FRESHNESS_DAYS`; render aged-out ones
muted with "no longer visible to AI"). Optionally list the contact's
`conversation_facts` (field label + value + confidence) under it — that is the
AI's structured memory. Follow the existing contact-page section conventions
(server component if the page's sections are server-rendered; check how
sibling sections load data). Empty state: "No WhatsApp conversation signal
yet." Do not change any write path.

---

## 1c. Per-contact AI summaries (+ email ingestion groundwork)

**Goal (Andrei, Jul 7):** an AI-written summary for each contact, refreshed
when the contact's data changes — later usable as context for email drafting.

**Why this is easy:** the pipeline already has a CONTACT scope (one ~4k-token
card, no planner/map-reduce; `scope: "contact"` branch in
`src/lib/admin-ai/prompt.ts`, `contactAssessment` response shape, contact-scope
path in `orchestrator.ts`). A summary is a fixed question through that path.

**Build:**
1. A summarization prompt/question for the contact scope (what a CRM admin
   needs at a glance: who they are, program interest + decision state, budget/
   constraints, skills, relationship notes, open questions).
2. Storage: `contact_ai_summaries` (contact_id, summary, card_content_hash,
   model, generated_at). Staleness by CONTENT HASH of the rendered card —
   same idempotency pattern as `conversation_digests` (`buildDigestContentHash`
   in `src/lib/conversations/digests.ts`); regenerate only when the hash
   changes (new note/tag/digest/application).
3. Batch: gated live script (pattern: `scripts/conversation-digest-backlog.
   test.ts`) for the initial pass (~300 contacts ≈ $0.5–1 cold), then a
   bounded nightly cron route + pg_cron/Vault scheduling (pattern:
   `docs/plans/whatsapp-ingestion-runbook.md` §Scheduling).
4. Render on the contact detail page (pairs with task 1b).
5. **Before shipping: add contact-scope eval questions** — the current 9-question
   suite is global-only. Minimum: summary reflects decline/commitment status,
   cites only real evidence, never imports other contacts' details. Same
   runtime-derived-truth discipline (see `docs/admin-ai-handbook.md` §4).

**Owner decisions needed first:** where summaries render; refresh cadence;
whether summaries feed back into the GLOBAL corpus (recommend NO initially —
avoid AI-reading-AI loops).

**Email ingestion (second phase, design-sketched):** the conversations layer
is multi-source by design (`ConversationSource`, `src/lib/conversations/
ingestion/adapter.ts` — WhatsApp is just the first adapter). Emails become a
second adapter: match by exact email address (easier than phones), feed the
SAME windowing → profile/status/noise taxonomy → digests/facts pipeline;
everything downstream (45-day status expiry, card rendering, visibility UIs)
works unchanged. Owner decisions first: which mailbox/provider supplies
inbound email, and the inbound-only analog (whose words count as evidence).

---

## 2. Staged-progress UI for admin-AI map-reduce waits

**Goal:** global admin-AI answers take 15–110s (map scan over ~11 chunks +
reduce). The user currently stares at a spinner. Show live stage progress.

**Context you need:**
- Pipeline: `runGlobalSynthesis` in `src/lib/admin-ai/orchestrator.ts` —
  constraint planner → prefilter → (map scan over 30-card chunks, see
  `src/lib/admin-ai/map-scan.ts`, which already emits `adminAiDebugLog
  ("map-chunk", {chunkIndex, cardCount, candidateCount, ...})` per chunk) →
  reduce (one `provider.generate` call) → post-processing.
- The answer flow runs inside a server action; the client (admin-ai page)
  awaits it. There is currently NO channel reporting progress mid-run.

**Design freedom (choose the simplest that fits the codebase):** e.g. write
progress events (stage, chunkNo/chunkTotal, candidateCount) to a small table or
to the pending assistant message's metadata keyed by thread id, and poll from
the client every ~2s while the answer is pending; or use Supabase Realtime.
Stages worth showing: "Planning constraints" → "Scanning contacts (chunk i/N,
X candidates)" → "Analyzing candidates" → done. Failure states must surface
loudly (fail-loud house rule).

**Constraints:** do not change pipeline semantics or add latency; progress
writes must be fire-and-forget (never fail the answer on a progress-write
error — log instead); keep the eval script unaffected.

---

## 3. WhatsApp media persistence (TIME-SENSITIVE — 30-day clock)

> **STATUS: IMPLEMENTED Jul 7 2026 (by Fable, on `feat/whatsapp-media-persistence`).**
> Migration `20260707000003` (bucket + `conversation_media` ledger + seed RPC),
> archiver `src/lib/conversations/media-archive.ts`, cron route
> `/api/cron/whatsapp-media-archive`, proxy prefers the archived copy (410 on
> expired), inline audio/video players, gated backfill script. Remaining =
> ACTIVATION (Andrei): merge, `supabase db push`, backfill dry-run → apply,
> schedule the cron — steps in `docs/plans/whatsapp-ingestion-runbook.md`
> §"Media archive activation". Original spec kept below for reference.

**Goal (Andrei, Jul 7):** media on WhatsApp messages (images, audio, video,
documents, stickers) exists only as YCloud-hosted URLs today. YCloud retains
media for **30 days** (confirmed from docs.ycloud.com: the `link` URL needs an
`X-API-Key` header to fetch reliably; unauthenticated access dies within
minutes; after 30 days the media is gone permanently). Copy the bytes into our
own private Supabase Storage bucket so attachments survive YCloud expiry.

**What already exists — do NOT rebuild:**
- `conversation_messages.media_json` (jsonb, `[{url, contentType}]`) and
  `raw_payload` (full provider event) are populated by the webhook adapter
  (`src/lib/conversations/ingestion/ycloud-whatsapp.ts`).
- An admin-gated media proxy already serves attachments:
  `src/app/api/whatsapp/ycloud/media/route.ts`, called as
  `/api/whatsapp/ycloud/media?messageId=...&index=...`, injecting
  `X-API-Key: YCLOUD_API_KEY`.
- The thread UI (`src/app/(admin)/admin/contacts/[id]/
  contact-whatsapp-section.tsx`, `MediaAttachment`) already renders images
  inline via that proxy and non-images as links.

The entire gap is byte persistence + teaching the proxy to prefer our copy.
**No webhook changes** — archiving is cron/backfill-driven, which keeps the
webhook storm-proof by construction (30-day retention makes nightly plenty).

**Build:**
1. **Migration** (copy the bucket pattern from
   `supabase/migrations/20260506000001_profile_portfolio.sql`):
   - Private bucket `whatsapp-media` (`INSERT INTO storage.buckets ... ON
     CONFLICT DO UPDATE`; no public-read policies — service-role writes,
     signed-URL reads only).
   - Table `conversation_media`: `id uuid PK`, `message_id uuid NOT NULL FK
     conversation_messages(id) ON DELETE CASCADE`, `media_index int NOT NULL`,
     `UNIQUE(message_id, media_index)`, `source_url text NOT NULL`,
     `content_type text`, `storage_path text` (null until stored),
     `size_bytes bigint`, `status text NOT NULL DEFAULT 'pending' CHECK
     (status IN ('pending','stored','expired','failed'))`, `attempts int NOT
     NULL DEFAULT 0`, `last_error text`, `fetched_at timestamptz`,
     `created_at timestamptz DEFAULT now()`. RLS: admin SELECT, service-role
     writes. Why a table instead of mutating `media_json`: jsonb
     read-modify-write is the race the house RPC rule exists to prevent, and
     a table gives a status/attempts audit trail.
2. **Archiver** `src/lib/conversations/media-archive.ts`: enumerate messages
   with `media_json != '[]'` lacking a `stored`/`expired` row, **oldest
   `happened_at` first** (closest to the 30-day cliff). Per item: fetch
   `source_url` with `X-API-Key` + `AbortSignal.timeout(15_000)` and a size
   cap (~25MB → mark failed with reason); upload to
   `whatsapp-media/messages/{message_id}/{media_index}{ext-from-contentType}`;
   mark `stored`. HTTP 404/403/410 → `expired` (permanent, never retried).
   Other failures → `attempts + 1`, becoming `failed` at 5 attempts (stays
   visible for manual review — fail loud). Bounded batch per run (default 40
   files) returning a remaining count — mirror the shape of
   `processConversationDigestWindows`.
3. **Cron route** `src/app/api/cron/whatsapp-media-archive/route.ts` — copy
   `src/app/api/cron/conversation-digest/route.ts` exactly (constant-time
   `CRON_SECRET` check via `src/lib/cron-auth.ts`, `maxDuration = 300`, one
   bounded archiver call, summary JSON with remaining count). Prod scheduling
   is Andrei's step (pg_cron + Vault, runbook pattern) — **add the SQL to
   `docs/plans/whatsapp-ingestion-runbook.md`** (new secret
   `whatsapp_media_archive_url`) **and update its Hostinger-cutover section to
   list all THREE URL secrets**. Rejected alternative: piggybacking on the
   conversation-digest route — repo convention is one job per route, separate
   failure domains.
4. **Backfill script** `scripts/whatsapp-media-backfill.test.ts` (copy
   `scripts/whatsapp-match-backfill.test.ts` gating +
   `scripts/conversation-digest-backlog.test.ts` env-overwrite pattern):
   `RUN_WHATSAPP_MEDIA_BACKFILL=1` = dry-run (counts by contentType,
   per-message listing, JSON report to `.admin-ai-debug/`, NO fetches);
   `BACKFILL_APPLY=1` = loop the archiver until remaining = 0. The corpus
   includes months-old history-sync messages, so some media is likely already
   expired — report `expired` rows plainly (disclosed, not silent).
5. **Proxy update** (`src/app/api/whatsapp/ycloud/media/route.ts`): check
   `conversation_media` first. `stored` → redirect to a signed URL
   (`createSignedUrls` pattern from `src/lib/data/profile-portfolio.ts`,
   ~10-min TTL). No row / `pending` → current YCloud passthrough. `expired`
   → 410 with a clear message. The UI keeps working unchanged for images.
6. **UI (small, recommended)**: in `MediaAttachment`, render
   `<audio controls>` / `<video controls>` for audio/video contentTypes via
   the same proxy URL; documents keep the link but show the filename; an
   `expired` attachment renders a visible "attachment expired before
   archiving" placeholder — never a silently broken image.
7. **Out of scope:** the AI pipeline. Media never reaches the model;
   media-only windows stay noise via the 40-char body gate. Touch nothing in
   `digests.ts` / facts.

**Tests:** contentType→extension mapping; status transitions incl. 404→expired
and the attempts cap; batch bound + oldest-first ordering; proxy branching
(stored/pending/expired) with mocked storage; cron auth. No live network in
CI — the live path is the gated script, run by Andrei.

**Owner decisions:** archive outbound and unmatched messages too? (recommend
YES — the goal is preservation and storage is cheap); include deactivated
messages? (recommend yes — curation is not deletion); signed-URL TTL; size cap.

**Ops:** migration + backfill should run SOON after merge (the 30-day clock is
already running on existing media). Current volume is trivial (hundreds of
messages).

---

## Deploy checklist (Andrei's own actions, not coding tasks)

- Prod cron scheduling for conversation digests: SQL in
  `docs/plans/whatsapp-ingestion-runbook.md` (run AFTER the whatsapp branch is
  deployed so the route exists).
- Keep `OPENAI_API_KEY` OUT of prod env until OpenAI billing is topped up
  (embeddings then backfill automatically on the next digest run).
- Re-enable the YCloud webhook at the Hostinger cutover (dedup fix + echoes
  handler are prerequisites — both merged).
- Prod `maxDuration` accommodation for the 360s DeepSeek timeout on the
  admin-ai route at deploy time.
- After task 3 (media persistence) merges: run the media backfill promptly
  (YCloud's 30-day retention clock is already running on existing media) and
  schedule the `whatsapp-media-archive` cron per the runbook.

## Explicitly out of queue (Andrei, Jul 7 2026)

- Deep-link batching — VERIFIED IMPLEMENTED on main (Jul 7 check): commit
  `e5db8d0` server-renders the contact deep link via one
  `getContactDetailPageBootstrap` + cache seeding. Nothing left to do.
- Repo-hardening review — the REPO-WIDE pass described in
  `docs/plans/comprehensive-review-refactor-prompt.md` (an untracked prompt
  doc) has NOT been executed (verified Jul 7). Do not confuse it with the two
  hardening PRs that DID merge — PR #21 "Harden admin dashboard concurrency
  and forms" (squash `fa590ac`, Apr 13; its local branch
  `admin-dashboard-hardening` is fully merged, just a stale ref) and PR #53
  "cache & realtime robustness hardening" (Jul 3) — both scoped to the admin
  dashboard, not repo-wide. The repo-wide prompt stays available to run in a
  fresh session whenever Andrei triggers it.
