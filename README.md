# BTM Hub

Internal/admin and public-facing Next.js 16 application for BTM Hub, backed by Supabase.

## Getting Started

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Common Commands

```bash
npm run dev
npm run build
npm run lint
npm run test:unit
npm run test:e2e
```

## Required Environment

Local development and tests expect:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Some routes/features also use existing Sanity / email secrets when enabled:

```bash
NEXT_PUBLIC_SANITY_PROJECT_ID=...
NEXT_PUBLIC_SANITY_DATASET=...
SANITY_API_READ_TOKEN=...
RESEND_API_KEY=...
EMAIL_FROM=...
```

## Admin AI Analyst

Phase 1 of the admin AI feature lives inside the existing admin surfaces:

- global panel in `/admin`
- contact-scoped panel in `/admin/contacts/[id]`

It does **not** create a separate `/admin/ai` route.

### AI provider env vars

The hosted provider adapters use OpenAI via server-side `fetch`:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_DOSSIER_MODEL=gpt-4o-mini   # optional — falls back to OPENAI_MODEL
OPENAI_RANKING_MODEL=gpt-4o-mini   # optional — falls back to OPENAI_MODEL
```

`OPENAI_MODEL` is optional. If omitted, the app defaults to `gpt-4o-mini` to keep simple test queries inexpensive. Dossier generation and the cohort ranking pass each pick up their own override env so the three roles (synthesis, dossier-writing, ranking) can be tuned independently.

### Memory architecture

Phase 2 added a five-layer external memory system around the existing
thread/message/citation flow:

1. **Raw sources** — applications, contact notes, application admin notes (and later WhatsApp / Instagram / Zoom).
2. **Normalized evidence chunks** — `crm_ai_evidence_chunks`, source-agnostic.
3. **Per-contact dossiers** — `crm_ai_contact_dossiers`, persistent AI memory with structured signals + evidence anchors.
4. **Embeddings** — `crm_ai_embeddings` (schema only — retrieval is FTS + memory-first for the current CRM).
5. **Answer-time synthesis** — global queries run a ranking pass over compact ranking cards, then a grounded synthesis pass over finalist dossiers + raw evidence. Contact queries load the dossier and contact-scoped raw evidence, then synthesize once. Final answers always cite raw evidence chunks.

### Memory backfill

Memory artifacts are populated by a CLI backfill that uses a service-role Supabase client:

```bash
# Required env (local supabase: see `supabase status`)
export SUPABASE_SERVICE_ROLE_KEY=...

# Rebuild memory for all contacts
node --import tsx scripts/admin-ai-memory/backfill.ts

# Limit to N contacts
node --import tsx scripts/admin-ai-memory/backfill.ts --limit=5

# Specific contact ids
node --import tsx scripts/admin-ai-memory/backfill.ts --contact=<uuid>,<uuid>

# Force-rebuild even when memory is fresh
node --import tsx scripts/admin-ai-memory/backfill.ts --force
```

### Dossier evaluation

Score dossiers against the seven-category rubric using a JSON gold-set file (see `docs/superpowers/evals/admin-ai-memory-gold-set.md`):

```bash
node --experimental-strip-types scripts/admin-ai-memory/eval.ts gold-set.json
```

### Missing AI config behavior

If `OPENAI_API_KEY` is missing:

- the admin AI panels still render
- submitting a question returns a safe failure state
- the app does not crash at import/build time

### Phase 2 guardrails

This memory-architecture phase intentionally excludes:

- WhatsApp / Instagram / Zoom ingestion (schema-ready, connectors not built)
- vector retrieval — `crm_ai_embeddings` exists but the live retrieval path stays FTS + memory-first
- production job infrastructure — backfill is a CLI, not a queue
- agent loops, SSE, streaming, autonomous actions

The feature remains read-only, evidence-backed, and citation-first.
