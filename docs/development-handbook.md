# BTM Hub Development Handbook

`CLAUDE.md` states the rules. This document carries what rules can't: **why**
each rule exists, **where** the canonical example of each pattern lives, and
**how** to work with Andrei. It was written in July 2026 as a deliberate
knowledge transfer from the sessions that built the admin dashboard, the email
pipeline, the WhatsApp ingestion layer, and the admin AI — so that future
sessions (human or model) inherit the judgment, not just the constraints.

If this document and the code disagree, the code is newer — fix the document.

---

## 1. Architecture: the whys behind the rules

Rules without reasons get cargo-culted or dropped at the first edge case.
These are the reasons.

**Layering.** Server component page → `src/lib/data/` fetcher (wrapped in
React `cache()`) → Supabase PostgREST. `cache()` exists because multiple
sections of one page independently want the same data; per-request dedup means
fetchers can be called freely without coordinating callers. It is NOT
cross-request caching — client-side session caches handle revisits (§3).
Server fetchers must never be imported into client components (`cookies()` is
server-only).

**Server actions.** Co-located `actions.ts`, Zod validation before any DB
call. The reason for validate-first: *user* errors must return shaped
(`{errors, message}` for `useActionState`) while only *unexpected* failures
throw. Blurring that line either shows users stack traces or swallows real
bugs into form errors.

**Auth.** The proxy (`src/proxy.ts`, Next.js 16 convention) refreshes the
session and gates `protectedPaths`; pages check again. Two hard-won lessons:

- Never add code between `createServerClient()` and `supabase.auth.getUser()`
  in `src/lib/supabase/proxy.ts` — doing so caused random logouts.
- Jul 2026 login-loop incident: the proxy authorized via `getClaims` while the
  page authorized via `getProfile`; users with an auth record but no
  `profiles` row bounced `/login` ↔ `/profile` forever. Fix: `getProfile`
  self-heals a member profile. The general lesson: **any two auth checks that
  can disagree eventually will** — derive both from one source, or make one
  self-healing.

**Concurrent writes.** Two admins clicking at once is the normal case, not the
edge case. JSONB read-modify-write races, so merges happen inside Postgres:
`add_admin_note()` RPC appends to the `admin_notes` JSONB column
(`supabase/migrations/20260404000002_squash.sql`, called from
`src/lib/data/applications.ts`); tags use a join table with a bulk RPC. Rule:
if interleaved clicks could corrupt state, push the merge into the database.

**Webhooks.** The Jun 29 2026 incident: the YCloud webhook returned 5xx under
DB pressure → YCloud retried → more pressure → more 5xx. The retry storm
burned 482 GB-hours of Fluid compute in a day. Doctrine, permanently:

- Bound EVERY awaited external call with `AbortSignal.timeout(...)`.
- Return **2xx on internal errors** (logged loudly) — a webhook 5xx is an
  invitation to retry. Auth/signature failures still return 401/404; only
  *internal* failures get the 2xx treatment.
- Small explicit `export const maxDuration`.
- Verify HMAC signatures; insert idempotently (e.g. `UNIQUE(provider,
  provider_message_id)`).

**Cron.** Routes under `src/app/api/cron/`, Bearer `CRON_SECRET` checked
constant-time via `src/lib/cron-auth.ts`, scheduled on prod with pg_cron +
Supabase Vault URL indirection (`docs/plans/whatsapp-ingestion-runbook.md`
§Scheduling — never a repo migration, it breaks the local db-push hook). Every
run processes a **bounded batch** and reports what remains; backlogs drain
across schedules. A cron that tries to finish everything melts precisely on
the day there's a backlog. One job per route — separate failure domains.

**Fail loud, never fake.** The priority order is in `CLAUDE.md`; here is what
it looks like applied: embeddings unconfigured → skip *with a disclosure
flag*; embeddings configured but failing → throw. Admin AI with zero
candidates → an explicit insufficient-data response naming what was scanned,
never a plausible-sounding answer. Expired media → a visible "expired"
placeholder, never a silently broken image. The test for any fallback: *could
an admin be misled into treating degraded output as complete?*

**Conversations are multi-source by design.** `ConversationSource` +
`src/lib/conversations/ingestion/adapter.ts`: WhatsApp is the first adapter,
email is the planned second. Everything downstream — session windows,
profile/status/noise taxonomy, digests, facts, 45-day status expiry, cards —
is source-agnostic. New sources get a new adapter, not a new pipeline.

**Admin AI is a governed subsystem.** Do not touch `src/lib/admin-ai/` or the
digest taxonomy in `src/lib/conversations/` without reading
`docs/admin-ai-handbook.md` and `docs/admin-ai-eval-contract.md`. Behavior
changes are gated by the eval suite (§5).

---

## 2. Canonical exemplars — to build X, copy Y

Imitating a named exemplar beats following an abstract description. These are
the reference implementations (verified Jul 7 2026):

| Pattern | Copy | What makes it the reference |
|---|---|---|
| Server action (form) | `src/app/(auth)/actions.ts` | Zod-first, `{errors, message, values}` shape, open-redirect guard (`startsWith("/")`, reject `//`) |
| Server action (admin mutation) | `src/app/(admin)/admin/contacts/[id]/contact-detail-actions.ts` | Pairs with optimistic client + session cache write-through |
| Cached data fetcher | `src/lib/data/applications.ts` | `cache()` + server `createClient`, `escapeSearchTerm` for ILIKE |
| SSR bootstrap (no serial chains) | `src/lib/data/contact-detail.ts` + `src/app/(admin)/admin/contacts/[id]/page.tsx` | One `getContactDetailPageBootstrap` gathers all sections in parallel, seeds the client cache |
| Optimistic UI | `src/app/(admin)/admin/applications/[id]/StatusSelector.tsx` (`useOptimistic`), `.../contacts/[id]/contact-detail-panel.tsx` (`useTransition`) | Immediate UI, reconcile on response, visible rollback |
| Session cache + realtime resync | `src/app/(admin)/admin/contacts/contact-detail-cache.ts` + `[id]/contact-detail-realtime.tsx` | Module singleton via `useSyncExternalStore`, SWR seed-then-refresh, debounced Realtime resync without `router.refresh()` |
| Config-driven multi-step form | `src/lib/academy/forms/` (`buildFullSchema` in `schema-builder.ts`) + `src/components/forms/DynamicFormRenderer.tsx` | Field defs drive both UI and Zod schema |
| Storm-proof webhook | `src/app/api/whatsapp/ycloud/webhook/route.ts` | HMAC verify, bounded awaits, 2xx-on-internal-error, idempotent upsert, `maxDuration = 20` |
| Cron route | `src/app/api/cron/email-drain/route.ts` + `src/lib/cron-auth.ts` | Constant-time secret check, bounded batch, SKIP LOCKED |
| Gated live script | `scripts/whatsapp-match-backfill.test.ts` (dry-run/apply flags), `scripts/conversation-digest-backlog.test.ts` (env-overwrite pattern) | `RUN_*=1` gate, dry-run default, report to `.admin-ai-debug/`, explicit apply flag |
| Eval suite | `scripts/admin-ai-eval.test.ts` + `scripts/admin-ai-live-lib.ts` | Runtime-derived ground truth, JSON diagnostics |
| Private storage bucket | `supabase/migrations/20260506000001_profile_portfolio.sql` + `src/lib/data/profile-portfolio.ts` | Bucket-in-migration, path-scoped RLS, signed-URL reads |
| Cinematic marketing section | `src/components/home/videos-section.tsx` (ships on `src/app/(home)/page.tsx`) | The look §3 describes |
| Tokens & utilities | `src/app/globals.css` (oklch vars), `cn()` in `src/lib/utils.ts` | — |

---

## 3. UI design language

Two surfaces, two languages. Don't mix them.

**Marketing: cinematic.** One large atmospheric background image per section;
generous negative space; minimal overlay copy; restrained palette drawn from
the tokens. Never busy collages or grids of small images. References:
`videos-section.tsx`, the academy four-panel hero and dark detail pages.
Academy imagery sources from the Milanote board (strip query params for
full-res).

**Admin: dense, fast, honest.**

- *Optimistic-first*: mutate the UI immediately, reconcile on the server
  response, roll back **visibly** on failure. Never leave stale optimistic
  state standing.
- *Session-cached sections*: revisits render instantly from cache, then
  refresh (SWR). Seed the cache from SSR where possible.
- *Realtime*: debounced appends; resync on reconnect through the cache, not
  `router.refresh()`.
- *Skeletons must match final layout dimensions* — a mismatched skeleton
  caused a real CLS regression.
- *Prefetch on intent* (hover / list mount) for detail views.

**Mechanics.** Tailwind 4 utilities only; design tokens are oklch CSS
variables in `globals.css` — new colors become tokens, never inline hex;
`cn()` to merge classes; `cva` for variants; no CSS modules.

**Process: visual POC first.** For any notable UI work, build a throwaway
version, screenshot it, get Andrei's eye on it, *then* productionize. He
judges by looking, not by reading JSX.

**Email HTML is a different universe.** Only real clients count — Outlook
clipping and Gmail trimming do not reproduce in a browser. A "fix" verified
only locally once broke Gmail while failing to fix Outlook and had to be
reverted. Test sends go to isailaandrei.i@gmail.com ONLY.

---

## 4. Performance playbook

Every entry here was learned by measurement, not theory.

- **Measure in a foreground tab.** Background-tab timer throttling produced a
  false "Hostinger is slow" diagnosis; the fair A/B showed it ~2× faster.
  Never trust timings from a hidden tab.
- **Kill serial request chains.** A cold deep link into a contact page once
  made ~10 *serial* round-trips (each section fetched on mount) — 12s on
  Vercel. The fix was one SSR bootstrap gathering everything in parallel plus
  cache seeding (see exemplar). Watch new sections for reintroduced
  mount-time fetches; the chain grows back one innocent `useEffect` at a time.
- **LLM cost is cache economics.** DeepSeek prices by prompt-prefix cache
  hits: keep prefixes byte-identical (corpus first, question last; stable
  chunk boundaries). Editing a system prompt = a cold run. Design prompts so
  the volatile part sits at the tail. Details in `docs/admin-ai-handbook.md`.
- **React 19 discipline** (perf and correctness): no `setState` in
  `useEffect`; lazy `useState` initializers for static browser reads (guarded
  for SSR); `useSyncExternalStore` with `getServerSnapshot` for reactive
  browser values — avoids both double renders and layout shift.
- **Bounded batches beat clever parallelism** in crons and webhooks (§1). The
  system that survives backlog days is the one that does 40 units per run and
  says how many remain.

---

## 5. Working agreement for AI sessions

How Andrei works, distilled from explicit feedback. Violating these costs
more trust than any bug.

**Read first**: `CLAUDE.md` → this handbook → if touching AI,
`docs/admin-ai-handbook.md` + `docs/admin-ai-eval-contract.md` → check
`docs/plans/opus-task-queue.md` for already-specced, already-approved work.

**Judgment checkpoint before code.** For anything user-visible, any
taxonomy/filter/question-set change, or any multi-commit feature: write the
plan, discuss it, get an explicit go. Andrei has said, verbatim, "DO NOT START
MAKING CHANGES WITHOUT MY PERMISSION" — after a well-intentioned filter change
he hadn't approved. When presenting options, give a recommendation with
reasons, not a survey. Decisions he always owns: eval questions and success
criteria, taxonomies, anything an admin or member will see.

**Git discipline.** Feature branch BEFORE the first commit of multi-commit
work. Commit locally. **NEVER push without an explicit ask** — he tests
locally first, every time.

**Tiered verification.** While iterating: `tsc --noEmit`, eslint on changed
files, affected vitest suites. Before a merge request: full unit suite +
build. Browser checks only for visual/UX changes. Keep recaps short.

**AI-behavior changes are eval-gated.** Run `RUN_ADMIN_AI_EVAL=1` and require
9/9. When the eval fails, **suspect the ground truth first** — two of the
suite's first failures were bugs in the eval's own truth derivation, not in
the product. New behavior means extending the contract *with Andrei*, because
the question set is owner-approved.

**Live data has a liturgy.** Gated scripts only (`RUN_*=1`), dry-run by
default, audit the report in `.admin-ai-debug/`, then an explicit apply flag.
`.admin-ai-debug/` contains PII and is gitignored — never commit it. Agents
never read or write `.env*` files and never make live LLM/DB-write calls; the
main session or Andrei runs those after auditing the diff.

**Migrations.** Normal repo flow; a hook auto-applies locally; remind Andrei
to `supabase db push` to remote. pg_cron scheduling is prod-side SQL per the
runbook, never a migration.

**Separate deciding from typing.** The workflow that built this codebase:
spec precisely (down to file paths and failure modes), delegate the
implementation to a cheaper/faster agent, then audit the diff — and take the
implementer seriously when they push back with evidence; twice the agent was
right and the spec was wrong. Budget judgment, not just tokens.

**When in doubt between "make it work" and "make it honest," choose honest.**
That's the house style, and it's rule #1 in `CLAUDE.md` for a reason.
