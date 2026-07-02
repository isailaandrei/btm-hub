# Design: Admin Dashboard Cache Hardening & Server-Call Reduction

> **Audience:** the engineer/agent implementing this. Fully self-contained — no
> conversation context assumed. Read top to bottom before writing code.
> Approved scope: ALL tiers (Andrei, Jul 2 2026).
>
> **Worktree rule:** the main checkout is reserved for the Hostinger migration
> (`feat/hostinger-phase0`). Do ALL work in a separate git worktree on a new
> branch `feat/admin-cache-hardening` off `origin/main` (fetch first). Commit
> locally per theme; NEVER push without Andrei's explicit approval.

## Goal

A Jul 2026 four-way audit of the admin dashboard (post the June optimistic-UI +
session-cache work, which held up cleanly) found one architectural blind spot —
**every cache refresh after a mutation, and all data liveness, trusts an
unmonitored Supabase Realtime websocket** — plus a set of wasted-server-call and
hygiene issues. This design fixes all of them without changing any happy-path
user-visible behavior, except where a silent failure becomes a visible one
(project rule: fail loud, never fake).

## Architecture facts you must not violate

- `/admin` dashboard is a **client workspace**: `page.tsx` returns null; data
  lives in `AdminDataProvider` (client fetch + Realtime). `revalidatePath` does
  nothing for it.
- `/admin/contacts/[id]` renders **only from the module-level session cache
  store** (`contacts/contact-detail-cache.ts`) via `useSyncExternalStore`. The
  server render seeds the store once per mount via a lazy `useState` initializer
  (`contact-detail-cache-seeder.tsx`). `router.refresh()` re-runs the server
  page but the fresh data prop is discarded — it does NOT update the store.
- Supabase `postgres_changes` does **not replay events missed while
  disconnected**. Any "the socket will tell us" assumption must have a
  reconnect/resync story.
- Optimistic layers: World A (`useOptimistic` over store-fed props in contact
  detail) reverts to base when its transition ends; World B (provider mutators
  with targeted-inverse rollback) reconciles via Realtime. Do not change these
  models.
- Mostly ONE admin at a time; concurrent use rare but must stay correct.

## The invalidation model (normative)

Post-change, every cache must be refreshed by **the actor that knows the change
happened**, with Realtime as a *second* signal, never the only one:

1. **Own mutations** (this tab wrote): on success, the mutating code refreshes
   the affected cache **directly and socket-independently** — for contact
   detail: `contactDetailCacheStore.markStale(id)` + `warmContactDetail(id)`;
   for provider state: the existing optimistic mutators already applied it, and
   Realtime (when healthy) reconciles.
2. **Foreign changes** (another admin / webhook wrote): Realtime channels, now
   monitored. On `CHANNEL_ERROR`/`TIMED_OUT`: surface a visible warning (toast +
   provider flag, mirroring tasks). On recovery to `SUBSCRIBED` after a drop:
   **resync** (refetch the datasets that channel feeds; markStale the open
   contact).
3. **Wake-ups**: a `visibilitychange`→visible / `online` listener (debounced,
   e.g. ≥30s since last sync) triggers the same resync — covers the
   sleep/reconnect gap where the socket rejoins silently "from now".
4. Last-write-wins guards must stamp **at request time**, not resolve time.

## Fix specifications

### Tier 1 — correctness

**T1.1 Socket-independent post-mutation refresh (contact detail).**
Files: `contacts/[id]/timeline-composer.tsx` (~:109), `timeline-event-row.tsx`
(:90/:104/:125/:138), `contact-tag-manager.tsx` (:126/:168/:266),
`delete-buttons.tsx` (:31), `contact-detail-realtime.tsx` (:31-34).
Replace post-success `router.refresh()` with `markStale(contactId)` + `await
warmContactDetail(contactId)` **inside the existing transition** so the
`useOptimistic` value stays pinned until the store holds fresh data (this also
closes the happy-path flicker). Route `ContactDetailRealtime`'s direct
`loadContactDetailAction` call through `warmContactDetail` so it shares the
in-flight dedup. Keep `revalidatePath("/admin/contacts/[id]")` in the actions
whose data is in the server bootstrap (see T3.5) so hard reloads stay fresh.
Error paths unchanged (toast + no refresh → optimistic revert is then correct).

**T1.2 Channel monitoring + resync (provider, detail, email).**
Files: `admin-data-provider.tsx` (subscribes at :759/:784/:802/:820 and the
contacts/applications/events channels), `contact-detail-realtime.tsx`,
`email/email-sends-realtime.tsx` (:37/:45), `tasks/task-data-provider.tsx`
(:370-375).
Every `.subscribe()` gets a status callback. Track per-channel health in a ref;
on first `CHANNEL_ERROR`/`TIMED_OUT`: one visible `toast.warning` + set a
provider-level `realtimeDegraded` flag (fail loud, no spam — warn once per
degradation episode). On `SUBSCRIBED` after a prior drop: clear the flag/warning
(fixes the tasks tab's sticky banner) and resync: reset the relevant
fetch-state refs and re-run `ensureContacts()` / applications replace-fetch /
`reloadTasks()` / sends refresh; `markStale` + warm the currently open contact.
Add ONE shared `visibilitychange`/`online` listener (provider level) that
triggers the same resync, debounced (skip if last successful sync < 30s ago).
Reuse existing guards (`applicationsChannelStartedRef`, fetch-state refs) — no
double-subscribes, no refetch storms.

**T1.3 Fail-loud tag refetches.** `admin-data-provider.tsx:793-798, 811-816`:
destructure `{ data, error }`; on error `toast.error` + keep prior data,
mirroring the activity-summary handler (:261-269).

**T1.4 Idempotent applications INSERT.** `admin-data-provider.tsx:381-390`:
filter out `a.id === next.id` before prepending (mirror `upsertSortedContact`);
cap the array at `MAX_ADMIN_APPLICATIONS` (1000) after prepend.

### Tier 2 — server calls & cold start

**T2.1 Wire the server-streamed contacts bootstrap.** `getAdminContactsInitialData`
(`src/lib/data/admin-contact-list.ts:110`) is built, tested, and has zero
callers; the consumer chain (`admin-dashboard.tsx:70/:184` →
`deferred-contacts-panel.tsx:37-39` `use()` → `admin-data-provider.tsx:190-210`
seeding) already exists. In the **server** `admin/layout.tsx`, create the
promise **unawaited** — `const p = getAdminContactsInitialData(profile.preferences)`
— and thread it through `AdminWorkspaceFrame` → `AdminDashboard` →
`DeferredContactsPanel` under the existing Suspense. Never `await` it in the
layout (would block the shell). Resolve the provider-vs-panel shape mismatch
(provider wants a resolved value at :185, panel wants the Promise): pass the
Promise to the panel (which `use()`es it and seeds the provider through the
existing path). The client `AdminWorkspaceFrame` must only pass the prop
through — it cannot create it. Verify the warm-cache skip (`hasCachedFullData`)
still short-circuits on soft nav back. This supersedes any idea of persisting
datasets to IndexedDB/sessionStorage across reloads — REJECTED: realtime cannot
backfill a cross-reload gap; fresh server-streamed data is the correct fast path.

**T2.2 Prewarm code, not data.** `admin-dashboard.tsx:65,126-171` keeps
prewarming the dynamic-import chunks, but hidden panels must not fetch:
gate `email-studio.tsx:214-221` (`ensureEmailTemplates`/`ensureManualRecipients`)
and `tasks-panel.tsx:30-32` (`ensureTasks`) on first `isVisible` (copy the
Admin AI pattern: `dashboard-panel.tsx:16-30`, `hasRequestedRef`). Tags prewarm
is already free (shares `ensureContacts`).

**T2.3 Single reconciliation path for task mutations.**
`tasks/task-data-provider.tsx:268-320`: after an optimistic patch succeeds, do
NOT fire the explicit full `refreshAfterMutation` when the channel is healthy —
let the (debounced) Realtime echo be the one reload; keep the explicit refresh
as the fallback when `realtimeDegraded` (from T1.2). Add in-flight dedup to
`reloadTasks`. Net: one board reload per mutation, zero when payload-incremental
handling suffices, two never.

**T2.4 Sent-list payload diet.** `src/lib/data/email-sends.ts` `listEmailSends`
(select at ~:86): replace `select("*")` with the explicit scalar column list
(everything except `builder_json_snapshot`, `html_preview_snapshot`,
`text_preview_snapshot`). `sent-email-preview.tsx:39` fetches the snapshot on
open via the existing `getEmailSend(id)` (email-sends.ts:81). Type the list row
as a `EmailSendListRow` (Omit of the snapshot fields) so the compiler finds all
readers. Do NOT touch the other `select("*")` sites in webhook paths in this
change (see T3.6 for the safe ones).

**T2.5 Composer shares the provider caches + debounce.**
`email/compose/email-composer.tsx:225-265,381`: replace the raw
`loadEmailListsAction`/`loadEmailSegmentsAction`/`loadAudienceContactsAction`
+ local state with the provider's `ensureLists`/`ensureSegments`/
`ensureAudienceContacts` (`admin-email-data-provider.tsx:386-429`); after
creating a list, call the provider's `refreshLists` so Audiences sees it.
Debounce the recipient re-resolution effect (:270-312) by ~300ms and skip when
selection is unchanged (compare a stable key of the inputs).

### Tier 3 — hygiene & smaller wins

**T3.1 Incremental answer-key fetch.** `admin-data-provider.tsx:303-311,453-464`:
when `ensureAnswerKeys` finds missing keys, select `id` + ONLY the missing
projected keys and merge by id via `mergeProjectedApplicationAnswers`, instead
of re-selecting the full cumulative projection for all rows.

**T3.2 Merge-refetch union.** `application-projection.ts:77-96`: in
`mergeProjectedApplicationAnswers` (mode "merge"), union rows present in
`previous` but absent from `next` (by id) instead of dropping them — closes the
race where a realtime-inserted application vanishes until the next full refetch.

**T3.3 Detail-cache LRU + request-time stamps.** `contact-detail-cache.ts`:
cap entries (LRU, keep ~50, never evict the id with active listeners /
currently open); stamp `loadedAt` at **request start** — `warmContactDetail`
captures `Date.now()` before calling the action and passes it to `set(...,
loadedAt)` — making the existing last-write-wins guard actually functional.
Also cap `prefetchedContactIdsRef` (`contacts-panel.tsx:321`) or clear it when
the cache evicts. Sub-note: `contact-email-section.tsx` has no realtime — its
staleness is acceptable once T1.2's resync also re-runs its load (piggyback:
re-fire its `onChanged` read on resync; keep it minimal).

**T3.4 Dead code removal.** Remove (grep-verified zero non-test callers):
`getAllContactEventSummaries` (contact-events.ts:239, unbounded),
`getContactEvents` (contact-events.ts:17), `getApplicationsByContactId`
(contacts.ts:395), `loadEmailStudioDataAction` (email/actions.ts:241) + their
tests. Re-verify zero callers at implementation time before deleting.

**T3.5 revalidatePath cleanup.** Delete all `revalidatePath("/admin")` calls
(≈30 sites: contacts/actions.ts, [id]/event-actions.ts, applications/actions.ts,
tags/actions.ts, email/actions.ts ×15, email/templates/actions.ts,
email/assets/actions.ts, admin-ai/actions.ts) — `/admin` renders no server
data. Also delete the per-id no-ops whose data is NOT in the detail bootstrap:
tag assign/unassign (contacts/actions.ts:63,71), email exclude/allow
(:143,150), tags/actions.ts:48. KEEP per-id revalidation where the data IS in
the bootstrap: `editContact` (:55), all of event-actions.ts
(:101,152,160,169,177), application status/delete (applications/actions.ts:55,
102; contacts/actions.ts:197). Note in each kept call site WHY (comment: keeps
hard-reload/deep-link fresh).

**T3.6 Narrow selects.** `getContacts()` (contacts.ts:16-25): explicit column
list (id, name, email, phone + whatever current consumers read — verify via
types). Trim `CONTACT_SELECT` in the provider only if `profile_id` is
confirmed unused by the detail portfolio path (`contact-detail-panel.tsx:208`)
— verify before removing; if used, leave with a comment.

**Deferred (recorded, not in this package):** contacts-table virtualization
("All" page size renders every row — latent at current data volume; revisit at
~2–3k contacts). IndexedDB/sessionStorage dataset persistence (rejected — see
T2.1).

---

## What shipped vs. deferred (Jul 2 2026 execution)

Implemented on `feat/admin-cache-hardening` (10 commits): all of Tier 1
(T1.1–T1.4 + the tag-manager provider-mutator wiring), Tier 2 T2.1/T2.2/T2.3,
and Tier 3 T3.2/T3.3/T3.4 plus the safe subset of T3.5 (the ~40 no-op
`revalidatePath("/admin")` deletions). Gates: tsc clean, lint clean, 1004 unit
tests pass, production build succeeds.

**Deferred to a follow-up pass (perf-only, on surfaces with no reported
slowness; each carries ripple/risk disproportionate to impact):**

- **T2.4 — slim the sent-emails list payload.** Real win during active sends
  (the list re-pulls full HTML snapshots every 3s), but the diff is wide: the
  `select("*")` → explicit-columns change forces `EmailSendListItem` to
  `Omit<EmailSend, snapshot fields>`, which ripples to `buildEmailSendMetrics` /
  `buildSentRowSummary` (both typed `EmailSend`), the `SentEmailPreview` (must
  refetch `html_preview_snapshot` on open via a new action), `email-studio`'s
  `previewSend` type, and the sent-summary/metrics/ordering test fixtures.
- **T2.5 — composer shares the provider audience caches.** `email-composer.tsx`
  re-fetches lists/segments/all-contacts on every Compose (re)activation via raw
  actions into local state, and a list created in Compose doesn't invalidate the
  shared cache (Audiences shows stale until manual refresh). Rewire to the
  provider `ensure*`/`refresh*` + debounce recipient re-resolution.
- **T3.1 — incremental answer-key fetch.** MED risk on the hot projection path;
  fetch only missing keys + merge by id instead of re-selecting the full
  cumulative projection for all rows.
- **T3.5 (remainder) — per-id `revalidatePath` reclassification.** The no-op
  `/admin` calls are gone; the nuanced keep/delete of per-`/admin/contacts/[id]`
  calls (delete tag-assign/unassign + email-exclude/allow + the
  `tags/actions.ts` `"[id]","page"` call, whose data is NOT in the detail
  bootstrap; keep editContact / event-actions / application status+delete) was
  left to avoid misclassifying a meaningful revalidation as a no-op.
- **T3.6 — narrow `getContacts()` select.** LOW impact (column over-fetch on the
  email-audience path, not a hot loop) and its return type feeds
  `resolveEmailEligibility`, so narrowing risks a type ripple.

## Testing & verification

- Unit (Vitest, co-located; mock Supabase via `createMockSupabaseClient()`):
  T1.2 resync-on-reconnect + warn-once + clear-on-recovery (provider + tasks);
  T1.3 error toast; T1.4 dedupe + cap; T3.1 incremental merge; T3.2 union;
  T3.3 LRU + request-time stamp (extend contact-detail-cache.test.ts).
- Existing tests must stay green: `admin-data-provider.test.ts`,
  `admin-workspace-frame.test.tsx`, `contact-detail-actions.test.ts`,
  email actions tests (T3.4 removes `loadEmailStudioDataAction` — update its
  test file), tags/tasks tests.
- Manual (dev server): (1) add timeline note with DevTools offline → note
  persists after reconnect resync, degradation toast appears once; (2) sleep-
  wake simulation via visibilitychange → resync fires, ≤1 refetch burst;
  (3) cold `/admin` shows server-streamed contacts before client fetch would
  have landed (network tab: no duplicate 5-query client burst); (4) Compose ↔
  Audiences list creation stays consistent; (5) task edit → exactly one board
  reload; (6) Sent tab payload size visibly smaller (network tab), preview
  still renders.
- Gates before handing back: `npx tsc --noEmit`, `npm run lint`,
  `npm run test:unit`, `npm run build`.

## Commit sequence (worktree branch, local only)

1. `fix(admin): socket-independent contact-detail refresh after mutations` (T1.1)
2. `fix(admin): realtime channel monitoring + reconnect/visibility resync` (T1.2, T1.3, T1.4)
3. `perf(admin): stream server contacts bootstrap into the workspace` (T2.1)
4. `perf(admin): prewarm code without fetching hidden-panel data` (T2.2)
5. `perf(admin): single reconciliation path for task mutations` (T2.3)
6. `perf(email): slim sent-list payload; share composer audience caches` (T2.4, T2.5)
7. `refactor(admin): incremental answer keys, merge union, cache LRU` (T3.1–T3.3)
8. `chore(admin): drop dead fetchers and no-op revalidatePaths; narrow selects` (T3.4–T3.6)
