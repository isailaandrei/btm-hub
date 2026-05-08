import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/data/auth", () => ({
  getAuthUser: vi.fn(),
}));

describe("getMessages", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();

    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);

    const { getAuthUser } = await import("@/lib/data/auth");
    vi.mocked(getAuthUser).mockResolvedValue({ id: "user-1" } as never);
  });

  it("fetches the newest page first and returns it in chronological display order", async () => {
    mockSupabase.mockQueryResult([
      {
        id: "message-new",
        conversation_id: "conversation-1",
        sender_id: "user-1",
        body: "<p>Newer</p>",
        body_format: "html",
        edited_at: null,
        deleted_at: null,
        created_at: "2026-05-08T10:00:00.000Z",
        updated_at: "2026-05-08T10:00:00.000Z",
        profiles: { id: "user-1", display_name: "Test User", avatar_url: null },
      },
      {
        id: "message-old",
        conversation_id: "conversation-1",
        sender_id: "user-2",
        body: "<p>Older</p>",
        body_format: "html",
        edited_at: null,
        deleted_at: null,
        created_at: "2026-05-08T09:00:00.000Z",
        updated_at: "2026-05-08T09:00:00.000Z",
        profiles: { id: "user-2", display_name: "Other User", avatar_url: null },
      },
    ]);

    const { getMessages } = await import("./messages");
    const result = await getMessages("conversation-1");

    expect(mockSupabase.query.order).toHaveBeenNthCalledWith(
      1,
      "created_at",
      { ascending: false },
    );
    expect(mockSupabase.query.order).toHaveBeenNthCalledWith(
      2,
      "id",
      { ascending: false },
    );
    expect(result.map((message) => message.id)).toEqual([
      "message-old",
      "message-new",
    ]);
  });
});

describe("getConversation", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();

    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);

    const { getAuthUser } = await import("@/lib/data/auth");
    vi.mocked(getAuthUser).mockResolvedValue({ id: "user-1" } as never);
  });

  it("loads the other participant with the conversation instead of doing a second profile query", async () => {
    mockSupabase.mockQueryResult({
      id: "conversation-1",
      user1_id: "user-1",
      user2_id: "user-2",
      last_message_at: "2026-05-08T10:00:00.000Z",
      created_at: "2026-05-08T09:00:00.000Z",
      user1: { id: "user-1", display_name: "Current User", avatar_url: null },
      user2: { id: "user-2", display_name: "Other User", avatar_url: null },
    });

    const { getConversation } = await import("./messages");
    const result = await getConversation("conversation-1");

    expect(mockSupabase.client.from).toHaveBeenCalledTimes(1);
    expect(mockSupabase.client.from).toHaveBeenCalledWith("dm_conversations");
    expect(mockSupabase.query.select).toHaveBeenCalledWith(
      expect.stringContaining("user2:profiles!dm_conversations_user2_fkey"),
    );
    expect(result?.participant).toEqual({
      id: "user-2",
      display_name: "Other User",
      avatar_url: null,
    });
  });
});
