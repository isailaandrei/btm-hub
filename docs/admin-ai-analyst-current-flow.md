# Admin AI Analyst Current Flow

This is the tracked source of truth for how the Admin AI Analyst works today.

Use this together with:
- [docs/debugging/admin-ai-debugging.md](./debugging/admin-ai-debugging.md)
- [docs/debugging/admin-ai-memory-runtime-notes.md](./debugging/admin-ai-memory-runtime-notes.md)

## Core idea

The system has two layers of memory:

1. raw CRM source data
   - applications
   - application admin notes
   - contact notes
   - contact tags
   - contacts
2. derived memory
   - `crm_ai_evidence_chunks`
   - `crm_ai_evidence_subchunks`
   - `crm_ai_fact_observations`
   - `crm_ai_contact_dossiers`

The model reasons over dossiers, but final answers still persist **raw chunk-backed citations**.

## Global flow

Global questions now use a **single-pass whole-cohort profile-scaffold call**.

Runtime steps:

1. validate the question and persist the user message
2. build a deterministic query plan
3. apply only exact structured filters
4. load the whole eligible dossier cohort
5. build a bounded ask-time projection for every eligible contact
6. build a stable prompt-cache key from that cohort projection
7. dynamically retrieve raw evidence across the cohort with hybrid lexical + vector retrieval
8. send one OpenAI call over the cached profile scaffold plus dynamic evidence pack
9. drop any shortlist entry that ends up with zero grounded citations
10. persist the assistant message and raw citations

What the model sees for each contact:
- compact facts
- current structured-field snapshot
- conflict markers for fields with multiple observed values
- short summary
- anchor-backed `supportRefs` as profile context
- contradictions
- unknowns
- `memoryStatus = fresh | stale | missing`

What the model also sees on global questions:
- a dynamic raw evidence pack retrieved for the current question
- raw `evidenceId` values that the final shortlist must cite

What it does **not** see:
- a ranking-card layer
- a semantic pre-shortlist chosen by the app
- all raw chunks for every contact

## Contact flow

Contact-scoped questions still use dossier-plus-evidence synthesis.

Runtime steps:

1. validate the question and persist the user message
2. build a deterministic query plan
3. load the contact dossier
4. sync-rebuild only on hard drift:
   - missing dossier
   - old generator version
   - old dossier schema version
5. retrieve raw chunk evidence for that contact
6. call the model once with dossier + raw evidence
7. resolve citations directly against raw chunk ids
8. persist the assistant message and raw citations

## How memory is built

Per-contact memory rebuild:

1. load the contact’s current CRM sources
2. normalize them into `crm_ai_evidence_chunks`
   - free-text application answers
   - synthetic chunks for structured application fields
   - contact notes
   - application admin notes
   - synthetic chunks for contact tags
3. append direct fact observations from current structured-field and tag chunks
4. derive retrievable subchunks from the current evidence surface
5. supersede old current-CRM chunk versions instead of deleting history
6. compare the live fingerprint and versions against the existing dossier
7. skip if already fresh unless forced
8. build structured facts
9. pick a bounded chunk subset for dossier generation
10. generate the dossier
11. persist the dossier with `stale_at = null`

Important:
- the full chunk set stays in the DB
- current chunks also produce retrievable `crm_ai_evidence_subchunks`
- short structured chunks stay as a single subchunk; only oversized free-text sources split
- the direct fact ledger stays in the DB too and is append-only by chunk version
- mutable evidence keeps historical rows via `logical_source_id` + `superseded_at`
- reruns stay idempotent because chunk ids and direct observation ids are deterministic
- subchunk ids are deterministic too, so future embeddings can target stable retrieval units
- answer-time retrieval defaults to `superseded_at is null`
- only a bounded subset is sent to the dossier generator
- this keeps oversized contacts from timing out rebuilds
- global answer-time prompts now use a stable profile scaffold plus a dynamic evidence pack
- contact answer-time prompts now use hybrid evidence retrieval too

## Freshness policy

Global reads:
- include fresh, stale, and missing dossiers
- do not block on synchronous multi-contact rebuilds
- schedule a very small background refresh via `after()`

Contact reads:
- sync-rebuild only on hard drift
- continue serving soft-stale dossiers until backfill catches up

## What gets persisted

Thread/message history:
- `admin_ai_threads`
- `admin_ai_messages`
- `admin_ai_message_citations`

Memory:
- `crm_ai_evidence_chunks`
- `crm_ai_evidence_subchunks`
- `crm_ai_fact_observations`
- `crm_ai_contact_dossiers`

There is no live `crm_ai_contact_ranking_cards` table anymore.

## Debugging flags

Set:

```bash
DEBUG_ADMIN_AI=1
```

to emit:
- action entry / failure
- query plan shape
- single-pass cohort size and token estimate
- hybrid evidence retrieval results
- evidence-id citation stripping / pruning
- raw OpenAI call timing
- contact-scoped memory assembly
- final persistence path

## Current guardrails

- exact structured filtering is deterministic
- global reasoning is model-driven after the exact filters
- raw chunks remain the citation surface
- unsupported citations are stripped before persistence
- unsupported global shortlist entries are dropped before persistence
- insufficient evidence returns a safe system response instead of bluffing
