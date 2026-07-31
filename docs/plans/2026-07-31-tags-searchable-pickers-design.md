# Tags: searchable pickers — design

**Date:** 2026-07-31 · **Status:** implemented on `feat/tags-searchable-pickers` (worktree `.worktrees/tags-pickers`); amended same day after an adversarial staff review (2 blockers: quick-create cache sequencing, prod-masked thrown errors) and Andrei's POC feedback (picker browse mode collapsed)
**Surfaces:** `/admin/contacts` (list tag filter) and `/admin/contacts/[id]` (Tags card)

## Problem

Production has 13 tag categories / 71 tags and the count grows with every
program season: almost every category is a program/trip (e.g. "26 Azores
Summer Academy Week 2") holding the same ~5 pipeline tags (Interested,
Undecided, Joining, Declined, Potential Candidate), plus a "Status" category
(11 tags) and "Interested in" (6 tags). Both tag UIs were built for a handful
of categories:

- **Contacts list filter** (`src/app/(admin)/admin/contacts/contacts-filters.tsx`):
  a popover listing all categories as collapsible sections, no search — you
  must already know which category to open.
- **Contact detail Tags card**
  (`src/app/(admin)/admin/contacts/[id]/contact-tag-manager.tsx`): renders
  **all** categories stacked, each with its own "+" button opening a
  hand-rolled per-category dropdown (tag list + inline `AddTagForm`
  quick-create). Most categories are irrelevant for any given contact —
  pure clutter.

Key data fact: a search like "azores" only ever matches **category names**;
tag names are generic and repeat across ~10 categories. Search must therefore
match on category name as well as tag name, and results must keep category
context (a bare "Interested" ×10 is meaningless).

## Decisions (approved)

1. No new dependencies (no cmdk/Command). Enhance the existing hand-rolled
   Popover dropdowns; share only a pure matching helper.
2. Contact-page picker assigns **instantly on click** (optimistic), stays
   open for multi-add. No Apply button.
3. **Quick-create stays** in the contact-page picker, per category.
4. Behavior change (explicitly approved): creating a tag from the
   contact-page picker also **auto-assigns it to that contact** (today:
   create, wait for refresh, click to assign).
5. Contact-page card shows **only categories with ≥1 assigned tag**.
6. No schema changes; existing server actions and optimistic/cache/realtime
   plumbing stay untouched except for one new thin action (§4).
7. (Review amendment) The new action reports expected failures as a
   **discriminated result**, never thrown errors — Next.js masks
   server-thrown error messages in production, and the house rule is
   user-errors-return, unexpected-errors-throw.
8. (Andrei, after POC) Picker **browse mode shows categories collapsed** —
   tags appear only after expanding a category; search auto-expands matches.

## 1. Shared matching helper

New file `src/app/(admin)/admin/tag-search.ts` (sibling of `constants.ts`)
+ co-located unit tests.

```ts
export interface TagSearchGroup<C, T> { category: C; tags: T[] }
export function searchTags<C extends { id, name, sort_order }, T extends { category_id, name, sort_order }>(
  categories: C[], tags: T[], query: string,
): TagSearchGroup<C, T>[]
```

Rule: a (category, tag) pair matches when **every** whitespace-separated
query word is a case-insensitive substring of `"<category name> <tag name>"`.
Empty/whitespace query → all pairs. Output grouped by category, both levels
ordered by `sort_order` with a name tie-break (so the provider-cache path,
sorted by (sort_order, name), and the DB path, sorted by sort_order alone,
render identically); categories with zero matching tags are omitted.

A second helper, `categoryNameMatches(name, query)` (same word semantics,
category name only, empty query never matches), lets the contact-page picker
keep a name-matched category visible even when no tags survive the filter.

Consequences of the rule (test cases):
- `azores` → every tag of every Azores-named category (category hit ⇒ whole group)
- `azores joining` → only "Joining" tags inside Azores categories
- `interested` → all tags of the "Interested in" category **and** every
  "Interested" tag in other categories
- `AZORES` / mixed case → same as lowercase; no matches → `[]`

## 2. Contacts list — Tags filter popover

`contacts-filters.tsx` only; all new state is local; props unchanged.

- Search input at the top of the popover, autofocused when it opens.
- Empty query → current behavior exactly (collapsible category sections,
  checkbox rows, "N selected" counts).
- Non-empty query → replace the browse list with `searchTags` results:
  every matched category rendered expanded with its matching tags as the
  same checkbox rows (toggling calls the existing `onTagToggle`).
- No-match state: muted "No tags match \<query\>" line.
- Query resets when the popover closes.
- Selected-tag chips row under the toolbar: unchanged.

## 3. Contact detail — Tags card

`contact-tag-manager.tsx` (rendered by `contact-tags-section.tsx`; section
data flow, `persistToProvider`, SSR seeding all unchanged).

- Render only categories that currently have ≥1 assigned tag (computed from
  optimistic rows, so a first assign shows the category immediately and
  removing the last tag hides it). Badges keep the "×" unassign button.
- Delete all per-category "+" buttons, the `openDropdown` state, and the
  hand-rolled outside-click dropdown div.
- One **"+ Add tags"** trigger after the category groups (when the contact
  has no tags: the button plus a muted "No tags yet" hint). It opens a
  `@/components/ui/popover`-based picker:
  - Search input on top, autofocused (Radix focuses the first focusable
    element — the input is first; no autoFocus attr needed).
  - **Browse mode** (empty query): every category listed **collapsed** —
    chevron header, tags only after expanding (Andrei's call after seeing
    the flat POC: 13 categories × 5 tags laid out flat is the exact clutter
    this replaces). Expanded state resets when the picker closes.
  - **Search mode**: matching runs over **all** tags with assigned rows
    hidden at render (not excluded from the input) so a group doesn't
    vanish under the cursor when its last matching tag gets assigned
    mid-multi-add; matched groups render auto-expanded with plain headers.
    Name-matched categories with no surviving tag rows are appended via
    `categoryNameMatches` so their quick-create row stays reachable.
  - Click a tag → instant optimistic assign through the existing paths
    (`addOptimisticContactTags` when `persistToProvider`, else local
    `useOptimistic` applied before the await; `pendingTagIds` re-entrancy
    guard; server action `assignContactTag`). Picker stays open; search
    text is kept so several matches can be added in a row.
  - Each expanded group ends with a compact quick-create row ("＋ New tag…"
    affordance → inline input). Submitting calls `createAndAssignContactTag`
    (§4). On `ok`, the **provider path** writes the returned tag through the
    provider's existing `addOptimisticTag` then `addOptimisticContactTags`
    (post-success write-through, no rollback handles; realtime reconciles
    via full-tags refetch + pair upsert with no flicker). The **local
    fallback path** is refetch-only via `onDataMayHaveChanged` — pre-await
    optimism is impossible (no tag id yet) and a post-await `useOptimistic`
    dispatch would land outside the transition in React 19.
  - **Escape** mid-quick-create collapses only the inline row, via
    `PopoverContent onEscapeKeyDown` + `preventDefault` — Radix listens in
    the capture phase, so `stopPropagation` on the input cannot intercept
    it. With no quick-create open, Escape closes the picker as normal.
  - The zero-categories early return ("No tag categories yet. Create some
    in the Tags panel.") is preserved.

## 4. New server action: create-and-assign

In `src/app/(admin)/admin/contacts/actions.ts` (co-located with the existing
`assignContactTag`):

```ts
export async function createAndAssignContactTag(
  contactId: string, categoryId: string, name: string,
): Promise<
  | { ok: true; tag: Tag }
  | { ok: false; code: "invalid_input" | "duplicate_name"; message: string }
  | { ok: false; code: "created_not_assigned"; message: string; tag: Tag }
>
```

- Expected failures come back as the discriminated result, never thrown:
  Next.js masks server-thrown error messages in production, so a thrown
  "duplicate name" would reach the client as a useless generic string.
  Unexpected failures still throw (fail loud). The result type is not
  exported ("use server" files may only export async functions — the
  e4beca7 landmine); consumers use `Awaited<ReturnType<...>>` if needed.
- `validateUUID` on both ids → `invalid_input`; name trimmed + sliced to
  100 chars like `addTagToCategory`, empty → `invalid_input`.
- Composes existing data-layer functions: `createTag(categoryId, name)`
  (returns the `Tag` row via the atomic `insert_tag` RPC) then
  `assignTag(contactId, tag.id)`.
- Duplicate detection lives in a plain shared module
  `src/lib/admin/tags/errors.ts` (`isDuplicateTagError` +
  `DUPLICATE_TAG_MESSAGE`), also adopted by `tags/actions.ts` — it can't be
  exported from a "use server" file.
- Create-succeeds/assign-fails → `created_not_assigned` **with the tag**,
  so the client can seed it into the picker as available (there is no
  client refetch on the provider path to rely on).
- `revalidatePath("/admin/contacts/[id]", "page")` on success — a new tag
  changes every contact page's picker seed, matching the blanket
  revalidation `/admin/tags` mutations use (siblings that only assign keep
  their single-contact revalidate).
- `AddTagForm` stays as-is for the `/admin/tags` panel; the picker's
  quick-create row is a small local form in `contact-tag-manager.tsx` (the
  `useActionState`-based `AddTagForm` isn't reused because the picker needs
  the created tag id for the cache write-through).

## 5. Error handling

Unchanged for assign/unassign: rollback + `toast.error`. Quick-create:
`duplicate_name` / `invalid_input` → inline error text, row stays open for
a fix; `created_not_assigned` → **toast** (the picker content may unmount
at any moment) + the tag seeded as available + data refresh; unexpected
thrown failure → inline generic + refetch. No silent fallbacks anywhere.

## 6. Tests

- `tag-search.test.ts`: the four rule cases above + empty query, whitespace
  query, no-match, ordering by `sort_order`, category-with-no-matching-tags
  omitted.
- `contacts-filters.test.tsx` (extend): typing narrows to grouped matches;
  checkbox toggle still fires `onTagToggle`; closing resets the query;
  empty-query browse mode still renders categories collapsed.
- `contact-tag-manager.test.tsx` (rewrite affected parts): only categories
  with assigned tags render; empty state shows Add button + hint; collapsed
  browse mode reveals tags on expand; search auto-expands and matches
  category names; group stays visible after assigning its last match;
  clicking assigns (action called, picker stays open) + provider rollback;
  quick-create success seeds provider caches; duplicate stays inline;
  created_not_assigned toasts and seeds the tag; Escape collapses only the
  quick-create row. Harness notes: the picker portals into document.body,
  so queries must scan there (the old container-scoped getButton finds
  nothing); dispatched Escape must be `cancelable: true` or Radix ignores
  `preventDefault`; provider-path row updates don't propagate through the
  mocked provider, so assigned-row hiding is asserted via props, not after
  a mocked assign.
- `actions.test.ts` (contacts): result contract of
  `createAndAssignContactTag` — invalid ids/name, success + blanket
  revalidate, duplicate_name, created_not_assigned with tag, unexpected
  errors rethrown (mock data layer per existing idiom; the
  `@/lib/data/contacts` mock factory must gain `createTag`).
- E2E: none — verified no spec asserts the old tag UI (`e2e/admin.spec.ts`
  only checks the Tags nav button).

## 7. Process notes

- New branch off `main` (e.g. `feat/tags-searchable-pickers`); this spec is
  committed as its first commit. Do not entangle with
  `feat/admin-ai-interpretation-rules` (unrelated WIP awaiting review).
- Visual pass before polish, per working agreement: run dev server,
  screenshot both dropdowns (list filter with a search term; contact card
  before/after adds), show Andrei, then finalize.
- No push without explicit approval.
