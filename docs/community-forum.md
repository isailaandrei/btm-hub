# Community Forum — Technical Documentation

## Overview

The community forum is a two-level threaded discussion system: **threads** contain flat **replies** (no nested threading). It is public-read, requires authentication to post, and supports full admin moderation (pin, lock, edit, delete). The feature lives under ticket **BTM-8**.

---

## Route Structure

| Route | File | Description |
|---|---|---|
| `/community` | `src/app/(marketing)/community/page.tsx` | Home — topic grid + recent threads |
| `/community/[topic]` | `src/app/(marketing)/community/[topic]/page.tsx` | Topic listing — pinned + paginated threads |
| `/community/[topic]/new` | `src/app/(marketing)/community/[topic]/new/page.tsx` | New thread form (auth-gated) |
| `/community/[topic]/[slug]` | `src/app/(marketing)/community/[topic]/[slug]/page.tsx` | Thread detail — OP + paginated replies + reply form |

All routes are under the `(marketing)` layout group and are **not** proxy-protected — the forum is publicly readable. Auth is checked at the component level to conditionally render write UI.

---

## Database Schema

**Migration:** `supabase/migrations/20260320000001_forum_tables.sql`

### Tables

**`forum_threads`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `author_id` | uuid | Nullable FK to `profiles.id` (SET NULL on delete — preserves posts from deleted users) |
| `topic` | text | CHECK enum of 6 slugs |
| `title` | text | 3–200 chars |
| `slug` | text | Regex `^[a-z0-9][a-z0-9-]*[a-z0-9]$`, max 86 chars |
| `body` | text | 1–20,000 chars |
| `reply_count` | integer | Maintained by trigger, default 0 |
| `pinned` | boolean | Default false |
| `locked` | boolean | Default false |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |
| `last_reply_at` | timestamptz | Default `now()`, updated by trigger |

Unique constraint: `(topic, slug)` — slugs are unique **per topic**, not globally.

**`forum_posts`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `thread_id` | uuid | FK to `forum_threads.id` (CASCADE on delete) |
| `author_id` | uuid | Nullable FK to `profiles.id` (SET NULL) |
| `body` | text | 1–10,000 chars |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### Indexes

```
idx_forum_threads_topic_listing  (topic, pinned DESC, last_reply_at DESC, id DESC)
idx_forum_threads_recent         (last_reply_at DESC, id DESC)
idx_forum_posts_thread_listing   (thread_id, created_at ASC, id ASC)
idx_forum_threads_author         (author_id)
idx_forum_posts_author           (author_id)
```

These directly support the composite cursor pagination queries used by the data fetchers.

### Trigger: Reply Stats

`forum_update_thread_reply_stats()` fires AFTER INSERT or DELETE on `forum_posts`. It:

1. Acquires a row-level lock on the parent thread (`SELECT ... FOR UPDATE`) to prevent race conditions.
2. **On INSERT:** increments `reply_count`, sets `last_reply_at` to the new post's `created_at`.
3. **On DELETE:** recalculates `last_reply_at` as `MAX(created_at)` from remaining posts (falls back to `thread.created_at`), decrements `reply_count` with `GREATEST(..., 0)` guard.

This means `reply_count` and `last_reply_at` are always consistent without application-layer bookkeeping.

### RPC Functions

Both are `SECURITY INVOKER` (runs as the calling user, respects RLS) and re-check admin status internally:

- `toggle_thread_pin(_thread_id uuid)` — flips `pinned = NOT pinned`
- `toggle_thread_lock(_thread_id uuid)` — flips `locked = NOT locked`

### RLS Policies

| Operation | Who | Condition |
|---|---|---|
| SELECT (threads + posts) | Everyone | Always allowed |
| INSERT thread | Authenticated | `auth.uid() = author_id` |
| INSERT post | Authenticated | `auth.uid() = author_id` AND thread not locked |
| INSERT post | Admin | Always (can post in locked threads) |
| UPDATE / DELETE | Owner | `auth.uid() = author_id` |
| UPDATE / DELETE | Admin | `profiles.role = 'admin'` |

### Grants

- **`anon`:** SELECT only (read-only for unauthenticated users)
- **`authenticated`:** SELECT, INSERT, UPDATE, DELETE (RLS still applies)
- **`service_role`:** ALL (bypasses RLS)

---

## Topic Configuration

**File:** `src/lib/community/topics.ts`

Topics are defined as a static `Record<ForumTopicSlug, ForumTopicDefinition>`:

| Slug | Name |
|---|---|
| `trip-reports` | Trip Reports |
| `underwater-filmmaking-photography` | Underwater Filmmaking & Photography |
| `gear-talk` | Gear Talk |
| `marine-life` | Marine Life |
| `freediving` | Freediving |
| `beginner-questions` | Beginner Questions |

The same six slugs are enforced by:
- The DB CHECK constraint on `forum_threads.topic`
- The TypeScript `ForumTopicSlug` union type in `src/types/database.ts`
- The Zod `z.enum(FORUM_TOPIC_SLUGS)` in `createThreadSchema`

`getForumTopic(slug)` returns `undefined` for unknown slugs; page components call `notFound()` when this returns undefined.

---

## Data Fetching

**File:** `src/lib/data/forum.ts`

All fetchers use `import { cache } from "react"` for per-request deduplication and call `createClient()` from `@/lib/supabase/server`.

| Fetcher | Returns | Used By |
|---|---|---|
| `getThreadsByTopic(topic, options)` | `PaginatedThreadsResult` (pinned + paginated unpinned) | Topic page |
| `getRecentThreads(options)` | `PaginatedResult<ForumThreadSummary>` | Community home |
| `getThreadBySlug(topic, slug)` | `ForumThreadWithAuthor \| null` | Thread detail page |
| `getThreadReplies(threadId, options)` | `PaginatedResult<ForumPostWithAuthor>` | Thread detail page |

### Cursor-Based Pagination

The pattern avoids OFFSET-based pagination (which degrades with large tables):

```
CursorPair = { ts: string; id: string }
```

- `ts` is a timestamp (`last_reply_at` for threads, `created_at` for posts)
- `id` is a UUID tiebreaker for records with identical timestamps

The cursor condition is injected into PostgREST's `.or()` filter:
- **DESC ordering** (threads): `last_reply_at.lt.${ts},and(last_reply_at.eq.${ts},id.lt.${id})`
- **ASC ordering** (replies): `created_at.gt.${ts},and(created_at.eq.${ts},id.gt.${id})`

"Has next page" is determined by fetching `limit + 1` rows and checking if the result exceeds `limit`. The cursor for the next page comes from the last item in the sliced result.

### Cursor Validation

Cursor values come from URL query params (`?cursor=<ts>&cursor_id=<id>`). Before passing to fetchers, all three page components validate:
- `cursor_id` with `isUUID()`
- `cursor` with `isValidISODate()`

This prevents injection into the PostgREST filter string. Invalid cursors are silently treated as "no cursor" (first page).

**File:** `src/lib/validation-helpers.ts`

---

## Validation Schemas

**File:** `src/lib/validations/forum.ts` (Zod 4)

| Schema | Fields | Constraints |
|---|---|---|
| `createThreadSchema` | topic, title, body | topic: enum; title: 3–200; body: 1–20,000 |
| `createReplySchema` | threadId, body | threadId: UUID; body: 1–10,000 |
| `editThreadSchema` | body | 1–20,000 (matches `forum_threads.body` DB constraint) |
| `editReplySchema` | body | 1–10,000 (matches `forum_posts.body` DB constraint) |

The split between `editThreadSchema` and `editReplySchema` exists because threads allow 20,000-char bodies while posts allow 10,000.

---

## Server Actions

**File:** `src/app/(marketing)/community/actions.ts`

### Action State Shape

```ts
type ForumActionState = {
  errors: Record<string, string> | null;  // field-level validation errors
  message: string;                         // top-level error/success message
  success: boolean;
  resetKey: number;                        // drives form reset via React key prop
};
```

### Form Actions (useActionState pattern)

**`createThread(prevState, formData)`**
1. Auth check → Zod validation → `slugify(title)`
2. INSERT into `forum_threads`
3. On unique violation (`23505`): retry with `slugifyUnique(slugify(title) || "thread")`
4. On success: `revalidatePath` → `redirect` (never returns a success state)

**`createReply(prevState, formData)`**
1. Auth check → Zod validation
2. Fetch thread (verify exists + check `locked` status)
3. If locked and not admin → return error
4. INSERT into `forum_posts`
5. Return `{ success: true, resetKey: prevState.resetKey + 1 }`

### Imperative Actions (throw on error)

| Action | What It Does |
|---|---|
| `editThread(threadId, body)` | Ownership/admin check → UPDATE body + updated_at |
| `editReply(postId, body)` | Ownership/admin check → UPDATE body + updated_at |
| `deleteThread(threadId, redirectPath)` | Ownership/admin check → DELETE → redirect |
| `deleteReply(postId)` | Ownership/admin check → DELETE |
| `toggleThreadPin(threadId)` | Admin only → RPC `toggle_thread_pin` |
| `toggleThreadLock(threadId)` | Admin only → RPC `toggle_thread_lock` |

All imperative actions:
- Call `validateUUID()` on IDs first
- Check ownership (`thread.author_id !== user.id` → `requireAdmin()`)
- Revalidate affected paths (home, topic listing, thread page)

---

## Slug Strategy

**File:** `src/lib/community/slugify.ts`

**`slugify(text)`:** NFD normalize → strip diacritics → lowercase → replace non-alphanumeric with `-` → collapse consecutive hyphens → trim leading/trailing hyphens → slice to 80 chars.

**`slugifyUnique(text)`:** `slugify(text).slice(0, 79)` + `-` + 6 random base-36 chars. Total <= 86 chars (matches DB constraint).

The uniqueness strategy is **optimistic insert + retry**:
1. Try inserting with `slugify(title)` (human-readable).
2. On unique violation: retry with `slugifyUnique()` (appends random suffix).
3. No pre-flight check — avoids TOCTOU race conditions.

Edge case: titles that produce empty slugs (all special characters) fall back to `slugifyUnique("thread")`.

---

## Component Architecture

### Server Components

| Component | Purpose |
|---|---|
| `TopicGrid` / `TopicCard` | Renders the 6-topic grid on the community home |
| `ThreadList` / `ThreadCard` | Renders thread summaries with body preview, author, reply count, relative time |
| `ForumBreadcrumb` | `Community > [topic] > [thread]` navigation |
| `PaginationControls` | "Load More" link encoding cursor params as query string |

### Client Components

| Component | Purpose |
|---|---|
| `ThreadActions` | Orchestrator passing server action callbacks to `ThreadHeader` and `PostCard` |
| `ThreadHeader` | Thread title, metadata, admin controls (Pin/Lock/Delete) via `useTransition` |
| `PostCard` | Individual post with inline edit mode (`MarkdownEditor`) and delete |
| `NewThreadForm` | `useActionState(createThread, ...)` with title input + `MarkdownEditor` |
| `ReplyForm` | `useActionState(createReply, ...)` with resetKey-driven form reset |
| `MarkdownEditor` | Write/Preview tabs; controlled textarea with `useState`; preview uses `MarkdownContent` |
| `MarkdownContent` | `react-markdown` + `remark-gfm` + `rehype-sanitize`; custom Tailwind-styled element renderers |
| `RelativeTime` | Formats timestamps as "2 hours ago", updates every minute via `setInterval` |

### Component Tree (Thread Detail Page)

```
ThreadPage (server)
  ForumBreadcrumb (server)
  ThreadActions (client)
    ThreadHeader (client)
      RelativeTime (client)
    PostCard [OP] (client)
      MarkdownContent
      MarkdownEditor [edit mode]
    PostCard [replies...] (client)
      MarkdownContent
      MarkdownEditor [edit mode]
  PaginationControls (server)
  ReplyForm (client)
    MarkdownEditor (client)
      MarkdownContent
```

---

## Key Patterns

### Form State with `resetKey`

`ReplyForm` uses `useActionState(createReply, { ..., resetKey: 0 })`. The form element has `key={state.resetKey}`. When a reply is posted successfully, the action returns `resetKey: prevState.resetKey + 1`. React sees the new key and **remounts** the entire form subtree, resetting the `MarkdownEditor`'s internal `useState` value.

This avoids the `useEffect` + `setState` antipattern that triggers the `react-hooks/set-state-in-effect` lint rule. The key is derived directly from action state — no extra hooks needed.

`NewThreadForm` does not need this because successful thread creation calls `redirect()`, navigating away from the page entirely.

### `useTransition` for Imperative Actions

`ThreadHeader` and `PostCard` use `useTransition` for edit/delete/pin/lock operations. This keeps the UI responsive during the async server action and provides an `isPending` flag for loading states, without the `useActionState` form pattern (since these aren't form submissions).

### Three-Layer Security

Every write operation is protected at three levels:

1. **Application layer** (server actions): `getAuthUser()` + ownership/admin checks
2. **Database layer** (RLS policies): enforce the same rules even if the application layer is bypassed
3. **Database constraints** (CHECK constraints): prevent malformed data regardless of the access path

### Markdown Rendering

User content is rendered through `react-markdown` with `rehype-sanitize` to prevent XSS. Links open in new tabs with `rel="noopener noreferrer"`. The same `MarkdownContent` component is used for both the preview tab in the editor and the final rendered posts.

---

## Data Flow: Creating a Thread

```
User fills form on /community/gear-talk/new
  -> NewThreadForm submits via useActionState
    -> createThread(prevState, formData) [server action]
      -> getAuthUser() [auth check]
      -> createThreadSchema.safeParse() [validation]
      -> slugify(title) [generate slug]
      -> INSERT forum_threads [DB write]
        -> 23505? retry with slugifyUnique()
      -> revalidatePath("/community/gear-talk", "/community")
      -> redirect("/community/gear-talk/best-camera")
```

## Data Flow: Posting a Reply

```
User fills form on /community/gear-talk/best-camera
  -> ReplyForm submits via useActionState
    -> createReply(prevState, formData) [server action]
      -> getAuthUser() [auth check]
      -> createReplySchema.safeParse() [validation]
      -> SELECT forum_threads [verify exists + locked check]
      -> INSERT forum_posts [DB write]
        -> TRIGGER: lock thread row, increment reply_count, update last_reply_at
      -> revalidatePath (thread page + topic listing)
      -> return { success: true, resetKey: prevState.resetKey + 1 }
        -> React remounts <form key={resetKey}>, clearing MarkdownEditor state
        -> "Reply posted!" message shown
```

---

## Known Limitations / TODOs

- **No rate limiting** — planned but not implemented (TODO comments in `actions.ts`)
- **No Realtime** — new replies require page reload (TODO for Supabase Realtime subscriptions)
- **Full body fetched for previews** — `truncateBody()` truncates server-side, but the full `body` column is selected from DB (TODO for generated column or RPC)
- **Titles are immutable** — editing only changes the body, not the title or topic
- **Flat threading only** — no nested reply-to-reply support
- **`isSlugTaken` is unused** — exists and is tested, but the action uses optimistic insert instead

---

## File Reference

| Category | Files |
|---|---|
| **Database** | `supabase/migrations/20260320000001_forum_tables.sql` |
| **Types** | `src/types/database.ts` (lines 40–92) |
| **Config** | `src/lib/community/topics.ts` |
| **Data** | `src/lib/data/forum.ts` |
| **Validation** | `src/lib/validations/forum.ts`, `src/lib/validation-helpers.ts` |
| **Actions** | `src/app/(marketing)/community/actions.ts` |
| **Utilities** | `src/lib/community/slugify.ts` |
| **Pages** | `src/app/(marketing)/community/**/page.tsx` (4 routes) |
| **Components** | `src/components/community/*.tsx` (12 components) |
| **Auth** | `src/lib/data/auth.ts`, `src/lib/auth/require-admin.ts` |
| **Tests** | `src/lib/validations/forum.test.ts` |
