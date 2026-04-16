# AI Admin Memory Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current admin AI analyst from bounded retrieval-only reasoning into a memory-backed CRM intelligence layer that can reason over the whole cohort using persistent external memory while preserving evidence-backed final answers.

**Architecture:** Keep the existing thread/message/citation answer layer and add a 5-layer external memory system: raw sources, normalized evidence chunks, derived contact dossiers, embeddings/vector infrastructure, and answer-time synthesis. For the immediate implementation, ship the memory foundation, dossier/ranking-card generation, and memory-first retrieval for current CRM data; prepare extension seams for future WhatsApp / Instagram / Zoom ingestion without implementing those connectors yet.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + RLS), Zod 4, OpenAI Responses API, Vitest, Playwright, Node scripts for backfill/evaluation.

**Spec:** `docs/superpowers/specs/2026-04-16-ai-admin-memory-architecture-design.md`

---

## Scope And Delivery Strategy

This plan deliberately reuses the current admin AI surface and grounded-answer core.

### In scope for this plan

- canonical evidence chunk storage for current CRM sources
- per-contact dossiers
- per-contact ranking cards
- freshness/version tracking for memory artifacts
- a backfill / rebuild command for current CRM data
- whole-cohort global query flow using ranking cards first
- contact-scoped query flow using dossiers first
- final answers still citing raw evidence chunks
- dossier evaluation rubric + initial gold-set harness

### Explicitly not in scope for this plan

- WhatsApp / Instagram / Zoom connector implementation
- production job infrastructure (queue workers, cron scheduling, webhooks)
- agent loops, SSE, streaming, or autonomous actions
- model fine-tuning as the CRM memory mechanism
- replacing raw evidence citations with dossier-only citations
- mandatory vector search activation for the current CRM-only dataset

### Practical implementation posture

The design calls for a long-term background generation pipeline. For the first implementation in this repo, use:
- explicit backfill commands
- deterministic freshness checks
- synchronous rebuild-on-read only as a narrow fallback

Do **not** add a full job queue unless the repo already has one by the time implementation starts.

## Non-Negotiable Guardrails

- Do **not** remove or rewrite the current `admin_ai_threads`, `admin_ai_messages`, and `admin_ai_message_citations` flow. Extend around it.
- Do **not** make the model the system of record for CRM memory.
- Do **not** send whole raw applications / notes for the full cohort on every global query.
- Do **not** cite dossier prose as final evidence when raw chunks exist.
- Do **not** introduce WhatsApp / Instagram / Zoom-specific codepaths into the answer layer. Use source-agnostic chunk abstractions.
- Do **not** implement embeddings-first retrieval for the current application-only CRM. Add the table/interface, but keep the live retrieval path FTS + memory first.
- Do **not** reuse `AdminDataProvider` for memory generation or query-time retrieval.
- Do **not** build a background queue system unless there is a real repo-level reason to do so now. Prefer deterministic rebuild commands plus freshness metadata.

## What Already Exists And Must Be Preserved

The current implementation already provides:

- admin AI UI in `/admin` and `/admin/contacts/[id]`
- request/response server action flow
- per-admin threads and messages
- final answer persistence
- raw citation persistence
- structured facts view: `admin_ai_contact_facts`
- raw evidence view + FTS RPC: `admin_ai_evidence_items`, `search_admin_ai_evidence(...)`
- current global/contact orchestration

The new architecture should preserve those strengths and insert the new memory layers before final synthesis.

## Proposed File Map

### Database

```text
supabase/migrations/
  20260416000001_admin_ai_memory_foundation.sql
```

### Shared types

```text
src/types/
  admin-ai-memory.ts
```

### Data layer

```text
src/lib/data/
  admin-ai-memory.ts
```

### Memory generation + retrieval

```text
src/lib/admin-ai-memory/
  source-types.ts
  chunk-schemas.ts
  chunk-builder.ts
  dossier-schema.ts
  dossier-prompt.ts
  dossier-generator.ts
  ranking-card.ts
  freshness.ts
  backfill.ts
  global-retrieval.ts
  contact-retrieval.ts
  eval-rubric.ts
```

### Scripts

```text
scripts/admin-ai-memory/
  backfill.ts
  eval.ts
```

### Existing AI layer updates

```text
src/lib/admin-ai/
  prompt.ts
  orchestrator.ts
  retrieval.ts
  provider.ts (only if model split/config support is needed)
```

### Tests

```text
src/lib/admin-ai-memory/
  chunk-builder.test.ts
  dossier-generator.test.ts
  ranking-card.test.ts
  freshness.test.ts
  global-retrieval.test.ts
  contact-retrieval.test.ts
  eval-rubric.test.ts

src/lib/data/
  admin-ai-memory.test.ts

src/lib/admin-ai/
  orchestrator.test.ts

e2e/
  admin-ai-analyst.spec.ts
```

## Data Model Decisions

### 1. `crm_ai_evidence_chunks`

Purpose:
- canonical AI-facing evidence storage
- current-source unification layer
- future home for long message/transcript chunks

Suggested columns:

```sql
create table crm_ai_evidence_chunks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  source_type text not null check (
    source_type in (
      'application_answer',
      'contact_note',
      'application_admin_note',
      'whatsapp_message',
      'instagram_message',
      'zoom_transcript_chunk'
    )
  ),
  source_id text not null,
  source_timestamp timestamptz,
  text text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  content_hash text not null,
  chunk_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, content_hash)
);
```

Indexes:
- `(contact_id, source_timestamp desc)`
- `(source_type, source_timestamp desc)`
- GIN / FTS index over `text`
- optional partial indexes by source type if needed later

### 2. `crm_ai_contact_dossiers`

Purpose:
- persistent per-contact AI memory
- structured summary + evidence anchor layer

Suggested columns:

```sql
create table crm_ai_contact_dossiers (
  contact_id uuid primary key references contacts(id) on delete cascade,
  dossier_version int not null,
  generator_version text not null,
  source_fingerprint text not null,
  source_coverage jsonb not null,
  facts_json jsonb not null,
  signals_json jsonb not null,
  contradictions_json jsonb not null,
  unknowns_json jsonb not null,
  evidence_anchors_json jsonb not null,
  short_summary text not null,
  medium_summary text not null,
  confidence_json jsonb not null default '{}'::jsonb,
  last_built_at timestamptz not null default now(),
  stale_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 3. `crm_ai_contact_ranking_cards`

Purpose:
- cheap whole-cohort read surface
- derived from dossiers
- used by global ranking pass

Suggested columns:

```sql
create table crm_ai_contact_ranking_cards (
  contact_id uuid primary key references contacts(id) on delete cascade,
  dossier_version int not null,
  source_fingerprint text not null,
  facts_json jsonb not null,
  top_fit_signals_json jsonb not null,
  top_concerns_json jsonb not null,
  confidence_notes_json jsonb not null,
  short_summary text not null,
  updated_at timestamptz not null default now()
);
```

### 4. `crm_ai_embeddings`

Purpose:
- future-proof embedding storage for chunks, and maybe later dossier summaries

Create now, but do not activate retrieval against it in the current CRM-only path.

Suggested columns:

```sql
create table crm_ai_embeddings (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('chunk', 'dossier')),
  target_id uuid not null,
  embedding_model text not null,
  embedding_version text not null,
  content_hash text not null,
  embedding vector(1536), -- choose concrete dimension when model is chosen
  created_at timestamptz not null default now(),
  unique (target_type, target_id, embedding_model, embedding_version, content_hash)
);
```

If the chosen model dimension is still undecided at implementation time, stop and decide it before writing the migration. Do **not** leave this as a placeholder.

## Core Architectural Choice: Two-Pass Global Reasoning

The current system makes one final synthesis call after one bounded retrieval pass. That is not enough for true whole-cohort awareness.

For global questions, implement a two-pass model flow:

### Pass 1: Ranking pass

Inputs:
- user question
- structured filter output
- ranking cards for the candidate cohort

Output:
- shortlist of contact ids
- brief reasons
- optional note about weak cohort coverage

### Pass 2: Grounded synthesis pass

Inputs:
- user question
- shortlist contact dossiers
- raw evidence chunks for shortlisted contacts

Output:
- existing `AdminAiResponse` shape
- citations pointing to raw chunks

For contact-scoped questions, keep a one-pass answer flow:
- dossier first
- raw chunks second
- final synthesis once

## Task 1: Add Memory Storage Foundations

**Files:**
- Create: `supabase/migrations/20260416000001_admin_ai_memory_foundation.sql`
- Create: `src/types/admin-ai-memory.ts`
- Test: `src/lib/data/admin-ai-memory.test.ts`

- [ ] **Step 1: Write failing tests for the new persisted memory row shapes**

Add tests that exercise:
- chunk insert / upsert behavior
- dossier upsert behavior
- ranking card upsert behavior
- stale artifact lookup by contact id

Test the contracts, not SQL syntax. Use mocked Supabase responses in `src/lib/data/admin-ai-memory.test.ts`.

- [ ] **Step 2: Run the targeted test file and confirm it fails for missing module / functions**

Run:

```bash
npx vitest run src/lib/data/admin-ai-memory.test.ts
```

Expected:
- failing import or missing helper failures

- [ ] **Step 3: Add the migration for the new memory tables**

Implement:
- `crm_ai_evidence_chunks`
- `crm_ai_contact_dossiers`
- `crm_ai_contact_ranking_cards`
- `crm_ai_embeddings`

Also include:
- `updated_at` maintenance where needed
- admin-only RLS
- indexes for contact/time lookups and text search

Do **not** alter or remove existing `admin_ai_*` tables.

- [ ] **Step 4: Define shared TypeScript contracts in `src/types/admin-ai-memory.ts`**

Include types for:
- `CrmAiEvidenceChunk`
- `CrmAiContactDossier`
- `CrmAiContactRankingCard`
- `CrmAiEmbeddingRow`
- `DossierSignalEntry`
- `DossierSourceCoverage`
- `DossierEvidenceAnchor`

Keep JSON fields typed explicitly enough for downstream code to rely on them.

- [ ] **Step 5: Implement the data-layer helpers in `src/lib/data/admin-ai-memory.ts`**

Add focused helpers for:
- `upsertEvidenceChunks(...)`
- `listEvidenceChunksByContact(...)`
- `upsertContactDossier(...)`
- `getContactDossier(...)`
- `listContactDossiers(...)`
- `upsertRankingCard(...)`
- `listRankingCards(...)`
- `findStaleContactMemory(...)`

All writes should go through `requireAdmin()`. Reads should use server-side Supabase and respect RLS.

- [ ] **Step 6: Run the targeted tests and make them pass**

Run:

```bash
npx vitest run src/lib/data/admin-ai-memory.test.ts
```

Expected:
- PASS

- [ ] **Step 7: Apply the migration locally**

Run:

```bash
supabase db push --local
```

Expected:
- new tables visible locally
- no regression to existing `admin_ai_*` tables

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260416000001_admin_ai_memory_foundation.sql src/types/admin-ai-memory.ts src/lib/data/admin-ai-memory.ts src/lib/data/admin-ai-memory.test.ts
git commit -m "feat: add admin ai memory storage foundation"
```

## Task 2: Normalize Current CRM Sources Into Evidence Chunks

**Files:**
- Create: `src/lib/admin-ai-memory/source-types.ts`
- Create: `src/lib/admin-ai-memory/chunk-schemas.ts`
- Create: `src/lib/admin-ai-memory/chunk-builder.ts`
- Test: `src/lib/admin-ai-memory/chunk-builder.test.ts`

- [ ] **Step 1: Write failing tests for chunk normalization**

Cover:
- application free-text answers become one chunk per allowlisted field
- contact notes become chunks with correct provenance
- application admin notes become chunks with stable source ids
- blank strings are ignored
- `content_hash` changes when text changes

- [ ] **Step 2: Run the targeted test file and confirm it fails**

```bash
npx vitest run src/lib/admin-ai-memory/chunk-builder.test.ts
```

Expected:
- FAIL for missing implementation

- [ ] **Step 3: Define source-type constants and schemas**

In `source-types.ts` and `chunk-schemas.ts`, define:
- chunk source enum
- normalized chunk input schema
- helper schemas for dossier generation inputs

Reuse the existing allowlisted text fields from `src/lib/admin-ai/field-config.ts`. Do **not** create a new independent allowlist for current CRM text fields.

- [ ] **Step 4: Implement `chunk-builder.ts`**

Add functions:
- `buildApplicationAnswerChunks(application)`
- `buildContactNoteChunks(contactNotes)`
- `buildApplicationAdminNoteChunks(application)`
- `buildCurrentCrmChunksForContact({ contact, applications, notes })`

Each chunk should produce:
- stable `source_type`
- stable `source_id`
- `source_timestamp`
- `metadata_json`
- deterministic `content_hash`

Use a deterministic hash helper based on the exact text + source id. Keep it local to this module unless reused elsewhere.

- [ ] **Step 5: Wire a data fetch helper for current-source chunk building**

Either:
- add a focused data-layer helper here
or
- add one small helper in `src/lib/data/admin-ai-memory.ts`

It must fetch, in one contact-scoped call graph:
- contact
- applications
- contact notes

Do not reach through `AdminDataProvider`.

- [ ] **Step 6: Run the targeted tests and make them pass**

```bash
npx vitest run src/lib/admin-ai-memory/chunk-builder.test.ts
```

Expected:
- PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin-ai-memory/source-types.ts src/lib/admin-ai-memory/chunk-schemas.ts src/lib/admin-ai-memory/chunk-builder.ts src/lib/admin-ai-memory/chunk-builder.test.ts src/lib/data/admin-ai-memory.ts
git commit -m "feat: normalize current crm sources into ai chunks"
```

## Task 3: Generate Structured Contact Dossiers

**Files:**
- Create: `src/lib/admin-ai-memory/dossier-schema.ts`
- Create: `src/lib/admin-ai-memory/dossier-prompt.ts`
- Create: `src/lib/admin-ai-memory/dossier-generator.ts`
- Test: `src/lib/admin-ai-memory/dossier-generator.test.ts`

- [ ] **Step 1: Write failing tests for dossier generation contract**

Cover:
- valid dossier parses into schema
- summary cannot be the only signal carrier
- major sections exist: facts, signals, contradictions, unknowns, evidence anchors, summaries
- unknown chunk references are rejected

- [ ] **Step 2: Run the targeted test and confirm it fails**

```bash
npx vitest run src/lib/admin-ai-memory/dossier-generator.test.ts
```

Expected:
- FAIL

- [ ] **Step 3: Implement `dossier-schema.ts`**

Define the exact structured output schema for a dossier generation call.

Include:
- `facts`
- `signals`
- `contradictions`
- `unknowns`
- `evidenceAnchors`
- `summary.short`
- `summary.medium`

Every evidence anchor must point to known chunk ids.

- [ ] **Step 4: Implement `dossier-prompt.ts`**

Prompt requirements:
- answer only from supplied chunks and structured facts
- preserve important fit signals and concerns
- explicitly surface contradictions and unknowns
- do not overclaim
- return structured JSON only

Do **not** ask it to create personality types.

- [ ] **Step 5: Implement `dossier-generator.ts`**

Add:
- `generateContactDossier({ contactFacts, chunks })`
- validation against the dossier schema
- evidence-anchor resolution against provided chunk ids

Reuse the current OpenAI provider infrastructure where practical, but do **not** couple dossier generation to the final `AdminAiResponse` schema.

If needed, add a small provider helper rather than mutating `provider.ts` into a god file.

- [ ] **Step 6: Decide and document the dossier model**

Use a dedicated env var if you need a different model, for example:
- `OPENAI_DOSSIER_MODEL`

If absent, it may fall back to `OPENAI_MODEL`, but document the fallback clearly in README updates later.

- [ ] **Step 7: Run the targeted tests and make them pass**

```bash
npx vitest run src/lib/admin-ai-memory/dossier-generator.test.ts
```

Expected:
- PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin-ai-memory/dossier-schema.ts src/lib/admin-ai-memory/dossier-prompt.ts src/lib/admin-ai-memory/dossier-generator.ts src/lib/admin-ai-memory/dossier-generator.test.ts
git commit -m "feat: add contact dossier generation"
```

## Task 4: Derive Ranking Cards And Freshness Rules

**Files:**
- Create: `src/lib/admin-ai-memory/ranking-card.ts`
- Create: `src/lib/admin-ai-memory/freshness.ts`
- Test: `src/lib/admin-ai-memory/ranking-card.test.ts`
- Test: `src/lib/admin-ai-memory/freshness.test.ts`

- [ ] **Step 1: Write failing tests for ranking-card derivation**

Cover:
- ranking card is deterministic from dossier
- it keeps key facts
- it preserves top fit signals and top concerns
- it stays compact

- [ ] **Step 2: Write failing tests for freshness decisions**

Cover:
- missing dossier => stale
- source fingerprint mismatch => stale
- missing ranking card => stale
- dossier/ranking versions behind current generator version => stale

- [ ] **Step 3: Run both test files and confirm they fail**

```bash
npx vitest run src/lib/admin-ai-memory/ranking-card.test.ts src/lib/admin-ai-memory/freshness.test.ts
```

- [ ] **Step 4: Implement `ranking-card.ts`**

Add:
- `buildRankingCardFromDossier(dossier)`

It should output a compact artifact that contains:
- minimal facts relevant to ranking
- top fit signals
- top concerns
- confidence notes
- short summary

Do not make a second model call here. This should be a deterministic projection from the dossier.

- [ ] **Step 5: Implement `freshness.ts`**

Add helpers such as:
- `computeChunkSourceFingerprint(chunks)`
- `isDossierStale({ dossier, chunks, generatorVersion })`
- `isRankingCardStale({ rankingCard, dossier })`
- `needsContactMemoryRebuild(...)`

Use fingerprints + generator versioning, not vague timestamp-only heuristics.

- [ ] **Step 6: Run the targeted tests and make them pass**

```bash
npx vitest run src/lib/admin-ai-memory/ranking-card.test.ts src/lib/admin-ai-memory/freshness.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin-ai-memory/ranking-card.ts src/lib/admin-ai-memory/freshness.ts src/lib/admin-ai-memory/ranking-card.test.ts src/lib/admin-ai-memory/freshness.test.ts
git commit -m "feat: add dossier freshness and ranking cards"
```

## Task 5: Build Contact Memory Rebuild And Backfill Flow

**Files:**
- Create: `src/lib/admin-ai-memory/backfill.ts`
- Create: `scripts/admin-ai-memory/backfill.ts`
- Test: `src/lib/admin-ai-memory/backfill.test.ts`

- [ ] **Step 1: Write failing tests for one-contact rebuild orchestration**

Cover:
- fetch current CRM data for one contact
- normalize chunks
- upsert chunks
- generate dossier
- upsert dossier
- build ranking card
- upsert ranking card

- [ ] **Step 2: Write failing tests for backfill iteration**

Cover:
- iterates all contacts
- supports limiting / batching
- keeps going past individual contact failures while reporting them

- [ ] **Step 3: Run the targeted tests and confirm they fail**

```bash
npx vitest run src/lib/admin-ai-memory/backfill.test.ts
```

- [ ] **Step 4: Implement `backfill.ts`**

Add:
- `rebuildContactMemory(contactId)`
- `backfillContactMemory({ limit?, contactIds? })`

Return explicit stats:
- contacts processed
- contacts succeeded
- contacts failed
- chunks upserted
- dossiers upserted
- ranking cards upserted

- [ ] **Step 5: Implement `scripts/admin-ai-memory/backfill.ts`**

Provide a local command entrypoint that can:
- rebuild all contacts
- rebuild a single contact
- rebuild a provided list

Keep it simple and CLI-friendly.

- [ ] **Step 6: Run the targeted tests and make them pass**

```bash
npx vitest run src/lib/admin-ai-memory/backfill.test.ts
```

- [ ] **Step 7: Manually dry-run a backfill locally**

Run:

```bash
node scripts/admin-ai-memory/backfill.ts --limit=5
```

Expected:
- processes 5 contacts
- writes chunks / dossiers / ranking cards
- exits with a readable summary

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin-ai-memory/backfill.ts src/lib/admin-ai-memory/backfill.test.ts scripts/admin-ai-memory/backfill.ts
git commit -m "feat: add admin ai memory rebuild flow"
```

## Task 6: Add Memory-Aware Retrieval Helpers

**Files:**
- Create: `src/lib/admin-ai-memory/global-retrieval.ts`
- Create: `src/lib/admin-ai-memory/contact-retrieval.ts`
- Test: `src/lib/admin-ai-memory/global-retrieval.test.ts`
- Test: `src/lib/admin-ai-memory/contact-retrieval.test.ts`

- [ ] **Step 1: Write failing tests for global retrieval**

Cover:
- structured filters still narrow the cohort
- ranking cards are loaded for the cohort
- missing/stale cards are detected
- raw evidence expansion is limited to shortlisted contacts

- [ ] **Step 2: Write failing tests for contact retrieval**

Cover:
- dossier loads first
- raw chunk selection is contact-scoped
- fallback works when dossier is missing or stale

- [ ] **Step 3: Run the targeted tests and confirm they fail**

```bash
npx vitest run src/lib/admin-ai-memory/global-retrieval.test.ts src/lib/admin-ai-memory/contact-retrieval.test.ts
```

- [ ] **Step 4: Implement `contact-retrieval.ts`**

Add:
- `assembleContactScopedMemory({ contactId, question, textFocus })`

It should:
- load or rebuild the dossier if needed
- load relevant raw chunks for that contact
- return a bounded input object for final synthesis

- [ ] **Step 5: Implement `global-retrieval.ts`**

Add:
- `assembleGlobalCohortMemory({ plan })`
- `expandFinalistEvidence({ question, shortlistedContactIds })`

It should:
- reuse existing structured facts filtering where possible
- load ranking cards for the cohort
- return the memory bundle for the ranking pass
- later support dossier + raw evidence expansion for finalists

- [ ] **Step 6: Keep the retrieval path cheap**

For the first implementation:
- allow whole-cohort ranking cards up to a sensible current cap (for example 250 contacts)
- do not load dossiers for everyone
- do not load raw chunks for everyone

This is the main cost-control behavior. Guard it with tests.

- [ ] **Step 7: Run the targeted tests and make them pass**

```bash
npx vitest run src/lib/admin-ai-memory/global-retrieval.test.ts src/lib/admin-ai-memory/contact-retrieval.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin-ai-memory/global-retrieval.ts src/lib/admin-ai-memory/contact-retrieval.ts src/lib/admin-ai-memory/global-retrieval.test.ts src/lib/admin-ai-memory/contact-retrieval.test.ts
git commit -m "feat: add memory-aware admin ai retrieval"
```

## Task 7: Upgrade Orchestrator To Memory-First Query Handling

**Files:**
- Modify: `src/lib/admin-ai/orchestrator.ts`
- Modify: `src/lib/admin-ai/prompt.ts`
- Modify: `src/lib/admin-ai/retrieval.ts` (either narrow or deprecate; do not leave dead code)
- Test: `src/lib/admin-ai/orchestrator.test.ts`

- [ ] **Step 1: Write failing tests for the new orchestration split**

Cover:
- global questions use ranking pass + grounded synthesis pass
- contact questions use dossier-first synthesis
- final answer still persists citations as raw evidence chunks
- insufficient evidence still short-circuits safely

- [ ] **Step 2: Run the targeted test and confirm it fails**

```bash
npx vitest run src/lib/admin-ai/orchestrator.test.ts
```

- [ ] **Step 3: Add ranking-pass prompt support**

In `prompt.ts`, add a dedicated prompt/schema for the ranking pass.

It should output:
- shortlisted contact ids
- short reasons
- optional cohort uncertainty

This is **not** the final user-visible answer.

- [ ] **Step 4: Update `orchestrator.ts`**

Global path:
- build query plan
- assemble cohort ranking memory
- run ranking pass
- expand finalist dossiers + raw chunks
- run final synthesis
- persist answer + citations

Contact path:
- build query plan
- assemble contact dossier + raw chunks
- run final synthesis
- persist answer + citations

Preserve the existing `AdminAiResponse` contract for the UI.

- [ ] **Step 5: Keep current thread/message/citation persistence intact**

Do not change the UI message model. The upgraded orchestration should still save:
- user message
- assistant message
- citations

No new streaming/tool-call content types.

- [ ] **Step 6: Run the targeted tests and make them pass**

```bash
npx vitest run src/lib/admin-ai/orchestrator.test.ts
```

- [ ] **Step 7: Run the existing admin AI action tests to catch integration regressions**

```bash
npx vitest run 'src/app/(dashboard)/admin/admin-ai/actions.test.ts'
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin-ai/orchestrator.ts src/lib/admin-ai/prompt.ts src/lib/admin-ai/retrieval.ts src/lib/admin-ai/orchestrator.test.ts src/app/(dashboard)/admin/admin-ai/actions.test.ts
git commit -m "feat: switch admin ai to memory-first orchestration"
```

## Task 8: Add Dossier Evaluation Harness And Gold Set Scaffolding

**Files:**
- Create: `src/lib/admin-ai-memory/eval-rubric.ts`
- Create: `src/lib/admin-ai-memory/eval-rubric.test.ts`
- Create: `scripts/admin-ai-memory/eval.ts`
- Create: `docs/superpowers/evals/admin-ai-memory-gold-set.md`

- [ ] **Step 1: Write failing tests for rubric scoring helpers**

Cover:
- category scores stay in `0 | 1 | 2`
- total score sums correctly
- hard-fail rules override totals

- [ ] **Step 2: Run the targeted test and confirm it fails**

```bash
npx vitest run src/lib/admin-ai-memory/eval-rubric.test.ts
```

- [ ] **Step 3: Implement `eval-rubric.ts`**

Encode the rubric from the approved design:
- factual accuracy
- fit-signal recall
- concern recall
- contradiction handling
- uncertainty honesty
- evidence grounding
- usefulness for ranking

Also encode hard-fail semantics:
- factual hallucination on core facts
- missing obvious major concern
- unsupported strong inference

- [ ] **Step 4: Implement `scripts/admin-ai-memory/eval.ts`**

This script does **not** need to integrate LangSmith / Phoenix on day one.
It should at minimum:
- load dossier artifacts
- load a local gold-set file
- print score breakdowns
- compare model/prompt versions cleanly

Keep the format plain enough that a third-party eval platform can be added later without replacing local evaluation.

- [ ] **Step 5: Document how to create the gold set**

In `docs/superpowers/evals/admin-ai-memory-gold-set.md`, describe:
- how many contacts to review
- how to choose edge cases
- how to apply the rubric
- what reviewers should look for

Do not commit real PII-rich review notes into the repo. Use anonymized or synthetic examples if sample content is needed.

- [ ] **Step 6: Run the targeted tests and make them pass**

```bash
npx vitest run src/lib/admin-ai-memory/eval-rubric.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin-ai-memory/eval-rubric.ts src/lib/admin-ai-memory/eval-rubric.test.ts scripts/admin-ai-memory/eval.ts docs/superpowers/evals/admin-ai-memory-gold-set.md
git commit -m "feat: add dossier evaluation rubric and harness"
```

## Task 9: Wire Docs, Backfill, And Local Verification

**Files:**
- Modify: `README.md`
- Modify: `e2e/admin-ai-analyst.spec.ts` (only if UI assumptions changed)

- [ ] **Step 1: Document env vars and commands**

Update `README.md` with:
- memory architecture overview
- `OPENAI_DOSSIER_MODEL` if introduced
- backfill command
- evaluation command
- note that embeddings are schema-ready but not active in current CRM retrieval

- [ ] **Step 2: Seed / backfill local memory artifacts**

Run:

```bash
node scripts/admin-ai-memory/backfill.ts
```

Expected:
- current contacts produce chunks / dossiers / ranking cards

- [ ] **Step 3: Run focused admin AI tests**

```bash
npx vitest run \
  src/lib/data/admin-ai-memory.test.ts \
  src/lib/admin-ai-memory/chunk-builder.test.ts \
  src/lib/admin-ai-memory/dossier-generator.test.ts \
  src/lib/admin-ai-memory/ranking-card.test.ts \
  src/lib/admin-ai-memory/freshness.test.ts \
  src/lib/admin-ai-memory/global-retrieval.test.ts \
  src/lib/admin-ai-memory/contact-retrieval.test.ts \
  src/lib/admin-ai-memory/eval-rubric.test.ts \
  src/lib/admin-ai/orchestrator.test.ts \
  'src/app/(dashboard)/admin/admin-ai/actions.test.ts'
```

Expected:
- PASS

- [ ] **Step 4: Run the full unit suite**

```bash
npm run test:unit
```

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

- [ ] **Step 6: Run build**

```bash
npm run build
```

- [ ] **Step 7: Run focused browser verification**

```bash
npx playwright test e2e/admin-ai-analyst.spec.ts
```

- [ ] **Step 8: Optional low-cost live verification**

Only if provider env is configured and the feature is otherwise green:
- run one contact-scoped live query
- use the cheapest model configured for testing
- keep the prompt minimal

Do not burn multiple paid requests while debugging predictable local failures.

- [ ] **Step 9: Commit**

```bash
git add README.md e2e/admin-ai-analyst.spec.ts
git commit -m "docs: add admin ai memory architecture usage"
```

## Task 10: Future-Scoped Work Items (Do Not Start Unless Explicitly Requested)

These are intentionally separated from the current implementation effort.

### Future Task A: External source ingestion

Implement only when real source connectors are ready:
- WhatsApp ingestion
- Instagram ingestion
- Zoom transcript ingestion

Each new source should:
- land in raw source storage
- normalize into chunks
- trigger per-contact memory refresh

### Future Task B: Activate embeddings

Implement only when long-form unstructured data is large enough to justify it:
- choose embedding model + vector dimension
- populate `crm_ai_embeddings`
- add hybrid retrieval path over chunks
- keep structured facts + ranking cards + raw evidence in the loop

### Future Task C: External evaluation platform

Only after the local rubric + gold-set harness exists and is useful:
- wire LangSmith, Phoenix, Braintrust, or equivalent
- keep the local rubric source of truth in-repo

## Self-Review

### Spec coverage

This plan covers the approved spec sections:
- goals list -> memory-first architecture and global reasoning flow
- 5-layer memory architecture -> migration + types + generation + retrieval tasks
- dossier quality rubric -> dedicated evaluation task
- cost-control strategy -> ranking-card-first global path and bounded finalist evidence expansion
- future WhatsApp / Instagram / Zoom path -> explicit extension tasks without premature connector implementation

### Placeholder scan

Reviewed for red flags:
- no `TODO` / `TBD`
- no "add tests later"
- no undefined future helper names without a file home
- embeddings are future-scoped but still concretely isolated

### Type consistency

Kept naming aligned across tasks:
- `crm_ai_evidence_chunks`
- `crm_ai_contact_dossiers`
- `crm_ai_contact_ranking_cards`
- `crm_ai_embeddings`
- ranking pass vs final synthesis pass are explicitly separate

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-ai-admin-memory-architecture.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
