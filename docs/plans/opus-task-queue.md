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

## Explicitly out of queue (Andrei, Jul 7 2026)

- Deep-link batching & repo-hardening review — Andrei believes these are done/
  merged. NOTE: session records suggest only their SPEC DOCS were merged
  (`docs/plans/deep-link-batching.md`, `docs/plans/comprehensive-review-
  refactor-prompt.md`) and the work itself was open — verify before assuming
  either way.
