import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

describe("getThreadBySlug", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
  });

  it("returns thread with author when found", async () => {
    const fakeThread = {
      id: "t1",
      author_id: "u1",
      topic: "gear-talk",
      title: "Best camera?",
      slug: "best-camera",
      reply_count: 3,
      pinned: false,
      locked: false,
      created_at: "2026-03-20T00:00:00Z",
      updated_at: "2026-03-20T00:00:00Z",
      last_reply_at: "2026-03-20T01:00:00Z",
      profiles: { id: "u1", display_name: "Alice", avatar_url: null },
    };
    mockSupabase.mockQueryResult(fakeThread);

    const { getThreadBySlug } = await import("./forum");
    const result = await getThreadBySlug("best-camera");

    expect(result).toEqual({
      id: "t1",
      author_id: "u1",
      topic: "gear-talk",
      title: "Best camera?",
      slug: "best-camera",
      reply_count: 3,
      pinned: false,
      locked: false,
      created_at: "2026-03-20T00:00:00Z",
      updated_at: "2026-03-20T00:00:00Z",
      last_reply_at: "2026-03-20T01:00:00Z",
      author: { id: "u1", display_name: "Alice", avatar_url: null },
    });
  });

  it("returns null when thread not found (PGRST116)", async () => {
    mockSupabase.mockQueryResult(null, { code: "PGRST116", message: "not found" });

    const { getThreadBySlug } = await import("./forum");
    const result = await getThreadBySlug("nonexistent");

    expect(result).toBeNull();
  });

  it("throws on other errors", async () => {
    mockSupabase.mockQueryResult(null, { code: "42P01", message: "relation does not exist" });

    const { getThreadBySlug } = await import("./forum");
    await expect(getThreadBySlug("test")).rejects.toThrow(
      "Failed to fetch thread: relation does not exist",
    );
  });
});

describe("isSlugTaken", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
  });

  it("returns true when slug exists", async () => {
    mockSupabase.mockQueryResult({ id: "t1" });

    const { isSlugTaken } = await import("./forum");
    const result = await isSlugTaken("existing-slug");

    expect(result).toBe(true);
  });

  it("returns false when slug does not exist", async () => {
    mockSupabase.mockQueryResult(null);

    const { isSlugTaken } = await import("./forum");
    const result = await isSlugTaken("new-slug");

    expect(result).toBe(false);
  });
});

describe("getThreadsGroupedByTopic", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
  });

  it("fetches grouped topic threads with a single RPC call", async () => {
    mockSupabase.client.rpc.mockResolvedValue({
      data: [
        {
          topic_slug: "gear-talk",
          topic_name: "Gear Talk",
          topic_description: "Cameras and equipment",
          topic_icon: "hash",
          topic_sort_order: 10,
          thread_id: "thread-1",
          thread_author_id: "user-1",
          thread_title: "Best camera?",
          thread_slug: "best-camera",
          thread_reply_count: 3,
          thread_pinned: true,
          thread_locked: false,
          thread_created_at: "2026-03-20T00:00:00Z",
          thread_last_reply_at: "2026-03-20T01:00:00Z",
          op_post_id: "post-1",
          body_preview: "Camera body and lens discussion",
          op_body: "<p>Camera body and lens discussion</p>",
          op_body_format: "html",
          op_like_count: 2,
          author_display_name: "Alice",
          author_avatar_url: null,
        },
        {
          topic_slug: "travel",
          topic_name: "Travel",
          topic_description: "Trip planning",
          topic_icon: "plane",
          topic_sort_order: 20,
          thread_id: "thread-2",
          thread_author_id: "user-2",
          thread_title: "Packing list",
          thread_slug: "packing-list",
          thread_reply_count: 0,
          thread_pinned: false,
          thread_locked: false,
          thread_created_at: "2026-03-21T00:00:00Z",
          thread_last_reply_at: "2026-03-21T01:00:00Z",
          op_post_id: "post-2",
          body_preview: "What should I bring?",
          op_body: "What should I bring?",
          op_body_format: "markdown",
          op_like_count: 0,
          author_display_name: null,
          author_avatar_url: null,
        },
      ],
      error: null,
    });

    const { getThreadsGroupedByTopic } = await import("./forum");
    const result = await getThreadsGroupedByTopic(3);

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "get_latest_forum_threads_by_topic",
      { _threads_per_topic: 3 },
    );
    expect(mockSupabase.client.from).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        topic: {
          slug: "gear-talk",
          name: "Gear Talk",
          description: "Cameras and equipment",
          icon: "hash",
          sort_order: 10,
        },
        threads: [
          {
            id: "thread-1",
            topic: "gear-talk",
            title: "Best camera?",
            slug: "best-camera",
            reply_count: 3,
            pinned: true,
            locked: false,
            created_at: "2026-03-20T00:00:00Z",
            last_reply_at: "2026-03-20T01:00:00Z",
            author: {
              id: "user-1",
              display_name: "Alice",
              avatar_url: null,
            },
            body_preview: "Camera body and lens discussion",
            op_post_id: "post-1",
            op_body: "<p>Camera body and lens discussion</p>",
            op_body_format: "html",
            op_like_count: 2,
            topic_name: "Gear Talk",
          },
        ],
      },
      {
        topic: {
          slug: "travel",
          name: "Travel",
          description: "Trip planning",
          icon: "plane",
          sort_order: 20,
        },
        threads: [
          {
            id: "thread-2",
            topic: "travel",
            title: "Packing list",
            slug: "packing-list",
            reply_count: 0,
            pinned: false,
            locked: false,
            created_at: "2026-03-21T00:00:00Z",
            last_reply_at: "2026-03-21T01:00:00Z",
            author: {
              id: "user-2",
              display_name: null,
              avatar_url: null,
            },
            body_preview: "What should I bring?",
            op_post_id: "post-2",
            op_body: "What should I bring?",
            op_body_format: "markdown",
            op_like_count: 0,
            topic_name: "Travel",
          },
        ],
      },
    ]);
  });
});

describe("searchProfiles", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
  });

  it("returns matching profiles", async () => {
    mockSupabase.mockQueryResult([
      { id: "u1", display_name: "Alice", avatar_url: null },
    ]);

    const { searchProfiles } = await import("./forum");
    const result = await searchProfiles("Ali");

    expect(result).toEqual([
      { id: "u1", display_name: "Alice", avatar_url: null },
    ]);
  });

  it("returns empty array for empty query", async () => {
    const { searchProfiles } = await import("./forum");
    const result = await searchProfiles("   ");

    expect(result).toEqual([]);
  });
});
