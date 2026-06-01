import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateClient = vi.fn();
const mockCreateStreamServerClient = vi.fn();
const mockGetOrCreateDirectChatThread = vi.fn();
const mockUpsertUsers = vi.fn();
const mockChannelCreate = vi.fn();
const mockChannel = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/stream/server", () => ({
  createStreamServerClient: mockCreateStreamServerClient,
}));

vi.mock("@/lib/data/chat-threads", () => ({
  getOrCreateDirectChatThread: mockGetOrCreateDirectChatThread,
}));

function createSupabaseMock({
  userId,
  profiles,
}: {
  userId: string | null;
  profiles?: Record<string, { id: string; display_name: string | null; avatar_url: string | null } | null>;
}) {
  const filters: Record<string, string> = {};
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: string) => {
      filters[column] = value;
      return query;
    }),
    single: vi.fn(async () => {
      const id = filters.id;
      const profile = profiles?.[id] ?? null;
      return profile
        ? { data: profile, error: null }
        : { data: null, error: { message: "Profile not found", code: "PGRST116" } };
    }),
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      })),
    },
    from: vi.fn(() => query),
  };
}

describe("POST /api/stream/channels/direct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertUsers.mockResolvedValue({});
    mockChannelCreate.mockResolvedValue({
      channel: { cid: "messaging:00000000-0000-4000-8000-000000000099" },
    });
    mockChannel.mockReturnValue({
      cid: "messaging:00000000-0000-4000-8000-000000000099",
      create: mockChannelCreate,
    });
    mockGetOrCreateDirectChatThread.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000099",
      kind: "direct",
      provider: "stream",
      provider_channel_id: "00000000-0000-4000-8000-000000000099",
      provider_channel_cid: "messaging:00000000-0000-4000-8000-000000000099",
      direct_participant_key:
        "00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002",
      created_by: "00000000-0000-4000-8000-000000000001",
      created_at: "2026-05-13T00:00:00.000Z",
      updated_at: "2026-05-13T00:00:00.000Z",
    });
    mockCreateStreamServerClient.mockReturnValue({
      upsertUsers: mockUpsertUsers,
      channel: mockChannel,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockCreateClient.mockResolvedValue(createSupabaseMock({ userId: null }));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/channels/direct", {
        method: "POST",
        body: JSON.stringify({ recipientId: "00000000-0000-4000-8000-000000000001" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mockCreateStreamServerClient).not.toHaveBeenCalled();
  });

  it("rejects self-message attempts", async () => {
    mockCreateClient.mockResolvedValue(createSupabaseMock({ userId: "00000000-0000-4000-8000-000000000001" }));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/channels/direct", {
        method: "POST",
        body: JSON.stringify({ recipientId: "00000000-0000-4000-8000-000000000001" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "You cannot message yourself." });
  });

  it("rejects missing recipient profiles", async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseMock({
        userId: "00000000-0000-4000-8000-000000000001",
        profiles: {
          "00000000-0000-4000-8000-000000000001": {
            id: "00000000-0000-4000-8000-000000000001",
            display_name: "Sender",
            avatar_url: null,
          },
        },
      }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/channels/direct", {
        method: "POST",
        body: JSON.stringify({ recipientId: "00000000-0000-4000-8000-000000000002" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(mockCreateStreamServerClient).not.toHaveBeenCalled();
  });

  it("creates a distinct Stream messaging channel for two profile members", async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseMock({
        userId: "00000000-0000-4000-8000-000000000001",
        profiles: {
          "00000000-0000-4000-8000-000000000001": {
            id: "00000000-0000-4000-8000-000000000001",
            display_name: "Sender",
            avatar_url: null,
          },
          "00000000-0000-4000-8000-000000000002": {
            id: "00000000-0000-4000-8000-000000000002",
            display_name: "Recipient",
            avatar_url: "https://example.com/r.jpg",
          },
        },
      }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/channels/direct", {
        method: "POST",
        body: JSON.stringify({ recipientId: "00000000-0000-4000-8000-000000000002" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      threadId: "00000000-0000-4000-8000-000000000099",
      cid: "messaging:00000000-0000-4000-8000-000000000099",
    });
    expect(mockGetOrCreateDirectChatThread).toHaveBeenCalledWith({
      currentUserId: "00000000-0000-4000-8000-000000000001",
      recipientId: "00000000-0000-4000-8000-000000000002",
    });
    expect(mockUpsertUsers).toHaveBeenCalledWith([
      { id: "00000000-0000-4000-8000-000000000001", name: "Sender" },
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Recipient",
        image: "https://example.com/r.jpg",
      },
    ]);
    expect(mockChannel).toHaveBeenCalledWith(
      "messaging",
      "00000000-0000-4000-8000-000000000099",
      {
        members: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        created_by_id: "00000000-0000-4000-8000-000000000001",
      },
    );
    expect(mockChannelCreate).toHaveBeenCalled();
  });

  it("accepts seeded UUID-shaped profile IDs used by the local database", async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseMock({
        userId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        profiles: {
          "a1b2c3d4-e5f6-7890-abcd-ef1234567890": {
            id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            display_name: "Test User",
            avatar_url: null,
          },
          "c3d4e5f6-a7b8-9012-cdef-234567890123": {
            id: "c3d4e5f6-a7b8-9012-cdef-234567890123",
            display_name: "Sarah Chen",
            avatar_url: null,
          },
        },
      }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/channels/direct", {
        method: "POST",
        body: JSON.stringify({ recipientId: "c3d4e5f6-a7b8-9012-cdef-234567890123" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockChannel).toHaveBeenCalledWith(
      "messaging",
      "00000000-0000-4000-8000-000000000099",
      {
        members: [
          "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          "c3d4e5f6-a7b8-9012-cdef-234567890123",
        ],
        created_by_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      },
    );
  });
});
