# /contacts perf — Stage 1 (server-side pagination) — PARKED

**Status: PARKED pending measurement. Do NOT build without new evidence.**

## Why parked (read this first)

Stage 0 (delete the `contact_activity_summary` view + its two unused consumers —
the "Last activity" column and the "awaiting" filter) is done and shipped on
branch `perf/contacts-drop-activity-summary`, together with a small first-paint
fix (denormalized `contacts.last_application_at`, see below).

Before building server-side pagination we checked the actual dataset size
(prod, 2026-07-19):

| Contacts | Applications | Max apps/contact |
|---|---|---|
| **310** | **343** | 4 |

That is ~650 rows total — **trivial** to download and sort in the browser. The
original ~4s `/contacts` load was therefore almost certainly the **view
recompute** (scanning the growing `contact_events` table), which Stage 0 already
removed — plus possible DB contention / cold-start / request-waterfall effects
(cf. the Jul 3 Hostinger perf-diagnosis finding that "slowness" was largely
measurement artifact). **Download volume is not the bottleneck at this scale**,
so full server-side pagination would be premature optimization.

## Un-park trigger

Build the phases below ONLY if, **after Stage 0 is deployed and re-measured on
prod** (baseline was ~3997ms), `/contacts` is *still* slow. And even then:
**profile the actual bottleneck first** (network waterfall, cold start, the
application-projection query shape) — at 310 contacts the fix is very unlikely
to be pagination. Revisit this doc's phase plan only once row counts have grown
materially (e.g. contacts in the low thousands / applications approaching the
`MAX_ADMIN_APPLICATIONS = 1000` client cap, at which point the client already
silently truncates and server pagination becomes correctness-necessary, not
just perf).

---

## What already shipped (the foundation)

- **Stage 0**: `DROP VIEW contact_activity_summary` +
  `migrations/20260719000001_drop_contact_activity_summary.sql`; removed
  `events-derivation.ts`, `last-activity-cell.tsx`, `pending-filter.tsx`,
  `contact-activity-summary.ts` and all references. 19 files, +44/-792.
- **Phase 1 (first-paint fix)**: `contacts.last_application_at timestamptz`,
  trigger-maintained = `max(applications.submitted_at)` per contact (statement-
  level triggers on applications INSERT/UPDATE/DELETE, backfilled, indexed
  `DESC NULLS LAST`). `admin-contact-list.ts` maps the default `submitted_at`
  sort → `ORDER BY last_application_at DESC` server-side, so the SSR first paint
  is already in "most recently submitted" order (no A→Z-then-reorder). This is a
  UX correctness fix, not a scale bet — it stands on its own regardless of
  Stage 1. It is also the reusable native-sort primitive Phase 2+ would need.

---

## Architecture digest (as of post-Stage-0, for whoever un-parks this)

- **SSR bootstrap**: `admin/layout.tsx` fires `getAdminContactsInitialData(prefs)`
  un-awaited, passes the promise → `DeferredContactsPanel` resolves via `use()`
  → `ContactsPanel` renders the SSR first page while `isHydratingFullData`, then
  swaps to the client full datasets. `AdminDataProvider` gets only
  `initialPreferences` (its `initialContactsData` prop is dead in current wiring).
- **The two ~4s full loads** (parallel, in `admin-data-provider.tsx`):
  `ensureContacts()` (all contacts + tags + tag_categories + all contact_tags)
  and `startApplicationsFetch(mode)` (apps via projected answer-key select,
  `.range(0, 999)`, `count:"exact"`; `"replace"` vs `"merge"` widen-and-merge).
  Answer-key projection is demand-driven via `ensureAnswerKeys`.
- **Client pipeline** (`contacts-panel-view-model.ts`, all JS over full arrays):
  search → program filter → tag filter (AND across categories, OR within) →
  column filters over `answers` (canonical `normalize` then compare; empty/
  unmapped → "Other") → sort (`compareContacts`) → slice.
- **Sort** (`sort-helpers.ts`): builtins name/email/phone/`submitted_at`/`_tags`;
  `submitted_at` = `appsByContact[0].submitted_at` (MAX, since apps are desc) —
  the per-contact aggregate now denormalized into `last_application_at`. Nulls
  always sort last.
- **Search** (`search-helpers.ts`): name/email substring; phone-like queries
  also match digits against `contact.phone` and every app `answers.phone`.
- **Canonical filters** (`field-registry.ts`): only TWO fields carry canonical
  normalization — `age` (`normalizeAgeToRange`) and `btm_category`
  (`normalizeBtmCategory`). These are the only ones a naive `answers->>key = val`
  SQL filter would get wrong.
- **Preferences**: server-persisted (`profiles.preferences.contacts_table`, Zod
  `.strict()`): `visible_columns`, `previously_selected_columns`, `sort_by`,
  `page_size`. localStorage-only: `search`, `programFilter`, `selectedTagIds`,
  `columnFilters`, `sortBy`, `page`, `columnWidths`. Any new persisted sort key
  must round-trip both without throwing.
- **Realtime** (6 channels): applications / contacts / contact_tags mutate list
  state in place + `markContactDetailStale`; tag_categories / tags debounced
  full refetch; contact_events → only `markContactDetailStale`. Resync-on-gap:
  when the last degraded channel returns SUBSCRIBED → `resyncAdminData({force})`
  (full replace) + wake resync on `visibilitychange`/`online`. **Any Stage-1
  rework MUST preserve this convergence contract.**
- **DB primitives present**: `idx_applications_submitted_at (DESC)`,
  `idx_applications_contact_id`, `idx_applications_program`,
  `idx_applications_answers (gin jsonb_path_ops)`, `idx_applications_search (gin
  tsvector search_vector)`, contact_tags indexes + `REPLICA IDENTITY FULL`. No
  index on `contacts(name)`. Trigger exemplar:
  `20260416000003_admin_ai_memory_review_followups.sql`. RLS admin-only; new RPCs
  should be `SECURITY INVOKER`.

---

## Deferred phase plan (only if measurement justifies it)

- **Phase 2**: `admin_contacts_page(...)` SECURITY INVOKER RPC — native sort
  (name/email/phone/last_application_at) + program (EXISTS on applications) +
  search (escaped ILIKE / search_vector / digits-phone) + LIMIT/OFFSET +
  `count(*) OVER()` filtered total in one scan. Thin TS fetcher
  (`admin-contacts-page.ts`) then fetches that page's apps (projection) +
  contact_tags. NOT wired. Parity-tested vs the JS pipeline.
- **Phase 3**: extend the RPC with tag filtering (`p_tag_ids`, HAVING count of
  matched distinct categories = selected categories). Parity-tested.
- **Phase 4** (**the real perceived-speed win**): wire server-page mode; stop the
  two full loads for supported sort/filter sets; keep the small tag catalog full;
  load contact_tags per page; rework realtime to invalidate+refetch the current
  page (debounced) preserving the convergence contract. **Fail-loud fallback**:
  when a canonical/answers column filter is active, fall back to the full-load
  client path **with a disclosed banner** — never silently return rows that
  ignore a JSONB filter. Feature-flagged.
- **Phase 5** (optional; candidate to skip): move `age`/`btm_category` canonical
  filters server-side via IMMUTABLE SQL functions replicating the TS normalize
  logic (parity-tested against the exact field-registry fixtures), removing the
  Phase-4 fallback. If the two canonical filters are rarely used, the disclosed
  client fallback may be the permanent answer — don't build this without demand.
- **Phase 6**: cleanup + full unit/E2E/build; document the server-page pattern.

### Key decisions if un-parked (options + lean)
1. **RPC vs TS-chained PostgREST** → lean RPC (`count(*) OVER()`, tag HAVING,
   canonical normalize all cleaner in SQL; precedent: `find_or_create_contact`,
   AI RPCs). Bends the "PostgREST directly" convention — acceptable.
2. **Realtime** → lean invalidate+refetch current page (always correct, preserves
   convergence) over surgical in-place patching (subtly wrong once sort/filter
   are server-side). Debounce bursts.
3. **Search scope** → lean match current client scope (name/email/phone) exactly
   to avoid a silent behavior change; widening to `search_vector` is a separate
   product decision.
4. **Drop "all contact_tags in memory" invariant** → yes, per-page is fine
   (bulk-select is by id; tag catalog stays full for the picker/optimism).
5. **Keep a disclosed degraded full-load fallback** for "server page failed"
   rather than a hard error screen — judgment call on maintenance cost.
