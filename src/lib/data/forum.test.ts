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
