# Admin AI Memory Runtime Notes

This file is a tracked runtime supplement to the local wiki topics:
- `wiki/topics/admin-ai.md`
- `wiki/topics/admin-ai-memory.md`

Use it as the source for the current implementation details that matter when continuing work on the admin AI analyst and memory layer.

For the clearest high-level runtime walkthrough, also read:
- [docs/admin-ai-analyst-current-flow.md](../admin-ai-analyst-current-flow.md)

## Debug flag

Set:
- `DEBUG_ADMIN_AI=1`

to emit step-level server logs for:
- action entry / failure
- query plan shape
- dossier cohort size and token estimate
- single-pass cohort timing
- hybrid evidence retrieval
- contact-scoped memory assembly
- final synthesis timing
- raw OpenAI call timing, model, response id, and timeout/error status

## Current Runtime Truths

### Raw CRM data is the source of truth

The source of truth is still the underlying CRM data:
- `applications.answers`
- `applications.admin_notes`
- `contact_notes`
- `contact_tags`
- `contacts`

The memory layer is derived context:
- `crm_ai_evidence_chunks`
- `crm_ai_evidence_subchunks`
- `crm_ai_fact_observations`
- `crm_ai_contact_dossiers`

Final answers must still cite raw chunk-backed evidence, not dossier prose alone.

### Global memory refresh is non-blocking

Global cohort retrieval no longer waits on synchronous dossier rebuilds.

Current behavior:
- `assembleGlobalSinglePassCohort()` serves the dossiers that already exist
- it schedules a narrow background refresh with `after()` from `next/server`
- it does not block the current user request on OpenAI rebuild calls

Current cap:
- `MAX_BACKGROUND_MEMORY_REFRESHES = 1`

Relevant file:
- [src/lib/admin-ai-memory/global-retrieval.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/global-retrieval.ts)

### Global questions now use one single-pass dossier cohort

The default global path is now:
1. build exact structured filters with the deterministic planner
2. load the whole eligible dossier cohort
3. build a bounded ask-time projection for every eligible contact
4. derive a stable `promptCacheKey` from that cohort projection
5. dynamically retrieve raw evidence across the cohort with hybrid lexical + vector retrieval
6. send one cohort call with the cache-friendly profile scaffold plus the dynamic evidence pack
7. strip any unsupported citations and drop uncited shortlist entries before persistence

There is no ranking-card layer and no separate shortlist-model pass anymore.

### Limited cohort coverage is surfaced, not hidden

If contacts are missing dossiers or the cohort had to serve soft-stale dossiers, that limited coverage is surfaced through:
- `contactsMissingDossiers`
- `contactsServingStaleDossiers`
- projection-level `memoryStatus = fresh | stale | missing`

That means the one-pass cohort call can still see every eligible contact without pretending all memory is equally fresh.

### Historical migration note

The repo still contains historical ranking-card migrations because those files were already applied in real environments before the single-pass refactor removed that layer.

Current rule:
- do not rewrite or delete already-applied migrations just to make the history look cleaner
- use forward-only cleanup migrations, like `20260418000001_admin_ai_remove_ranking_cards.sql`, to reach the final schema state

If we ever want a cleaner migration history, that should be a deliberate baseline/squash task coordinated across environments, not an ad hoc edit to applied files.

### Contact-scoped reads only sync-rebuild on hard drift

Contact retrieval uses a narrow sync-rebuild posture.

It only sync-rebuilds on read when the dossier is:
- missing
- on an old `generator_version`
- on an old `dossier_version`

It does **not** sync-rebuild just because `stale_at` is set.

Soft-stale dossiers continue serving reads until backfill or an explicit rebuild catches up.

Relevant file:
- [src/lib/admin-ai-memory/contact-retrieval.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/contact-retrieval.ts)

### Application admin-note chunk IDs are stable

Application admin-note chunks no longer use positional source IDs like:
- `${application.id}:an:${index}`

They now use a stable fingerprint-based source ID derived from:
- `application.id`
- `author_id`
- `created_at`

This prevents surviving notes from "moving" when another note is deleted from the JSONB array.

Relevant file:
- [src/lib/admin-ai-memory/chunk-builder.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/chunk-builder.ts)

### Current CRM evidence is versioned, not destructively pruned

Before rebuilding dossier memory, the system now:
- keeps a stable `logical_source_id` per mutable source slot
- inserts a new chunk version when the rendered evidence changes
- marks the older current version with `superseded_at`

So answer-time retrieval can default to current evidence while still preserving older observations for conflict/timeline work.

Current evidence surface now includes:
- free-text application answers
- synthetic structured-field chunks for application fields
- contact notes
- application admin notes
- synthetic contact-tag chunks

On top of that, the current rebuild path now appends a direct fact ledger:
- `crm_ai_fact_observations`
- populated from current structured-field and contact-tag chunks
- idempotent on rerun for the same chunk version
- additive when a field or tag assignment changes over time

The current evidence surface also derives retrievable subchunks:
- `crm_ai_evidence_subchunks`
- every current chunk yields at least one subchunk
- oversized free-text sources split deterministically with overlap
- short structured chunks stay as a single retrievable subchunk
- subchunk ids are stable per parent chunk id + subchunk index

Embeddings are now wired into the retrieval path:
- `crm_ai_embeddings` can target `subchunk`
- contextualized embedding text is built from the parent chunk metadata plus subchunk text
- query-time hybrid retrieval now fuses:
  - vector hits over subchunks
  - lexical hits over canonical chunks
  - recent-evidence fallback when both are empty

Relevant helpers:
- `supersedeStaleCurrentCrmEvidenceChunksForContact()` in [src/lib/data/admin-ai-memory.ts](/Users/andrei/Dev/btm-hub/src/lib/data/admin-ai-memory.ts)
- `upsertFactObservations()` in [src/lib/data/admin-ai-memory.ts](/Users/andrei/Dev/btm-hub/src/lib/data/admin-ai-memory.ts)
- `buildFactObservationsFromChunks()` in [src/lib/admin-ai-memory/fact-observations.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/fact-observations.ts)
- `buildEvidenceSubchunks()` in [src/lib/admin-ai-memory/subchunk-builder.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/subchunk-builder.ts)
- `generateSubchunkEmbeddings()` in [src/lib/admin-ai-memory/embeddings.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/embeddings.ts)
- `retrieveHybridEvidence()` in [src/lib/admin-ai-memory/retrieval-fusion.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/retrieval-fusion.ts)
- mirrored logic in [scripts/admin-ai-memory/_runner.ts](/Users/andrei/Dev/btm-hub/scripts/admin-ai-memory/_runner.ts)

This is especially important for application answers, structured form fields, tags, deleted admin notes, and any future mutable CRM evidence.

### Dossier anchors persist stable chunk IDs

At rebuild time:
- `rebuildContactMemory()` passes stable chunk IDs into the dossier generator
- `dossier-generator.ts` converts them into prompt-local labels like `chunk_1`
- the generator remaps returned anchors back to the stable IDs before persistence

So persisted dossier anchors should always point at real chunk rows, not prompt-local labels.

Relevant files:
- [src/lib/admin-ai-memory/backfill.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/backfill.ts)
- [src/lib/admin-ai-memory/dossier-generator.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/dossier-generator.ts)

### The CLI backfill path must stay mirrored with the app rebuild path

The request-time rebuild path and the standalone backfill CLI are intentionally parallel implementations.

If you change:
- chunk generation
- stale chunk pruning
- dossier input shape
- anchor behavior

you must update both:
- [src/lib/admin-ai-memory/backfill.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/backfill.ts)
- [scripts/admin-ai-memory/_runner.ts](/Users/andrei/Dev/btm-hub/scripts/admin-ai-memory/_runner.ts)

## Handoff Note For Claude

If you continue implementation from this branch, assume the following are already true:
- global cohort refresh is background-only
- global questions use a single cohort call over dossier projections
- contact sync rebuild is narrow and soft-stale memory can still be served
- admin-note chunk IDs are stable and non-positional
- stale current-CRM chunks are superseded during rebuild/backfill instead of deleted
- direct structured-field and contact-tag observations are appended into `crm_ai_fact_observations`
- current chunks also derive deterministic `crm_ai_evidence_subchunks`
- contact and global reads now use hybrid evidence retrieval
- limited cohort coverage is surfaced through dossier-based coverage fields

Do not reintroduce:
- blocking multi-contact sync rebuilds on the hot path
- semantic pre-shortlisting before the model sees the dossier cohort
- positional admin-note source IDs
- dossier-only final citations
- drift between `backfill.ts` and `_runner.ts`
