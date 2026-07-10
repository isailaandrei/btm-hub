# Admin AI Handbook

The what, why, and how of BTM Hub's admin AI — written Jul 2026 after the
feature reached 9/9 on its eval suite. This is the master document for anyone
(human or LLM) developing the feature further. Read this FIRST, before touching
any admin-AI code. Companion docs: `docs/admin-ai-eval-contract.md` (the
owner-approved rules the eval enforces) and
`docs/plans/whatsapp-ingestion-runbook.md` (the conversation-ingestion
operations manual).

---

## 1. What this is

A CRM analyst. The admin asks natural-language questions ("who are the
strongest candidates for the 26 Coral Catch with underwater experience?") over
~300 contact cards — applications, tags, admin/call/message notes, and WhatsApp
conversation digests — and gets a ranked, cited, uncertainty-disclosing answer.

It runs on DeepSeek (`deepseek-v4-pro`) with an OpenAI fallback, costs
$0.002–0.16 per question (warm/cold prompt cache), and answers in 7–110s
depending on how much of the corpus the question touches.

The defining engineering fact: the corpus (~340k tokens) exceeds what a single
LLM pass can reliably enumerate. Everything in the architecture exists to make
answers **complete and trustworthy anyway**.

## 2. Architecture — how a question becomes an answer

All code in `src/lib/admin-ai/` unless noted. The whole pipeline is the
exported `runGlobalSynthesis` in `orchestrator.ts` — the app route AND the eval
harness call the same function, so tested behavior is shipped behavior (this
was once not true, and the drift produced phantom eval failures — never let
them diverge again).

```
question
  │
  ├─ 1. CONSTRAINT PLANNER (constraint-planner.ts)
  │     One cheap completeJson call maps the question onto a catalog built
  │     from live data: tag categories + statuses, option-backed fields,
  │     list-valued fields (top-30 observed values). Output: a validated plan
  │     {tagConstraint, budgetMin, fieldConstraints, enumerationOnly}.
  │     validatePlan DROPS (with disclosure) any constraint whose value is not
  │     a WHOLE vocabulary item, and normalizes ops to `contains`.
  │
  ├─ 2. DETERMINISTIC PREFILTER (hard-constraints.ts, applyPlannedConstraints)
  │     Tags are authoritative membership (declined-only excluded by default,
  │     included when the question asks about declines). Budget parses the
  │     budget field + conversation facts. Field filters substring-match
  │     stored values. Contacts dropped by FIELD/BUDGET (never TAG) form the
  │     RESCUE POOL.
  │
  ├─ 3. MAP SCAN (map-scan.ts) — skipped if ≤30 prefiltered cards
  │     30-card chunks, parallel completeJson extraction at temperature 0,
  │     two-wave retry, hallucinated-id guard. Chunks with ZERO full matches
  │     may emit ≤3 NEAR-MISSES (partial matches with the missing aspect
  │     named) — consulted only if the global full-match union is empty
  │     (double gate: prevents candidate inflation on broad questions).
  │     A concurrent RESCUE SCAN runs over the rescue pool: contacts whose
  │     structured field failed but whose notes/essays suggest they qualify
  │     re-enter with a code-injected "admin decides" disclosure.
  │
  ├─ 4. REDUCE / SYNTHESIS (orchestrator.ts → provider.generate)
  │     One call over candidate cards only. The response contract:
  │     assumptions (interpretive judgment calls only, ≤4) · shortlist (≤10,
  │     matchStrength 0-100, concerns mandatory) · additionalMatches ·
  │     uncertainty (borderlines named, filters disclosed).
  │
  └─ 5. CODE-SIDE ENFORCEMENT (orchestrator.ts)
        id repair (garbled ids fixed by unique name, else dropped+disclosed) ·
        matchStrength sort + cap-10 with overflow to additionalMatches ·
        ENUMERATION COMPLETENESS: for enumerationOnly plans with a
        deterministic constraint, every prefiltered member the model dropped
        is appended — recall 1.0 by construction · response filtered to the
        sent corpus.
```

Providers (`provider.ts`, `deepseek-provider.ts`): DeepSeek chat-completions,
`json_object` mode, zod-validated, retry-once-then-fail-loud, thinking
explicitly DISABLED (DeepSeek reasons by default if the field is omitted —
this once silently ate 86% of output budget), `temperature: 0` on
`completeJson` only (extraction/planning are classification; synthesis keeps
the API default). Prompt-cache engineering: the big stable card corpus renders
FIRST, per-question content LAST, cards ordered oldest-first so new contacts
append to the cacheable prefix's tail. ANY system-prompt edit invalidates the
whole prefix → the next query runs cold (~$0.15) — batch prompt changes.

The corpus (`src/lib/data/contact-cards.ts`): contacts WITH ≥1 application
(owner decision Jul 2026 — WhatsApp-only contacts are invisible; revisit only
with the owner). Cards include conversation digests filtered by
`is_noise = false AND (relevance = 'profile' OR window_end within 45 days)` —
see §6.

## 3. The principles (learned the hard way — do not relearn them)

1. **Code enforces what prompts only request.** Models emitted the shortlist
   in exact corpus order 11/11 times despite ranking instructions; garbled
   36-char UUIDs when enumerating 80+ contacts; padded cohorts their own
   uncertainty said were wrong. Every guarantee that matters — ranking, caps,
   completeness, id integrity, filter scope — is enforced in code AFTER the
   model responds. A prompt rule without a code backstop is a wish.

2. **Wrong exclusion is strictly worse than wrong inclusion.** The worst
   production failure: "should own professional equipment" became a substring
   filter (`equipment_owned contains "Professional"` matched the option
   "Professional video camera") and silently cut a 15-person cohort to 1.
   Doctrine since: a hard filter may fire ONLY when the user's term equals a
   complete vocabulary item verbatim; quality adjectives (professional,
   experienced, advanced…) are NEVER filter values; a constraint that cannot
   ground is dropped WITH DISCLOSURE and the criterion goes to the model as
   ranking evidence. Failure direction must always be inclusion.

3. **Recall comes from architecture, not persuasion.** Three controlled
   prompt-tuning attempts failed to make a single 340k-token pass surface a
   one-line call note (salience bias: long essays drown short notes). The fix
   was structural: map-reduce chunks where nothing drowns, plus code-side
   completeness appends. If retrieval is failing, restructure — don't write a
   sterner prompt.

4. **Fail loud; disclose degradation.** Every dropped constraint, excluded
   count, near-miss mode, rescue, and id drop appears in the answer's
   uncertainty. An empty answer names the closest candidates and their gaps
   rather than returning blank. The "Applied filter — N excluded" line is how
   the owner caught the equipment bug in one glance: disclosure is the
   product's immune system.

5. **Measure, don't vibe.** Every prompt/architecture/model change is gated by
   the eval suite (§4) with before/after scorecards. Live failures become eval
   questions (the equipment incident is now `qualifier-trap`). Ground truth is
   computed from the DB at runtime, never hardcoded — and eval truth
   derivation itself has been wrong twice (string-vs-array field shapes; a
   keyword regex mislabeling a near-miss as ground truth), so when the model
   scores 0% against a tiny truth set, SUSPECT THE TRUTH FIRST.

6. **Ground truth belongs to the DB; judgment to the model; decisions to the
   admin.** Tags are authoritative membership — no evidence overrides them.
   Interpretive bars belong to the model, which must state its assumptions.
   Rescued and near-miss candidates always reach the admin with explicit
   uncertainty — the system surfaces, the human decides.

7. **Determinism where mechanical.** Extraction and planning are
   classification → temperature 0 (an unset temperature caused eval flake:
   the same contact was near-missed one run and skipped the next). Synthesis
   keeps sampling freedom.

8. **Memory needs forgetting** (see §6): durable profile facts persist;
   operational status expires from the AI's view after 45 days; noise never
   enters. A CRM corpus without decay eventually lies about the present.

## 4. The eval suite — the only safe way to change anything

```
RUN_ADMIN_AI_EVAL=1 npx vitest run --maxConcurrency=3 scripts/admin-ai-eval.test.ts --disableConsoleIntercept
```

~$0.30–0.45 and ~5 min per run against the LIVE DB + DeepSeek (keys from
`.env.development.local`). 9 questions, each encoding an owner-approved
product rule — the table lives in `docs/admin-ai-eval-contract.md`; change a
rule there ONLY with the owner.

The iteration loop that produced 9/9, to be reused verbatim:
1. Run the suite; read the scorecard (RECALL/SL-PREC/PREFILT/CARDS/COST).
2. On failure, read the JSON in `.admin-ai-debug/eval-*.json` — it records the
   plan, truth/union/missing ids, map candidate ids, near-miss/rescue
   diagnostics, id repairs. Diagnosis is a file read, not forensics.
3. Classify: eval-truth bug? planner over/under-grounding? map recall? reduce
   judgment? code-guarantee gap? Fix the CLASS, not the instance — and prefer
   a code guarantee over a prompt tweak (§3.1).
4. Re-run. A live failure that had no eval question gets one (runtime-derived
   truth only).

Known watch-items (advisory, not asserted, as of Jul 7 2026): broad-advisory's
map union has crept across runs (57→101→149 of 306) — if it approaches ~250
the map bar has collapsed again and needs tightening; cohort-big once returned
an empty shortlist with all 27 members in additionalMatches (recall guarantee
held; ranking was lazy) — if it recurs, consider asserting non-empty
shortlists for roster questions. Debug corpus dumps: `ADMIN_AI_PRINT_OPENAI_
PAYLOAD=1` + `DEBUG_ADMIN_AI=1` → `.admin-ai-debug/` (gitignored, contains
PII, NEVER commit).

## 5. Operations

Env (in `.env.development.local`, mirrored to prod env stores when enabling):
`ADMIN_AI_PROVIDER=deepseek` · `DEEPSEEK_API_KEY` ·
`DEEPSEEK_MODEL=deepseek-v4-pro` · `ADMIN_AI_SCAN_MODE=map_reduce` ·
optional `DEEPSEEK_THINKING` (leave unset) · `OPENAI_API_KEY` only where
embeddings should run (see below).

Prod enablement checklist (feature is dormant wherever these are missing):
1. DeepSeek env vars above.
2. `export const maxDuration` on the admin-ai route sized for the 360s
   DeepSeek request timeout.
3. Expect the first query after any deploy that changed prompts to be cold.

Cron/host topology: the hub prod is `btm-hub.vercel.app` (there is NO
canonical hub domain — `behind-the-mask.com` is a different website; the
Hostinger pilot is `preview.behind-the-mask.com`). The nightly
`conversation-digest` pg_cron job (03:10 UTC) and the email-drain job read
their target URLs from Supabase Vault (`conversation_digest_url`,
`email_drain_url`) — at any host change, update BOTH vault values (exact SQL
in the ingestion runbook) and verify with a no-auth curl (expect 401; 308/404
= broken, `net.http_get` follows no redirects).

Embeddings (`conversation_embeddings`) are OpenAI-only (DeepSeek has no
embedding API). They feed ONLY evidence-mode retrieval, which is currently
OFF; the pipeline skips them with a logged count when `OPENAI_API_KEY` is
unset and backfills automatically on the first configured run. Keep the key
out of prod env until OpenAI billing is restored.

## 6. The WhatsApp knowledge feed (summary — runbook has the operations)

Raw messages NEVER enter the AI corpus. Inbound, contact-matched,
non-deactivated messages are windowed (30-min session gaps) and distilled at
temperature 0 into:
- **Digests** — one dated summary per window, tagged `profile` (durable:
  skills, preferences, aspirations, relationships, decisions/commitments) or
  `status` (operational: arrivals, logistics, waiting-on-X; visible to the AI
  for 45 days past the window, then auto-expired by a read-time filter) —
  or marked noise (`is_noise`, incl. ALL call/meeting scheduling).
- **Facts** — structured `fieldKey`/value entries, profile-grade content only
  (the PROMPT owns that rule; code accepts facts from any signal window —
  a window-level code veto once silently discarded a contact's confirmed
  attendance; don't reintroduce it).
Phone matching is digit-suffix based with a uniqueness guard (exact → unique
last-9; ambiguity refused). Recalibration = wipe derived tables + re-drain
(runbook §Recalibration wipe) — cheap (~$0.05), deterministic, and the
expected way to iterate on the taxonomy.

## 7. Developing further

Queued, fully specced, Opus-executable (`docs/plans/opus-task-queue.md`):
AI-visibility badges in the WhatsApp thread; conversation summaries + facts on
the contact detail page; staged-progress UI for map-reduce waits.

Plausible next levers, in rough value order:
- **Calibration via the visibility UIs** — the owner reviews digests/badges in
  situ and reports misclassifications; fold them into the taxonomy prompt and
  re-drain. This loop is the intended way the memory quality improves.
- **Evidence mode** — needs embeddings (OpenAI billing or a new embedding
  provider + a vector-dimension migration; table is small). Roughly 2–3×
  prompt size; re-check TPM/cost before enabling.
- **Corpus expansion** — WhatsApp-only contacts (no applications) are
  invisible; as their digest quality proves out, the owner may widen
  eligibility. Owner decision, not a technical one.
- **Enumeration >50** — the shortlist+additionalMatches contract caps at ~50
  before code appends; large rosters already work via the append, but the UI
  answer for "list all 150 X" may deserve its own rendering.
- **Email ingestion** — the contact scope (one card, no map-reduce) can
  support per-contact features, but the per-contact AI summary built on it
  was withdrawn by the owner Jul 9 2026 and deleted Jul 10 (see
  `docs/plans/opus-task-queue.md` §1c) — do not rebuild without a fresh owner
  decision. Email ingestion itself remains design-sketch only, and any
  contact-scope feature still needs contact-scope eval questions first (the
  current suite is global-only).
- **Digest consolidation** — when contacts accumulate many windows, compress
  old ones into a per-contact profile summary (planned-for but deliberately
  not built at current scale).
- **Planner catalog sampling** — list-valued fields expose top-30 values;
  rarer values can't ground a prefilter and fall to the (correct but
  unguaranteed) evidence scan. Raise the cap if a real roster query needs it.

### Protocol for any future change (the part Opus must actually follow)

1. Read this doc and `docs/admin-ai-eval-contract.md` before coding.
2. Run the eval BEFORE your change (baseline) and AFTER (proof). A change
   that can't be evaluated gets a new eval question first.
3. Never weaken a code-side guarantee (sort, cap, append, repair, grounding,
   disclosure) to simplify a prompt — the guarantees exist because prompts
   failed.
4. New hard filters must pass the whole-vocabulary-item test; when in doubt,
   don't filter — rank and disclose.
5. When a result looks wrong, check in order: eval-truth derivation → the
   registry/DB reality (two "model bugs" were actually wrong assumptions
   about field types) → planner plan → map diagnostics → reduce output.
   The `.admin-ai-debug/` JSONs answer most of this without re-running.
6. Prompt edits are cache-cold events and judgment changes: batch them, and
   re-run the eval every time.
7. Anything touching what the ADMIN sees as truth (filters, exclusions,
   corpus eligibility, taxonomy meanings) is an owner decision — present
   options with failure modes, get a verdict, then build.

### Anti-patterns already paid for (do not repeat)

Query-specific prompt tweaks to fix one question (was reverted wholesale);
free-text substring prefilters (destroyed recall twice); trusting
model-emitted ordering or ids; window-level vetoes of model-level rules;
diagnosing "the model invented X" without checking whether X exists in the
registry or DB; scheduling infra via repo migrations that the local stack
can't run; host-specific URLs anywhere except Vault-indirected secrets.
