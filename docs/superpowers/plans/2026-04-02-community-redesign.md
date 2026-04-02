# Community Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Facebook-style chronological feed with a Reddit-style grouped-by-topic layout and add full-text search.

**Architecture:** New migration adds `tsvector` generated columns + GIN indexes for full-text search. New data fetcher `getThreadsGroupedByTopic()` returns threads grouped by topic. New `searchThreads()` fetcher handles keyword search. Feed page conditionally renders grouped view or search results based on URL params. Three new components: `SearchBar`, `TopicGroup`, `ThreadCard`.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (PostgREST + Postgres full-text search), TypeScript, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-04-02-community-redesign-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260402000001_forum_fulltext_search.sql` | tsvector columns, GIN indexes, html_strip_tags fn |
| Modify | `src/lib/data/forum.ts` | Add `getThreadsGroupedByTopic()` and `searchThreads()` |
| Create | `src/components/community/ThreadCard.tsx` | Compact thread card (title, preview, metadata) |
| Create | `src/components/community/TopicGroup.tsx` | Topic header + 3 ThreadCards + "See all" link |
| Create | `src/components/community/SearchBar.tsx` | Search input with GET form submission |
| Modify | `src/app/(marketing)/community/page.tsx` | Rewrite to use grouped view / search / topic filter |
| Modify | `src/components/community/ChannelSidebar.tsx` | Rename "All Posts" to "Home", topic links unchanged |
| Delete | `src/components/community/FeedCard.tsx` | Replaced by ThreadCard |

---

### Task 1: Database Migration — Full-Text Search

**Files:**
- Create: `supabase/migrations/20260402000001_forum_fulltext_search.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================================
-- Full-text search for forum threads and posts
-- Adds tsvector generated columns + GIN indexes for keyword search.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Helper: strip HTML tags from text (for HTML-format posts)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."html_strip_tags"("input" "text")
    RETURNS "text"
    LANGUAGE "sql"
    IMMUTABLE
    AS $$
    SELECT regexp_replace(input, '<[^>]*>', '', 'g');
$$;

ALTER FUNCTION "public"."html_strip_tags"("input" "text") OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- 2. Add tsvector column to forum_threads (indexes title)
-- --------------------------------------------------------------------------

ALTER TABLE "public"."forum_threads"
  ADD COLUMN "title_search" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "title")) STORED;

CREATE INDEX "idx_forum_threads_title_search"
  ON "public"."forum_threads" USING GIN ("title_search");

-- --------------------------------------------------------------------------
-- 3. Add tsvector column to forum_posts (indexes stripped body)
--    Must drop/recreate forum_thread_listings view because it uses ft.*
--    and adding a column to forum_threads changes the view's column set.
-- --------------------------------------------------------------------------

DROP VIEW IF EXISTS "public"."forum_thread_listings";

ALTER TABLE "public"."forum_posts"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', html_strip_tags("body"))
  ) STORED;

CREATE INDEX "idx_forum_posts_search_vector"
  ON "public"."forum_posts" USING GIN ("search_vector");

-- --------------------------------------------------------------------------
-- 4. Recreate forum_thread_listings view (unchanged definition)
-- --------------------------------------------------------------------------

CREATE VIEW "public"."forum_thread_listings"
WITH (security_invoker = true) AS
SELECT ft.*,
       fp."id" AS "op_post_id",
       fp."body_preview",
       fp."body" AS "op_body",
       fp."body_format" AS "op_body_format",
       fp."like_count" AS "op_like_count",
       fp."search_vector" AS "op_search_vector",
       fto."name" AS "topic_name"
FROM "public"."forum_threads" ft
LEFT JOIN "public"."forum_posts" fp ON fp."thread_id" = ft."id" AND fp."is_op" = true
LEFT JOIN "public"."forum_topics" fto ON fto."slug" = ft."topic";

ALTER VIEW "public"."forum_thread_listings" OWNER TO "postgres";
GRANT SELECT ON "public"."forum_thread_listings" TO "authenticated";
GRANT SELECT ON "public"."forum_thread_listings" TO "service_role";
```

- [ ] **Step 2: Verify migration applies cleanly**

Run: `npx supabase db reset`
Expected: Migration applies without errors. Local DB includes the new columns and indexes.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260402000001_forum_fulltext_search.sql
git commit -m "feat(db): add full-text search columns and GIN indexes for forum"
```

---

### Task 2: Data Layer — `getThreadsGroupedByTopic()` and `searchThreads()`

**Files:**
- Modify: `src/lib/data/forum.ts`

**Docs to check:**
- Supabase JS `textSearch` filter: the Supabase client supports `.textSearch(column, query, { type: 'websearch' })` for full-text search via PostgREST.

- [ ] **Step 1: Add `getThreadsGroupedByTopic()` to `src/lib/data/forum.ts`**

Add this after the existing `getThreads` function (around line 168):

```typescript
// ---------------------------------------------------------------------------
// Grouped feed (latest N threads per topic)
// ---------------------------------------------------------------------------

export interface TopicWithThreads {
  topic: ForumTopic;
  threads: ForumThreadSummary[];
}

export const getThreadsGroupedByTopic = cache(async function getThreadsGroupedByTopic(
  threadsPerTopic = 3,
): Promise<TopicWithThreads[]> {
  const supabase = await createClient();
  const topics = await getForumTopics();

  // Fetch latest N threads per topic in parallel
  const results = await Promise.all(
    topics.map(async (topic) => {
      const { data, error } = await supabase
        .from(LISTING_VIEW)
        .select(`*, ${LISTING_PROFILE_JOIN}`)
        .eq("topic", topic.slug)
        .order("pinned", { ascending: false })
        .order("last_reply_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(threadsPerTopic);

      if (error) throw new Error(`Failed to fetch threads for topic ${topic.slug}: ${error.message}`);

      return {
        topic,
        threads: (data ?? []).map(toThreadSummary),
      };
    }),
  );

  // Exclude topics with no threads
  return results.filter((group) => group.threads.length > 0);
});
```

- [ ] **Step 2: Add `searchThreads()` to `src/lib/data/forum.ts`**

Add this after `getThreadsGroupedByTopic`:

```typescript
// ---------------------------------------------------------------------------
// Full-text search
// ---------------------------------------------------------------------------

export const searchThreads = cache(async function searchThreads(
  query: string,
  limit = 20,
): Promise<ForumThreadSummary[]> {
  if (!query.trim()) return [];

  const supabase = await createClient();

  // Search the listings view — title_search comes from ft.* (forum_threads),
  // op_search_vector comes from the OP post join
  const { data, error } = await supabase
    .from(LISTING_VIEW)
    .select(`*, ${LISTING_PROFILE_JOIN}`)
    .or(`title_search.wfts.${query},op_search_vector.wfts.${query}`)
    .order("last_reply_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to search threads: ${error.message}`);

  return (data ?? []).map(toThreadSummary);
});
```

Note: `wfts` is the PostgREST abbreviation for `websearch_to_tsquery` (web full-text search). The view exposes `title_search` from `forum_threads` and `op_search_vector` from the OP `forum_posts` row, both as tsvector columns with GIN indexes.

- [ ] **Step 3: Verify the file has no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `forum.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/forum.ts
git commit -m "feat: add getThreadsGroupedByTopic and searchThreads data fetchers"
```

---

### Task 3: Component — `ThreadCard`

**Files:**
- Create: `src/components/community/ThreadCard.tsx`

- [ ] **Step 1: Create `ThreadCard` component**

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RelativeTime } from "./RelativeTime";
import { UserAvatar } from "./UserAvatar";
import { MessageCircle, Heart, Pin } from "lucide-react";
import type { ForumThreadSummary } from "@/types/database";

interface ThreadCardProps {
  thread: ForumThreadSummary;
}

export function ThreadCard({ thread }: ThreadCardProps) {
  const authorName = thread.author?.display_name ?? "[deleted user]";

  return (
    <Link href={`/community/${thread.slug}`} className="group block">
      <Card className="transition-colors group-hover:border-primary/30">
        <CardContent className="flex gap-3 p-3">
          <UserAvatar
            name={thread.author?.display_name ?? null}
            avatarUrl={thread.author?.avatar_url}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            {/* Title row */}
            <div className="flex items-start gap-2">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {thread.title}
              </h3>
              {thread.pinned && (
                <Pin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              {thread.locked && (
                <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0">
                  Locked
                </Badge>
              )}
            </div>

            {/* Body preview */}
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {thread.body_preview}
            </p>

            {/* Meta row */}
            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{authorName}</span>
              <span className="flex items-center gap-0.5">
                <MessageCircle className="h-3 w-3" />
                {thread.reply_count}
              </span>
              {thread.op_like_count > 0 && (
                <span className="flex items-center gap-0.5">
                  <Heart className="h-3 w-3" />
                  {thread.op_like_count}
                </span>
              )}
              <RelativeTime date={thread.last_reply_at} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i "ThreadCard\|error" | head -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/community/ThreadCard.tsx
git commit -m "feat: add compact ThreadCard component for Reddit-style feed"
```

---

### Task 4: Component — `TopicGroup`

**Files:**
- Create: `src/components/community/TopicGroup.tsx`

- [ ] **Step 1: Create `TopicGroup` component**

```tsx
import Link from "next/link";
import { ThreadCard } from "./ThreadCard";
import { ChevronRight } from "lucide-react";
import type { ForumTopic, ForumThreadSummary } from "@/types/database";

interface TopicGroupProps {
  topic: ForumTopic;
  threads: ForumThreadSummary[];
}

export function TopicGroup({ topic, threads }: TopicGroupProps) {
  return (
    <section id={`topic-${topic.slug}`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {topic.name}
        </h2>
        <Link
          href={`/community?topic=${topic.slug}`}
          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          See all
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {threads.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i "TopicGroup\|error" | head -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/community/TopicGroup.tsx
git commit -m "feat: add TopicGroup component for grouped feed sections"
```

---

### Task 5: Component — `SearchBar`

**Files:**
- Create: `src/components/community/SearchBar.tsx`

- [ ] **Step 1: Create `SearchBar` component**

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useRef } from "react";

export function SearchBar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") ?? "";
  const formRef = useRef<HTMLFormElement>(null);

  function handleClear() {
    router.push("/community");
  }

  return (
    <form
      ref={formRef}
      action="/community"
      method="GET"
      className="relative"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        name="q"
        defaultValue={query}
        placeholder="Search threads..."
        className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i "SearchBar\|error" | head -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/community/SearchBar.tsx
git commit -m "feat: add SearchBar component for community thread search"
```

---

### Task 6: Rewrite Feed Page

**Files:**
- Modify: `src/app/(marketing)/community/page.tsx`

- [ ] **Step 1: Rewrite `page.tsx` with grouped view, search, and topic filter**

Replace the entire contents of `src/app/(marketing)/community/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getAuthUser } from "@/lib/data/auth";
import {
  getThreads,
  getForumTopics,
  getThreadsGroupedByTopic,
  searchThreads,
} from "@/lib/data/forum";
import { ThreadCard } from "@/components/community/ThreadCard";
import { TopicGroup } from "@/components/community/TopicGroup";
import { SearchBar } from "@/components/community/SearchBar";
import { PaginationControls } from "@/components/community/PaginationControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PenSquare } from "lucide-react";
import { isUUID, isValidISODate } from "@/lib/validation-helpers";

export const metadata: Metadata = {
  title: "Community | BTM Hub",
  description:
    "Connect with divers, freedivers, and ocean lovers worldwide. Share stories, ask questions, and learn from each other.",
};

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    cursor_id?: string;
    topic?: string;
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await getAuthUser();

  // Determine which view to render
  const searchQuery = params.q?.trim() || undefined;
  const topicFilter = params.topic || undefined;

  // --- Search view ---
  if (searchQuery) {
    const results = await searchThreads(searchQuery);

    return (
      <div className="mx-auto max-w-2xl">
        <Header user={user} />
        <div className="mb-4">
          <SearchBar />
        </div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Results for &ldquo;{searchQuery}&rdquo;
          </p>
          <Link
            href="/community"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </Link>
        </div>
        {results.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No threads found matching your search.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Topic filter view (See all for a topic) ---
  if (topicFilter) {
    const topics = await getForumTopics();
    const topicSlugs = new Set(topics.map((t) => t.slug));
    const activeTopic = topicSlugs.has(topicFilter) ? topicFilter : undefined;

    if (!activeTopic) {
      return (
        <div className="mx-auto max-w-2xl">
          <Header user={user} />
          <div className="mb-4">
            <SearchBar />
          </div>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">Topic not found.</p>
            </CardContent>
          </Card>
        </div>
      );
    }

    const cursor =
      params.cursor && params.cursor_id && isUUID(params.cursor_id) && isValidISODate(params.cursor)
        ? { ts: params.cursor, id: params.cursor_id }
        : undefined;

    const result = await getThreads({ topic: activeTopic, cursor, limit: 10 });
    const { pinned, data: threads, nextCursor } = result;
    const topicInfo = topics.find((t) => t.slug === activeTopic);
    const basePath = `/community?topic=${activeTopic}`;

    // On page 2+ (cursor set), pinned threads aren't shown again
    const allThreads = cursor ? threads : [...pinned, ...threads];

    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {topicInfo?.name ?? "Community"}
            </h1>
            {topicInfo?.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {topicInfo.description}
              </p>
            )}
          </div>
          {user && (
            <Button asChild size="sm" className="gap-1.5 md:hidden">
              <Link href="/community/new">
                <PenSquare className="h-4 w-4" />
                Post
              </Link>
            </Button>
          )}
        </div>
        <div className="mb-4">
          <SearchBar />
        </div>
        {allThreads.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No posts in this topic yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {allThreads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        )}
        <PaginationControls nextCursor={nextCursor} basePath={basePath} />
      </div>
    );
  }

  // --- Default: Grouped-by-topic view ---
  const groups = await getThreadsGroupedByTopic();

  return (
    <div className="mx-auto max-w-2xl">
      <Header user={user} />
      <div className="mb-4">
        <SearchBar />
      </div>
      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No posts yet. Be the first to share something!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <TopicGroup
              key={group.topic.slug}
              topic={group.topic}
              threads={group.threads}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ user }: { user: { id: string } | null }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Community</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect with divers, freedivers, and ocean lovers worldwide.
        </p>
      </div>
      {user && (
        <Button asChild size="sm" className="gap-1.5 md:hidden">
          <Link href="/community/new">
            <PenSquare className="h-4 w-4" />
            Post
          </Link>
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(marketing\)/community/page.tsx
git commit -m "feat: rewrite community feed — grouped by topic with search"
```

---

### Task 7: Update ChannelSidebar

**Files:**
- Modify: `src/components/community/ChannelSidebar.tsx`

- [ ] **Step 1: Rename "All Posts" to "Home" in the sidebar**

In `src/components/community/ChannelSidebar.tsx`, find and replace the "All Posts" text (line 74):

```tsx
// Change this:
              All Posts

// To this:
              Home
```

This is the only change needed. The sidebar topic links already point to `/community?topic=slug` which is the correct "See all" URL for the topic filter view.

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i "ChannelSidebar\|error" | head -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/community/ChannelSidebar.tsx
git commit -m "feat: rename sidebar 'All Posts' to 'Home' for grouped feed"
```

---

### Task 8: Delete FeedCard

**Files:**
- Delete: `src/components/community/FeedCard.tsx`

- [ ] **Step 1: Verify FeedCard is not imported anywhere**

Run: `grep -r "FeedCard" src/ --include="*.tsx" --include="*.ts"`
Expected: No results (page.tsx was already rewritten in Task 6 to use ThreadCard instead).

If there are still imports, update them to use ThreadCard before proceeding.

- [ ] **Step 2: Delete FeedCard.tsx**

```bash
rm src/components/community/FeedCard.tsx
```

- [ ] **Step 3: Verify build passes**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add -u src/components/community/FeedCard.tsx
git commit -m "chore: remove FeedCard, replaced by ThreadCard"
```

---

### Task 9: Manual Testing & Visual Verification

- [ ] **Step 1: Reset local database with the new migration**

Run: `npx supabase db reset`
Expected: All migrations apply cleanly.

Reminder: After confirming locally, run `supabase db push` against the remote database when ready.

- [ ] **Step 2: Start dev server and verify grouped feed**

Run: `npm run dev`

Open `http://localhost:3000/community` and verify:
- Search bar appears at the top
- Topics with threads are shown as groups (topic name + "See all" + up to 3 compact cards)
- Topics are ordered by `sort_order`
- Clicking a thread card navigates to the thread detail page
- Empty topics are hidden

- [ ] **Step 3: Verify search**

In the search bar, type a keyword that matches a thread title or body and press Enter.
- URL changes to `/community?q=keyword`
- Results appear as a flat list of ThreadCards
- "Results for ..." header shows with a "Clear" link
- Clicking "Clear" returns to the grouped view
- Searching for a term with no matches shows "No threads found"

- [ ] **Step 4: Verify topic "See all" view**

Click "See all" on a topic group or click a topic in the sidebar.
- URL changes to `/community?topic=slug`
- All threads for that topic are listed as ThreadCards
- Pagination works (if there are more than 10 threads)
- Topic name and description show in the header

- [ ] **Step 5: Verify mobile layout**

Resize browser to mobile width:
- Sidebar is hidden
- Search bar is full-width
- Topic groups stack vertically
- Thread cards are readable

- [ ] **Step 6: Commit any fixes if needed, then run lint**

Run: `npm run lint`
Expected: No lint errors.
