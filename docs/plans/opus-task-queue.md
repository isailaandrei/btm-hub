# Opus-solo task queue

Self-contained tasks deliberately deferred from the Jul 6–7 2026 Fable session
(usage rationing). Each is executable by a plain Opus session without
back-and-forth. Work on a feature branch off main; commit locally; never push
without Andrei's approval; run gates (tsc, affected vitest suites, eslint)
before committing. Do not touch `.env*` files or `.admin-ai-debug/` (PII).

---

## 1. AI-visibility badges in the WhatsApp thread

> **STATUS: IMPLEMENTED Jul 7 2026 (by Fable, on `feat/ai-visibility-and-summaries`,
> stacked on `feat/whatsapp-media-persistence` — merge media first).** Pure
> bucketing lib `src/lib/conversations/ai-visibility.ts` (all six states,
> tested incl. boundaries), badges + tooltips + header legend in the thread,
> `loadContactAiMemory` action. Remaining = Andrei: merge + browser-check the
> badges against a few known threads (Yang Yang's noise windows are the
> calibration case).

**Goal:** admins see, per message in the contact-page WhatsApp thread, whether
the AI sees it — the calibration surface for the digest taxonomy. V1 is
READ-ONLY (no override actions).

**Context you need:**
- The AI never reads raw messages; it reads `conversation_digests` rows
  (window summaries) + `conversation_facts`. Digests are built per contact from
  INBOUND, matched, non-deactivated messages, in session windows (3-hour gap
  since 2026-07-10, see `src/lib/conversations/digests.ts`).
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

> **STATUS: IMPLEMENTED Jul 7 2026 (same branch as task 1).** Read-only
> `ContactAiMemorySection` (signal digests w/ profile/status chips + status
> expiry/aged-out, extracted facts w/ labels + confidence) rendered under the
> WhatsApp thread on the contact page. (The task-1c AI summary block that
> briefly rendered here was withdrawn 2026-07-09 — see §1c.)

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

> **WITHDRAWN by owner 2026-07-09.** Owner clarified that what he actually
> wanted was the WhatsApp digest display (task 1b), which already existed —
> this task was a misunderstanding. The summary block has been removed from
> `ContactAiMemorySection`, and the nightly cron (`/api/cron/contact-ai-
> summaries`) must NEVER be scheduled (it was never scheduled in prod —
> `vercel.json` never carried it, and the `cron.schedule(...)` SQL below was
> never run). The `contact_ai_summaries` table held 309 unaudited rows that
> nothing read. The previously-noted "Tatiana" summary-prompt fix is
> moot — the prompt it targets no longer renders anywhere. The summary was never
> part of the AI's corpus, so this withdrawal is a UI-only change; no AI
> behavior changes. **Cleanup EXECUTED 2026-07-10:** the dormant code
> (`src/lib/admin-ai/contact-summary.ts` + test,
> `src/lib/data/contact-ai-summaries.ts`, `src/app/api/cron/contact-ai-
> summaries/`, `scripts/contact-ai-summaries-backfill.test.ts`) is deleted
> and migration `20260710000001` drops the `contact_ai_summaries` table.
>
> **STATUS: CODE IMPLEMENTED Jul 7 2026 (same branch as task 1); ACTIVATION
> GATED on the owner's calibration round.** `contact_ai_summaries` table
> (migration `20260707000005`), generator through the existing contact scope
> with content-hash staleness (`src/lib/admin-ai/contact-summary.ts`), nightly
> cron route `/api/cron/contact-ai-summaries`, gated backfill script, summary
> rendered in the AI-memory section. Owner decisions adopted: renders on the
> contact page; nightly + hash-staleness refresh; summaries do NOT feed the
> global corpus. **Still open before relying on it: audit the first live batch
> (the runbook's activation section) and add contact-scope eval questions —
> the suite is global-only today.** Email ingestion remains design-sketch only.

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

> **STATUS: IMPLEMENTED Jul 7 2026 (by Fable, on `feat/admin-ai-staged-progress`).**
> Design chosen: ephemeral `admin_ai_progress` row (migration `20260707000004`)
> keyed by a client-generated UUID, written fire-and-forget by a serialized
> reporter (`src/lib/admin-ai/progress.ts`), polled every 2s by the question
> form while the global answer is pending. Stages: planning → scanning (chunk
> i/N + running candidate count, shared across main+rescue scans) → analyzing.
> Pipeline semantics untouched (`onProgress` optional everywhere; eval passes
> none). Remaining = Andrei: merge, `supabase db push`, then a live global
> question to see the stages. Original spec kept below for reference.

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

## 4. Strength-graded map: cap the reduce set for broad questions

> **STATUS: IMPLEMENTED Jul 9 2026 (Sonnet agent, Fable-audited; merged to
> main).** ACTIVATION GATE: Andrei's live eval run (`RUN_ADMIN_AI_EVAL=1`,
> COLD — the map prompt changed, ~$0.15) must stay green incl. the two new
> broad-advisory assertions before relying on it.

**DECIDED (Andrei, Jul 8 2026): Option B approved — strength-graded map
candidates + code-side assembly with a weak-tier cap of 60.** Implementation
open. Do NOT substitute a general prompt-bar tightening (rejected: it gambles
narrow-question recall and its exclusions are silent).

**Why:** the map union keeps growing for broad judgment questions — "own
projects" flags 164 of 308 (earlier runs 57 → 101 → 149) — so the reduce is
drifting back toward the single-pass context size whose attention ceiling
caused the 2026-07-04 recall failures. Principle: convert invisible
exclusions into visible, countable, DISCLOSED ones.

**Build (all admin-AI change-protocol rules apply — read
`docs/admin-ai-handbook.md` first; system-prompt edits make the next eval run
cold, ~$0.15, expected):**

1. **Measure first** (no model calls): from the `.admin-ai-debug/` request
   dumps, record the reduce prompt token size for the own-projects question
   as the baseline (known-bad regime was ~340k single-pass; ~180k unproven).
2. **Map contract** (`src/lib/admin-ai/map-scan.ts`, `schemas.ts`): each
   candidate gains `strength: "strong" | "weak"` — strong = the quoted
   evidence DIRECTLY satisfies the question's core criterion; weak = real
   quotable evidence whose relevance is partial or uncertain. Err-on-inclusion
   is unchanged: uncertain → include as weak, never omit. In the Zod schema
   default a missing `strength` to `"strong"` (inclusion-safe) and
   `adminAiDebugLog` the omission — never abort an answer over grading noise.
   Near-miss tier unchanged (separate mechanism, zero-full-match gate).
3. **Assembly rule** (`orchestrator.ts`, map_reduce path): export
   `REDUCE_CANDIDATE_CAP = 60`. Reduce set = ALL strong candidates in corpus
   order (strong evidence is NEVER trimmed — wrong exclusion is worse than
   wrong inclusion, even past the cap; if strongs alone exceed the cap,
   disclose the breadth instead of cutting). If strong < cap, append weak
   candidates in corpus order up to the cap. Trimmed weaks are counted, never
   silently dropped:
   - analysisNote (compose with near-miss/rescue notes as elsewhere): "K
     additional contacts showed weaker or partial evidence for this question
     and were not analyzed in depth — narrow the question to surface them."
   - diagnostics gain `strongCount`, `weakFlaggedCount`, `weakIncludedCount`.
   Rescue-scan candidates keep existing behavior (rescued full matches merge
   after confirmed; they sit OUTSIDE the cap — the pool is small and already
   disclosed by the rescue note). Near-miss mode only when the union is empty,
   as today.
4. **Eval before shipping** (`scripts/admin-ai-eval.test.ts` +
   `docs/admin-ai-eval-contract.md`): extend the broad-advisory (own-projects)
   question's assertions — (a) Yang Yang still surfaces citing the Flo call
   note, (b) reduce set size ≤ max(cap, strongCount) via diagnostics, (c) when
   `weakFlaggedCount > weakIncludedCount` the disclosure text is present in
   the response. Add the standing rule to the contract: "strong evidence is
   never trimmed; weak evidence may be capped with disclosure" (direction
   owner-approved Jul 8; show Andrei the final contract wording). Full suite
   must stay green — 9/9 plus the extended assertions; Andrei runs the live
   eval.
5. Usual gates; map-scan/orchestrator unit tests for grading defaults,
   assembly order, cap boundary (strong ≥ cap), and disclosure composition.

---

## 5. Digest-label feedback: admins mark AI labels right/wrong

> **STATUS: IMPLEMENTED Jul 9 2026 (Sonnet agent, Fable-audited; merged to
> main).** ACTIVATION: `supabase db push` (migration `20260709000001` —
> corrections table + `conversation_digests_effective` view; the loaders
> already read the view, so push the migration BEFORE deploying this code).
> Calibration export: `RUN_DIGEST_CORRECTION_PAIRS=1` script.

**Why (Andrei, Jul 8):** the badges surfaced real miscalibrations — some
WhatsApp digests labeled `profile` should have been `status`. Admins need to
correct labels in the UI, and the corrections should both fix the AI's view
immediately and accumulate into a calibration dataset for tuning the taxonomy
prompt.

**Design (agreed direction, refine as needed):**
1. **Storage — corrections keyed by digest `content_hash`, not digest id:**
   table `conversation_digest_corrections` (`content_hash text PK`,
   `corrected_relevance text CHECK (in ('profile','status'))`,
   `corrected_is_noise boolean`, `original_relevance`, `original_is_noise`,
   `corrected_by uuid`, `created_at`). Keying by hash means corrections
   SURVIVE a recalibration wipe (re-digested windows produce the same hash →
   the correction reapplies). Store the originals so the correction pairs are
   the calibration dataset.
2. **Apply at read time:** the card loader (`src/lib/data/contact-cards.ts`
   digest query) and `listContactConversationDigests` join/overlay
   corrections so the AI and every visibility surface see the corrected
   label. Do NOT mutate the digest row — the model's original output is data.
3. **UI:** in the contact page's AI-memory section (and/or the badge
   tooltip), a small "wrong label?" control per digest → pick the correct
   label (profile / status / noise). Optimistic, house-style. Write path via
   a server action + RPC or plain insert (admins write; RLS admin-insert).
4. **Calibration loop:** a gated script that prints correction pairs
   (original → corrected + summary text) so Andrei/Fable-successor can tune
   the taxonomy prompt against real mistakes; bump the digest prompt version
   + recalibration wipe applies the improved taxonomy while corrections
   persist.
5. **Watch:** 45-day expiry semantics — a profile→status correction makes the
   digest age out (that's the point); a status→profile correction makes it
   permanent. The AI-visibility badges pick this up automatically once the
   loaders overlay corrections.

---

## 6. Hard-constraint gaps: DONE Jul 9 + one refinement open

> **IMPLEMENTED Jul 9 2026 (Sonnet agent, Fable-audited, merged to main):**
> program membership is now a hard TAG-CLASS constraint (deterministic
> prefilter on `applications.program` with runtime vocabulary, never rescued,
> enumeration-complete, drops disclosed; both planner and legacy paths), and
> field constraints ground to one OR MORE whole vocabulary items (op `in`),
> so an age span grounds every matching bucket instead of silently narrowing.
> Eval grew to 11 questions (Q10 program cohort — owner's verbatim internship
> question; Q11 runtime-built demographic multi-value). ACTIVATION: Andrei's
> cold live eval run must be 11/11.

**Open refinement (small, Opus-able):** the field applier compares RAW answer
values against bucket vocabulary, so internship's raw-numeric ages ("21")
miss the deterministic age prefilter and rely on the (disclosed) rescue path.
Fix: apply the field registry's age normalizer (`normalizeAgeToRange`, used
by the card renderer) inside `recordMatchesFieldConstraint` for fields that
declare a normalizer, then tighten Q11's assertion from
recall-via-rescue to exact prefilter equality. Unit tests: raw "21" matches
the bucket containing 21; non-numeric garbage still falls through to rescue.

---

## 7. PENDING OWNER DECISION: pin the reduce (generate) to temperature 0

**Observed (Jul 9, concurrent eval runs):** two eval questions flaked on one
run and passed on the next, identical code — the REDUCE call (`generate` in
`deepseek-provider.ts`) still samples at default temperature, unlike the map
(`completeJson`), which was pinned to 0 in July precisely to kill eval flake
(d78634a). Failure modes seen: reduce emitted zero `assumptions`
(judgment variance) and omitted `citations` arrays (shape variance → loud
ZodError). Roughly 2-in-11 assertions are exposed per dice roll.

**Recommendation (Fable):** pin `temperature: 0` on the `generate` path too
— same determinism doctrine, an admin analyst should answer identically to
identical questions; reproducibility is the eval's foundation. Secondary
(optional): one bounded retry when the reduce response fails the Zod parse,
mirroring the existing empty-content retry. Both are pipeline behavior
changes → owner sign-off + a fresh 11/11 live eval before shipping.

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
