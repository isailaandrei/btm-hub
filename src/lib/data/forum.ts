import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isUUID, isValidISODate, escapeSearchTerm } from "@/lib/validation-helpers";
import type {
  ForumTopicSlug,
  ForumThreadWithAuthor,
  ForumPostWithAuthor,
  ForumThreadSummary,
  ForumLikeWithUser,
  ForumAuthor,
  BodyFormat,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CursorPair {
  ts: string;
  id: string;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: CursorPair | null;
}

export interface PaginatedThreadsResult extends PaginatedResult<ForumThreadSummary> {
  pinned: ForumThreadSummary[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROFILE_JOIN = "profiles!forum_threads_author_profile_fkey(id, display_name, avatar_url)";
const POST_PROFILE_JOIN = "profiles!forum_posts_author_profile_fkey(id, display_name, avatar_url)";
const DEFAULT_PAGE_SIZE = 20;

const LISTING_VIEW = "forum_thread_listings";
const LISTING_PROFILE_JOIN = "profiles(id, display_name, avatar_url)";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateCursor(cursor: CursorPair): CursorPair | undefined {
  if (!isValidISODate(cursor.ts) || !isUUID(cursor.id)) return undefined;
  return cursor;
}

function toThreadSummary(row: Record<string, unknown>): ForumThreadSummary {
  return {
    id: row.id as string,
    topic: (row.topic as ForumTopicSlug) ?? null,
    title: row.title as string,
    slug: row.slug as string,
    reply_count: row.reply_count as number,
    pinned: row.pinned as boolean,
    locked: row.locked as boolean,
    created_at: row.created_at as string,
    last_reply_at: row.last_reply_at as string,
    author: (row.profiles as ForumThreadSummary["author"]) ?? null,
    body_preview: (row.body_preview as string) ?? "",
  };
}

function toThreadWithAuthor(row: Record<string, unknown>): ForumThreadWithAuthor {
  return {
    id: row.id as string,
    author_id: row.author_id as string | null,
    topic: (row.topic as ForumTopicSlug) ?? null,
    title: row.title as string,
    slug: row.slug as string,
    reply_count: row.reply_count as number,
    pinned: row.pinned as boolean,
    locked: row.locked as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_reply_at: row.last_reply_at as string,
    author: (row.profiles as ForumThreadWithAuthor["author"]) ?? null,
  };
}

function toPostWithAuthor(row: Record<string, unknown>): ForumPostWithAuthor {
  return {
    id: row.id as string,
    thread_id: row.thread_id as string,
    author_id: row.author_id as string | null,
    body: row.body as string,
    body_format: (row.body_format as BodyFormat) ?? "markdown",
    is_op: row.is_op as boolean,
    body_preview: (row.body_preview as string) ?? "",
    like_count: (row.like_count as number) ?? 0,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    author: (row.profiles as ForumPostWithAuthor["author"]) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export const getThreadsByTopic = cache(async function getThreadsByTopic(
  topic: ForumTopicSlug,
  options: { cursor?: CursorPair; limit?: number } = {},
): Promise<PaginatedThreadsResult> {
  const supabase = await createClient();
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  const cursor = options.cursor ? validateCursor(options.cursor) : undefined;

  const { data: pinnedRows, error: pinnedError } = await supabase
    .from(LISTING_VIEW)
    .select(`*, ${LISTING_PROFILE_JOIN}`)
    .eq("topic", topic)
    .eq("pinned", true)
    .order("last_reply_at", { ascending: false });

  if (pinnedError) throw new Error(`Failed to fetch pinned threads: ${pinnedError.message}`);

  let query = supabase
    .from(LISTING_VIEW)
    .select(`*, ${LISTING_PROFILE_JOIN}`)
    .eq("topic", topic)
    .eq("pinned", false)
    .order("last_reply_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.or(
      `last_reply_at.lt.${cursor.ts},and(last_reply_at.eq.${cursor.ts},id.lt.${cursor.id})`,
    );
  }

  const { data: rows, error } = await query;

  if (error) throw new Error(`Failed to fetch threads: ${error.message}`);

  const hasMore = (rows?.length ?? 0) > limit;
  const data = (rows ?? []).slice(0, limit);
  const lastRow = data[data.length - 1];

  return {
    pinned: (pinnedRows ?? []).map(toThreadSummary),
    data: data.map(toThreadSummary),
    nextCursor: hasMore && lastRow
      ? { ts: lastRow.last_reply_at as string, id: lastRow.id as string }
      : null,
  };
});

export const getRecentThreads = cache(async function getRecentThreads(
  options: { cursor?: CursorPair; limit?: number } = {},
): Promise<PaginatedThreadsResult> {
  const supabase = await createClient();
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  const cursor = options.cursor ? validateCursor(options.cursor) : undefined;

  // Fetch pinned threads (global)
  const { data: pinnedRows, error: pinnedError } = await supabase
    .from(LISTING_VIEW)
    .select(`*, ${LISTING_PROFILE_JOIN}`)
    .eq("pinned", true)
    .order("last_reply_at", { ascending: false });

  if (pinnedError) throw new Error(`Failed to fetch pinned threads: ${pinnedError.message}`);

  let query = supabase
    .from(LISTING_VIEW)
    .select(`*, ${LISTING_PROFILE_JOIN}`)
    .eq("pinned", false)
    .order("last_reply_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.or(
      `last_reply_at.lt.${cursor.ts},and(last_reply_at.eq.${cursor.ts},id.lt.${cursor.id})`,
    );
  }

  const { data: rows, error } = await query;

  if (error) throw new Error(`Failed to fetch recent threads: ${error.message}`);

  const hasMore = (rows?.length ?? 0) > limit;
  const data = (rows ?? []).slice(0, limit);
  const lastRow = data[data.length - 1];

  return {
    pinned: (pinnedRows ?? []).map(toThreadSummary),
    data: data.map(toThreadSummary),
    nextCursor: hasMore && lastRow
      ? { ts: lastRow.last_reply_at as string, id: lastRow.id as string }
      : null,
  };
});

export const getThreadBySlug = cache(async function getThreadBySlug(
  slug: string,
): Promise<ForumThreadWithAuthor | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("forum_threads")
    .select(`*, ${PROFILE_JOIN}`)
    .eq("slug", slug)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch thread: ${error.message}`);
  }

  return toThreadWithAuthor(data);
});

export const getThreadReplies = cache(async function getThreadReplies(
  threadId: string,
  options: { cursor?: CursorPair; limit?: number } = {},
): Promise<PaginatedResult<ForumPostWithAuthor>> {
  const supabase = await createClient();
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  const cursor = options.cursor ? validateCursor(options.cursor) : undefined;

  let query = supabase
    .from("forum_posts")
    .select(`*, ${POST_PROFILE_JOIN}`)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);

  if (cursor) {
    query = query.or(
      `created_at.gt.${cursor.ts},and(created_at.eq.${cursor.ts},id.gt.${cursor.id})`,
    );
  }

  const { data: rows, error } = await query;

  if (error) throw new Error(`Failed to fetch replies: ${error.message}`);

  const hasMore = (rows?.length ?? 0) > limit;
  const data = (rows ?? []).slice(0, limit);
  const lastRow = data[data.length - 1];

  return {
    data: data.map(toPostWithAuthor),
    nextCursor: hasMore && lastRow
      ? { ts: lastRow.created_at as string, id: lastRow.id as string }
      : null,
  };
});

export async function isSlugTaken(slug: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("forum_threads")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Failed to check slug: ${error.message}`);

  return data !== null;
}

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

export async function getUserLikedPostIds(
  userId: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("forum_likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);

  if (error) throw new Error(`Failed to fetch user likes: ${error.message}`);

  return new Set((data ?? []).map((row) => row.post_id));
}

export async function getLikesForPost(
  postId: string,
): Promise<ForumLikeWithUser[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("forum_likes")
    .select("*, profiles!forum_likes_user_fkey(id, display_name, avatar_url)")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Failed to fetch likes: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    post_id: row.post_id as string,
    user_id: row.user_id as string,
    created_at: row.created_at as string,
    user: (row.profiles as ForumAuthor) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Profile search (for @mentions)
// ---------------------------------------------------------------------------

export async function searchProfiles(
  query: string,
  limit = 10,
): Promise<ForumAuthor[]> {
  if (!query.trim()) return [];

  const supabase = await createClient();
  const escaped = escapeSearchTerm(query);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .ilike("display_name", `%${escaped}%`)
    .limit(limit);

  if (error) throw new Error(`Failed to search profiles: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
  }));
}
