import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateClient = vi.fn();
const mockMarkStreamThreadNotificationsRead = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/data/stream-notifications", () => ({
  markStreamThreadNotificationsRead: mockMarkStreamThreadNotificationsRead,
}));

function createSupabaseMock(userId: string | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      })),
    },
  };
}

describe("POST /api/stream/notifications/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkStreamThreadNotificationsRead.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockCreateClient.mockResolvedValue(createSupabaseMock(null));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/notifications/read", {
        method: "POST",
        body: JSON.stringify({ threadId: "00000000-0000-4000-8000-000000000099" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mockMarkStreamThreadNotificationsRead).not.toHaveBeenCalled();
  });

  it("rejects missing thread IDs", async () => {
    mockCreateClient.mockResolvedValue(createSupabaseMock("user-1"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/notifications/read", {
        method: "POST",
        body: JSON.stringify({ threadId: "" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockMarkStreamThreadNotificationsRead).not.toHaveBeenCalled();
  });

  it("marks Stream notifications read for the authenticated user and app thread", async () => {
    mockCreateClient.mockResolvedValue(createSupabaseMock("user-1"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/notifications/read", {
        method: "POST",
        body: JSON.stringify({ threadId: "00000000-0000-4000-8000-000000000099" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockMarkStreamThreadNotificationsRead).toHaveBeenCalledWith({
      recipientId: "user-1",
      threadId: "00000000-0000-4000-8000-000000000099",
    });
  });
});
