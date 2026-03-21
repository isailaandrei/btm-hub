# Community Forum — Technical Documentation

## Overview

The community forum is a two-level threaded discussion system: **threads** contain flat **replies** (no nested threading). The entire forum is **restricted to authenticated users** — anonymous visitors cannot view or access any community content. It supports full admin moderation (pin, lock, edit, delete). The feature lives under ticket **BTM-8**.

---

## Route Structure

| Route | File | Description |
|---|---|---|
| `/community` | `src/app/(marketing)/community/page.tsx` | Home — topic grid + recent threads |
| `/community/[topic]` | `src/app/(marketing)/community/[topic]/page.tsx` | Topic listing — pinned + paginated threads |
| `/community/[topic]/new` | `src/app/(marketing)/community/[topic]/new/page.tsx` | New thread form (auth-gated) |
| `/community/[topic]/[slug]` | `src/app/(marketing)/community/[topic]/[slug]/page.tsx` | Thread detail — OP + paginated replies + reply form |

All routes are under the `(marketing)` layout group but are **proxy-protected** — `/community` is in the `protectedPaths` array in `src/lib/supabase/proxy.ts`. Unauthenticated users are redirected to `/login?redirect=/community`. The nav link remains visible to all users; clicking it as an anonymous user triggers the redirect.

---

## Database Schema

**Migration:** `supabase/migrations/20260320000001_forum_tables.sql`

### Tables

**`forum_topics`**

| Column | Type | Notes |
|---|---|---|
| `slug` | text | PK |
| `name` | text | Display name |
| `description` | text | Topic description |
| `icon` | text | Emoji icon |
| `sort_order` | integer | Display ordering |
| `created_at` | timestamptz | Default `now()` |

Seeded with 6 topics. Source of truth for valid topic slugs — `forum_threads.topic` references this via FK.

**`forum_threads`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `author_id` | uuid | Nullable FK to `profiles.id` (SET NULL on delete — preserves threads from deleted users) |
| `topic` | text | FK to `forum_topics.slug` |
| `title` | text | 3–200 chars |
| `slug` | text | Regex `^[a-z0-9][a-z0-9-]*[a-z0-9]$`, max 86 chars |
| `reply_count` | integer | Maintained by trigger, default 0 |
| `pinned` | boolean | Default false |
| `locked` | boolean | Default false |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |
| `last_reply_at` | timestamptz | Default `now()`, updated by trigger |

Unique constraint: `(topic, slug)` — slugs are unique **per topic**, not globally.

Note: Thread body lives in `forum_posts` (the OP post with `is_op = true`), not in this table. This keeps the data model uniform — all content is in `forum_posts`.

**`forum_posts`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `thread_id` | uuid | FK to `forum_threads.id` (CASCADE on delete) |
| `author_id` | uuid | Nullable FK to `profiles.id` (SET NULL) |
| `body` | text | 1–20,000 chars |
| `is_op` | boolean | Default false. True for the original post of a thread. |
| `body_preview` | text | GENERATED ALWAYS AS `left(body, 200)` STORED |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

The `body` column allows up to 20,000 chars at the DB level. The application layer enforces a 10,000-char limit for replies via Zod (`createReplySchema`, `editReplySchema`), while OP posts use the full 20,000 limit (`createThreadSchema`, `editThreadSchema`).

The `body_preview` generated column eliminates the need to fetch full post bodies on listing pages — the `forum_thread_listings` view uses it directly.

### View

**`forum_thread_listings`** — joins `forum_threads` with the OP post's `body_preview`:

```sql
SELECT ft.*, fp.body_preview
FROM forum_threads ft
LEFT JOIN forum_posts fp ON fp.thread_id = ft.id AND fp.is_op = true;
```

Used by `getThreadsByTopic` and `getRecentThreads` for efficient listing queries without fetching full post bodies.

### Indexes

```
idx_forum_threads_topic_listing  (topic, pinned DESC, last_reply_at DESC, id DESC)
idx_forum_threads_recent         (last_reply_at DESC, id DESC)
idx_forum_posts_thread_listing   (thread_id, created_at ASC, id ASC)
idx_forum_posts_thread_op        UNIQUE (thread_id) WHERE is_op = true
idx_forum_threads_author         (author_id)
idx_forum_posts_author           (author_id)
```

The `idx_forum_posts_thread_op` partial unique index ensures exactly one OP post per thread and enables fast OP lookups for the listing view.

### Triggers

**Reply Stats** — `forum_update_thread_reply_stats()` fires AFTER INSERT or DELETE on `forum_posts`. It skips posts where `is_op = true` and:

1. Acquires a row-level lock on the parent thread (`SELECT ... FOR UPDATE`) to prevent race conditions.
2. **On INSERT:** increments `reply_count`, sets `last_reply_at` to the new post's `created_at`.
3. **On DELETE:** recalculates `last_reply_at` as `MAX(created_at)` from remaining non-OP posts (falls back to `thread.created_at`), decrements `reply_count` with `GREATEST(..., 0)` guard.

**Column Restriction — Threads** — `forum_restrict_thread_update()` fires BEFORE UPDATE on `forum_threads`. For non-admin users, it resets `title`, `slug`, `topic`, `pinned`, `locked`, `reply_count`, and `last_reply_at` to their `OLD` values. This prevents privilege escalation via direct Supabase SDK calls that bypass server actions.

**Column Restriction — Posts** — `forum_restrict_post_update()` fires BEFORE UPDATE on `forum_posts`. For non-admin users, it resets `thread_id` to its `OLD` value, preventing users from moving posts between threads.

### RPC Functions

Both are `SECURITY INVOKER` (runs as the calling user, respects RLS) and re-check admin status internally:

- `toggle_thread_pin(_thread_id uuid)` — flips `pinned = NOT pinned`
- `toggle_thread_lock(_thread_id uuid)` — flips `locked = NOT locked`

### RLS Policies

| Operation | Who | Condition |
|---|---|---|
| SELECT (all tables) | Authenticated | `auth.uid() IS NOT NULL` |
| INSERT thread | Authenticated | `auth.uid() = author_id` |
| INSERT post | Authenticated | `auth.uid() = author_id` AND thread not locked |
| INSERT post | Admin | Always (can post in locked threads) |
| UPDATE / DELETE | Owner | `auth.uid() = author_id` |
| UPDATE / DELETE | Admin | `profiles.role = 'admin'` |

Note: Even though UPDATE RLS allows row-level access, the BEFORE UPDATE triggers restrict which columns non-admins can actually change.

### Grants

- **`anon`:** No grants (forum is invisible to unauthenticated users)
- **`authenticated`:** SELECT, INSERT, UPDATE, DELETE on forum tables; SELECT on `forum_topics` and `forum_thread_listings` view (RLS still applies)
- **`service_role`:** ALL (bypasses RLS)

---

## Topic Configuration

**Database table:** `forum_topics` — source of truth for valid topic slugs (FK constraint).

**Static config:** `src/lib/community/topics.ts` — provides name, description, and icon for rendering without a DB query. The `FORUM_TOPICS` record mirrors the DB table contents.

| Slug | Name |
|---|---|
| `trip-reports` | Trip Reports |
| `underwater-filmmaking-photography` | Underwater Filmmaking & Photography |
| `gear-talk` | Gear Talk |
| `marine-life` | Marine Life |
| `freediving` | Freediving |
| `beginner-questions` | Beginner Questions |

The Zod `z.enum(FORUM_TOPIC_SLUGS)` in `createThreadSchema` validates against the static config keys. `getForumTopic(slug)` returns `undefined` for unknown slugs; page components call `notFound()` when this returns undefined.

---

## Data Fetching

**File:** `src/lib/data/forum.ts`

All fetchers use `import { cache } from "react"` for per-request deduplication and call `createClient()` from `@/lib/supabase/server`.

| Fetcher | Returns | Source | Used By |
|---|---|---|---|
| `getThreadsByTopic(topic, options)` | `PaginatedThreadsResult` (pinned + paginated unpinned) | `forum_thread_listings` view | Topic page |
| `getRecentThreads(options)` | `PaginatedResult<ForumThreadSummary>` | `forum_thread_listings` view | Community home |
| `getThreadBySlug(topic, slug)` | `ForumThreadWithAuthor \| null` | `forum_threads` table | Thread detail page |
| `getThreadReplies(threadId, options)` | `PaginatedResult<ForumPostWithAuthor>` | `forum_posts` table | Thread detail page |

Listing fetchers query the `forum_thread_listings` view which provides `body_preview` from the OP post's generated column — no full body text is fetched for list pages.

`getThreadReplies` returns **all** posts for a thread (including the OP with `is_op = true`). The page component splits them: `posts.find(p => p.is_op)` for the OP, `posts.filter(p => !p.is_op)` for replies.

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

Cursor values come from URL query params (`?cursor=<ts>&cursor_id=<id>`). Validation happens at two levels as defense-in-depth:

1. **Page level:** all three page components validate `cursor_id` with `isUUID()` and `cursor` with `isValidISODate()` before passing to fetchers.
2. **Data layer:** each fetcher calls `validateCursor()` internally, which silently drops invalid cursors (returns `undefined` → first page).

This prevents injection into the PostgREST `.or()` filter string even if a new caller skips page-level validation.

**File:** `src/lib/validation-helpers.ts`, `src/lib/data/forum.ts`

---

## Validation Schemas

**File:** `src/lib/validations/forum.ts` (Zod 4)

| Schema | Fields | Constraints |
|---|---|---|
| `createThreadSchema` | topic, title, body | topic: enum; title: 3–200; body: 1–20,000 |
| `createReplySchema` | threadId, body | threadId: UUID; body: 1–10,000 |
| `editThreadSchema` | body | 1–20,000 (OP post body limit) |
| `editReplySchema` | body | 1–10,000 (reply body limit) |

The DB allows up to 20,000 chars for all posts. The split between thread/reply schemas enforces a tighter 10,000-char limit for replies at the application level.

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
2. If slug is < 2 chars, fall back to `slugifyUnique` (prevents DB regex constraint failure)
3. INSERT into `forum_threads` (without body)
4. INSERT OP post into `forum_posts` with `is_op: true`
5. On unique violation (`23505`): retry with `slugifyUnique(slugify(title) || "thread")`
6. On success: `revalidatePath` → `redirect` (never returns a success state)

**`createReply(prevState, formData)`**
1. Auth check → Zod validation
2. Fetch thread (verify exists + check `locked` status)
3. If locked and not admin → return error
4. INSERT into `forum_posts` (with `is_op: false`)
5. Return `{ success: true, resetKey: prevState.resetKey + 1 }`

### Imperative Actions (throw on error)

| Action | What It Does |
|---|---|
| `editThread(threadId, body)` | Ownership/admin check → UPDATE OP post body in `forum_posts` |
| `editReply(postId, body)` | Ownership/admin check → UPDATE reply body + updated_at |
| `deleteThread(threadId)` | Ownership/admin check → DELETE → redirect to `/community/${topic}` |
| `deleteReply(postId)` | Ownership/admin check → DELETE |
| `toggleThreadPin(threadId)` | Admin only → RPC `toggle_thread_pin` |
| `toggleThreadLock(threadId)` | Admin only → RPC `toggle_thread_lock` |

All imperative actions:
- Call `validateUUID()` on IDs first
- Check ownership (`thread.author_id !== user.id` → `requireAdmin()`)
- Revalidate affected paths (home, topic listing, thread page)
- Errors are caught and displayed inline by `PostCard` and `ThreadHeader` via error state

Note: `deleteThread` hardcodes the redirect to `/community/${thread.topic}` — it does not accept a client-supplied redirect path, preventing open redirect vulnerabilities.

---

## Slug Strategy

**File:** `src/lib/community/slugify.ts`

**`slugify(text)`:** NFD normalize → strip diacritics → lowercase → replace non-alphanumeric with `-` → collapse consecutive hyphens → trim leading/trailing hyphens → slice to 80 chars.

**`slugifyUnique(text)`:** `slugify(text).slice(0, 79)` + `-` + 6 random base-36 chars. Total <= 86 chars (matches DB constraint).

The uniqueness strategy is **optimistic insert + retry**:
1. Try inserting with `slugify(title)` (human-readable).
2. If slug is < 2 characters (would fail DB regex), fall back to `slugifyUnique` immediately.
3. On unique violation: retry with `slugifyUnique()` (appends random suffix).
4. No pre-flight check — avoids TOCTOU race conditions.

---

## Component Architecture

### Server Components

| Component | Purpose |
|---|---|
| `TopicGrid` / `TopicCard` | Renders the 6-topic grid on the community home |
| `ThreadList` / `ThreadCard` | Renders thread summaries with body preview, author, reply count, relative time |
| `ForumBreadcrumb` | `Community > [topic] > [thread]` navigation |
| `PaginationControls` | "Next Page" link encoding cursor params as query string |
| `MarkdownContent` | `react-markdown` + `remark-gfm` + `rehype-sanitize`; only runs server-side for post rendering |

### Client Components

| Component | Purpose |
|---|---|
| `ThreadActions` | Orchestrator passing server action callbacks to `ThreadHeader` and `PostCard` |
| `ThreadHeader` | Thread title, metadata, admin controls (Pin/Lock/Delete) via `useTransition` with error display |
| `PostCard` | Individual post with inline edit mode and delete, with error display |
| `NewThreadForm` | `useActionState(createThread, ...)` with title input + `MarkdownEditor` |
| `ReplyForm` | `useActionState(createReply, ...)` with resetKey-driven form reset; admin-aware locked state |
| `MarkdownEditor` | Write/Preview tabs; controlled textarea with `useState`; preview lazy-loads `MarkdownContent` |
| `RelativeTime` | Formats timestamps as "2 hours ago", updates every minute via `setInterval` |

### Markdown Rendering Strategy

Post bodies are rendered server-side — the thread detail page pre-renders `MarkdownContent` for each post and passes the resulting JSX to the client `PostCard` via React node props. This keeps `react-markdown`, `remark-gfm`, and `rehype-sanitize` out of the client JavaScript bundle.

The `MarkdownEditor` preview tab lazy-loads `MarkdownContent` via `React.lazy()` — the markdown libraries are only downloaded client-side when a user clicks Edit and then switches to the Preview tab.

### Component Tree (Thread Detail Page)

```
ThreadPage (server)
  MarkdownContent [pre-renders all post bodies]
  ForumBreadcrumb (server)
  ThreadActions (client)
    ThreadHeader (client) [error state for pin/lock/delete]
      RelativeTime (client)
    PostCard [OP] (client) [receives pre-rendered body, error state for edit/delete]
      MarkdownEditor [edit mode, lazy preview]
    PostCard [replies...] (client)
      MarkdownEditor [edit mode, lazy preview]
  PaginationControls (server)
  ReplyForm (client) [admin-aware, shows form even on locked threads for admins]
    MarkdownEditor (client)
```

---

## Key Patterns

### Uniform Post Model

All content (OP and replies) lives in `forum_posts`. The `is_op` boolean flag distinguishes the original post from replies. This eliminates the need for union types in components — `PostCard` always takes `ForumPostWithAuthor`. The `editThread` action finds the OP post (`is_op = true AND thread_id = threadId`) and updates it in `forum_posts`.

### Form State with `resetKey`

`ReplyForm` uses `useActionState(createReply, { ..., resetKey: 0 })`. The form element has `key={state.resetKey}`. When a reply is posted successfully, the action returns `resetKey: prevState.resetKey + 1`. React sees the new key and **remounts** the entire form subtree, resetting the `MarkdownEditor`'s internal `useState` value. The success message is rendered outside the keyed form so it persists after remount.

This avoids the `useEffect` + `setState` antipattern that triggers the `react-hooks/set-state-in-effect` lint rule. The key is derived directly from action state — no extra hooks needed.

### Error Display for Imperative Actions

`PostCard` and `ThreadHeader` wrap `startTransition` calls in try/catch blocks and display errors via `useState<string | null>`. This surfaces failures from `editThread`, `deleteThread`, `toggleThreadPin`, etc. that would otherwise be silent unhandled promise rejections.

### `useTransition` for Imperative Actions

`ThreadHeader` and `PostCard` use `useTransition` for edit/delete/pin/lock operations. This keeps the UI responsive during the async server action and provides an `isPending` flag for loading states, without the `useActionState` form pattern (since these aren't form submissions).

### Four-Layer Security

Every operation (including reads) is protected at four levels:

1. **Proxy layer** (`src/lib/supabase/proxy.ts`): `/community` is in `protectedPaths` — unauthenticated users are redirected to login before any page renders
2. **RLS policies**: SELECT requires `auth.uid() IS NOT NULL`; writes enforce ownership/admin checks. The `anon` role has zero grants on forum tables.
3. **BEFORE UPDATE triggers**: Non-admins cannot change restricted columns (`title`, `slug`, `pinned`, `locked`, etc.) even via direct SDK calls — the triggers reset them to `OLD` values.
4. **Database constraints** (CHECK constraints, FK constraints): prevent malformed data regardless of the access path

Server actions additionally call `getAuthUser()` and check ownership/admin status before any DB write.

### Markdown Rendering

User content is rendered through `react-markdown` with `rehype-sanitize` to prevent XSS. Links open in new tabs with `rel="noopener noreferrer"`. Markdown rendering happens server-side for post display (zero client bundle impact) and is lazy-loaded client-side only for the editor preview tab.

---

## Data Flow: Creating a Thread

```
User fills form on /community/gear-talk/new
  -> NewThreadForm submits via useActionState
    -> createThread(prevState, formData) [server action]
      -> getAuthUser() [auth check]
      -> createThreadSchema.safeParse() [validation]
      -> slugify(title) [generate slug, fallback if < 2 chars]
      -> INSERT forum_threads [metadata only, no body]
        -> 23505? retry with slugifyUnique()
      -> INSERT forum_posts with is_op=true [OP body]
      -> revalidatePath("/community/gear-talk", "/community")
      -> redirect("/community/gear-talk/best-camera")
```

## Data Flow: Posting a Reply

```
User fills form on /community/gear-talk/best-camera
  -> ReplyForm submits via useActionState
    -> createReply(prevState, formData) [server action]
      -> getAuthUser() [auth check]
      -> createReplySchema.safeParse() [validation, max 10000 chars]
      -> SELECT forum_threads [verify exists + locked check]
      -> INSERT forum_posts with is_op=false [reply body]
        -> TRIGGER: skip (is_op check), lock thread row, increment reply_count, update last_reply_at
      -> revalidatePath (thread page + topic listing)
      -> return { success: true, resetKey: prevState.resetKey + 1 }
        -> React remounts <form key={resetKey}>, clearing MarkdownEditor state
        -> "Reply posted!" message shown (outside keyed form, persists)
```

---

## Known Limitations / TODOs

- **No rate limiting** — planned but not implemented (TODO comments in `actions.ts`)
- **No soft delete / audit trail** — admin deletes are hard deletes with CASCADE, no moderation log
- **No Realtime** — new replies require page reload (TODO for Supabase Realtime subscriptions)
- **Titles are immutable** — editing only changes the body, not the title or topic
- **Flat threading only** — no nested reply-to-reply support
- **No search** — no full-text search across threads or posts
- **No notifications** — no mechanism to notify thread authors of new replies

---

## File Reference

| Category | Files |
|---|---|
| **Database** | `supabase/migrations/20260320000001_forum_tables.sql` |
| **Types** | `src/types/database.ts` |
| **Config** | `src/lib/community/topics.ts` |
| **Data** | `src/lib/data/forum.ts` |
| **Validation** | `src/lib/validations/forum.ts`, `src/lib/validation-helpers.ts` |
| **Actions** | `src/app/(marketing)/community/actions.ts` |
| **Utilities** | `src/lib/community/slugify.ts` |
| **Pages** | `src/app/(marketing)/community/**/page.tsx` (4 routes) |
| **Components** | `src/components/community/*.tsx` (12 components) |
| **Auth** | `src/lib/data/auth.ts`, `src/lib/auth/require-admin.ts`, `src/lib/supabase/proxy.ts` |
| **Tests** | `src/lib/validations/forum.test.ts`, `src/lib/data/forum.test.ts` |
