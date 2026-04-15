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

The current hosted provider adapter uses OpenAI via server-side `fetch`:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_MODEL` is optional. If omitted, the app defaults to `gpt-4.1-mini`.

### Missing AI config behavior

If `OPENAI_API_KEY` is missing:

- the admin AI panels still render
- submitting a question returns a safe failure state
- the app does not crash at import/build time

### Phase 1 guardrails

This first version intentionally excludes:

- `/admin/ai`
- token streaming / SSE
- tool-calling agent loops
- embeddings / vector search
- WhatsApp / Instagram / Zoom ingestion
- AI-driven writes back into CRM data

The feature is read-only, evidence-backed, and citation-first.
