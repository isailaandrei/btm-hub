# AI Admin Analyst Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of the read-only, high-trust AI admin analyst inside the existing `/admin` dashboard and `/admin/contacts/[id]` pages, using current Supabase CRM data plus evidence-backed citations.

**Architecture:** Use a simple server-side request/response pipeline. Build Postgres-backed structured and text evidence read models, a deterministic query-plan builder, one bounded retrieval pass, one hosted-model synthesis call, and persistent per-admin threads/messages/citations. Do not build a separate `/admin/ai` route, do not build SSE streaming, and do not build a tool-calling agent runtime.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + RLS), Zod 4, Tailwind 4, shadcn/ui, Vitest, Playwright, one hosted LLM adapter behind a server-side interface.

**Spec:** `docs/superpowers/specs/2026-04-15-ai-admin-analyst-design.md`

---

## Non-Negotiable Guardrails

These are part of the plan, not optional implementation preferences.

- Do **not** create `/admin/ai`.
- Do **not** add SSE, token streaming, websockets, long-lived “streaming” DB rows, or stale-stream cleanup jobs.
- Do **not** add tool-calling, multi-step model loops, SQL generation, or agent-style `tool_use` / `tool_result` chat content.
- Do **not** reuse `AdminDataProvider` data for AI retrieval. AI reads stay server-only.
- Do **not** add embeddings or vector search in Phase 1.
- Do **not** scan arbitrary JSONB keys on every request. Only query a small allowlisted set of answer fields.
- Do **not** validate provider env vars at module import time in a way that can crash `next build`. Missing config should render an unavailable state, not break the app.
- Keep the retrieval/model boundary clean so future WhatsApp / Instagram / Zoom sources can plug into the evidence layer without changing the UI contract.

## Assumptions

- Hosted model APIs are allowed for production.
- Phase 1 remains read-only.
- Threads are private to the current admin.
- Phase 1 favors one model call per answer. Query planning should be deterministic and server-side, not a separate model round-trip.
- Contact/application/admin-note data volume stays in the “small” range for now, so SQL views + bounded FTS are good enough.

## Deliverables

By the end of this plan, the repo should contain:

- Supabase persistence for AI threads, messages, and citations
- A structured contact-facts read model
- A text-evidence read model covering free-text answers, contact notes, and application admin notes
- A server-only admin-AI data layer
- A deterministic query-plan builder and bounded retrieval/orchestration layer
- A provider-agnostic model adapter with one concrete hosted implementation
- A shared AI panel UI used in both `/admin` and `/admin/contacts/[id]`
- Saved history and evidence drill-down
- Unit/integration coverage for the core logic and at least one browser-level smoke path for the shell

## File Structure

This is the intended file map. Keep responsibilities tight; avoid giant “god files.”

```text
supabase/migrations/
  20260415000001_admin_ai_analyst.sql

src/types/
  admin-ai.ts

src/lib/data/
  admin-ai.ts
  admin-ai-retrieval.ts

src/lib/admin-ai/
  field-config.ts
  schemas.ts
  query-plan.ts
  retrieval.ts
  prompt.ts
  provider.ts
  orchestrator.ts

src/app/(dashboard)/admin/
  page.tsx
  admin-dashboard.tsx
  admin-ai/
    actions.ts
    panel.tsx
    thread-list.tsx
    message-list.tsx
    question-form.tsx
    answer-view.tsx
    citation-list.tsx

src/app/(dashboard)/admin/contacts/[id]/
  page.tsx

src/lib/data/
  admin-ai.test.ts

src/lib/admin-ai/
  query-plan.test.ts
  retrieval.test.ts
  orchestrator.test.ts

src/app/(dashboard)/admin/admin-ai/
  actions.test.ts

e2e/
  admin-ai-analyst.spec.ts

README.md
```

## Data Model Decisions

### Persistence tables

Use three tables exactly as approved in the spec:

- `admin_ai_threads`
- `admin_ai_messages`
- `admin_ai_message_citations`

Suggested columns:

```sql
create table admin_ai_threads (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  scope text not null check (scope in ('global', 'contact')),
  contact_id uuid references contacts(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table admin_ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references admin_ai_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  status text not null default 'complete' check (status in ('complete', 'failed')),
  query_plan jsonb,
  response_json jsonb,
  model_metadata jsonb,
  created_at timestamptz not null default now()
);

create table admin_ai_message_citations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references admin_ai_messages(id) on delete cascade,
  claim_key text not null,
  source_type text not null,
  source_id text not null,
  contact_id uuid not null references contacts(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  source_label text not null,
  snippet text not null,
  created_at timestamptz not null default now()
);
```

Add indexes on:

- `admin_ai_threads(author_id, scope, updated_at desc)`
- `admin_ai_threads(contact_id, updated_at desc)` with `where contact_id is not null`
- `admin_ai_messages(thread_id, created_at)`
- `admin_ai_message_citations(message_id, claim_key)`

Use RLS so admins can only access their own rows. Keep threads private in Phase 1.

### Read models

Create two SQL views with `security_invoker = true`:

- `admin_ai_contact_facts`
- `admin_ai_evidence_items`

Create one SQL search helper as well:

- `search_admin_ai_evidence(p_query text, p_contact_ids uuid[] default null, p_contact_id uuid default null, p_limit int default 40)`

Do **not** create a new synchronized shadow table for evidence in Phase 1. That is unnecessary complexity for current scale.

`admin_ai_contact_facts` should expose one row per application snapshot with:

- `contact_id`
- `application_id`
- `contact_name`
- `contact_email`
- `contact_phone`
- `program`
- `status`
- `submitted_at`
- `tag_ids`
- `tag_names`
- allowlisted structured answer fields:
  - `budget`
  - `time_availability`
  - `start_timeline`
  - `travel_willingness`
  - `languages`
  - `country_of_residence`
  - `certification_level`
  - `years_experience`
  - `involvement_level`

`admin_ai_evidence_items` should expose one row per evidence item with:

- `evidence_id`
- `contact_id`
- `application_id`
- `source_type`
- `source_id`
- `source_label`
- `source_timestamp`
- `program`
- `text`

The evidence view should union:

- free-text application answer rows from an allowlisted set of keys
- `contact_notes`
- `applications.admin_notes` expanded via `jsonb_array_elements`

Do **not** rely only on `applications.search_vector`, because Phase 1 also needs contact notes and application admin notes.

`search_admin_ai_evidence` should encapsulate the FTS ranking logic in SQL so the app can make one RPC call instead of building ad hoc multi-branch search queries in TypeScript.

## Shared Types Contract

Use these shared TypeScript contracts as the source of truth:

```ts
export type AdminAiScope = "global" | "contact";
export type AdminAiMode = "global_search" | "contact_synthesis" | "hybrid";

export type AdminAiQueryPlan = {
  mode: AdminAiMode;
  contactId?: string;
  structuredFilters: Array<{
    field: string;
    op: "eq" | "in" | "contains";
    value: string | string[];
  }>;
  textFocus: string[];
  requestedLimit: number;
};

export type EvidenceItem = {
  evidenceId: string;
  contactId: string;
  applicationId: string | null;
  sourceType: "application_answer" | "contact_note" | "application_admin_note";
  sourceId: string;
  sourceLabel: string;
  sourceTimestamp: string | null;
  program: string | null;
  text: string;
};

export type AdminAiResponse = {
  summary: string;
  keyFindings: string[];
  shortlist?: Array<{
    contactId: string;
    contactName: string;
    whyFit: string[];
    concerns: string[];
    citations: Array<{ evidenceId: string; claimKey: string }>;
  }>;
  contactAssessment?: {
    facts: string[];
    inferredQualities: string[];
    concerns: string[];
    citations: Array<{ evidenceId: string; claimKey: string }>;
  };
  uncertainty: string[];
};
```

Validate every boundary with Zod:

- ask input
- thread load input
- rename/delete inputs
- query plan
- provider output

## Task 1: Add the Database Foundations

**Files:**
- Create: `supabase/migrations/20260415000001_admin_ai_analyst.sql`

- [ ] **Step 1: Create the persistence tables and indexes**

Write the migration for:

- `admin_ai_threads`
- `admin_ai_messages`
- `admin_ai_message_citations`
- `search_admin_ai_evidence(...)`
- supporting indexes
- `updated_at` maintenance for threads after rename and after new messages

Keep `admin_ai_messages.content` plain text. Do **not** store provider-native block arrays or tool traces.

- [ ] **Step 2: Add RLS for admin-owned private history**

Policies must ensure:

- only authenticated admins can read/write these tables
- only the thread author can access rows
- contact-scoped threads can only reference real contacts

- [ ] **Step 3: Add the read-model views**

Create:

- `admin_ai_contact_facts`
- `admin_ai_evidence_items`
- `search_admin_ai_evidence(...)`

Use `with (security_invoker = true)` so the view respects the caller’s privileges.

`admin_ai_evidence_items` should use an allowlisted `values (...)` list for answer keys, for example:

```sql
cross join lateral (
  values
    ('ultimate_vision', a.answers ->> 'ultimate_vision'),
    ('inspiration_to_apply', a.answers ->> 'inspiration_to_apply'),
    ('questions_or_concerns', a.answers ->> 'questions_or_concerns'),
    ('anything_else', a.answers ->> 'anything_else'),
    ('current_occupation', a.answers ->> 'current_occupation'),
    ('filming_equipment', a.answers ->> 'filming_equipment'),
    ('photography_equipment', a.answers ->> 'photography_equipment'),
    ('filmmaking_experience', a.answers ->> 'filmmaking_experience'),
    ('internship_hopes', a.answers ->> 'internship_hopes'),
    ('candidacy_reason', a.answers ->> 'candidacy_reason')
) as answer_items(source_label, text)
```

Discard rows where `text is null or btrim(text) = ''`.

Implement `search_admin_ai_evidence(...)` so it:

- ranks by `ts_rank_cd`
- scopes to `p_contact_id` when provided
- otherwise scopes to `p_contact_ids` when provided
- falls back to a safe plain-text path for degenerate search input
- always enforces `p_limit`

- [ ] **Step 4: Review the migration against the approved spec**

Before moving on, manually check that the migration covers:

- citations as first-class data
- contact notes
- application admin notes
- free-text answer evidence
- no `/admin/ai`-specific schema

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260415000001_admin_ai_analyst.sql
git commit -m "feat: add admin AI analyst schema and read models"
```

## Task 2: Add Shared Types, Schemas, and Field Configuration

**Files:**
- Create: `src/types/admin-ai.ts`
- Create: `src/lib/admin-ai/schemas.ts`
- Create: `src/lib/admin-ai/field-config.ts`
- Test: `src/lib/admin-ai/query-plan.test.ts`

- [ ] **Step 1: Add shared admin-AI types**

Create `src/types/admin-ai.ts` with the shared contracts for:

- scopes
- query plans
- evidence items
- structured candidates
- response shape
- thread/message summary shapes used by the UI

- [ ] **Step 2: Add Zod schemas**

Create `src/lib/admin-ai/schemas.ts` with:

- `adminAiAskInputSchema`
- `adminAiThreadLoadSchema`
- `adminAiThreadMutationSchema`
- `adminAiQueryPlanSchema`
- `adminAiResponseSchema`

Use `zod/v4`, matching the rest of the repo.

- [ ] **Step 3: Add a single source of truth for allowlisted AI fields**

Create `src/lib/admin-ai/field-config.ts`.

This file should:

- import `FIELD_REGISTRY` from `src/app/(dashboard)/admin/contacts/field-registry.ts`
- export `ADMIN_AI_STRUCTURED_FIELDS`
- export `ADMIN_AI_TEXT_FIELDS`
- expose helper maps for labels, normalized option values, and canonical matching

Do **not** duplicate field labels or answer keys across multiple files.

- [ ] **Step 4: Write the first failing tests for deterministic query planning**

Add tests in `src/lib/admin-ai/query-plan.test.ts` that describe the future behavior:

```ts
it("forces contact_synthesis mode when contact scope is provided", () => {});
it("extracts structured filters only from allowlisted fields", () => {});
it("keeps unsupported words in textFocus instead of inventing filters", () => {});
it("clamps requestedLimit for global questions", () => {});
```

- [ ] **Step 5: Run the targeted test file and verify it fails for the right reason**

Run:

```bash
npx vitest run src/lib/admin-ai/query-plan.test.ts
```

Expected:

- FAIL because `buildAdminAiQueryPlan` does not exist yet

- [ ] **Step 6: Commit**

```bash
git add src/types/admin-ai.ts src/lib/admin-ai/schemas.ts src/lib/admin-ai/field-config.ts src/lib/admin-ai/query-plan.test.ts
git commit -m "feat: add admin AI shared contracts"
```

## Task 3: Build the Server-Only Data Layer

**Files:**
- Create: `src/lib/data/admin-ai.ts`
- Create: `src/lib/data/admin-ai-retrieval.ts`
- Test: `src/lib/data/admin-ai.test.ts`

- [ ] **Step 1: Write failing tests for persistence and retrieval helpers**

Add tests for:

- `listAdminAiThreadSummaries`
- `getAdminAiThreadDetail`
- `createAdminAiThread`
- `createAdminAiMessage`
- `createAdminAiCitations`
- `renameAdminAiThread`
- `deleteAdminAiThread`
- `queryAdminAiContactFacts`
- `searchAdminAiEvidence`

Use the existing mock pattern from `src/test/mocks/supabase.ts`.

- [ ] **Step 2: Implement thread/message/citation persistence helpers**

Create `src/lib/data/admin-ai.ts`.

Follow repo conventions:

- reader functions live in `src/lib/data/`
- wrap server-read helpers in `cache()` where useful
- writes call `requireAdmin()`
- use `createClient()` from `@/lib/supabase/server`

Suggested signatures:

```ts
export const listAdminAiThreadSummaries = cache(async function listAdminAiThreadSummaries(...) {});
export const getAdminAiThreadDetail = cache(async function getAdminAiThreadDetail(...) {});
export async function createAdminAiThread(...) {}
export async function createAdminAiMessage(...) {}
export async function createAdminAiCitations(...) {}
export async function renameAdminAiThread(...) {}
export async function deleteAdminAiThread(...) {}
```

Keep these functions small and explicit. Do not mix retrieval, model calls, and persistence in this file.

- [ ] **Step 3: Implement the read-model query helpers**

Create `src/lib/data/admin-ai-retrieval.ts`.

Suggested signatures:

```ts
export async function queryAdminAiContactFacts(input: {
  filters: AdminAiQueryPlan["structuredFilters"];
  contactId?: string;
  limit: number;
}): Promise<ContactFactRow[]> {}

export async function searchAdminAiEvidence(input: {
  textFocus: string[];
  contactIds?: string[];
  contactId?: string;
  limit: number;
}): Promise<EvidenceItem[]> {}
```

Implementation rules:

- one Supabase query for the facts view
- one Supabase RPC call for evidence search
- no per-contact N+1 fetches
- no client-side joins across multiple server calls

For evidence search:

- call `search_admin_ai_evidence(...)`
- keep the FTS/ranking logic in SQL, not in TypeScript
- always bound the result size

- [ ] **Step 4: Run the targeted data-layer tests**

Run:

```bash
npx vitest run src/lib/data/admin-ai.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/admin-ai.ts src/lib/data/admin-ai-retrieval.ts src/lib/data/admin-ai.test.ts
git commit -m "feat: add admin AI data layer"
```

## Task 4: Implement Deterministic Query Planning and Evidence Assembly

**Files:**
- Create: `src/lib/admin-ai/query-plan.ts`
- Create: `src/lib/admin-ai/retrieval.ts`
- Modify: `src/lib/admin-ai/query-plan.test.ts`
- Test: `src/lib/admin-ai/retrieval.test.ts`

- [ ] **Step 1: Implement `buildAdminAiQueryPlan`**

Create `src/lib/admin-ai/query-plan.ts`.

This function should:

- derive scope from explicit input, not from route inspection inside the helper
- force `mode = "contact_synthesis"` when `contactId` exists
- match structured filter values only against allowlisted fields and known tag/program/status values
- keep fuzzy or unsupported concepts in `textFocus`
- clamp `requestedLimit` server-side

Important: do **not** use a model call here.

Suggested signature:

```ts
export function buildAdminAiQueryPlan(input: {
  scope: AdminAiScope;
  contactId?: string;
  question: string;
  availableTags: Array<{ id: string; name: string }>;
}): AdminAiQueryPlan {}
```

- [ ] **Step 2: Add retrieval orchestration**

Create `src/lib/admin-ai/retrieval.ts`.

This file should:

- call `queryAdminAiContactFacts`
- derive candidate contact IDs
- call `searchAdminAiEvidence`
- dedupe repeated evidence
- truncate snippets to the citation cap
- enforce hard caps:
  - max 25 candidate contacts before synthesis
  - max 10 shortlisted contacts in the final answer
  - max 40 evidence items sent to the provider
  - max 500 characters per snippet

Suggested signature:

```ts
export async function assembleAdminAiEvidence(input: {
  plan: AdminAiQueryPlan;
}): Promise<{
  candidates: ContactFactRow[];
  evidence: EvidenceItem[];
  insufficientEvidence: boolean;
}> {}
```

- [ ] **Step 3: Write failing retrieval tests**

Add tests for:

- candidate limits are enforced
- evidence rows are deduped by `evidenceId`
- contact scope never leaks other contacts
- application admin notes are included
- insufficient evidence short-circuits cleanly

- [ ] **Step 4: Run the planning/retrieval tests**

Run:

```bash
npx vitest run src/lib/admin-ai/query-plan.test.ts src/lib/admin-ai/retrieval.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-ai/query-plan.ts src/lib/admin-ai/retrieval.ts src/lib/admin-ai/query-plan.test.ts src/lib/admin-ai/retrieval.test.ts
git commit -m "feat: add admin AI query planning and retrieval orchestration"
```

## Task 5: Add the Prompt, Provider Adapter, and Orchestrator

**Files:**
- Create: `src/lib/admin-ai/prompt.ts`
- Create: `src/lib/admin-ai/provider.ts`
- Create: `src/lib/admin-ai/orchestrator.ts`
- Test: `src/lib/admin-ai/orchestrator.test.ts`

- [ ] **Step 1: Write failing orchestrator tests**

Cover these behaviors:

- builds a deterministic query plan from the current question/scope
- short-circuits to a high-trust refusal when evidence is insufficient
- returns a safe unavailable state when the provider is not configured
- calls the provider exactly once per successful answer
- validates provider output with `adminAiResponseSchema`
- rejects responses that cite unknown `evidenceId`s
- persists the normalized response and citations separately

- [ ] **Step 2: Implement the prompt builder**

Create `src/lib/admin-ai/prompt.ts`.

The system prompt must instruct the model to:

- answer only from supplied evidence
- separate facts, inferences, and uncertainty
- never invent missing details
- use only the provided `evidenceId`s for citations
- return JSON matching `AdminAiResponse`

Do not embed vendor-specific formatting tricks here. Keep it plain and provider-neutral.

- [ ] **Step 3: Implement the provider adapter**

Create `src/lib/admin-ai/provider.ts`.

Expose a small interface:

```ts
export interface AdminAiProvider {
  isConfigured(): boolean;
  getUnavailableReason(): string | null;
  generate(input: {
    question: string;
    scope: AdminAiScope;
    queryPlan: AdminAiQueryPlan;
    evidence: EvidenceItem[];
  }): Promise<AdminAiResponse & { modelMetadata: Record<string, unknown> }>;
}
```

Rules:

- keep one concrete hosted implementation only
- keep env access inside functions, not at top-level module initialization
- if config is missing, surface a user-safe unavailable state
- do **not** add streaming
- do **not** add tool calling

- [ ] **Step 4: Implement the orchestrator**

Create `src/lib/admin-ai/orchestrator.ts`.

This is the single server-side pipeline:

1. validate input
2. build query plan
3. assemble evidence
4. short-circuit if evidence is insufficient
5. call the provider once
6. validate output
7. persist assistant message and citations
8. return normalized data for the UI

Suggested signature:

```ts
export async function runAdminAiAnalysis(input: {
  scope: AdminAiScope;
  question: string;
  threadId?: string;
  contactId?: string;
}): Promise<RunAdminAiAnalysisResult> {}
```

Do not fetch the same thread or contact data twice inside this pipeline.

- [ ] **Step 5: Run the orchestrator tests**

Run:

```bash
npx vitest run src/lib/admin-ai/orchestrator.test.ts
```

Expected:

- PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-ai/prompt.ts src/lib/admin-ai/provider.ts src/lib/admin-ai/orchestrator.ts src/lib/admin-ai/orchestrator.test.ts
git commit -m "feat: add admin AI analysis pipeline"
```

## Task 6: Add Server Actions and the Shared Panel UI

**Files:**
- Create: `src/app/(dashboard)/admin/admin-ai/actions.ts`
- Create: `src/app/(dashboard)/admin/admin-ai/panel.tsx`
- Create: `src/app/(dashboard)/admin/admin-ai/thread-list.tsx`
- Create: `src/app/(dashboard)/admin/admin-ai/message-list.tsx`
- Create: `src/app/(dashboard)/admin/admin-ai/question-form.tsx`
- Create: `src/app/(dashboard)/admin/admin-ai/answer-view.tsx`
- Create: `src/app/(dashboard)/admin/admin-ai/citation-list.tsx`
- Create: `src/app/(dashboard)/admin/admin-dashboard.tsx`
- Modify: `src/app/(dashboard)/admin/page.tsx`
- Test: `src/app/(dashboard)/admin/admin-ai/actions.test.ts`

- [ ] **Step 1: Write failing server-action tests**

Cover:

- ask action creates a new thread when no `threadId` is provided
- ask action appends to an existing owned thread
- failed runs persist the user message and a failed assistant row
- missing provider config returns a safe UI error without crashing the route
- rename/delete validate ownership
- global scope cannot be used to mutate a contact-scoped thread incorrectly

- [ ] **Step 2: Implement admin-AI server actions**

Create `src/app/(dashboard)/admin/admin-ai/actions.ts`.

Actions needed:

- `askAdminAiQuestion`
- `loadAdminAiThread`
- `renameAdminAiThread`
- `deleteAdminAiThread`

Use repo patterns:

- form submissions use `useActionState`
- validation happens with Zod
- actions return `{ errors, message, ...data }`

For `askAdminAiQuestion`, return enough data to update the local panel state without requiring a full `router.refresh()`.

- [ ] **Step 3: Convert `/admin` page bootstrap to server + client shell**

Replace the current client-only `src/app/(dashboard)/admin/page.tsx` with:

- a server component that loads the initial global thread summaries
- a new client `AdminDashboard` component that owns tab state and renders the existing `ContactsPanel` / `TagsPanel`

This avoids an extra “load AI history after mount” call.

Suggested shape:

```tsx
export default async function AdminPage() {
  const initialGlobalThreads = await listAdminAiThreadSummaries({ scope: "global" });
  return <AdminDashboard initialGlobalThreads={initialGlobalThreads} />;
}
```

- [ ] **Step 4: Build the shared AI panel**

Create `panel.tsx` as the reusable shell for both global and contact scopes.

The panel should:

- show a simple header and trust copy
- list recent threads
- show prior messages for the selected thread
- render the response sections clearly:
  - Summary
  - Key Findings
  - Shortlist or Contact Assessment
  - Inferences
  - Uncertainty
  - Citations
- keep state local to the panel, not in `AdminDataProvider`

Do not build an agent-console UI. No tool traces, no raw prompt dumps.

- [ ] **Step 5: Implement the question form with `useActionState`**

Create `question-form.tsx`.

Requirements:

- textarea + submit button
- disabled state while pending
- hidden `threadId`, `scope`, and `contactId` inputs as needed
- inline validation/error display
- successful submission updates the thread/message state in the panel

- [ ] **Step 6: Render the global panel inside `/admin` without creating a route**

In `AdminDashboard`, render the global AI panel only when the `contacts` tab is active.

Recommended layout:

```tsx
<div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
  <ContactsPanel />
  <AdminAiPanel scope="global" initialThreads={initialGlobalThreads} />
</div>
```

Keep `TagsPanel` full-width and AI-free in Phase 1.

- [ ] **Step 7: Run the action tests**

Run:

```bash
npx vitest run src/app/(dashboard)/admin/admin-ai/actions.test.ts
```

Expected:

- PASS

- [ ] **Step 8: Commit**

```bash
git add src/app/(dashboard)/admin/page.tsx src/app/(dashboard)/admin/admin-dashboard.tsx src/app/(dashboard)/admin/admin-ai
git commit -m "feat: add global admin AI panel"
```

## Task 7: Add the Contact-Scoped Assistant

**Files:**
- Modify: `src/app/(dashboard)/admin/contacts/[id]/page.tsx`
- Reuse: `src/app/(dashboard)/admin/admin-ai/panel.tsx`

- [ ] **Step 1: Load contact-scoped thread summaries on the server**

Update the contact detail page server component so it fetches:

- existing contact data
- contact-scoped AI thread summaries for that contact

Use a single `Promise.all`, extending the current pattern.

- [ ] **Step 2: Add the AI card to the right sidebar**

Render the shared panel in the sidebar as a regular `Card`.

Place it near the top of the sidebar, before tags and notes. The AI assistant is part of contact evaluation, not an afterthought beneath admin notes.

Recommended order:

1. Contact Info
2. AI Analyst
3. Tags
4. Admin Notes

- [ ] **Step 3: Scope the panel correctly**

Pass:

- `scope="contact"`
- `contactId`
- `contactName`
- initial thread summaries

The contact panel must only analyze that contact. It should never show or fetch other contacts.

- [ ] **Step 4: Verify the page still follows current server/client boundaries**

Do not move the contact page to client-side rendering. Keep the page server-rendered and keep the AI interaction inside the existing client panel component.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/admin/contacts/[id]/page.tsx
git commit -m "feat: add contact-scoped admin AI panel"
```

## Task 8: Hardening, Docs, and Final Verification

**Files:**
- Create: `e2e/admin-ai-analyst.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Add provider/config documentation**

Update `README.md` with:

- required env vars for the chosen provider
- the fact that missing config shows a disabled AI panel instead of crashing
- the Phase 1 scope limits:
  - no `/admin/ai`
  - no streaming
  - no tool calling
  - no external sources yet

- [ ] **Step 2: Add a browser-level smoke test**

Create `e2e/admin-ai-analyst.spec.ts`.

Keep it practical:

- admin can see the AI panel on `/admin`
- admin can open a contact and see the contact-scoped AI panel
- when provider config is missing in the test environment, the UI shows a safe unavailable or empty state instead of crashing

Do not make E2E depend on live paid model calls.

- [ ] **Step 3: Run targeted unit tests**

Run:

```bash
npx vitest run \
  src/lib/data/admin-ai.test.ts \
  src/lib/admin-ai/query-plan.test.ts \
  src/lib/admin-ai/retrieval.test.ts \
  src/lib/admin-ai/orchestrator.test.ts \
  src/app/(dashboard)/admin/admin-ai/actions.test.ts
```

Expected:

- PASS

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected:

- PASS

- [ ] **Step 5: Run the admin E2E smoke coverage**

Run:

```bash
npx playwright test e2e/admin.spec.ts e2e/admin-ai-analyst.spec.ts
```

Expected:

- PASS

- [ ] **Step 6: Run a production build**

Run:

```bash
npm run build
```

Expected:

- PASS

- [ ] **Step 7: Commit**

```bash
git add README.md e2e/admin-ai-analyst.spec.ts
git commit -m "test: verify admin AI analyst flows"
```

## QA Checklist

Use this checklist during implementation review:

- `/admin` remains the only global route; there is no `/admin/ai`
- the contacts tab still works as before
- the tags tab still works as before
- the global AI panel appears only in the contacts experience
- `/admin/contacts/[id]` still renders server-side and now includes a scoped AI panel
- contact notes, application admin notes, and allowlisted free-text answers are all retrievable as evidence
- every successful answer stores citations in `admin_ai_message_citations`
- missing provider config does not crash the app
- no extra round-trip is added just to bootstrap global thread summaries on `/admin`
- no N+1 fetch pattern exists in the retrieval path
- one user question triggers at most:
  - one write for the user message
  - one facts query
  - one evidence query
  - one model call
  - one assistant write
  - one citation insert batch

## Explicitly Deferred

Do not sneak these into Phase 1:

- WhatsApp / Instagram / Zoom ingestion
- embeddings or pgvector
- autonomous writes
- re-ranking model cascades
- multi-provider failover
- semantic conversation memory
- token streaming
- separate AI navigation routes

## Self-Review Against the Approved Spec

- Spec says panel in `/admin` plus panel on `/admin/contacts/[id]`: this plan does that.
- Spec says request/response, no streaming in Phase 1: this plan does that.
- Spec says citations are first-class persisted data: this plan does that.
- Spec says include free-text answers, contact notes, and application admin notes from day one: this plan does that.
- Spec says avoid `AdminDataProvider` reuse and avoid unnecessary round-trips: this plan does that.
- Spec says prepare for future external sources by normalizing around evidence items: this plan does that.

## Implementation Handoff Notes

If Claude implements this plan, hold him to these decisions:

- no `/admin/ai`
- no SSE or streaming
- no tool loop
- no `AdminDataProvider`-backed AI retrieval
- no ad hoc `ILIKE` scans over raw `applications.answers` for every request
- no missing citation table
- no application-admin-note omission

If any of those appear in the diff, it is drift from the approved design and should be corrected before continuing.
