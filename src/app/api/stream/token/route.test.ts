import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

const mockSupabase = createMockSupabaseClient();
const mockCreateStreamServerClient = vi.fn();
const mockUpsertUsers = vi.fn();
const mockCreateToken = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

vi.mock("@/lib/stream/server", () => ({
  createStreamServerClient: mockCreateStreamServerClient,
}));

vi.mock("@/lib/stream/env", () => ({
  getStreamChatConfig: () => ({
    apiKey: "stream-key",
    apiSecret: "secret",
    tokenTtlSeconds: 86_400,
  }),
}));

describe("GET /api/stream/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00.000Z"));
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    mockSupabase.mockQueryResult(null);
    mockUpsertUsers.mockResolvedValue({});
    mockCreateToken.mockReturnValue("stream-token");
    mockCreateStreamServerClient.mockReturnValue({
      upsertUsers: mockUpsertUsers,
      createToken: mockCreateToken,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when the request has no authenticated Supabase user", async () => {
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockCreateStreamServerClient).not.toHaveBeenCalled();
  });

  it("upserts the Stream user and returns a token payload for authenticated users", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockSupabase.mockQueryResult({
      id: "user-1",
      display_name: "Test Diver",
      avatar_url: "https://example.com/avatar.jpg",
    });

    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSupabase.client.from).toHaveBeenCalledWith("profiles");
    expect(mockUpsertUsers).toHaveBeenCalledWith([
      {
        id: "user-1",
        name: "Test Diver",
        image: "https://example.com/avatar.jpg",
      },
    ]);
    expect(mockCreateToken).toHaveBeenCalledWith("user-1", 1778760000);
    expect(body).toEqual({
      apiKey: "stream-key",
      token: "stream-token",
      expiresAt: 1778760000,
      user: {
        id: "user-1",
        name: "Test Diver",
        image: "https://example.com/avatar.jpg",
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
