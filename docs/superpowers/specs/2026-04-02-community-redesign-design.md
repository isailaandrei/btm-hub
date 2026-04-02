# Community Redesign: Reddit-Style Grouped Feed + Search

**Date:** 2026-04-02
**Status:** Approved
**Requested by:** Partner A

## Summary

Replace the current Facebook-style chronological feed with a Reddit-style grouped-by-topic layout. Each topic shows its latest 3 threads as compact cards. Add full-text search across thread titles and post bodies.

## Goals

1. Users see more threads at a glance (compact cards, no inline reply previews)
2. Threads are organized by topic — users can quickly scan what's active in each area
3. Users can search for threads by keyword

## Non-Goals

- Full UI/branding revamp (planned separately for later)
- Nested/threaded replies
- Real-time updates or websocket-based feed

---

## Design

### 1. Database & Search

#### Full-text search columns

Add generated `tsvector` columns for full-text search:

- **`forum_threads.title_search`**: `tsvector GENERATED ALWAYS AS (to_tsvector('english', title)) STORED`
- **`forum_posts.search_vector`**: `tsvector GENERATED ALWAYS AS (to_tsvector('english', html_strip_tags(body))) STORED`

Create a small SQL function `html_strip_tags(text)` that strips HTML tags before tsvector generation (needed because posts can be HTML format).

#### Indexes

- `CREATE INDEX idx_forum_threads_title_search ON forum_threads USING GIN (title_search)`
- `CREATE INDEX idx_forum_posts_search_vector ON forum_posts USING GIN (search_vector)`

#### No changes to

- Existing tables, columns, triggers, views, or RLS policies
- `forum_thread_listings` view
- Any write operations or RPCs

### 2. Data Layer (`src/lib/data/forum.ts`)

#### New: `getThreadsGroupedByTopic()`

Replaces `getThreads()` usage on the main feed page.

- Fetches all topics via `getForumTopics()`
- For each topic: fetches latest 3 threads from `forum_thread_listings` ordered by `pinned DESC, last_reply_at DESC`
- Returns `Array<{ topic: ForumTopic, threads: ForumThreadSummary[] }>`
- Excludes topics with zero threads
- Wrapped in `React.cache()`

#### New: `searchThreads(query: string)`

- Takes a search string from the `?q` param
- Joins `forum_threads` + `forum_posts` (WHERE `is_op = true`)
- Matches against `title_search @@ websearch_to_tsquery('english', query)` OR `search_vector @@ websearch_to_tsquery('english', query)`
- Orders by `ts_rank` relevance, then `last_reply_at DESC`
- Returns `ForumThreadSummary[]` (flat list, not grouped)
- Wrapped in `React.cache()`

#### Unchanged

- `getThreads()` — still used for `/community?topic=slug` ("See all" pages)
- `getThreadBySlug()`, `getThreadReplies()`, `getUserLikedPostIds()` — unchanged
- `getTopRepliesForThreads()` — no longer called from feed page, but function remains in codebase

### 3. Feed Page (`/community/page.tsx`)

#### URL-driven state

| URL | View |
|-----|------|
| `/community` | Grouped-by-topic (default) |
| `/community?q=keyword` | Search results (flat list) |
| `/community?topic=slug` | All threads for one topic (paginated) |

#### Default view (no params)

- Search bar at top of main content
- Below: `TopicGroup` sections ordered by `sort_order`
- Each group: topic name header + "See all" link + up to 3 `ThreadCard` components
- Pinned threads appear first within their topic group

#### Search view (`?q=keyword`)

- Search bar prefilled with query
- "Results for 'keyword'" header with "Clear" link
- Flat list of `ThreadCard` results across all topics
- Paginated if needed

#### Topic view (`?topic=slug`)

- Existing behavior, but uses `ThreadCard` instead of `FeedCard`
- Paginated (cursor-based, existing implementation)

### 4. Components

#### New: `SearchBar`

- Simple form with text input
- Reads/sets `?q` via URL search params
- GET submission (no server action — URL change triggers server re-render)
- Located in `src/components/community/SearchBar.tsx`

#### New: `TopicGroup`

- Props: `topic: ForumTopic`, `threads: ForumThreadSummary[]`
- Renders: topic name (no emoji/icon), "See all" link to `/community?topic=slug`, up to 3 `ThreadCard` children
- Located in `src/components/community/TopicGroup.tsx`

#### New: `ThreadCard`

- Props: `thread: ForumThreadSummary`
- Compact card: title, 1-2 line body preview (truncated), author name, reply count, OP like count, relative time
- Entire card is a link to `/community/[slug]`
- No inline reply previews, no like button
- Replaces `FeedCard` everywhere (feed + topic filtered view)
- Located in `src/components/community/ThreadCard.tsx`

#### Modified: `ChannelSidebar`

- Topic links navigate to `/community?topic=slug` (the "See all" paginated view for that topic)
- This matches the "See all" link behavior in each `TopicGroup` header
- Minor change to existing link `href` values

#### Modified: Feed page (`page.tsx`)

- Rewritten to use `getThreadsGroupedByTopic()` or `searchThreads()` based on URL params
- No longer calls `getTopRepliesForThreads()`

#### Removed: `FeedCard`

- Replaced by `ThreadCard` — can be deleted

#### Unchanged

- Thread detail page, `ThreadActions`, `PostCard`, `ReplyForm`, `RichTextEditor`
- `NewPostForm`, `LikeButton`, `UserAvatar`, `PaginationControls`
- All server actions in `actions.ts`

### 5. Visual Design

- Match existing project color branding (CSS variables in `globals.css`)
- No emojis in topic headers — use topic name text only
- Keep existing `ChannelSidebar` on desktop
- Compact cards use existing design tokens (backgrounds, borders, text colors)
- Full UI revamp is planned separately — this redesign focuses on layout and information architecture only

### 6. Mobile

- Sidebar collapses as it does today
- Search bar at top, full width
- Topic groups stack vertically
- Same `ThreadCard` component, responsive

---

## Data Flow Diagrams

### Default feed

```
/community (no ?q, no ?topic)
  -> getThreadsGroupedByTopic()
    -> getForumTopics()
    -> For each topic: latest 3 threads from forum_thread_listings
  -> Render: SearchBar + TopicGroup[] (each with ThreadCard[])
```

### Search

```
/community?q=keyword
  -> searchThreads(query)
    -> JOIN forum_threads + forum_posts (is_op)
    -> WHERE title_search @@ query OR search_vector @@ query
    -> ORDER BY ts_rank, last_reply_at DESC
  -> Render: SearchBar (prefilled) + "Results for..." + ThreadCard[]
```

### Topic "See all"

```
/community?topic=gear-talk
  -> getThreads({ topic: 'gear-talk' })  (existing, unchanged)
  -> Render: SearchBar + ThreadCard[] (paginated)
```
