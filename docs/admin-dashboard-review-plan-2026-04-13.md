# Admin Dashboard Review Plan

Date: 2026-04-13

## Scope

Reviewed the admin dashboard under `src/app/(dashboard)/admin` with focus on:

- correctness and stale UI risks
- multi-admin concurrency safety
- React/Next.js patterns and unnecessary recomputation
- server-side and client-side performance
- refactor opportunities and missing test coverage

Checked against current official docs before writing recommendations:

- React `useMemo`: https://react.dev/reference/react/useMemo
- React `useDeferredValue`: https://react.dev/reference/react/useDeferredValue
- React `useActionState`: https://react.dev/reference/react/useActionState
- React `useEffectEvent`: https://react.dev/reference/react/useEffectEvent
- Next.js `revalidatePath`: https://nextjs.org/docs/app/api-reference/functions/revalidatePath
- Next.js forms guide: https://nextjs.org/docs/app/guides/forms

Verification run during review:

- `npm run test:unit -- src/app/(dashboard)/admin/contacts/actions.test.ts src/app/(dashboard)/admin/applications/actions.test.ts src/app/(dashboard)/admin/contacts/sort-helpers.test.ts src/app/(dashboard)/admin/contacts/field-registry.test.ts`
- `npm run lint -- src/app/(dashboard)/admin src/lib/data/contacts.ts src/lib/data/applications.ts src/lib/data/profiles.ts src/lib/auth/require-admin.ts`
- `npm run build`
- `npm run test:unit -- src/app/(dashboard)/admin/applications/actions.test.ts src/app/(dashboard)/admin/tags/actions.test.ts src/app/(dashboard)/admin/contacts/actions.test.ts src/app/(dashboard)/admin/contacts/selection-helpers.test.ts src/lib/data/applications.test.ts`
- `npm run lint -- src/app/(dashboard)/admin src/lib/data/applications.ts src/lib/data/contacts.ts src/lib/optimistic-concurrency.ts`

Results:

- targeted admin unit tests passed
- production build passed
- lint passed on the edited admin/dashboard paths
- final validation after implementation: `npm run lint`, `npm run test:unit`, and `npm run build` all passed

## Branch Status

Implemented on branch `admin-dashboard-hardening`:

- detail-page freshness hardening via `router.refresh()` on local mutations and a dedicated realtime refresher for `/admin/contacts/[id]`
- optimistic concurrency for application status, contact edits, and tag/category edits via `updated_at` checks
- stale bulk-selection pruning when realtime removes contacts
- atomic bulk-tag assignment via SQL/RPC, with partial-success counts surfaced in the UI
- ordered client-side preference persistence so older saves cannot land after newer ones
- single-source-of-truth search state with a debounced derived search value
- contact-table lookup maps, stable callbacks, memoized filter/action bars, and a panel refactor into state/view-model helpers
- page-level data-loading ownership cleanup so `/admin/page.tsx` no longer consumes admin data just to call `ensure*()`
- split admin contexts plus memoized provider values so unrelated consumers rerender less
- sorted realtime contact upserts so renamed/new contacts stay in name order
- safe removal of redundant action-layer `requireAdmin()` calls where the delegated write helper already guards
- server-side status and tag-color validation hardening
- clearer duplicate-name error messages for tag/category creation
- `useActionState` form conversion for the admin note form, category creation form, and tag creation forms
- inline tag/category edit controls so the edit actions are no longer dead code
- bounded application fetching with explicit column lists and debounced tag/category realtime refetches

Remaining follow-up work:

- full server-driven pagination/search for the contacts table, which is a larger architectural change because filtering currently spans contacts, applications, tags, and dynamic answer fields in one client-side view model

## Findings

### 1. High: detail-page mutations revalidate the wrong paths, so the current UI can stay stale

Files:

- `src/app/(dashboard)/admin/applications/actions.ts:14`
- `src/app/(dashboard)/admin/contacts/actions.ts:94`
- `src/app/(dashboard)/admin/tags/actions.ts:15`
- `src/app/(dashboard)/admin/contacts/[id]/contact-tag-manager.tsx:109`

Why this matters:

- `changeStatus()` revalidates `/admin/applications/${applicationId}`, but there is no matching page in the app.
- `deleteApplication()` only revalidates `/admin`, not `/admin/contacts/[id]`.
- `addTagToCategory()` only revalidates `/admin`, but it is also called from the contact detail page.
- Next.js documents `revalidatePath()` as targeting a specific page or layout path, not sibling paths. Based on that, the contact detail route can remain stale after these mutations.

User impact:

- status dropdown can appear to "snap back" or never reflect the new value on the contact detail page
- deleted applications can stay visible until a manual refresh
- tags created from the contact detail page may not appear immediately

Suggested fix:

- revalidate the actual detail path when mutating from the detail screen
- for mutations shared across routes, pass the current path into the action or call `router.refresh()` after success
- add an e2e test that changes status, creates a tag, and deletes an application from `/admin/contacts/[id]`

### 2. High: several scalar updates are still last-write-wins

Files:

- `src/lib/data/applications.ts:142`
- `src/lib/data/contacts.ts:39`
- `src/lib/data/contacts.ts:106`
- `src/lib/data/contacts.ts:149`

Why this matters:

- JSONB mutations already use atomic RPCs, which is good.
- Plain `update(...).eq("id", id)` writes still overwrite silently if two admins edit the same record near-simultaneously.
- This is most visible for application status, contact edits, tag/category edits, and any future inline editing.

User impact:

- Admin A can overwrite Admin B's recent status or metadata change without warning.
- The UI gives no indication that the record changed underneath the current viewer.

Suggested fix:

- add optimistic concurrency checks for mutable scalar fields
- easiest pattern: include `expected_updated_at` and update with `.eq("updated_at", expectedUpdatedAt)`
- better long-term pattern: move these writes into Postgres RPCs that either succeed or return a conflict result
- surface conflicts as explicit UI messages instead of generic failure toasts

### 3. High: bulk tag operations are vulnerable to stale selection when another admin deletes contacts

Files:

- `src/app/(dashboard)/admin/contacts/contacts-panel.tsx:149`
- `src/app/(dashboard)/admin/admin-data-provider.tsx:265`
- `src/app/(dashboard)/admin/contacts/bulk-action-bar.tsx:42`
- `src/lib/data/contacts.ts:221`

Why this matters:

- `selectedIds` is never reconciled against realtime contact deletions.
- If another admin deletes a selected contact, the stale ID can stay in the selection.
- Bulk upsert/delete is sent as one mutation, so one missing contact can fail the whole batch.

User impact:

- bulk assign/remove can fail unexpectedly during concurrent admin activity
- the selected count can include rows that no longer exist

Suggested fix:

- prune `selectedIds` whenever `contacts` changes
- harden bulk mutations with an RPC that joins only existing contacts and returns applied/skipped counts
- show partial-success feedback instead of a single generic failure

### 4. High: the main admin view scales poorly because it loads and computes everything in the browser

Files:

- `src/app/(dashboard)/admin/admin-data-provider.tsx:95`
- `src/app/(dashboard)/admin/admin-data-provider.tsx:216`
- `src/app/(dashboard)/admin/contacts/contacts-panel.tsx:236`

Why this matters:

- the provider fetches all applications with `select("*")`
- it also fetches all contacts, tag categories, tags, and contact tags into client state
- filtering, sorting, pagination, and dynamic-column expansion all happen client-side

User impact:

- increasing data volume will hurt initial admin load, memory usage, and tab responsiveness
- the Contacts tab does work even when only a subset of rows is visible

Suggested fix:

- immediate: shrink the application query to only required columns
- immediate: precompute lookup maps instead of repeated array scans
- medium-term: move contacts list to server-driven pagination with URL/search params
- long-term: expose a dedicated admin contacts query or RPC that returns a denormalized page of rows

### 5. Medium: the search input can drift out of sync with the actual filter state

Files:

- `src/app/(dashboard)/admin/contacts/contacts-filters.tsx:48`
- `src/app/(dashboard)/admin/contacts/contacts-panel.tsx:459`

Why this matters:

- `ContactsFilters` copies `search` into local state once and never resyncs when the parent changes it.
- `handleClearAllFilters()` clears the real search state, but the input component may still show the old text.

Suggested fix:

- either make the input fully controlled from the parent
- or sync `localSearch` from the `search` prop with an effect
- if the goal is smoother rendering, prefer `useDeferredValue` for the expensive list work instead of keeping a second source of truth

### 6. Medium: realtime patching breaks the default contact ordering

Files:

- `src/app/(dashboard)/admin/admin-data-provider.tsx:223`
- `src/app/(dashboard)/admin/admin-data-provider.tsx:245`

Why this matters:

- initial contacts load is ordered by name
- realtime inserts are prepended, not inserted in sorted position
- realtime updates replace in place, so a renamed contact can stay in the wrong spot

Suggested fix:

- centralize contact upsert/delete helpers that preserve sort order
- or re-sort the contact array after relevant realtime events

### 7. Medium: debounced preference writes can land out of order

Files:

- `src/app/(dashboard)/admin/contacts/contacts-panel.tsx:363`
- `src/lib/data/profiles.ts:45`
- `supabase/migrations/20260409000001_add_preferences.sql:1`

Why this matters:

- the debounce prevents extra sends before the timeout fires, but it does not protect against in-flight request reordering
- an older request can finish after a newer request and overwrite fresher column preferences
- the SQL merge is top-level only, so nested preference expansion later will be fragile

Suggested fix:

- add a client-side request version and ignore stale completions
- or queue preference writes through one action state pipeline
- if nested admin preferences will grow, replace `preferences || patch` with a true deep-merge strategy or store `contacts_table` as its own column/table

### 8. Medium: form handling is inconsistent with the project rule and with current React/Next.js guidance

Files:

- `src/app/(dashboard)/admin/tags/tags-panel.tsx:73`
- `src/app/(dashboard)/admin/contacts/[id]/contact-note-form.tsx:15`
- `src/app/(dashboard)/admin/contacts/[id]/contact-tag-manager.tsx:103`

Why this matters:

- the project rules prefer `useActionState` for forms
- these forms use imperative `useState` + `onSubmit` + `useTransition`
- errors are collapsed into generic toasts, so duplicate-name conflicts and validation issues are hard to understand

Suggested fix:

- convert real forms to `useActionState` + `<form action={...}>`
- return structured `{ errors, message }` for known errors
- keep imperative actions only for true single-click mutations where success/failure is binary

### 9. Medium: there is still avoidable repeated work in render paths

Files:

- `src/app/(dashboard)/admin/contacts/contacts-panel.tsx:257`
- `src/app/(dashboard)/admin/contacts/contacts-panel.tsx:736`
- `src/app/(dashboard)/admin/contacts/contacts-filters.tsx:99`
- `src/app/(dashboard)/admin/tags/tags-panel.tsx:187`

Why this matters:

- tag filtering scans `contactTags` repeatedly for every contact
- row rendering filters `contactTags` again per row, then does `find()` on `tags` and `tagCategories`
- category rendering repeatedly filters the full `tags` array

Suggested fix:

- memoize `tagsById`, `tagCategoriesById`, `contactTagIdsByContactId`, and `tagsByCategoryId`
- derive row data once from those maps
- keep `useMemo` only where the work is actually expensive; React recommends using it as a performance tool, not as a correctness crutch

### 10. Medium: the contact detail page is not live-updating for concurrent admins

Files:

- `src/app/(dashboard)/admin/contacts/[id]/page.tsx:28`

Why this matters:

- the main `/admin` view gets realtime updates through `AdminDataProvider`
- the detail page is server-rendered and does not subscribe to concurrent changes
- this increases the chance of acting on stale status/tag/note state while another admin is working in parallel

Suggested fix:

- either add a small detail-page realtime client layer for the active contact
- or refresh on focus / interval while the page is open
- pair this with conflict-aware mutations for status and editable metadata

### 11. Low: server validation is weaker than the UI contract in a few places

Files:

- `src/app/(dashboard)/admin/applications/actions.ts:14`
- `src/app/(dashboard)/admin/tags/actions.ts:15`
- `supabase/migrations/20260406000001_contacts_and_tags.sql:7`

Why this matters:

- the UI constrains application status to known values, and the database enforces them, but the server action still trusts the client payload
- the UI only offers 7 preset colors, but the server action accepts any string and the DB does not constrain it
- uniqueness conflicts for category/tag creation are thrown from Postgres but hidden behind generic catch blocks in the client

Suggested fix:

- validate application status explicitly in the server action so errors fail early and read clearly
- validate color against the known preset union on the server
- map Postgres unique violations to clear messages like "Tag already exists in this category"

### 12. Low: there are redundant `ensure*()` calls between the page and panel layers

Files:

- `src/app/(dashboard)/admin/page.tsx:17`
- `src/app/(dashboard)/admin/contacts/contacts-panel.tsx:158`
- `src/app/(dashboard)/admin/tags/tags-panel.tsx:42`

Why this matters:

- `AdminPage` eagerly calls `ensureContacts()` and `ensureApplications()` on tab change
- `ContactsPanel` and `TagsPanel` also call their own `ensure*()` functions on mount
- the current `FetchState` guards make this safe, but it duplicates responsibility and makes the data-loading model harder to reason about

Suggested fix:

- let each panel own the data it needs
- keep `page.tsx` focused on tab state/rendering
- preserve the `ensure*()` idempotence as a safety net

### 13. Low: realtime full-refetches for tags and categories could be coalesced

Files:

- `src/app/(dashboard)/admin/admin-data-provider.tsx:299`
- `src/app/(dashboard)/admin/admin-data-provider.tsx:311`

Why this matters:

- any `tag_categories` or `tags` realtime event triggers a full table refetch
- this is acceptable at current scale, but rapid bursts of tag creation or cleanup will issue multiple back-to-back identical queries

Suggested fix:

- debounce or coalesce those refetches over a short window
- keep the current refetch strategy unless profiling shows it is noisy enough to matter

### 14. Low: unused tag edit actions should be either wired up or removed

Files:

- `src/app/(dashboard)/admin/tags/actions.ts:23`
- `src/app/(dashboard)/admin/tags/actions.ts:50`

Why this matters:

- `editCategory()` and `editTag()` exist, but the current admin UI does not call them
- leaving dead actions around makes it harder to tell what is production behavior versus planned behavior

Suggested fix:

- either add the missing edit UI
- or remove these actions until the feature is ready

### 15. Low: tags-panel pending state is broader than necessary

Files:

- `src/app/(dashboard)/admin/tags/tags-panel.tsx:33`

Why this matters:

- one `useTransition()` instance disables unrelated buttons during any tag/category mutation
- this is safe, but slightly heavier UX than needed

Suggested fix:

- keep the current approach if simplicity is preferred
- otherwise split it into narrower pending states, similar to `BulkActionBar`

## Architecture Options

### Option A: incremental hardening on the current client-heavy design

How it works:

- keep `AdminDataProvider`
- fix the revalidation bugs
- add conflict-aware writes
- add lookup maps, lighter selects, selection pruning, and better form state

Upside:

- fastest path to a safer admin
- smallest change surface
- keeps the current UX mostly intact

Downside:

- the browser still owns too much data and too much query logic
- long-term scaling ceiling remains

Best when:

- the admin dataset is still modest
- we want to stabilize first, then redesign

### Option B: move the Contacts view to a server-driven route with URL state

How it works:

- split tabs into route-level pages
- use search params for tab/filter/sort/page state
- fetch a paginated contacts result on the server
- keep only lightweight client islands for per-row actions and dialogs

Upside:

- much better scaling story
- less client memory and less recomputation
- filters become shareable/bookmarkable

Downside:

- bigger refactor
- dynamic-column filtering needs a dedicated query layer or RPC

Best when:

- contact/application volume is expected to keep growing
- admin performance is becoming a recurring issue

My lean:

- do Option A first as a stabilization pass
- move toward Option B once correctness and concurrency are fixed, or immediately if the table is already feeling slow with real data

## Phased Plan

## Phase 1: Correctness and refresh-path fixes

**Goal:** Make all current admin mutations immediately reflect in the right screen.

**Changes:**

- fix admin actions to revalidate the current detail route, not only `/admin`
- remove the dead `/admin/applications/${id}` revalidation target
- add route-aware refresh after shared actions used from the detail page
- fix the search input state drift
- fix the unused-variable lint warning in `contacts-panel.tsx`

**Tests:**

- [ ] Unit test: action revalidation targets are correct for detail-page mutations
- [ ] Integration test: status changes stay updated on `/admin/contacts/[id]`
- [ ] Manual verification: create a tag from contact detail and see it appear without full reload

**Gate:** detail-page status, tag creation, and application deletion all refresh correctly

## Phase 2: Concurrency hardening for multi-admin usage

**Goal:** Prevent silent overwrites and stale-selection failures.

**Changes:**

- add optimistic concurrency checks to scalar writes
- add conflict errors for stale status/contact/tag/category edits
- prune selected IDs when realtime removes contacts
- move bulk assign/unassign into RPCs that tolerate missing/deleted contacts and return applied counts
- improve unique-conflict error handling for tag/category creation

**Tests:**

- [ ] Unit test: stale `updated_at` causes a conflict result instead of blind overwrite
- [ ] Integration test: bulk assign skips a concurrently deleted contact instead of failing the whole batch
- [ ] Manual verification: two admins editing the same contact see a conflict message instead of silent loss

**Gate:** concurrent writes either merge safely or fail with explicit conflict feedback

## Phase 3: Performance and data-flow optimization

**Goal:** Reduce admin payload size and repeated client work.

**Changes:**

- narrow the admin application select list to only required columns
- add memoized lookup maps for tags, categories, and contact-tag membership
- preserve sorted contact order during realtime inserts/updates
- remove redundant `ensure*()` calls so panel ownership is clearer
- debounce tag/category realtime refetches only if profiling shows meaningful churn
- replace local search debounce duplication with one source of truth plus `useDeferredValue` if rendering remains heavy
- evaluate splitting `AdminDataProvider` by dataset or route

**Tests:**

- [ ] Unit test: realtime contact upsert helper preserves alphabetical order
- [ ] Integration test: filtering and tag rendering still match current behavior
- [ ] Manual verification: typing in search remains responsive with a large seeded dataset

**Gate:** no behavior regressions and measurable improvement in Contacts tab responsiveness

## Phase 4: Form modernization and test coverage expansion

**Goal:** Align the admin feature with the project’s form/action conventions and close coverage gaps.

**Changes:**

- convert admin forms to `useActionState` where appropriate
- return structured action state for known validation errors
- add explicit server validation for status/color boundary values
- remove dead admin actions or add the UI that exercises them
- add a multi-context Playwright test for two simultaneous admins
- add regression coverage for detail-page refresh and conflict handling

**Tests:**

- [ ] Unit test: tag/category form actions return structured validation errors
- [ ] Integration test: contact note and tag forms keep pending/error state correctly
- [ ] Manual verification: duplicate tag/category creation shows a useful inline error

**Gate:** admin forms follow one consistent pattern and concurrency regressions are covered by e2e

## Recommended implementation order

1. Fix refresh-path correctness first.
2. Add conflict-safe writes and bulk-operation hardening second.
3. Do the payload and lookup-map optimizations next.
4. Finish by standardizing forms and expanding tests.

## Biggest wins for the least effort

If we want the fastest improvement set, start here:

1. Fix `revalidatePath` targets for detail-page mutations.
2. Prune stale selections before bulk actions.
3. Replace repeated tag/category lookups with memoized maps.
4. Sync the search input with source state.
5. Return actionable server errors for duplicate tag/category creation.
