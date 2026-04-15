# AI Admin Analyst Design

**Status:** approved, ready for implementation plan  
**Date:** 2026-04-15  
**Owner:** Andrei

## Context

BTM Hub's admin dashboard already contains a meaningful CRM surface:
- contacts
- applications
- tag assignments
- contact notes
- application admin notes
- structured application answers in `applications.answers`

The owner wants an AI-assisted workflow inside admin that can answer both:
- **search questions** like "find candidates for this trip brief"
- **synthesis questions** like "what do we know about this person's fit, reliability, motivation, and communication style?"

Phase 1 should work only on the existing Supabase-backed admin data, but it must be designed so future unstructured sources such as WhatsApp chats, Instagram DMs, and Zoom transcripts can plug into the same retrieval and reasoning pipeline later.

This design intentionally treats the feature as an **evidence-backed admin analyst**, not a free-form autonomous agent.

## Product Decisions

| Dimension | Decision | Rationale |
|---|---|---|
| Scope | Phase 1 uses existing admin data only | Keeps the first version shippable and testable |
| Mutability | Read-only | Avoids mixing analysis with operational writes |
| Privacy | Hosted AI API is allowed | Lowest-friction path to production |
| Trust posture | High-trust answers only | Admins need grounded results, not confident guesses |
| Inference policy | Conservative inference only | Allows useful synthesis without overreaching into personality typing |
| Query styles | Search + synthesis in one UI | Matches the owner's real use cases |
| Surfaces | Global assistant in `/admin` plus contact-scoped assistant on `/admin/contacts/[id]` | Supports broad exploration and deep per-contact analysis |
| Retrieval | Structured retrieval first, text retrieval second, model synthesis last | Best fit for current data shape |
| Search tech | Postgres full-text search before embeddings | Current data volume is small and largely structured |
| Persistence | Save conversations and cited evidence per admin | Needed for auditability and later review |
| Sharing | Threads private to the author admin in Phase 1 | Simplest correct default |

## Goals

1. Let admins ask open-ended questions about contacts using the data already in the CRM.
2. Support both ranking/shortlisting and deeper contact synthesis in a single assistant experience.
3. Make every answer traceable to concrete CRM evidence.
4. Build the retrieval and persistence layers so external sources can be added later without rewriting the product.
5. Keep the implementation efficient: bounded retrieval, no unnecessary server round-trips, and no whole-database prompts.

## Non-goals

- WhatsApp, Instagram, Zoom, email, or other external ingestion in Phase 1
- autonomous writes such as tagging contacts, editing notes, changing statuses, or drafting outreach
- embeddings or vector search in Phase 1
- personality typing or broad psychological profiling
- shared team-visible AI threads in Phase 1
- streaming/token-by-token responses in Phase 1

## Chosen Approach

The chosen architecture is an **evidence-backed copilot**:

1. The app interprets the admin's question into a constrained internal query plan.
2. The server retrieves structured CRM data plus the most relevant free-text evidence.
3. The model synthesizes an answer from that bounded evidence pack only.
4. The answer is rendered with clear sections and first-class citations.

This is not "chat with the whole database." The model never gets unrestricted access to Supabase and never writes SQL.

## High-Trust Contract

In this feature, "high-trust" means:

- the assistant only makes meaningful claims that can be grounded in retrieved CRM data
- the UI separates **facts**, **inferences**, and **uncertainty**
- conservative inferences are allowed, but they must be labeled as inferences
- weak evidence leads to a narrower answer or a refusal, not a guess
- every answer includes citations back to contacts, applications, notes, or free-text answer snippets

Examples of acceptable inference categories:
- communication style
- motivation signals
- reliability signals
- collaboration signals
- fit for a specific context or trip brief

Examples that are out of scope for Phase 1:
- hard personality labels
- psychological diagnoses
- unsupported claims about intent or character

## Phase 1 Data Surface

The assistant can use:

- `contacts`
- `applications`
- `tag_categories`
- `tags`
- `contact_tags`
- `contact_notes`
- application `admin_notes`
- structured answer fields from `applications.answers`
- free-text answer fields from `applications.answers`

Phase 1 should treat free-text evidence as first-class input, not just a fallback. In practice, many of the most useful synthesis questions will rely heavily on:
- `ultimate_vision`
- `inspiration_to_apply`
- `questions_or_concerns`
- `anything_else`
- equipment and experience free-text fields
- contact notes
- admin notes

## Retrieval Architecture

The assistant should not reuse `AdminDataProvider` data from the browser. The retrieval layer must be server-only.

### 1. Internal query plan

The first step is to turn the user's question into a constrained `AiQueryPlan` that the app can validate with Zod.

Suggested shape:

```ts
type AiMode = "global_search" | "contact_synthesis" | "hybrid";

type StructuredFilter = {
  field: string;
  op: "eq" | "in" | "contains" | "exists" | "range";
  value?: string | string[] | { min?: string; max?: string };
};

type AiQueryPlan = {
  mode: AiMode;
  contactId?: string;
  structuredFilters: StructuredFilter[];
  textFocus: string[];
  requestedLimit: number;
};
```

Rules:
- the model may populate this shape, but it may not emit SQL
- fields must be validated against an allowlist
- `requestedLimit` must be clamped server-side
- unsupported requests are rejected before retrieval

### 2. Structured read model

Add a denormalized structured read model for efficient matching over the CRM without repeated joins at answer time.

From the caller's perspective this is the "contact facts" surface. Physically, the most efficient implementation may be one row per contact/application snapshot if that keeps filters simpler and avoids repeated recomputation.

This read model should expose:
- contact identity
- application id and program
- application status
- tag ids and tag names
- normalized answer fields that are useful for matching:
  - budget
  - time availability
  - start timeline
  - travel willingness
  - languages
  - country of residence
  - certification level
  - years of experience
  - involvement level
  - other curated fields from the current field registry

The goal is to support exact or near-exact filtering without scanning raw JSONB for every request.

### 3. Text evidence read model

Add a separate evidence read model with one row per evidence item.

Each row should include:
- `contact_id`
- `application_id` when relevant
- `source_type`
  - `application_answer`
  - `contact_note`
  - `application_admin_note`
- `source_label`
- `source_timestamp`
- `program` when relevant
- `text`

This lets the system retrieve and cite free-text evidence uniformly, regardless of where it came from.

For Phase 1, retrieval should use Postgres full-text search over this evidence model. Follow the same broad pattern already used by the community module: a denormalized search-oriented read shape plus server-side query helpers.

### 4. Evidence pack assembly

The retrieval pipeline should be:

1. Validate the `AiQueryPlan`
2. Run structured retrieval
3. Retrieve the most relevant text evidence for the matching contacts or contact scope
4. Merge into a bounded `EvidenceItem[]`
5. Send only that evidence pack to the model

Suggested bounding rules:
- max 25 contacts for global search before reranking
- max 10 contacts in the final shortlist
- max 40 evidence items total per answer
- max 500 characters per cited snippet

The exact numbers can be tuned during implementation, but the principle is fixed: no whole-CRM prompts.

## Synthesis Layer

The model should not produce arbitrary prose only. It should return a constrained structured response that the UI can render predictably.

Suggested shape:

```ts
type CitationRef = {
  evidenceId: string;
  claimKey: string;
};

type RankedCandidate = {
  contactId: string;
  contactName: string;
  whyFit: string[];
  concerns: string[];
  citations: CitationRef[];
};

type ContactAssessment = {
  facts: string[];
  inferredQualities: string[];
  concerns: string[];
  citations: CitationRef[];
};

type AiResponse = {
  summary: string;
  keyFindings: string[];
  shortlist?: RankedCandidate[];
  contactAssessment?: ContactAssessment;
  uncertainty: string[];
};
```

Rules:
- answers cite `evidenceId`s, not free-form "trust me" prose
- search questions produce a shortlist
- contact-scoped synthesis produces a contact assessment
- unsupported questions should produce uncertainty or a refusal, not fabricated structure

## Persistence Model

Phase 1 needs lightweight but auditable persistence.

### `admin_ai_threads`

Stores conversation threads.

Suggested columns:
- `id`
- `author_id`
- `scope` (`global` or `contact`)
- `contact_id` nullable
- `title`
- `created_at`
- `updated_at`

Phase 1 threads are private to the author admin.

### `admin_ai_messages`

Stores the user prompt and the assistant response.

Suggested columns:
- `id`
- `thread_id`
- `role` (`user` or `assistant`)
- `content`
- `status` (`complete` or `failed`)
- `query_plan` nullable
- `response_json` nullable
- `model_metadata` nullable
- `created_at`

For Phase 1, storing the normalized query plan and structured response is more valuable than storing raw hidden prompt internals.

### `admin_ai_message_citations`

Stores the answer's explicit evidence references.

Suggested columns:
- `id`
- `message_id`
- `claim_key`
- `source_type`
- `source_id`
- `contact_id`
- `application_id` nullable
- `source_label`
- `snippet`
- `created_at`

This table is what lets the UI show citations and what lets admins audit why an answer was produced.

## UX Design

### Global assistant in `/admin`

The main admin page gets an AI panel that supports broad cross-contact questions.

Expected jobs:
- trip/candidate shortlisting
- broad CRM search with natural language
- synthesis across multiple contacts

Answer format:
- `Summary`
- `Key Findings`
- `Shortlist`
- `Evidence`
- `Inferences`
- `Uncertainty`

The shortlist should be a compact ranked table with:
- contact name
- program or relevant application context
- top reasons
- top concerns
- link to the contact detail page

### Contact-scoped assistant on `/admin/contacts/[id]`

Each contact detail page gets a lighter assistant surface for deep synthesis about that person only.

Expected jobs:
- summarize the person
- identify fit signals
- identify concerns or missing information
- describe communication style or motivation signals conservatively

Answer format:
- `Summary`
- `Observed Evidence`
- `Inferred Qualities`
- `Concerns`
- `Uncertainty`

### Evidence inspection

Every answer should be readable at a glance, but drill-down must be easy.

The UI should let an admin inspect:
- which source was used
- the raw snippet
- timestamp and source type
- the related contact or application page

The design target is "top-level answer first, evidence one click away."

### History

History is saved per admin:
- global thread list in the global assistant
- contact-scoped history on contact pages
- each saved answer stores question, structured answer, and citations

Each turn should be answered from fresh retrieval, even in an ongoing thread. Thread history may help phrasing and continuity, but stale hidden context must not replace new retrieval.

## Server-Side Integration Approach

Phase 1 should use a simple request/response server flow, not a full agent loop and not token streaming.

Why:
- smaller surface area
- easier persistence and retry behavior
- easier to test
- lower complexity for the first shipped version

A simple server action or server-only controller is enough for Phase 1:
- submit question
- build query plan
- retrieve evidence
- call model
- persist answer and citations
- return structured response

If streaming is added later, it should be an implementation upgrade, not a prerequisite for Phase 1.

## Model Strategy

Phase 1 uses a **hosted commercial model API** behind a provider-agnostic adapter.

Decisions:
- one provider adapter in app code
- one concrete hosted provider in the first implementation
- the retrieval and citation logic remains owned by the app

The model's job is deliberately narrow:
- read the bounded evidence pack
- return a structured answer
- never act as the source of truth

The app should not depend on provider-specific response shapes outside the adapter boundary.

This keeps future options open:
- switch hosted vendors
- test a free tier for development
- move to Ollama or vLLM later if cost or privacy changes

## Security and Privacy

- admin-only access
- all retrieval happens server-side
- only bounded, relevant evidence is sent to the provider
- no write-capable AI actions in Phase 1
- threads are private to the author admin
- the app should log provider/model metadata without exposing more data than needed

For hosted providers, production use should assume commercial terms appropriate for private CRM data, not a hobby free tier.

## Failure Behavior

If the assistant cannot answer reliably, it should fail cleanly.

### Structured data available, text weak
- answer the structured portion
- explicitly say where text evidence is weak or missing

### Too much data matched
- narrow to the top bounded candidate set
- state that the answer is based on the top retrieved matches
- encourage refinement if needed

### One source unavailable
- only return a partial answer if the remaining evidence is still strong enough
- disclose the missing source

### Model call fails
- persist the user question
- mark the assistant response as failed
- show a retry affordance

### Evidence insufficient
- return a clear "not enough evidence" answer

## Efficiency and Optimization Constraints

This feature must be correct and fast.

Design constraints:
- no whole-table prompts
- no reusing bulky client-side admin state for AI
- no repeated server joins that can be replaced by a denormalized read model
- no arbitrary JSONB scanning across all keys on every request
- no duplicated fetches when one bounded retrieval pass is enough
- no vector search in Phase 1 when FTS and structured filters are sufficient

Optimization goals:
- one structured retrieval pass
- one text evidence retrieval pass
- one model call per answer
- cached or persisted citation data for later review

This is the main reason to invest in read models early: they improve correctness and performance at the same time.

## Future Extension Path

Future unstructured sources should plug into the same evidence pipeline by producing the same internal `EvidenceItem` shape.

That means WhatsApp, Instagram, and Zoom should later add:
- ingestion tables
- source-specific retrieval helpers
- normalization into `EvidenceItem`

The synthesis layer and UI should not need to care whether a citation came from:
- an application answer
- a contact note
- a WhatsApp message
- an Instagram DM
- a Zoom transcript chunk

That is the key extensibility boundary for this feature.

## Rollout Shape

### Phase 1: Retrieval foundation
- add structured read model
- add text evidence read model
- add persistence tables
- add server-side retrieval helpers

### Phase 2: Global assistant
- add AI panel to `/admin`
- support search and synthesis questions
- save per-admin history
- render shortlist plus citations

### Phase 3: Contact assistant
- add contact-scoped assistant to `/admin/contacts/[id]`
- support deep synthesis for one contact
- add contact-scoped history and citation drill-down

### Phase 4: Hardening
- tune retrieval ranking
- tune latency and token usage
- tighten failure states and observability
- prepare the evidence interface for future external sources

## Why This Design

This design matches the current codebase and the actual product need:

- today's data is already rich enough for useful AI assistance
- current value comes more from retrieval quality than from larger models
- free-text evidence is important from day one
- the owner wants open-ended reasoning, not only natural-language filters
- future unstructured data should extend the system, not force a rewrite

The design is intentionally conservative:
- read-only
- evidence-first
- no hidden agent autonomy
- efficient retrieval
- explicit uncertainty

That is the right first version for an internal admin AI feature.
