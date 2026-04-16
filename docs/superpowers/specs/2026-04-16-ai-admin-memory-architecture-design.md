# AI Admin Memory Architecture Design

**Status:** approved in conversation, ready for implementation plan
**Date:** 2026-04-16
**Owner:** Andrei

## Context

BTM Hub already has a functioning Phase 1 admin AI analyst:
- read-only
- evidence-backed
- request/response, not streaming
- grounded in existing CRM data
- saves threads, answers, and citations

That implementation is intentionally conservative. It performs one bounded retrieval pass per question, sends a small evidence pack to the model, and produces a cited answer.

That is technically sound, but it is not yet the product the owner actually wants.

The intended product is broader:
- an AI analyst that understands the whole cohort of contacts, not just a narrow retrieved slice
- an AI that can compare candidates using nuanced free-text signals, not only structured filters
- an AI that can grow from applications + notes today into WhatsApp, Instagram, and Zoom tomorrow

The architecture therefore needs to evolve from a **bounded retrieval-only assistant** into a **CRM intelligence layer with external memory**.

## Goals

The upgraded system should allow the AI to:

1. search the whole CRM for the best candidates for a brief, even when the criteria are fuzzy or implicit
2. synthesize large amounts of free text across applications, notes, and later WhatsApp / Instagram / Zoom data
3. infer useful operational qualities conservatively, including motivation, communication style, reliability signals, travel flexibility, fit for a project, and concerns
4. compare contacts across the whole cohort, not only answer one-contact questions
5. explain its reasoning with evidence, so admins can trust and audit the answer
6. get smarter as more sources are added, without becoming a black-box chatbot

## Key Product Clarifications

### This is not model-side "memory"

The system should not rely on:
- fine-tuning the model on CRM data
- hidden long-lived chat history as the canonical memory
- an autonomous agent "remembering" the CRM in-process

Instead, the app should own persistent external memory.

### The model is the reasoner, not the source of truth

The source of truth remains:
- raw CRM data
- normalized evidence chunks
- derived contact memory owned by the app

The model is used for:
- extraction
- summarization
- ranking
- final synthesis

### Whole-cohort awareness is a real requirement

The owner does not merely want:
- exact filtering with some natural-language sugar

The owner does want:
- whole-cohort comparison
- broad awareness of the applicant pool
- stronger semantic understanding of text-heavy answers

That requirement drives the need for persistent contact memory artifacts such as dossiers and ranking cards.

## Chosen Architecture

The chosen direction is a **5-layer external-memory architecture**:

1. Raw sources
2. Normalized evidence chunks
3. Derived contact dossiers
4. Embeddings / vector index
5. Answer-time synthesis

This is the recommended architecture because it:
- preserves the current grounded-answer core
- gives the system broad cohort awareness
- keeps raw evidence citable
- scales into long unstructured data later

## Layer 1: Raw Sources

Raw sources remain the canonical business data.

Current sources:
- applications
- contact notes
- application admin notes

Future sources:
- WhatsApp messages
- Instagram DMs
- Zoom transcripts

Rules:
- raw sources are never replaced by summaries
- raw sources remain the audit trail
- raw sources are the final evidence surface for citations

## Layer 2: Normalized Evidence Chunks

All AI-facing retrieval should operate on normalized evidence chunks rather than directly on source-specific tables.

This layer should unify:
- short application free-text fields
- contact notes
- application admin notes
- future message/transcript chunks

Each chunk should carry:
- `id`
- `contact_id`
- `application_id` when relevant
- `source_type`
- `source_id`
- `source_timestamp`
- `text`
- `metadata_json`
- `content_hash`
- `chunk_version`

Responsibilities:
- provide a unified retrieval surface
- support FTS immediately
- support embeddings later
- preserve provenance back to raw sources

## Layer 3: Derived Contact Dossiers

Each contact should have one continuously updated dossier that acts as the long-lived AI memory for that contact.

The dossier is not just a paragraph summary. It is a structured memory artifact.

It should contain:
- stable facts
- extracted signals
- contradictions
- unknowns
- confidence metadata
- evidence anchors
- short summary
- medium summary
- source coverage metadata

Suggested high-level shape:

```ts
type ContactDossier = {
  contactId: string;
  dossierVersion: number;
  lastBuiltAt: string;
  sourceCoverage: {
    applicationCount: number;
    contactNoteCount: number;
    applicationAdminNoteCount: number;
    whatsappMessageCount: number;
    instagramMessageCount: number;
    zoomChunkCount: number;
  };
  facts: Record<string, unknown>;
  signals: {
    motivation: SignalEntry[];
    communicationStyle: SignalEntry[];
    reliabilitySignals: SignalEntry[];
    fitSignals: SignalEntry[];
    concerns: SignalEntry[];
  };
  contradictions: string[];
  unknowns: string[];
  evidenceAnchors: Array<{
    claim: string;
    chunkIds: string[];
    confidence: "high" | "medium" | "low";
  }>;
  summary: {
    short: string;
    medium: string;
  };
};

type SignalEntry = {
  value: string;
  confidence: "high" | "medium" | "low";
};
```

### Ranking cards

The dossier layer should also expose a smaller whole-cohort representation per contact.

This can be a derived artifact stored separately for cheaper reads:
- key facts
- top fit signals
- top concerns
- confidence notes
- short summary

This ranking card is what whole-cohort prompts should use first.

## Layer 4: Embeddings / Vector Index

Embeddings should not be the source of truth. They are retrieval infrastructure.

The system should support embeddings for:
- semantically rich normalized evidence chunks
- optionally later, compact dossier summaries

Embeddings are not required for the current application-only CRM to function well.
They become much more important when long-form conversation data arrives.

Recommended policy:
- Phase 1 of this architecture upgrade: embeddings optional
- Future conversation-ingestion phase: embeddings expected

## Layer 5: Answer-Time Synthesis

Answer-time synthesis should follow a progressive narrowing flow.

For whole-cohort questions:
1. parse the question
2. apply structured filters where available
3. load ranking cards for the relevant cohort
4. shortlist likely contacts
5. load fuller dossiers and raw evidence for finalists
6. produce final grounded answer with citations

For contact-specific questions:
1. load the contact dossier
2. load relevant raw evidence chunks for that contact
3. produce final grounded answer with citations

Important rule:
- final answers should cite raw evidence chunks, not dossier prose alone

The dossier helps the system think.
Raw chunks help the system justify.

## Retrieval Strategy By Question Type

### Whole-cohort ranking questions

Examples:
- "Who are the best candidates for this trip?"
- "Who seems most reliable and adaptable?"

Path:
- structured facts filter
- ranking cards first
- dossier refinement second
- raw evidence expansion for finalists
- final synthesis

### Contact-scoped synthesis questions

Examples:
- "Summarize this person's fit"
- "What do we know about their communication style?"

Path:
- dossier first
- raw evidence second
- final synthesis

### Fact-ish lookup questions

Examples:
- "Who is accepted?"
- "Who is willing to travel internationally?"

Path:
- structured facts first
- dossier or raw evidence only if the question requests interpretation

### Semantic text-heavy questions

Examples:
- "Who sounds deeply mission-driven?"
- "Who seems self-directed but realistic?"

Path today:
- ranking cards / dossier summaries
- FTS over chunks
- raw evidence expansion

Path later with conversation data:
- ranking cards / dossier summaries
- vector retrieval over chunks
- FTS as supporting signal
- raw evidence expansion

## Why This Is Better Than the Current Architecture

The current architecture is optimized for:
- bounded retrieval
- cheap requests
- high-trust local answers

The upgraded architecture adds:
- persistent contact memory
- stronger whole-cohort awareness
- better semantic comparison over text-heavy candidates
- a future-proof path to chats and transcripts

Without this architecture, the system would face two bad choices:
- send too much raw CRM text every time
- or stay too narrow to answer the real product questions

The 5-layer model avoids both.

## Freshness And Update Model

Freshness should propagate forward from raw sources.

### Raw source changes

When a source changes for a contact:
- new application
- new note
- note edit
- future message/transcript ingestion

The system should:
1. update normalized chunks for that contact
2. mark dossier and ranking artifacts stale
3. rebuild dossier
4. rebuild ranking card
5. optionally update embeddings

This should be incremental per contact, not a full-database rebuild.

### Staleness handling

Artifacts should carry:
- prompt / schema version
- last built timestamp
- last incorporated source timestamp or hash

This lets the system:
- detect stale dossiers
- rebuild selectively
- compare quality across versions

## Dossier Quality Rubric

The system needs an explicit rubric for evaluating dossier quality.

Each dossier should be scored on:
1. factual accuracy
2. fit-signal recall
3. concern recall
4. contradiction handling
5. uncertainty honesty
6. evidence grounding
7. usefulness for ranking

Each category is scored:
- `0 = bad`
- `1 = mixed`
- `2 = good`

Suggested thresholds:
- `12-14`: strong
- `9-11`: acceptable but needs tuning
- `0-8`: not good enough

Hard-fail rules:
- factual hallucination on core facts
- missing an obvious major concern
- unsupported strong inference

## Evaluation Strategy

The system should not rely on "looks good to me" evaluation.

It should use:
- deterministic validations
- a small human-reviewed gold set
- optional LLM-as-judge comparisons
- sampled production review later

### Gold set

Use a deliberately chosen set of 20-30 contacts that includes:
- easy cases
- sparse-data cases
- contradictory-data cases
- high-text cases
- operationally risky edge cases

Humans review these dossiers with the rubric.

This is not full-manual review of the whole CRM.
It is a reusable calibration set.

## Cost Strategy

The architecture should reduce cost by:
- storing memory externally instead of re-sending all raw data
- using ranking cards for whole-cohort awareness
- using dossiers for richer per-contact memory
- expanding raw evidence only for finalists

This keeps paid API usage feasible while preserving broad cohort awareness.

## Non-Goals

This architecture should not rely on:
- model fine-tuning as the CRM memory layer
- hidden persistent in-model memory as the truth source
- whole raw-CRM prompts on every question
- dossier-only citations without raw-evidence backing
- replacing structured retrieval with vectors

## Migration Strategy

This should be an evolution of the existing system, not a rewrite.

Keep:
- current admin AI UI
- current thread/message/citation persistence
- current final answer contract
- current grounded-answer orchestrator as the final citation path

Add:
- normalized chunk storage
- dossier storage
- ranking card storage
- regeneration pipeline
- later embeddings

## Phased Rollout

### Phase 1: Memory foundation
- chunk storage
- dossier storage
- ranking-card storage
- per-contact regeneration

### Phase 2: Memory-first global reasoning
- whole-cohort queries use ranking cards first
- dossier refinement for shortlist quality
- final evidence expansion remains grounded

### Phase 3: Quality hardening
- rubric-based eval set
- automated validations
- prompt/version comparison workflow

### Phase 4: External source ingestion
- WhatsApp / Instagram / Zoom into raw source + chunk layers
- incremental dossier refresh

### Phase 5: Hybrid retrieval
- embeddings
- vector retrieval
- hybrid search over structured facts + memory + raw evidence

## Decision Summary

The system should become:
- a CRM intelligence layer with persistent external memory
- not a chatbot that re-learns the CRM on every prompt
- not a model that silently "remembers" the CRM internally

This architecture best matches the owner's real goal:
- broad cohort understanding now
- scalable text-heavy reasoning later
- high-trust, evidence-backed answers throughout
